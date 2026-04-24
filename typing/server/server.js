const crypto = require('crypto');
const fsPromises = require('fs/promises');
const http = require('http');
const path = require('path');
const { URL } = require('url');

const config = require('./lib/config');
const { buildPromptQueue } = require('./lib/prompts');
const { SCORE_RULE, computeScore } = require('./lib/scoring');
const {
  initScoreStore,
  appendScore,
  replaceScores,
  readAllScores,
  readScoresCsv,
  getKnownClassIds,
  getRankingByClass,
  getGameRankSummary,
  compareRanking
} = require('./lib/scoreStore');
const { createGasSync } = require('./lib/gasSync');
const { SimpleWebSocketServer, OPEN: WS_OPEN } = require('./lib/simpleWs');

const SERVER_DIR = __dirname;
const APP_DIR = path.resolve(SERVER_DIR, '..');
const STATIC_DIR = APP_DIR;
const DATA_DIR = path.join(SERVER_DIR, 'data');
const SHARED_DIR = path.join(SERVER_DIR, 'lib');

const classStateMap = new Map();
const wsContextMap = new Map();
const adminSockets = new Set();
const knownClassIds = new Set();
const adminLogHistory = [];
let gasSync = null;
const gasFlushTimers = new Map();
let globalOfflineModeEnabled = false;

const server = http.createServer(handleHttpRequest);
const wss = new SimpleWebSocketServer({ server, path: '/ws' });
const PERSISTENCE_DURATION_SEC = 300;

function now() {
  return Date.now();
}

function pushAdminLog(level, message) {
  const entry = {
    t: 'admin_log',
    serverTime: now(),
    level: String(level || 'INFO'),
    message: String(message || '')
  };
  adminLogHistory.push(entry);
  if (adminLogHistory.length > 120) {
    adminLogHistory.splice(0, adminLogHistory.length - 120);
  }
  for (const ws of adminSockets) {
    sendJson(ws, entry);
  }
}

function log(level, message, ...extra) {
  const stamp = new Date().toISOString();
  const prefix = `${config.LOG_PREFIX} ${stamp} ${level}`;
  const safeMessage = String(message || '');
  if (extra.length > 0) {
    console.log(prefix, message, ...extra);
  } else {
    console.log(prefix, message);
  }
  if (safeMessage.startsWith('GAS sync')) {
    pushAdminLog(level, safeMessage);
  }
}

function safeString(input, maxLength, fallback = '') {
  const text = String(input || '').trim();
  if (!text) {
    return fallback;
  }
  return text.slice(0, maxLength);
}

function toNonNegativeNumber(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    return fallback;
  }
  return n;
}

function normalizeClassRow(value, fallbackClassId = '') {
  const raw = safeString(value, 8, '').toUpperCase();
  if (/^[A-HX]$/.test(raw)) {
    return raw;
  }
  if (/^TEST/.test(raw)) {
    return 'TEST';
  }
  const fallback = safeString(fallbackClassId, config.MAX_CLASS_ID_LENGTH, '').toUpperCase();
  if (/^TEST/.test(fallback)) {
    return 'TEST';
  }
  const match = fallback.match(/([A-HX])$/);
  return match ? match[1] : '';
}

function normalizeAttendanceNo(value, fallbackUid = '') {
  const direct = Math.floor(Number(value));
  if (Number.isFinite(direct) && direct >= 0 && direct <= 45) {
    return direct;
  }
  const uid = safeString(fallbackUid, 64, '');
  const uidMatch = uid.match(/(\d{1,2})$/);
  if (uidMatch) {
    const guessed = Number(uidMatch[1]);
    if (Number.isFinite(guessed) && guessed >= 0 && guessed <= 45) {
      return guessed;
    }
  }
  return 0;
}

function createEmptyStats() {
  return {
    score: 0,
    correctCount: 0,
    missCount: 0,
    accuracy: 0,
    combo: 0,
    maxCombo: 0,
    completedPrompts: 0,
    completedStageCounts: {
      alphabetSingle: 0,
      alphabetTriple: 0,
      englishWord: 0,
      japaneseWord: 0,
      japaneseSentence: 0
    },
    inputCount: 0,
    kpm: 0,
    wpm: 0
  };
}

function sanitizeRuntimeStats(raw) {
  const base = createEmptyStats();
  if (!raw || typeof raw !== 'object') {
    return base;
  }

  const completedStageCounts = raw.completedStageCounts && typeof raw.completedStageCounts === 'object'
    ? raw.completedStageCounts
    : {};

  return {
    score: Math.round(toNonNegativeNumber(raw.score, 0)),
    correctCount: Math.floor(toNonNegativeNumber(raw.correctCount, 0)),
    missCount: Math.floor(toNonNegativeNumber(raw.missCount, 0)),
    accuracy: Number(toNonNegativeNumber(raw.accuracy, 0).toFixed(2)),
    combo: Math.floor(toNonNegativeNumber(raw.combo, 0)),
    maxCombo: Math.floor(toNonNegativeNumber(raw.maxCombo, 0)),
    completedPrompts: Math.floor(toNonNegativeNumber(raw.completedPrompts, 0)),
    completedStageCounts: {
      alphabetSingle: Math.floor(toNonNegativeNumber(completedStageCounts.alphabetSingle, 0)),
      alphabetTriple: Math.floor(toNonNegativeNumber(completedStageCounts.alphabetTriple, 0)),
      englishWord: Math.floor(toNonNegativeNumber(completedStageCounts.englishWord, 0)),
      japaneseWord: Math.floor(toNonNegativeNumber(completedStageCounts.japaneseWord, 0)),
      japaneseSentence: Math.floor(toNonNegativeNumber(completedStageCounts.japaneseSentence, 0))
    },
    inputCount: Math.floor(toNonNegativeNumber(raw.inputCount, 0)),
    kpm: Math.round(toNonNegativeNumber(raw.kpm, 0)),
    wpm: Math.round(toNonNegativeNumber(raw.wpm, 0))
  };
}

function createEmptyRuntime(gameId = '') {
  return {
    gameId,
    promptIndex: 0,
    typed: '',
    stats: createEmptyStats(),
    eventTimeline: [],
    updatedAt: 0
  };
}

function createIdleGame() {
  return {
    status: 'idle',
    gameId: '',
    startAt: 0,
    endAt: 0,
    durationSec: config.GAME_DURATION_SEC,
    showRank: true,
    persistScores: true,
    seed: 0,
    prompts: []
  };
}

function createClassState(classId) {
  return {
    classId,
    players: new Map(),
    game: createIdleGame(),
    endTimer: null
  };
}

function createPlayerRecord(playerId, classId, playerName, meta = {}) {
  return {
    playerId,
    classId,
    name: playerName,
    uid: safeString(meta.uid, 64, ''),
    classRow: normalizeClassRow(meta.classRow, classId),
    attendanceNo: normalizeAttendanceNo(meta.attendanceNo, meta.uid),
    status: 'waiting',
    connected: false,
    ws: null,
    joinedAt: now(),
    lastHeartbeat: now(),
    lastSeenAt: now(),
    lastSubmittedGameId: '',
    activeGameId: '',
    currentGameJoinedAt: 0,
    runtime: createEmptyRuntime('')
  };
}

function getOrCreateClassState(classId) {
  if (!classStateMap.has(classId)) {
    classStateMap.set(classId, createClassState(classId));
  }
  return classStateMap.get(classId);
}

function getLiveClassIds() {
  return Array.from(classStateMap.keys());
}

function getAllClassIds() {
  const merged = new Set([...knownClassIds, ...getLiveClassIds()]);
  return Array.from(merged).sort((a, b) => a.localeCompare(b, 'ja'));
}

function refreshKnownClassIdsFromRecords(records) {
  const next = new Set(getLiveClassIds());
  for (const record of Array.isArray(records) ? records : []) {
    const classId = safeString(record && record.classId, config.MAX_CLASS_ID_LENGTH, '');
    if (classId) {
      next.add(classId);
    }
  }
  knownClassIds.clear();
  for (const classId of next) {
    knownClassIds.add(classId);
  }
}

