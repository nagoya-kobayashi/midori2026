const fs = require('fs/promises');
const path = require('path');

const SCORE_FILENAME = 'scores.jsonl';
const SCORE_CSV_FILENAME = 'scores.csv';
const SCORE_HEADERS = [
  'timestamp',
  'gameId',
  'classId',
  'no',
  'uid',
  'score',
  'accuracy',
  'correctCount',
  'missCount',
  'completedPrompts',
  'durationSec',
  'inputCount',
  'maxCombo',
  'kpm',
  'wpm',
  'eventTimeline'
];

let scoreFilePath = null;
let scoreCsvFilePath = null;
let writeQueue = Promise.resolve();

function assertInitialized() {
  if (!scoreFilePath) {
    throw new Error('Score store is not initialized. Call initScoreStore() first.');
  }
}

async function initScoreStore(dataDir) {
  await fs.mkdir(dataDir, { recursive: true });
  scoreFilePath = path.join(dataDir, SCORE_FILENAME);
  scoreCsvFilePath = path.join(dataDir, SCORE_CSV_FILENAME);
  try {
    await fs.access(scoreFilePath);
  } catch {
    await fs.writeFile(scoreFilePath, '', 'utf8');
  }

  try {
    await fs.access(scoreCsvFilePath);
  } catch {
    await fs.writeFile(scoreCsvFilePath, `${SCORE_HEADERS.join(',')}\n`, 'utf8');
  }

  const records = await readAllScores();
  await rewriteCsvSnapshot(records);

  return { filePath: scoreFilePath, csvFilePath: scoreCsvFilePath };
}

function normalizeRecord(record) {
  if (!record || typeof record !== 'object') {
    return null;
  }

  const rawPlayerId = String(record.playerId || '').trim();
  const inferredUid = String(record.uid || '').trim()
    || (rawPlayerId.startsWith('uid:') ? rawPlayerId.slice(4) : '');

  const normalized = {
    timestamp: normalizeTimestampIso(record.timestamp),
    gameId: String(record.gameId || '').trim(),
    classId: String(record.classId || '').trim(),
    no: Number(record.no || record.attendanceNo || 0),
    uid: String(inferredUid || '').trim(),
    playerId: rawPlayerId,
    score: Number(record.score || 0),
    accuracy: Number(record.accuracy || 0),
    correctCount: Number(record.correctCount || 0),
    missCount: Number(record.missCount || 0),
    completedPrompts: Number(record.completedPrompts || 0),
    durationSec: Number(record.durationSec || 0),
    inputCount: Number(record.inputCount || 0),
    maxCombo: Number(record.maxCombo || 0),
    kpm: Number(record.kpm || 0),
    wpm: Number(record.wpm || 0),
    eventTimeline: String(record.eventTimeline || '')
  };

  if (!normalized.timestamp || !normalized.classId || !normalized.uid) {
    return null;
  }

  if (!normalized.timestamp) {
    return null;
  }

  if (!Number.isFinite(normalized.score)) {
    normalized.score = 0;
  }
  if (!Number.isFinite(normalized.accuracy)) {
    normalized.accuracy = 0;
  }

  const numericFields = ['no', 'correctCount', 'missCount', 'completedPrompts', 'durationSec', 'inputCount', 'maxCombo', 'kpm', 'wpm'];
  for (const field of numericFields) {
    if (!Number.isFinite(normalized[field])) {
      normalized[field] = 0;
    }
  }

  return normalized;
}

function parseRecordTimestampMs(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value);
  }
  const text = String(value || '').trim();
  if (!text) {
    return NaN;
  }
  const match = text.match(
    /^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d{1,4}))?$/
  );
  if (match) {
    const [, year, month, day, hour, minute, second, fraction = '0'] = match;
    const milliseconds = Math.floor(Number(String(fraction).padEnd(4, '0').slice(0, 4)) / 10);
    return Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour) - 9,
      Number(minute),
      Number(second),
      milliseconds
    );
  }
  const direct = Date.parse(text);
  return Number.isFinite(direct) ? direct : NaN;
}