function sendJson(ws, payload) {
  if (!ws || ws.readyState !== WS_OPEN) {
    return;
  }
  ws.send(JSON.stringify(payload));
}

function closeSocketQuietly(ws) {
  if (!ws) {
    return;
  }
  try {
    ws.close();
  } catch {
    // noop
  }
}

function serializeGame(game, includePrompts = false) {
  const payload = {
    state: game.status,
    gameId: game.gameId,
    startAt: game.startAt,
    endAt: game.endAt,
    durationSec: Number.isFinite(game.durationSec) ? game.durationSec : config.GAME_DURATION_SEC,
    showRank: game.showRank !== false,
    persistScores: game.persistScores !== false,
    promptCount: game.prompts.length
  };

  if (includePrompts) {
    payload.prompts = game.prompts;
  }

  return payload;
}

function serializePlayerState(player) {
  return {
    playerId: player.playerId,
    name: player.name,
    uid: player.uid || '',
    classId: player.classId,
    classRow: player.classRow || normalizeClassRow('', player.classId),
    attendanceNo: normalizeAttendanceNo(player.attendanceNo, player.uid),
    connected: Boolean(player.connected),
    status: player.status,
    activeGameId: player.activeGameId || '',
    lastSubmittedGameId: player.lastSubmittedGameId || ''
  };
}

function serializeResumeState(player, classState) {
  if (!player || !classState || !classState.game.gameId) {
    return null;
  }

  const gameId = classState.game.gameId;
  if (player.runtime.gameId !== gameId) {
    return null;
  }

  return {
    gameId,
    promptIndex: player.runtime.promptIndex,
    typed: player.runtime.typed,
    stats: player.runtime.stats,
    eventTimeline: Array.isArray(player.runtime.eventTimeline) ? player.runtime.eventTimeline : [],
    updatedAt: player.runtime.updatedAt,
    currentGameJoinedAt: player.currentGameJoinedAt
  };
}

function resetPlayerRuntimeForGame(player, gameId, joinedAt) {
  player.activeGameId = gameId;
  player.currentGameJoinedAt = joinedAt;
  player.runtime = createEmptyRuntime(gameId);
}

function syncClassLifecycle(classState) {
  if (!classState) {
    return;
  }

  const game = classState.game;
  const currentTime = now();

  if (game.status === 'running' && currentTime >= game.endAt && game.gameId) {
    game.status = 'ended';
  }

  for (const player of classState.players.values()) {
    if (game.status === 'running' && player.activeGameId === game.gameId) {
      if (player.lastSubmittedGameId === game.gameId) {
        player.status = 'finished';
      } else {
        player.status = currentTime < game.startAt ? 'waiting' : 'playing';
      }
      continue;
    }

    if (game.status === 'ended' && player.activeGameId === game.gameId) {
      player.status = 'finished';
      continue;
    }

    if (player.connected) {
      player.status = 'waiting';
    }
  }
}

function getClassCounters(classState) {
  syncClassLifecycle(classState);

  const counters = {
    connected: 0,
    waiting: 0,
    playing: 0,
    finished: 0,
    registered: 0,
    disconnected: 0
  };

  const currentGameId = classState.game.gameId;
  const useCurrentGameView = Boolean(currentGameId && classState.game.status !== 'idle');

  for (const player of classState.players.values()) {
    if (player.connected) {
      counters.connected += 1;
    } else if (player.activeGameId === currentGameId && currentGameId) {
      counters.disconnected += 1;
    }

    const includeInPhaseCounters = useCurrentGameView
      ? (
        player.activeGameId === currentGameId ||
        player.lastSubmittedGameId === currentGameId ||
        player.runtime.gameId === currentGameId
      )
      : player.connected;

    if (!includeInPhaseCounters) {
      continue;
    }

    counters.registered += 1;
    if (player.status === 'waiting') {
      counters.waiting += 1;
    } else if (player.status === 'playing') {
      counters.playing += 1;
    } else if (player.status === 'finished') {
      counters.finished += 1;
    }
  }

  return counters;
}

function serializeClassState(classState) {
  syncClassLifecycle(classState);
  return {
    classId: classState.classId,
    counters: getClassCounters(classState),
    game: serializeGame(classState.game, false),
    players: Array.from(classState.players.values())
      .map((player) => serializePlayerState(player))
      .sort((a, b) => {
        const rowCompare = String(a.classRow || '').localeCompare(String(b.classRow || ''), 'ja');
        if (rowCompare !== 0) return rowCompare;
        const seatCompare = Number(a.attendanceNo || 0) - Number(b.attendanceNo || 0);
        if (seatCompare !== 0) return seatCompare;
        return String(a.name || '').localeCompare(String(b.name || ''), 'ja');
      })
  };
}

function broadcastToAdmins(payload) {
  for (const ws of adminSockets) {
    sendJson(ws, payload);
  }
}

function broadcastToClass(classState, payload) {
  for (const player of classState.players.values()) {
    if (player.connected && player.ws) {
      sendJson(player.ws, payload);
    }
  }
}

function broadcastGameFeed(payload, options = {}) {
  const excludePlayerId = options.excludePlayerId || '';
  const requiredGameId = options.requiredGameId || '';

  for (const classState of classStateMap.values()) {
    for (const player of classState.players.values()) {
      if (!player.connected || !player.ws) {
        continue;
      }
      if (excludePlayerId && player.playerId === excludePlayerId) {
        continue;
      }
      if (requiredGameId && player.activeGameId !== requiredGameId) {
        continue;
      }
      sendJson(player.ws, payload);
    }
  }
}

function broadcastOfflineModeState(initiatedBy = 'server') {
  const payload = {
    t: 'offline_mode',
    enabled: Boolean(globalOfflineModeEnabled),
    initiatedBy: safeString(initiatedBy, 32, 'server'),
    serverTime: now()
  };
  for (const ws of wsContextMap.keys()) {
    sendJson(ws, payload);
  }
}

function forceStopClassGame(classState, reason = 'admin_force_stop') {
  if (!classState) {
    return { stopped: false, affectedPlayers: 0, gameId: '' };
  }

  const currentGameId = safeString(classState.game && classState.game.gameId, 128, '');
  const shouldStop = Boolean(classState.game && classState.game.status !== 'idle') || Boolean(currentGameId);
  if (!shouldStop) {
    return { stopped: false, affectedPlayers: 0, gameId: currentGameId };
  }

  clearClassTimer(classState);
  classState.game = createIdleGame();

  let affectedPlayers = 0;
  for (const player of classState.players.values()) {
    const isCurrentGamePlayer = currentGameId
      && (
        player.activeGameId === currentGameId
        || player.runtime.gameId === currentGameId
        || player.lastSubmittedGameId === currentGameId
      );
    if (isCurrentGamePlayer) {
      affectedPlayers += 1;
      player.activeGameId = '';
      player.currentGameJoinedAt = 0;
      player.runtime = createEmptyRuntime('');
    }
    if (player.connected) {
      player.status = 'waiting';
    }
  }

  broadcastToClass(classState, {
    t: 'force_stop',
    classId: classState.classId,
    reason: safeString(reason, 48, 'admin_force_stop'),
    offlineModeEnabled: Boolean(globalOfflineModeEnabled),
    serverTime: now()
  });
  broadcastClassState(classState.classId);

  return {
    stopped: true,
    affectedPlayers,
    gameId: currentGameId
  };
}

function forceStopAllGames(reason = 'admin_force_stop') {
  const classIds = [];
  const gameIds = [];
  let affectedPlayerCount = 0;
  let stoppedClassCount = 0;

  for (const classState of classStateMap.values()) {
    const result = forceStopClassGame(classState, reason);
    if (!result.stopped) {
      continue;
    }
    stoppedClassCount += 1;
    affectedPlayerCount += Number(result.affectedPlayers || 0);
    classIds.push(classState.classId);
    if (result.gameId) {
      gameIds.push(result.gameId);
    }
  }

  if (stoppedClassCount > 0) {
    broadcastLobbyState();
  }

  return {
    stoppedClassCount,
    affectedPlayerCount,
    classIds,
    gameIds
  };
}

function broadcastClassState(classId) {
  const classState = classStateMap.get(classId);
  if (!classState) {
    return;
  }

  const payload = {
    t: 'class_state',
    serverTime: now(),
    class: serializeClassState(classState)
  };

  broadcastToClass(classState, payload);
  broadcastToAdmins(payload);
}

function broadcastLobbyState() {
  const classes = getLiveClassIds()
    .sort((a, b) => a.localeCompare(b, 'ja'))
    .map((classId) => {
      const classState = classStateMap.get(classId);
      if (classState) {
        return serializeClassState(classState);
      }
      return {
        classId,
        counters: {
          connected: 0,
          waiting: 0,
          playing: 0,
          finished: 0,
          registered: 0,
          disconnected: 0
        },
        game: serializeGame(createIdleGame(), false)
      };
    });

  broadcastToAdmins({
    t: 'lobby_state',
    serverTime: now(),
    offlineModeEnabled: Boolean(globalOfflineModeEnabled),
    classes
  });
}

function buildClientConfig() {
  return {
    gameDurationSec: config.GAME_DURATION_SEC,
    startDelayMs: config.START_DELAY_MS,
    heartbeatIntervalMs: config.HEARTBEAT_INTERVAL_MS,
    scoreRule: SCORE_RULE,
    rankingMode: config.SCORE_MODE,
    serverPublicHost: config.SERVER_PUBLIC_HOST
  };
}

function clearClassTimer(classState) {
  if (classState.endTimer) {
    clearTimeout(classState.endTimer);
    classState.endTimer = null;
  }
}

function queueGasSyncForGame(gameId, reason = 'game_end', delayMs = 3000) {
  if (!gasSync || !gameId) {
    return;
  }
  if (gasFlushTimers.has(gameId)) {
    clearTimeout(gasFlushTimers.get(gameId));
  }
  const timer = setTimeout(() => {
    gasFlushTimers.delete(gameId);
    gasSync.queueReplaceAll(`${reason}:${gameId}`);
  }, Math.max(250, delayMs));
  gasFlushTimers.set(gameId, timer);
}

function endClassGame(classId, gameId) {
  const classState = classStateMap.get(classId);
  if (!classState) {
    return;
  }

  if (classState.game.gameId !== gameId || classState.game.status !== 'running') {
    return;
  }

  classState.game.status = 'ended';
  for (const player of classState.players.values()) {
    if (player.activeGameId === gameId && player.status !== 'finished') {
      player.status = 'finished';
    }
  }

  const payload = {
    t: 'game_state',
    serverTime: now(),
    classId,
    ...serializeGame(classState.game, false)
  };

  broadcastToClass(classState, payload);
  broadcastToAdmins(payload);
  broadcastClassState(classId);
  broadcastLobbyState();

  if (gasSync && classState.game.persistScores !== false) {
    queueGasSyncForGame(gameId, 'game_end', 4000);
  }

  log('INFO', `Game ended for class=${classId}, gameId=${gameId}`);
}

function startClassGame(classId, initiatedBy = 'admin', options = {}) {
  const classState = getOrCreateClassState(classId);
  syncClassLifecycle(classState);

  if (classState.game.status === 'running' && now() < classState.game.endAt) {
    return {
      ok: false,
      reason: 'already_running',
      game: classState.game
    };
  }

  knownClassIds.add(classId);

  const generated = options.generated || buildPromptQueue({
    count: config.PROMPT_QUEUE_SIZE,
    seed: now() + Math.floor(Math.random() * 1000)
  });

  const startAt = Number.isFinite(options.startAt) ? Number(options.startAt) : now() + config.START_DELAY_MS;
  const endAt = Number.isFinite(options.endAt) ? Number(options.endAt) : startAt + config.GAME_DURATION_MS;
  const gameId = safeString(options.gameId, 128, '') || `${classId}_${startAt}_${crypto.randomBytes(3).toString('hex')}`;

  clearClassTimer(classState);

  classState.game = {
    status: 'running',
    gameId,
    startAt,
    endAt,
    durationSec: Math.max(1, Math.round((endAt - startAt) / 1000)),
    showRank: options.showRank !== false,
    persistScores: options.persistScores !== false,
    seed: generated.seed,
    prompts: generated.prompts
  };

  for (const player of classState.players.values()) {
    if (player.connected) {
      resetPlayerRuntimeForGame(player, gameId, now());
      player.status = 'waiting';
      continue;
    }

    if (player.activeGameId === gameId) {
      player.status = 'waiting';
    }
  }

  classState.endTimer = setTimeout(() => {
    endClassGame(classId, gameId);
  }, Math.max(0, endAt - now()) + 50);

  const studentPayload = {
    t: 'game_state',
    serverTime: now(),
    classId,
    ...serializeGame(classState.game, true)
  };

  const adminPayload = {
    t: 'game_state',
    serverTime: now(),
    classId,
    ...serializeGame(classState.game, false)
  };

  broadcastToClass(classState, studentPayload);
  broadcastToAdmins(adminPayload);
  broadcastClassState(classId);
  broadcastLobbyState();

  log('INFO', `Game started class=${classId}, gameId=${gameId}, by=${initiatedBy}`);

  return {
    ok: true,
    game: classState.game
  };
}

function detachStudentConnection(context) {
  if (!context || context.role !== 'student' || !context.classId || !context.playerId) {
    return;
  }

  const classState = classStateMap.get(context.classId);
  if (!classState) {
    return;
  }

  const player = classState.players.get(context.playerId);
  if (!player) {
    return;
  }

  if (player.ws && context.ws && player.ws !== context.ws) {
    return;
  }

  if (player.ws === context.ws) {
    player.ws = null;
  }
  player.connected = false;
  player.lastSeenAt = now();

  broadcastClassState(classState.classId);
  broadcastLobbyState();
}

function markSocketAlive(ws) {
  const context = wsContextMap.get(ws);
  if (!context) {
    return;
  }

  context.lastHeartbeat = now();
  if (context.role === 'student') {
    const classState = classStateMap.get(context.classId);
    const player = classState && classState.players.get(context.playerId);
    if (player) {
      player.lastHeartbeat = context.lastHeartbeat;
      player.lastSeenAt = context.lastHeartbeat;
    }
  }
}

function sendError(ws, code, message) {
  sendJson(ws, {
    t: 'error',
    code,
    message,
    serverTime: now()
  });
}

function handleHello(ws, msg) {
  const role = msg.role === 'admin' ? 'admin' : 'student';
  const context = wsContextMap.get(ws) || { connectionId: crypto.randomUUID() };

  context.role = role;
  context.lastHeartbeat = now();
  context.ws = ws;
  wsContextMap.set(ws, context);

  if (role === 'admin') {
    adminSockets.add(ws);
  }

  sendJson(ws, {
    t: 'welcome',
    role,
    connectionId: context.connectionId,
    serverTime: now(),
    offlineModeEnabled: Boolean(globalOfflineModeEnabled),
    config: buildClientConfig(),
    classes: getAllClassIds()
  });

  if (role === 'admin') {
    sendJson(ws, {
      t: 'admin_log_history',
      serverTime: now(),
      entries: adminLogHistory
    });
    broadcastLobbyState();
  }
}

function attachPlayerToCurrentGameIfNeeded(player, classState) {
  const game = classState.game;
  if (!game.gameId || game.status !== 'running') {
    return;
  }

  if (player.activeGameId === game.gameId) {
    return;
  }

  if (now() >= game.endAt) {
    return;
  }

  resetPlayerRuntimeForGame(player, game.gameId, now());
}

function resolvePlayerStatusOnJoin(player, classState) {
  const game = classState.game;
  syncClassLifecycle(classState);

  if (game.status === 'running' && player.activeGameId === game.gameId) {
    player.status = now() < game.startAt ? 'waiting' : 'playing';
    return;
  }

  if (game.status === 'ended' && player.activeGameId === game.gameId) {
    player.status = 'finished';
    return;
  }

  player.status = 'waiting';
}