function normalizeTimestampIso(value) {
  const timestampMs = parseRecordTimestampMs(value);
  if (!Number.isFinite(timestampMs)) {
    return '';
  }
  return new Date(timestampMs).toISOString();
}

function escapeCsvCell(value) {
  const text = String(value ?? '');
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function formatCsvTimestampJst(value) {
  const parsed = parseRecordTimestampMs(value);
  if (!Number.isFinite(parsed)) {
    return String(value || '');
  }
  const jst = new Date(parsed + 9 * 60 * 60 * 1000);
  const year = jst.getUTCFullYear();
  const month = jst.getUTCMonth() + 1;
  const day = jst.getUTCDate();
  const hours = String(jst.getUTCHours()).padStart(2, '0');
  const minutes = String(jst.getUTCMinutes()).padStart(2, '0');
  const seconds = String(jst.getUTCSeconds()).padStart(2, '0');
  const milliseconds4 = `${String(jst.getUTCMilliseconds()).padStart(3, '0')}0`;
  return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}.${milliseconds4}`;
}

function recordToCsvLine(record) {
  return SCORE_HEADERS.map((header) => {
    if (header === 'timestamp') {
      return escapeCsvCell(formatCsvTimestampJst(record[header]));
    }
    return escapeCsvCell(record[header]);
  }).join(',');
}

function buildCsvContent(records) {
  const lines = [SCORE_HEADERS.join(',')];
  for (const record of records) {
    lines.push(recordToCsvLine(record));
  }
  return `${lines.join('\n')}\n`;
}

async function rewriteCsvSnapshot(records) {
  assertInitialized();
  const safeRecords = Array.isArray(records)
    ? records.map((record) => normalizeRecord(record)).filter(Boolean)
    : [];
  await fs.writeFile(scoreCsvFilePath, buildCsvContent(safeRecords), 'utf8');
}

async function appendScore(record) {
  assertInitialized();
  const safe = normalizeRecord(record);
  if (!safe) {
    throw new Error('Invalid score record');
  }

  const line = `${JSON.stringify(safe)}\n`;
  writeQueue = writeQueue.then(async () => {
    await fs.appendFile(scoreFilePath, line, 'utf8');
    await fs.appendFile(scoreCsvFilePath, `${recordToCsvLine(safe)}\n`, 'utf8');
  });
  await writeQueue;
  return safe;
}

async function replaceScores(records) {
  assertInitialized();
  const safeRecords = Array.isArray(records)
    ? records.map((record) => normalizeRecord(record)).filter(Boolean)
    : [];
  const content = safeRecords.map((record) => JSON.stringify(record)).join('\n');
  const finalContent = content ? `${content}\n` : '';
  writeQueue = writeQueue.then(async () => {
    await fs.writeFile(scoreFilePath, finalContent, 'utf8');
    await rewriteCsvSnapshot(safeRecords);
  });
  await writeQueue;
  return safeRecords;
}

async function readAllScores() {
  assertInitialized();
  let content = '';
  try {
    content = await fs.readFile(scoreFilePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const records = [];
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }
    try {
      const parsed = JSON.parse(line);
      const safe = normalizeRecord(parsed);
      if (safe) {
        records.push(safe);
      }
    } catch {
      // ignore broken line to keep service running
    }
  }
  return records;
}

async function readScoresCsv() {
  assertInitialized();
  try {
    return await fs.readFile(scoreCsvFilePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      const records = await readAllScores();
      const csv = buildCsvContent(records);
      await fs.writeFile(scoreCsvFilePath, csv, 'utf8');
      return csv;
    }
    throw error;
  }
}

function compareRanking(a, b) {
  if (a.score !== b.score) {
    return b.score - a.score;
  }
  if (a.accuracy !== b.accuracy) {
    return b.accuracy - a.accuracy;
  }
  if (a.missCount !== b.missCount) {
    return a.missCount - b.missCount;
  }
  const timeA = Date.parse(a.timestamp) || 0;
  const timeB = Date.parse(b.timestamp) || 0;
  return timeA - timeB;
}

function isBetterRecord(candidate, current) {
  return compareRanking(candidate, current) < 0;
}

function pickLatestRecord(candidate, current) {
  return (Date.parse(candidate.timestamp) || 0) > (Date.parse(current.timestamp) || 0);
}

function getRecordPlayerKey(record) {
  const uid = String(record && record.uid || '').trim();
  if (uid) {
    return `uid:${uid}`;
  }
  if (record && record.playerId) {
    return `id:${record.playerId}`;
  }
  const classId = String(record && record.classId || '').trim();
  const no = Number(record && record.no || 0);
  if (classId || no) {
    return `seat:${classId}:${no}`;
  }
  return `name:${classId}:${String(record && record.playerName || '').trim()}`;
}

function matchesRecordIdentity(record, playerIdentity) {
  const target = String(playerIdentity || '').trim();
  if (!target) {
    return false;
  }
  const uid = String(record && record.uid || '').trim();
  const playerId = String(record && record.playerId || '').trim();
  if (uid && (target === uid || target === `uid:${uid}`)) {
    return true;
  }
  if (playerId && target === playerId) {
    return true;
  }
  return false;
}

function rankify(items) {
  return items.map((item, index) => ({
    rank: index + 1,
    ...item
  }));
}

async function getKnownClassIds() {
  const records = await readAllScores();
  const set = new Set();
  for (const item of records) {
    if (item.classId) {
      set.add(item.classId);
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'ja'));
}

async function getRankingByClass(classId, options = {}) {
  const targetClassId = String(classId || '').trim();
  if (!targetClassId) {
    return { classId: '', mode: 'best', total: 0, items: [] };
  }

  const mode = options.mode === 'latest' ? 'latest' : 'best';
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 100;

  const records = await readAllScores();
  const classRecords = records.filter((item) => item.classId === targetClassId);
  const byPlayer = new Map();

  for (const item of classRecords) {
    const key = getRecordPlayerKey(item);
    const current = byPlayer.get(key);
    if (!current) {
      byPlayer.set(key, item);
      continue;
    }

    if (mode === 'latest') {
      if (pickLatestRecord(item, current)) {
        byPlayer.set(key, item);
      }
    } else if (isBetterRecord(item, current)) {
      byPlayer.set(key, item);
    }
  }

  const ranked = rankify(Array.from(byPlayer.values()).sort(compareRanking)).slice(0, limit);
  return {
    classId: targetClassId,
    mode,
    total: ranked.length,
    items: ranked
  };
}

async function getPlayerRankSummary(classId, playerId, options = {}) {
  const ranking = await getRankingByClass(classId, options);
  const id = String(playerId || '').trim();
  let row = ranking.items.find((item) => matchesRecordIdentity(item, id));

  if (!row) {
    return {
      rank: null,
      total: ranking.total,
      score: null,
      accuracy: null
    };
  }

  return {
    rank: row.rank,
    total: ranking.total,
    score: row.score,
    accuracy: row.accuracy
  };
}

async function getGameRankSummary(gameId, playerId) {
  const targetGameId = String(gameId || '').trim();
  const id = String(playerId || '').trim();
  if (!targetGameId) {
    return {
      rank: null,
      total: 0,
      score: null,
      accuracy: null
    };
  }

  const records = await readAllScores();
  const gameRecords = records.filter((item) => item.gameId === targetGameId);
  const byPlayer = new Map();

  for (const item of gameRecords) {
    const key = getRecordPlayerKey(item);
    const current = byPlayer.get(key);
    if (!current) {
      byPlayer.set(key, item);
      continue;
    }

    if (pickLatestRecord(item, current) || isBetterRecord(item, current)) {
      byPlayer.set(key, item);
    }
  }

  const ranked = rankify(Array.from(byPlayer.values()).sort(compareRanking));
  const row = ranked.find((item) => matchesRecordIdentity(item, id));

  if (!row) {
    return {
      rank: null,
      total: ranked.length,
      score: null,
      accuracy: null
    };
  }

  return {
    rank: row.rank,
    total: ranked.length,
    score: row.score,
    accuracy: row.accuracy
  };
}

module.exports = {
  initScoreStore,
  appendScore,
  replaceScores,
  readAllScores,
  readScoresCsv,
  getKnownClassIds,
  getRankingByClass,
  getPlayerRankSummary,
  getGameRankSummary,
  compareRanking
};