function handleJoin(ws, msg) {
  const context = wsContextMap.get(ws);
  if (!context || context.role !== 'student') {
    sendError(ws, 'unauthorized', 'hello(role=student) の後に join を送信してください');
    return;
  }

  const classId = safeString(msg.classId, config.MAX_CLASS_ID_LENGTH);
  const playerName = safeString(msg.playerName, config.MAX_PLAYER_NAME_LENGTH);
  const uid = safeString(msg.uid, 64, '');
  const classRow = normalizeClassRow(msg.classRow, classId);
  const attendanceNo = normalizeAttendanceNo(msg.attendanceNo, uid);
  if (!classId || !playerName) {
    sendError(ws, 'invalid_join', 'クラス名と名前を入力してください');
    return;
  }

  knownClassIds.add(classId);
  const classState = getOrCreateClassState(classId);

  let playerId = safeString(msg.playerId, 64, '');
  if (!playerId) {
    playerId = crypto.randomUUID();
  }

  let player = classState.players.get(playerId);
  if (!player) {
    const resumeByName = Array.from(classState.players.values()).find((item) => {
      return !item.connected && item.name === playerName;
    });

    if (resumeByName) {
      player = resumeByName;
      playerId = resumeByName.playerId;
    }
  }

  if (!player) {
    player = createPlayerRecord(playerId, classId, playerName, { uid, classRow, attendanceNo });
    classState.players.set(playerId, player);
  }

  if (player.connected && player.ws && player.ws !== ws) {
    closeSocketQuietly(player.ws);
  }

  player.name = playerName;
  player.uid = uid;
  player.classRow = normalizeClassRow(classRow, classId);
  player.attendanceNo = normalizeAttendanceNo(attendanceNo, uid);
  player.connected = true;
  player.ws = ws;
  player.lastHeartbeat = now();
  player.lastSeenAt = now();

  attachPlayerToCurrentGameIfNeeded(player, classState);
  resolvePlayerStatusOnJoin(player, classState);

  context.classId = classId;
  context.playerId = playerId;
  context.playerName = playerName;
  context.lastHeartbeat = now();
  context.ws = ws;

  const classSnapshot = serializeClassState(classState);
  sendJson(ws, {
    t: 'join',
    ok: true,
    serverTime: now(),
    offlineModeEnabled: Boolean(globalOfflineModeEnabled),
    classId,
    playerId,
    playerName,
    classState: classSnapshot
  });

  const shouldSendGameState =
    classState.game.status === 'running' ||
    (
      classState.game.status === 'ended' &&
      (
        player.activeGameId === classState.game.gameId ||
        player.lastSubmittedGameId === classState.game.gameId ||
        player.runtime.gameId === classState.game.gameId
      )
    );

  if (shouldSendGameState) {
    sendJson(ws, {
      t: 'game_state',
      serverTime: now(),
      classId,
      ...serializeGame(classState.game, true),
      resume: serializeResumeState(player, classState)
    });
  }

  broadcastClassState(classId);
  broadcastLobbyState();
  log('INFO', `join class=${classId}, name=${playerName}, playerId=${playerId}`);
}

function handleLeave(ws) {
  const context = wsContextMap.get(ws);
  detachStudentConnection(context);
  if (context) {
    delete context.classId;
    delete context.playerId;
    delete context.playerName;
  }
}

function handleAdminStart(ws, msg) {
  const context = wsContextMap.get(ws);
  if (!context || context.role !== 'admin') {
    sendError(ws, 'unauthorized', '管理者のみ開始できます');
    return;
  }

  if (globalOfflineModeEnabled) {
    sendError(ws, 'offline_mode_active', 'オフラインモード中は一斉開始できません');
    return;
  }

  const scope = 'all';
  let targetClassIds = [];
  let sharedStartOptions = null;

  targetClassIds = getLiveClassIds().filter((classId) => {
    const classState = classStateMap.get(classId);
    return classState && getClassCounters(classState).connected > 0;
  });

  if (targetClassIds.length === 0) {
    sendError(ws, 'invalid_start', '開始対象クラスがありません');
    return;
  }

  const requestedDurationSec = Math.max(10, Math.min(3600, Math.round(toNonNegativeNumber(msg.durationSec, config.GAME_DURATION_SEC))));
  const showRank = msg.showRank !== false;
  const persistScores = requestedDurationSec === PERSISTENCE_DURATION_SEC;
  const generated = buildPromptQueue({
    count: config.PROMPT_QUEUE_SIZE,
    seed: now() + Math.floor(Math.random() * 1000)
  });
  const startAt = now() + config.START_DELAY_MS;
  sharedStartOptions = {
    generated,
    startAt,
    endAt: startAt + requestedDurationSec * 1000,
    showRank,
    persistScores,
    gameId: `all_${startAt}_${crypto.randomBytes(3).toString('hex')}`
  };

  const results = targetClassIds.map((classId) => {
    const started = startClassGame(classId, 'admin', sharedStartOptions || {});
    return {
      classId,
      ok: started.ok,
      reason: started.reason || '',
      gameId: started.game.gameId,
      startAt: started.game.startAt,
      endAt: started.game.endAt
    };
  });

  sendJson(ws, {
    t: 'admin_start',
    ok: results.some((item) => item.ok),
    scope,
    durationSec: requestedDurationSec,
    showRank,
    persistScores,
    results,
    serverTime: now()
  });
}

function handleAdminForceStop(ws) {
  const context = wsContextMap.get(ws);
  if (!context || context.role !== 'admin') {
    sendError(ws, 'unauthorized', '管理者のみ強制終了できます');
    return;
  }

  const stopped = forceStopAllGames('admin_force_stop');
  const summaryMessage = `強制終了を実行しました。stoppedClasses=${stopped.stoppedClassCount} affectedPlayers=${stopped.affectedPlayerCount}`;
  pushAdminLog('WARN', summaryMessage);
  log('WARN', summaryMessage);

  sendJson(ws, {
    t: 'admin_force_stop',
    ok: true,
    ...stopped,
    offlineModeEnabled: Boolean(globalOfflineModeEnabled),
    serverTime: now()
  });
}

function handleAdminSetOfflineMode(ws, msg) {
  const context = wsContextMap.get(ws);
  if (!context || context.role !== 'admin') {
    sendError(ws, 'unauthorized', 'admin 権限が必要です');
    return;
  }

  const enabled = Boolean(msg && msg.enabled);
  const changed = globalOfflineModeEnabled !== enabled;
  globalOfflineModeEnabled = enabled;

  const stopped = changed
    ? forceStopAllGames(enabled ? 'offline_mode_on' : 'offline_mode_off')
    : {
      stoppedClassCount: 0,
      affectedPlayerCount: 0,
      classIds: [],
      gameIds: []
    };

  broadcastOfflineModeState('admin');
  if (changed) {
    const summaryMessage = enabled
      ? `オフラインモードを ON にしました。stoppedClasses=${stopped.stoppedClassCount} affectedPlayers=${stopped.affectedPlayerCount}`
      : `オフラインモードを OFF にしました。stoppedClasses=${stopped.stoppedClassCount} affectedPlayers=${stopped.affectedPlayerCount}`;
    pushAdminLog('INFO', summaryMessage);
    log('INFO', summaryMessage);
  }

  sendJson(ws, {
    t: 'admin_offline_mode',
    ok: true,
    changed,
    enabled: Boolean(globalOfflineModeEnabled),
    ...stopped,
    serverTime: now()
  });
}

function handleProgress(ws, msg) {
  const context = wsContextMap.get(ws);
  if (!context || context.role !== 'student' || !context.classId || !context.playerId) {
    return;
  }

  const classState = classStateMap.get(context.classId);
  if (!classState) {
    return;
  }

  const player = classState.players.get(context.playerId);
  if (!player) {
    return;
  }

  const gameId = safeString(msg.gameId, 128);
  if (!gameId || player.activeGameId !== gameId) {
    return;
  }

  const promptIndex = Math.floor(toNonNegativeNumber(msg.promptIndex, 0));
  const typed = safeString(msg.typed, 128, '');

  player.runtime = {
    gameId,
    promptIndex,
    typed,
    stats: sanitizeRuntimeStats(msg.stats),
    eventTimeline: Array.isArray(player.runtime.eventTimeline) ? player.runtime.eventTimeline : [],
    updatedAt: now()
  };
  player.lastSeenAt = now();

  if (classState.game.status === 'running' && now() >= classState.game.startAt) {
    player.status = 'playing';
  }
}

function handleFeedEvent(ws, msg) {
  const context = wsContextMap.get(ws);
  if (!context || context.role !== 'student' || !context.classId || !context.playerId) {
    return;
  }

  const classState = classStateMap.get(context.classId);
  if (!classState) {
    return;
  }

  const player = classState.players.get(context.playerId);
  if (!player) {
    return;
  }

  const gameId = safeString(msg.gameId, 128);
  if (!gameId || player.activeGameId !== gameId || classState.game.gameId !== gameId || classState.game.status !== 'running') {
    return;
  }

  const eventType = safeString(msg.event, 32);
  const commonPayload = {
    t: 'class_feed',
    serverTime: now(),
    classId: context.classId,
    gameId,
    playerId: context.playerId,
    playerName: player.name
  };

  if (eventType === 'achievement') {
    const comboThreshold = Math.floor(toNonNegativeNumber(msg.comboThreshold, 0));
    const isBaseThreshold = [30, 80, 150, 300].includes(comboThreshold);
    const isHighMilestone = comboThreshold >= 400 && comboThreshold % 100 === 0;
    if (!isBaseThreshold && !isHighMilestone) {
      return;
    }
    if (player.runtime && player.runtime.gameId === gameId) {
      player.runtime.eventTimeline = Array.isArray(player.runtime.eventTimeline) ? player.runtime.eventTimeline : [];
      player.runtime.eventTimeline.push({
        event: 'achievement',
        comboThreshold,
        atMs: Math.max(0, now() - classState.game.startAt)
      });
      if (player.runtime.eventTimeline.length > 24) {
        player.runtime.eventTimeline = player.runtime.eventTimeline.slice(-24);
      }
      player.runtime.updatedAt = now();
    }
    broadcastGameFeed({
      ...commonPayload,
      event: 'achievement',
      comboThreshold
    }, {
      excludePlayerId: context.playerId,
      requiredGameId: gameId
    });
    return;
  }

  if (eventType === 'critical_miss') {
    const comboAtMiss = Math.floor(toNonNegativeNumber(msg.comboAtMiss, 0));
    if (comboAtMiss < 30) {
      return;
    }
    if (player.runtime && player.runtime.gameId === gameId) {
      player.runtime.eventTimeline = Array.isArray(player.runtime.eventTimeline) ? player.runtime.eventTimeline : [];
      player.runtime.eventTimeline.push({
        event: 'critical_miss',
        comboAtMiss,
        atMs: Math.max(0, now() - classState.game.startAt)
      });
      if (player.runtime.eventTimeline.length > 24) {
        player.runtime.eventTimeline = player.runtime.eventTimeline.slice(-24);
      }
      player.runtime.updatedAt = now();
    }
    broadcastGameFeed({
      ...commonPayload,
      event: 'critical_miss',
      comboAtMiss
    }, {
      excludePlayerId: context.playerId,
      requiredGameId: gameId
    });
  }
}

function computeAuthoritativeDurationSec(player, classState) {
  const game = classState.game;
  if (!game.gameId) {
    return config.GAME_DURATION_SEC;
  }

  const joinedAt = player.currentGameJoinedAt || game.startAt;
  const effectiveStart = Math.max(game.startAt, joinedAt);
  const effectiveEnd = Math.min(now(), game.endAt || now());
  const elapsedMs = Math.max(0, effectiveEnd - effectiveStart);
  return Math.max(0, Math.min(config.GAME_DURATION_SEC, Math.round(elapsedMs / 1000)));
}

function compareLiveRankRows(a, b) {
  if (a.score !== b.score) {
    return b.score - a.score;
  }
  if (a.accuracy !== b.accuracy) {
    return b.accuracy - a.accuracy;
  }
  if (a.missCount !== b.missCount) {
    return a.missCount - b.missCount;
  }
  return (a.lastSeenAt || 0) - (b.lastSeenAt || 0);
}

function buildLiveGameRankSummary(gameId, playerId) {
  const targetGameId = safeString(gameId, 128, '');
  const targetPlayerId = safeString(playerId, 64, '');
  if (!targetGameId || !targetPlayerId) {
    return {
      rank: null,
      total: 0,
      score: null,
      accuracy: null
    };
  }

  const rows = [];
  for (const classState of classStateMap.values()) {
    for (const player of classState.players.values()) {
      if (
        player.activeGameId !== targetGameId &&
        player.lastSubmittedGameId !== targetGameId &&
        (!player.runtime || player.runtime.gameId !== targetGameId)
      ) {
        continue;
      }
      const runtimeStats = player.runtime && player.runtime.gameId === targetGameId
        ? player.runtime.stats
        : createEmptyStats();
      const computed = computeScore({
        ...runtimeStats,
        durationSec: computeAuthoritativeDurationSec(player, classState)
      });
      rows.push({
        playerId: player.playerId,
        score: computed.score,
        accuracy: computed.accuracy,
        missCount: computed.missCount,
        lastSeenAt: player.lastSeenAt || 0
      });
    }
  }

  const ranked = rows
    .sort(compareLiveRankRows)
    .map((row, index) => ({ ...row, rank: index + 1 }));
  const row = ranked.find((item) => item.playerId === targetPlayerId);

  return {
    rank: row ? row.rank : null,
    total: ranked.length,
    score: row ? row.score : null,
    accuracy: row ? row.accuracy : null
  };
}

function normalizeGameIdArray(values) {
  const source = Array.isArray(values) ? values : [values];
  const seen = new Set();
  const normalized = [];
  for (const value of source) {
    const gameId = safeString(value, 128, '');
    if (!gameId || seen.has(gameId)) {
      continue;
    }
    seen.add(gameId);
    normalized.push(gameId);
  }
  return normalized;
}

function buildAdminRecordId(record, index) {
  const timestamp = safeString(record && record.timestamp, 64, '');
  const gameId = safeString(record && record.gameId, 128, '');
  const classId = safeString(record && record.classId, config.MAX_CLASS_ID_LENGTH, '');
  const uid = safeString(record && record.uid, 64, '');
  const playerName = safeString(record && record.playerName, 64, '');
  const source = `${index}|${timestamp}|${gameId}|${classId}|${uid}|${playerName}`;
  return crypto.createHash('sha1').update(source).digest('hex').slice(0, 16);
}

function buildAdminScoreCatalog(records) {
  const gameMap = new Map();
  for (const record of Array.isArray(records) ? records : []) {
    const gameId = safeString(record && record.gameId, 128, '');
    if (!gameId) {
      continue;
    }
    const recordTimestamp = safeString(record && record.timestamp, 64, '');
    const recordTimestampMs = Date.parse(recordTimestamp) || 0;
    const current = gameMap.get(gameId) || {
      gameId,
      count: 0,
      latestTimestampMs: 0,
      latestTimestamp: ''
    };
    current.count += 1;
    if (recordTimestampMs >= current.latestTimestampMs) {
      current.latestTimestampMs = recordTimestampMs;
      current.latestTimestamp = recordTimestamp;
    }
    gameMap.set(gameId, current);
  }

  return Array.from(gameMap.values())
    .sort((a, b) => {
      if (a.latestTimestampMs !== b.latestTimestampMs) {
        return b.latestTimestampMs - a.latestTimestampMs;
      }
      return a.gameId.localeCompare(b.gameId, 'ja');
    })
    .map((item) => ({
      gameId: item.gameId,
      count: item.count,
      latestTimestamp: item.latestTimestamp,
      latestTimestampIso: item.latestTimestampMs > 0 ? new Date(item.latestTimestampMs).toISOString() : ''
    }));
}

function buildAdminScoreRecords(records, gameIds, limit = 2000) {
  const selectedGameIds = normalizeGameIdArray(gameIds);
  const gameIdSet = new Set(selectedGameIds);
  const rows = [];

  (Array.isArray(records) ? records : []).forEach((record, index) => {
    const gameId = safeString(record && record.gameId, 128, '');
    if (!gameIdSet.has(gameId)) {
      return;
    }
    const timestamp = safeString(record && record.timestamp, 64, '');
    rows.push({
      recordId: buildAdminRecordId(record, index),
      timestamp,
      timestampMs: Date.parse(timestamp) || 0,
      gameId,
      classId: safeString(record && record.classId, config.MAX_CLASS_ID_LENGTH, ''),
      no: Math.max(0, Math.floor(toNonNegativeNumber(record && record.no, 0))),
      uid: safeString(record && record.uid, 64, ''),
      playerName: safeString(record && record.playerName, 64, ''),
      score: Math.round(toNonNegativeNumber(record && record.score, 0)),
      accuracy: Number(toNonNegativeNumber(record && record.accuracy, 0).toFixed(2)),
      missCount: Math.floor(toNonNegativeNumber(record && record.missCount, 0))
    });
  });

  rows.sort((a, b) => {
    if (a.timestampMs !== b.timestampMs) {
      return b.timestampMs - a.timestampMs;
    }
    if (a.gameId !== b.gameId) {
      return a.gameId.localeCompare(b.gameId, 'ja');
    }
    return a.recordId.localeCompare(b.recordId, 'ja');
  });

  const totalMatched = rows.length;
  const items = rows.slice(0, Math.max(1, limit)).map((row) => {
    const { timestampMs: _timestampMs, ...record } = row;
    return record;
  });

  return {
    items,
    totalMatched,
    truncated: totalMatched > items.length
  };
}

function getRankingRecordKey(record) {
  const uid = safeString(record && record.uid, 64, '');
  if (uid) {
    return `uid:${uid}`;
  }
  const playerId = safeString(record && record.playerId, 64, '');
  if (playerId) {
    return `id:${playerId}`;
  }
  const classId = safeString(record && record.classId, config.MAX_CLASS_ID_LENGTH, '');
  const playerName = safeString(record && record.playerName, config.MAX_PLAYER_NAME_LENGTH, '');
  return `name:${classId}:${playerName}`;
}

function buildBestRecordsByKey(records) {
  const source = Array.isArray(records) ? records : [];
  const map = new Map();
  for (const record of source) {
    const key = getRankingRecordKey(record);
    const current = map.get(key);
    if (!current || compareRanking(record, current) < 0) {
      map.set(key, record);
    }
  }
  return Array.from(map.values());
}

function getRankingClassRow(record) {
  const classId = safeString(record && record.classId, config.MAX_CLASS_ID_LENGTH, '').toUpperCase();
  const match = classId.match(/([A-H])$/);
  return match ? match[1] : '';
}

function toRankingRows(records, limit = 200) {
  return buildBestRecordsByKey(records)
    .sort(compareRanking)
    .slice(0, Math.max(1, limit))
    .map((record, index) => ({
      rank: index + 1,
      classId: safeString(record.classId, config.MAX_CLASS_ID_LENGTH, '-'),
      no: Math.max(0, Math.floor(toNonNegativeNumber(record.no, 0))),
      uid: safeString(record.uid, 64, ''),
      playerName: safeString(record.playerName, config.MAX_PLAYER_NAME_LENGTH, '-'),
      score: Math.round(toNonNegativeNumber(record.score, 0)),
      accuracy: Number(toNonNegativeNumber(record.accuracy, 0).toFixed(2)),
      timestamp: safeString(record.timestamp, 64, '')
    }));
}

function buildAdminRankingPayload(records, options = {}) {
  const source = Array.isArray(records) ? records : [];
  const selectedGameIds = normalizeGameIdArray(options && options.gameIds);
  const selectedGameIdSet = new Set(selectedGameIds);
  const classTabs = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

  const rankingSource = source.filter((record) => {
    return Boolean(getRankingClassRow(record));
  });

  const selectedGameSource = selectedGameIds.length
    ? rankingSource.filter((record) => {
      const gameId = safeString(record && record.gameId, 128, '');
      return selectedGameIdSet.has(gameId);
    })
    : [];

  const byClass = {};
  for (const classTab of classTabs) {
    const classRows = rankingSource.filter((record) => getRankingClassRow(record) === classTab);
    const items = toRankingRows(classRows, 200);
    byClass[classTab] = {
      total: items.length,
      items
    };
  }

  const overallItems = toRankingRows(rankingSource, 200);
  const selectedItems = toRankingRows(selectedGameSource, 200);

  return {
    selectedGame: {
      gameIds: selectedGameIds,
      total: selectedItems.length,
      items: selectedItems
    },
    overall: {
      total: overallItems.length,
      items: overallItems
    },
    byClass
  };
}

async function handleAdminScoresQuery(ws, msg) {
  const context = wsContextMap.get(ws);
  if (!context || context.role !== 'admin') {
    sendError(ws, 'unauthorized', 'admin 権限が必要です');
    return;
  }

  const mode = safeString(msg.mode, 16, 'catalog');
  const records = await readAllScores();

  if (mode === 'catalog') {
    const items = buildAdminScoreCatalog(records);
    sendJson(ws, {
      t: 'admin_scores_query',
      ok: true,
      mode: 'catalog',
      items,
      totalRecords: records.length,
      serverTime: now()
    });
    return;
  }

  if (mode === 'records') {
    const gameIds = normalizeGameIdArray(msg.gameIds);
    const rows = buildAdminScoreRecords(records, gameIds, 2000);
    sendJson(ws, {
      t: 'admin_scores_query',
      ok: true,
      mode: 'records',
      gameIds,
      items: rows.items,
      totalMatched: rows.totalMatched,
      truncated: rows.truncated,
      serverTime: now()
    });
    return;
  }

  if (mode === 'rankings') {
    const gameIds = normalizeGameIdArray(msg.gameIds);
    const rankingPayload = buildAdminRankingPayload(records, { gameIds });
    sendJson(ws, {
      t: 'admin_scores_query',
      ok: true,
      mode: 'rankings',
      gameIds,
      rankings: rankingPayload,
      totalRecords: records.length,
      serverTime: now()
    });
    return;
  }

  sendError(ws, 'invalid_admin_scores_mode', 'mode は catalog / records / rankings を指定してください');
}

async function handleAdminClearScores(ws, msg) {
  const context = wsContextMap.get(ws);
  if (!context || context.role !== 'admin') {
    sendError(ws, 'unauthorized', 'admin 権限が必要です');
    return;
  }

  const mode = safeString(msg.mode, 16, '');
  if (mode !== 'all' && mode !== 'game' && mode !== 'games' && mode !== 'records') {
    sendError(ws, 'invalid_clear_mode', 'mode は all / game / games / records を指定してください');
    return;
  }

  const sourceRecords = await readAllScores();
  let nextRecords = sourceRecords;
  let removedCount = 0;
  let gameId = '';
  let gameIds = [];
  let recordIds = [];

  if (mode === 'all') {
    removedCount = sourceRecords.length;
    nextRecords = [];
  } else if (mode === 'game') {
    gameId = safeString(msg.gameId, 128, '');
    if (!gameId) {
      sendError(ws, 'invalid_game_id', '削除する gameId を指定してください');
      return;
    }
    nextRecords = sourceRecords.filter((record) => safeString(record && record.gameId, 128, '') !== gameId);
    removedCount = sourceRecords.length - nextRecords.length;
    gameIds = [gameId];
  } else if (mode === 'games') {
    gameIds = normalizeGameIdArray(msg.gameIds);
    if (gameIds.length === 0) {
      sendError(ws, 'invalid_game_ids', '削除する gameId を1件以上選択してください');
      return;
    }
    const gameIdSet = new Set(gameIds);
    nextRecords = sourceRecords.filter((record) => !gameIdSet.has(safeString(record && record.gameId, 128, '')));
    removedCount = sourceRecords.length - nextRecords.length;
  } else if (mode === 'records') {
    const requestedRecordIds = Array.isArray(msg.recordIds) ? msg.recordIds : [];
    const recordIdSet = new Set(
      requestedRecordIds
        .map((value) => safeString(value, 64, ''))
        .filter(Boolean)
    );
    if (recordIdSet.size === 0) {
      sendError(ws, 'invalid_record_ids', '削除するレコードを1件以上選択してください');
      return;
    }
    nextRecords = [];
    sourceRecords.forEach((record, index) => {
      const recordId = buildAdminRecordId(record, index);
      if (recordIdSet.has(recordId)) {
        removedCount += 1;
        recordIds.push(recordId);
      } else {
        nextRecords.push(record);
      }
    });
  }

  await replaceScores(nextRecords);
  refreshKnownClassIdsFromRecords(nextRecords);
  broadcastLobbyState();

  const remainingCount = nextRecords.length;
  let summaryMessage = '';
  if (mode === 'all') {
    summaryMessage = `記録全消去を実行しました。removed=${removedCount} remaining=${remainingCount}`;
  } else if (mode === 'game') {
    summaryMessage = `gameId=${gameId} の記録削除を実行しました。removed=${removedCount} remaining=${remainingCount}`;
  } else if (mode === 'games') {
    summaryMessage = `複数 gameId の記録削除を実行しました。targets=${gameIds.length} removed=${removedCount} remaining=${remainingCount}`;
  } else {
    summaryMessage = `個別レコード削除を実行しました。targets=${recordIds.length} removed=${removedCount} remaining=${remainingCount}`;
  }
  pushAdminLog('INFO', summaryMessage);

  if (gasSync) {
    if (mode === 'all') {
      gasSync.queueReplaceAll('admin_clear_all');
    } else if (mode === 'game') {
      gasSync.queueReplaceAll(`admin_clear_game:${gameId}`);
    } else if (mode === 'games') {
      gasSync.queueReplaceAll(`admin_clear_games:${gameIds.length}`);
    } else {
      gasSync.queueReplaceAll(`admin_clear_records:${removedCount}`);
    }
  }

  sendJson(ws, {
    t: 'admin_clear_scores',
    ok: true,
    mode,
    gameId,
    gameIds,
    recordIds,
    removedCount,
    remainingCount,
    serverTime: now()
  });
}

async function getResultRankSummary(gameId, playerId) {
  const liveSummary = buildLiveGameRankSummary(gameId, playerId);
  if (liveSummary.total > 0) {
    return liveSummary;
  }
  return getGameRankSummary(gameId, playerId);
}

async function handleSubmitScore(ws, msg) {
  const context = wsContextMap.get(ws);
  if (!context || context.role !== 'student' || !context.classId || !context.playerId) {
    sendError(ws, 'unauthorized', 'join 後に submit_score を送信してください');
    return;
  }

  const classState = classStateMap.get(context.classId);
  if (!classState) {
    sendError(ws, 'invalid_submit', 'クラス状態が見つかりません');
    return;
  }

  const player = classState.players.get(context.playerId);
  if (!player) {
    sendError(ws, 'invalid_submit', 'プレイヤー情報が見つかりません');
    return;
  }

  const gameId = safeString(msg.gameId, 128, classState.game.gameId || '');
  if (!gameId) {
    sendError(ws, 'invalid_submit', 'gameId が必要です');
    return;
  }

  if (player.lastSubmittedGameId === gameId) {
    const rankSummary = await getResultRankSummary(gameId, context.playerId);
    sendJson(ws, {
      t: 'result',
      ok: true,
      duplicate: true,
      rankSummary,
      rankingMode: 'game',
      serverTime: now()
    });
    return;
  }

  if (player.activeGameId !== gameId && player.runtime.gameId !== gameId) {
    sendError(ws, 'invalid_submit', '現在のゲームと一致しない gameId です');
    return;
  }

  const runtimeStats = player.runtime.gameId === gameId ? player.runtime.stats : createEmptyStats();
  const rawMetrics = (msg.metrics && typeof msg.metrics === 'object') ? msg.metrics : {};
  const authoritativeMetrics = {
    ...runtimeStats,
    ...rawMetrics,
    durationSec: computeAuthoritativeDurationSec(player, classState)
  };

  const computed = computeScore(authoritativeMetrics);
  const timestamp = new Date().toISOString();

  const record = {
    timestamp,
    classId: context.classId,
    uid: String(player.uid || '').trim(),
    no: Math.max(0, Math.round(Number(player.attendanceNo || 0))),
    playerId: context.playerId,
    playerName: player.name,
    score: computed.score,
    accuracy: computed.accuracy,
    correctCount: computed.correctCount,
    missCount: computed.missCount,
    completedPrompts: computed.completedPrompts,
    durationSec: computed.durationSec,
    inputCount: computed.inputCount,
    maxCombo: computed.maxCombo,
    kpm: Math.round(toNonNegativeNumber(authoritativeMetrics.kpm, 0)),
    wpm: Math.round(toNonNegativeNumber(authoritativeMetrics.wpm, 0)),
    eventTimeline: JSON.stringify(Array.isArray(player.runtime.eventTimeline) ? player.runtime.eventTimeline : []),
    gameId
  };

  const shouldPersistRecord = Boolean(
    classState.game
    && classState.game.persistScores !== false
    && Number(classState.game.durationSec || 0) === PERSISTENCE_DURATION_SEC
  );

  if (shouldPersistRecord) {
    try {
      await appendScore(record);
    } catch (error) {
      log('ERROR', 'Failed to append score', error);
      sendError(ws, 'save_failed', 'スコア保存に失敗しました');
      return;
    }
  }

  if (gasSync && shouldPersistRecord) {
    queueGasSyncForGame(gameId, 'submit_batch', 3500);
  }

  player.lastSubmittedGameId = gameId;
  player.status = 'finished';
  player.lastSeenAt = now();

  const rankSummary = await getResultRankSummary(gameId, context.playerId);

  sendJson(ws, {
    t: 'result',
    ok: true,
    record,
    recordSaved: shouldPersistRecord,
    rankSummary,
    rankingMode: 'game',
    serverTime: now()
  });

  broadcastClassState(context.classId);
  broadcastLobbyState();
}

function handleMessage(ws, messageText) {
  let msg;
  try {
    msg = JSON.parse(String(messageText));
  } catch {
    sendError(ws, 'invalid_json', 'JSON 形式のメッセージを送信してください');
    return;
  }

  const type = msg.t;
  if (!type) {
    sendError(ws, 'invalid_message', 't フィールドが必要です');
    return;
  }

  if (type === 'hello') {
    handleHello(ws, msg);
    return;
  }

  if (type === 'heartbeat') {
    markSocketAlive(ws);
    sendJson(ws, {
      t: 'heartbeat',
      serverTime: now(),
      seq: Number(msg.seq || 0)
    });
    return;
  }

  if (type === 'join') {
    handleJoin(ws, msg);
    return;
  }

  if (type === 'leave') {
    handleLeave(ws);
    return;
  }

  if (type === 'admin_start') {
    handleAdminStart(ws, msg);
    return;
  }

  if (type === 'admin_force_stop') {
    handleAdminForceStop(ws);
    return;
  }

  if (type === 'admin_set_offline_mode') {
    handleAdminSetOfflineMode(ws, msg);
    return;
  }

  if (type === 'admin_clear_scores') {
    handleAdminClearScores(ws, msg).catch((error) => {
      log('WARN', `admin_clear_scores failed: ${error && error.message ? error.message : error}`);
      sendError(ws, 'admin_clear_failed', '記録削除に失敗しました');
    });
    return;
  }

  if (type === 'admin_scores_query') {
    handleAdminScoresQuery(ws, msg).catch((error) => {
      log('WARN', `admin_scores_query failed: ${error && error.message ? error.message : error}`);
      sendError(ws, 'admin_scores_query_failed', '記録一覧の取得に失敗しました');
    });
    return;
  }

  if (type === 'progress') {
    handleProgress(ws, msg);
    return;
  }

  if (type === 'feed_event') {
    handleFeedEvent(ws, msg);
    return;
  }

  if (type === 'submit_score') {
    handleSubmitScore(ws, msg);
    return;
  }

  sendError(ws, 'unknown_type', `未知のメッセージ種別です: ${type}`);
}

function handleSocketClose(ws) {
  const context = wsContextMap.get(ws);
  if (!context) {
    return;
  }

  if (context.role === 'admin') {
    adminSockets.delete(ws);
  }

  if (context.role === 'student') {
    detachStudentConnection(context);
  }

  wsContextMap.delete(ws);
}

function startHeartbeatSweep() {
  setInterval(() => {
    const cutoff = now() - config.HEARTBEAT_TIMEOUT_MS;

    for (const [ws, context] of wsContextMap.entries()) {
      if (context.lastHeartbeat >= cutoff) {
        continue;
      }

      log('WARN', `Heartbeat timeout role=${context.role} connectionId=${context.connectionId}`);
      closeSocketQuietly(ws);
      if (context.role === 'admin') {
        adminSockets.delete(ws);
      }
      if (context.role === 'student') {
        detachStudentConnection(context);
      }
      wsContextMap.delete(ws);
    }
  }, config.HEARTBEAT_INTERVAL_MS);
}

function startLobbyTicker() {
  setInterval(() => {
    broadcastLobbyState();
  }, config.LOBBY_BROADCAST_INTERVAL_MS);
}

function sendJsonResponse(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.json': 'application/json; charset=utf-8',
    '.csv': 'text/csv; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon'
  };
  return map[ext] || 'application/octet-stream';
}

function pathInside(baseDir, targetPath) {
  const normalizedBase = path.resolve(baseDir).toLowerCase();
  const normalizedTarget = path.resolve(targetPath).toLowerCase();
  return normalizedTarget === normalizedBase || normalizedTarget.startsWith(`${normalizedBase}${path.sep}`);
}

function resolveStaticPath(baseDir, requestPath) {
  const trimmed = requestPath.replace(/^\/+/, '');
  const target = path.resolve(baseDir, trimmed);
  if (!pathInside(baseDir, target)) {
    return null;
  }
  return target;
}

async function serveFile(res, filePath) {
  try {
    const data = await fsPromises.readFile(filePath);
    res.writeHead(200, {
      'Content-Type': getContentType(filePath),
      'Content-Length': data.length
    });
    res.end(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      sendNotFound(res);
      return;
    }
    log('ERROR', 'Failed to serve file', filePath, error);
    sendTextResponse(res, 500, 'Internal Server Error');
  }
}

function sendTextResponse(res, statusCode, message) {
  const body = Buffer.from(String(message), 'utf8');
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': body.length
  });
  res.end(body);
}

function sendNotFound(res) {
  sendTextResponse(res, 404, 'Not Found');
}

async function handleHttpRequest(req, res) {
  if (!req.url) {
    sendNotFound(res);
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname);

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end();
    return;
  }

  if (pathname === '/api/health') {
    sendJsonResponse(res, 200, {
      ok: true,
      serverTime: now(),
      classes: getAllClassIds().length
    });
    return;
  }

  if (pathname === '/api/config') {
    sendJsonResponse(res, 200, {
      ok: true,
      config: buildClientConfig(),
      serverTime: now()
    });
    return;
  }

  if (pathname === '/api/classes') {
    const classes = getAllClassIds().map((classId) => {
      const classState = classStateMap.get(classId);
      return classState ? serializeClassState(classState) : {
        classId,
        counters: {
          connected: 0,
          waiting: 0,
          playing: 0,
          finished: 0,
          registered: 0,
          disconnected: 0
        },
        game: serializeGame(createIdleGame(), false)
      };
    });

    sendJsonResponse(res, 200, {
      ok: true,
      classes,
      serverTime: now()
    });
    return;
  }

  if (pathname === '/api/ranking') {
    const classId = safeString(url.searchParams.get('classId'), config.MAX_CLASS_ID_LENGTH);
    const mode = url.searchParams.get('mode') === 'latest' ? 'latest' : config.SCORE_MODE;
    const limit = Number.parseInt(String(url.searchParams.get('limit') || '100'), 10);

    if (!classId) {
      sendJsonResponse(res, 400, {
        ok: false,
        message: 'classId クエリが必要です'
      });
      return;
    }

    try {
      const ranking = await getRankingByClass(classId, {
        mode,
        limit: Number.isInteger(limit) && limit > 0 ? limit : 100
      });

      sendJsonResponse(res, 200, {
        ok: true,
        classId,
        mode: ranking.mode,
        total: ranking.total,
        items: ranking.items,
        serverTime: now()
      });
    } catch (error) {
      log('ERROR', 'Failed to get ranking', error);
      sendJsonResponse(res, 500, {
        ok: false,
        message: 'ランキング取得に失敗しました'
      });
    }
    return;
  }

  if (pathname === '/shared/romaji-core.js') {
    await serveFile(res, path.join(SHARED_DIR, 'romaji-core.js'));
    return;
  }

  if (pathname === '/config.js') {
    await serveFile(res, path.join(STATIC_DIR, 'config.js'));
    return;
  }

  if (pathname === '/student.csv') {
    await serveFile(res, path.join(STATIC_DIR, 'student.csv'));
    return;
  }

  if (pathname.startsWith('/css/')) {
    const filePath = resolveStaticPath(path.join(STATIC_DIR, 'css'), pathname.slice('/css/'.length));
    if (!filePath) {
      sendNotFound(res);
      return;
    }
    await serveFile(res, filePath);
    return;
  }

  if (pathname.startsWith('/js/')) {
    const filePath = resolveStaticPath(path.join(STATIC_DIR, 'js'), pathname.slice('/js/'.length));
    if (!filePath) {
      sendNotFound(res);
      return;
    }
    await serveFile(res, filePath);
    return;
  }

  if (pathname.startsWith('/assets/')) {
    const filePath = resolveStaticPath(path.join(STATIC_DIR, 'assets'), pathname.slice('/assets/'.length));
    if (!filePath) {
      sendNotFound(res);
      return;
    }
    await serveFile(res, filePath);
    return;
  }

  if (pathname === '/' || pathname === '/index.html') {
    await serveFile(res, path.join(STATIC_DIR, 'index.html'));
    return;
  }

  if (pathname === '/admin' || pathname === '/admin.html') {
    await serveFile(res, path.join(STATIC_DIR, 'admin.html'));
    return;
  }

  if (pathname === '/ranking' || pathname === '/ranking.html') {
    await serveFile(res, path.join(STATIC_DIR, 'ranking.html'));
    return;
  }

  sendNotFound(res);
}

async function bootstrap() {
  await initScoreStore(DATA_DIR);
  gasSync = createGasSync({
    dataDir: DATA_DIR,
    config,
    log,
    readAllScores,
    readScoresCsv,
    replaceScores
  });
  await gasSync.initialize();
  log('INFO', `GAS sync ${config.GAS_SYNC_ENABLED ? 'enabled' : 'disabled'} meta=${config.GAS_META_URL || '-'} push=${config.GAS_PUSH_URL || '-'}`);

  const persistedClasses = await getKnownClassIds();
  for (const classId of persistedClasses) {
    knownClassIds.add(classId);
  }

  wss.on('connection', (ws, req) => {
    const context = {
      connectionId: crypto.randomUUID(),
      role: 'student',
      lastHeartbeat: now(),
      ws
    };
    wsContextMap.set(ws, context);

    log('INFO', `WS connected from ${req.socket.remoteAddress || 'unknown'}`);

    ws.on('message', (message) => {
      handleMessage(ws, message);
    });

    ws.on('close', () => {
      handleSocketClose(ws);
      log('INFO', `WS disconnected connectionId=${context.connectionId}`);
    });

    ws.on('error', (error) => {
      log('WARN', 'WS error', error.message);
    });
  });

  startHeartbeatSweep();
  startLobbyTicker();

  server.listen(config.SERVER_PORT, config.SERVER_BIND_HOST, () => {
    log('INFO', `HTTP/WS server listening on http://${config.SERVER_PUBLIC_HOST}:${config.SERVER_PORT} (bind=${config.SERVER_BIND_HOST})`);
  });
}

bootstrap().catch((error) => {
  log('ERROR', 'Failed to bootstrap server', error);
  process.exitCode = 1;
});
