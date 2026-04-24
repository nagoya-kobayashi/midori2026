(() => {
  const APP_CONFIG = window.TypingAppConfig || {};
  const SERVER_PUBLIC_HOST = String(APP_CONFIG.SERVER_PUBLIC_HOST || location.hostname || 'midori-st-sv');
  const SERVER_PORT = Number(APP_CONFIG.SERVER_PORT || 3100);
  const SERVER_PROTOCOL = String(APP_CONFIG.SERVER_PROTOCOL || (location.protocol === 'https:' ? 'https' : 'http'));
  const WS_PATH = String(APP_CONFIG.WS_PATH || '/ws');
  const WS_URL = `${SERVER_PROTOCOL === 'https' ? 'wss' : 'ws'}://${SERVER_PUBLIC_HOST}${SERVER_PORT ? `:${SERVER_PORT}` : ''}${WS_PATH}`;
  const STUDENT_CSV_URL = './student.csv';

  const CLASS_ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'X', 'TEST'];
  const ATTENDANCE_NUMBERS = Array.from({ length: 46 }, (_, index) => index);
  const RANKING_CLASS_TABS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

  const DURATION_MIN_SEC = 10;
  const DURATION_MAX_SEC = 3600;
  const DURATION_STEP_SEC = 10;

  function createEmptyClassRankingMap() {
    const map = {};
    RANKING_CLASS_TABS.forEach((classRow) => {
      map[classRow] = { total: 0, items: [] };
    });
    return map;
  }

  const state = {
    ws: null,
    reconnectTimer: null,
    heartbeatTimer: null,
    heartbeatSeq: 0,
    serverOffsetMs: 0,
    classes: [],
    offlineModeEnabled: false,
    scoreCatalog: [],
    scoreRecords: [],
    studentMap: {},
    rankingTarget: 'selectedGame',
    rankingSortMode: 'roster',
    rankingScoreAsc: false,
    rankings: {
      selectedGame: { gameIds: [], total: 0, items: [] },
      overall: { total: 0, items: [] },
      byClass: createEmptyClassRankingMap()
    }
  };

  const els = {
    connectionBadge: document.getElementById('adminConnectionBadge'),
    serverClock: document.getElementById('serverClock'),
    classCount: document.getElementById('classCount'),
    connectedTotal: document.getElementById('connectedTotal'),
    playingTotal: document.getElementById('playingTotal'),
    attendanceBoard: document.getElementById('attendanceBoard'),
    unassignedSummary: document.getElementById('unassignedSummary'),

    offlineModeStatus: document.getElementById('offlineModeStatus'),
    toggleOfflineModeBtn: document.getElementById('toggleOfflineModeBtn'),
    forceStopBtn: document.getElementById('forceStopBtn'),

    startAllBtn: document.getElementById('startAllBtn'),
    startAllNoRankBtn: document.getElementById('startAllNoRankBtn'),
    durationInput: document.getElementById('durationInput'),
    durationUpBtn: document.getElementById('durationUpBtn'),
    durationDownBtn: document.getElementById('durationDownBtn'),
    durationPresetButtons: Array.from(document.querySelectorAll('.duration-preset-btn')),

    clearAllRecordsBtn: document.getElementById('clearAllRecordsBtn'),
    refreshScoreCatalogBtn: document.getElementById('refreshScoreCatalogBtn'),
    deleteGameIdsSelect: document.getElementById('deleteGameIdsSelect'),
    clearSelectedGamesBtn: document.getElementById('clearSelectedGamesBtn'),
    loadGameRecordsBtn: document.getElementById('loadGameRecordsBtn'),
    deleteRecordIdsSelect: document.getElementById('deleteRecordIdsSelect'),
    clearSelectedRecordsBtn: document.getElementById('clearSelectedRecordsBtn'),

    refreshAdminRankingBtn: document.getElementById('refreshAdminRankingBtn'),
    rankingTabs: Array.from(document.querySelectorAll('#adminRankingTabs .admin-ranking-tab')),
    rankingRosterSortBtn: document.getElementById('rankingRosterSortBtn'),
    rankingScoreSortBtn: document.getElementById('rankingScoreSortBtn'),
    copyAdminRankingBtn: document.getElementById('copyAdminRankingBtn'),
    adminRankingScopeTitle: document.getElementById('adminRankingScopeTitle'),
    adminRankingScopeMeta: document.getElementById('adminRankingScopeMeta'),
    adminRankingBody: document.getElementById('adminRankingBody'),

    log: document.getElementById('adminLog')
  };

  function serverNow() {
    return Date.now() + state.serverOffsetMs;
  }

  function syncServerClock(serverTime) {
    const value = Number(serverTime);
    if (Number.isFinite(value)) {
      state.serverOffsetMs = value - Date.now();
    }
  }

  function setConnectionBadge(text, cls) {
    els.connectionBadge.textContent = text;
    els.connectionBadge.className = `badge ${cls}`;
  }

  function addLog(line) {
    const stamp = new Date().toLocaleTimeString('ja-JP');
    const entry = document.createElement('div');
    entry.textContent = `[${stamp}] ${line}`;
    els.log.prepend(entry);
    while (els.log.childElementCount > 80) {
      els.log.removeChild(els.log.lastElementChild);
    }
  }

  function send(payload) {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
      return false;
    }
    state.ws.send(JSON.stringify(payload));
    return true;
  }

  function formatServerTime() {
    const nowDate = new Date(serverNow());
    return `${nowDate.toLocaleDateString('ja-JP')} ${nowDate.toLocaleTimeString('ja-JP')}`;
  }

  function normalizeClassRow(value) {
    const upper = String(value || '').trim().toUpperCase();
    if (CLASS_ROWS.includes(upper)) {
      return upper;
    }
    if (/^TEST/.test(upper)) {
      return 'TEST';
    }
    const match = upper.match(/([A-HX])$/);
    return match ? match[1] : '';
  }

  function normalizeAttendanceNo(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return 0;
    }
    const normalized = Math.floor(number);
    return normalized >= 0 && normalized <= 45 ? normalized : 0;
  }

  function parseCsvLine(line) {
    const cells = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        if (quoted && line[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = !quoted;
        }
        continue;
      }
      if (char === ',' && !quoted) {
        cells.push(cell.trim());
        cell = '';
        continue;
      }
      cell += char;
    }
    cells.push(cell.trim());
    return cells;
  }

  function parseStudentCsvMap(text) {
    const lines = String(text || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length) {
      return {};
    }

    const head = parseCsvLine(lines[0]).map((value) => value.toLowerCase());
    const headerMap = {
      uid: head.findIndex((value) => value === 'uid' || value === 'id'),
      classId: head.findIndex((value) => value === 'classid' || value === 'class_id'),
      classValue: head.findIndex((value) => value === 'class'),
      no: head.findIndex((value) => value === 'attendanceno' || value === 'attendance' || value === 'seatno' || value === 'seat' || value === 'number' || value === 'no'),
      name: head.findIndex((value) => value === 'playername' || value === 'name' || value === 'studentname')
    };

    const readValue = (row, index) => (index >= 0 ? String(row[index] || '').trim() : '');
    const map = {};

    lines.slice(1).forEach((line) => {
      const row = parseCsvLine(line);
      const uid = readValue(row, headerMap.uid);
      if (!uid) {
        return;
      }
      const classId = String(readValue(row, headerMap.classId) || readValue(row, headerMap.classValue) || '').trim().toUpperCase();
      const no = normalizeAttendanceNo(readValue(row, headerMap.no));
      const name = readValue(row, headerMap.name);
      map[uid] = {
        uid,
        classId,
        classRow: normalizeClassRow(classId),
        no,
        name
      };
    });

    return map;
  }

  async function loadStudentMap() {
    try {
      const response = await fetch(STUDENT_CSV_URL, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`student.csv HTTP ${response.status}`);
      }
      const text = await response.text();
      state.studentMap = parseStudentCsvMap(text);
      renderScoreRecords();
      renderAdminRankings();
    } catch (error) {
      addLog(`student.csv 読み込み失敗: ${error && error.message ? error.message : 'unknown error'}`);
    }
  }

  function getStudentEntryByUid(uid) {
    const key = String(uid || '').trim();
    if (!key) {
      return null;
    }
    return state.studentMap[key] || null;
  }

  function getDisplayClassId(record) {
    const classId = String(record && record.classId || '').trim();
    if (classId) {
      return classId;
    }
    const fromStudent = getStudentEntryByUid(record && record.uid);
    return fromStudent && fromStudent.classId ? fromStudent.classId : '-';
  }

  function getDisplayAttendanceNo(record) {
    const raw = Math.floor(Number(record && record.no || 0));
    if (Number.isFinite(raw) && raw >= 0 && raw <= 45) {
      return raw;
    }
    const fromStudent = getStudentEntryByUid(record && record.uid);
    return fromStudent ? normalizeAttendanceNo(fromStudent.no) : 0;
  }

  function getDisplayPlayerName(record) {
    const fromStudent = getStudentEntryByUid(record && record.uid);
    if (fromStudent && fromStudent.name) {
      return fromStudent.name;
    }
    const fromRecord = String(record && record.playerName || '').trim();
    if (fromRecord) {
      return fromRecord;
    }
    const uid = String(record && record.uid || '').trim();
    return uid || '-';
  }

  function getPlayerVisualStatus(player) {
    if (!player || !player.connected) {
      return 'offline';
    }
    if (player.status === 'playing') {
      return 'playing';
    }
    return 'standby';
  }

  function getPlayerStatusLabel(player) {
    const visual = getPlayerVisualStatus(player);
    if (visual === 'playing') return 'プレイ中';
    if (visual === 'standby') return 'スタンバイ';
    return 'オフライン';
  }

  function getStatusPriority(status) {
    if (status === 'playing') return 2;
    if (status === 'standby') return 1;
    return 0;
  }

  function buildSeatState() {
    const seatMap = new Map();
    const unassigned = [];

    state.classes.forEach((classItem) => {
      const players = Array.isArray(classItem.players) ? classItem.players : [];
      players.forEach((player) => {
        const classRow = normalizeClassRow(player.classRow || classItem.classId);
        const attendanceNo = normalizeAttendanceNo(player.attendanceNo);
        const visualStatus = getPlayerVisualStatus(player);
        const summary = {
          classId: classItem.classId,
          classRow,
          attendanceNo,
          status: visualStatus,
          statusLabel: getPlayerStatusLabel(player),
          name: String(player.name || player.playerName || ''),
          connected: Boolean(player.connected)
        };

        if (!classRow) {
          if (summary.name) {
            unassigned.push(summary);
          }
          return;
        }

        const key = `${classRow}-${attendanceNo}`;
        const current = seatMap.get(key);
        if (!current || getStatusPriority(visualStatus) >= getStatusPriority(current.status)) {
          seatMap.set(key, summary);
        }
      });
    });

    return { seatMap, unassigned };
  }

  function renderHeaderStats() {
    const totals = state.classes.reduce((acc, item) => {
      acc.connected += Number(item.counters.connected || 0);
      acc.playing += Number(item.counters.playing || 0);
      return acc;
    }, { connected: 0, playing: 0 });

    els.serverClock.textContent = formatServerTime();
    els.classCount.textContent = String(state.classes.length);
    els.connectedTotal.textContent = String(totals.connected);
    els.playingTotal.textContent = String(totals.playing);
  }

  function renderAttendanceBoard() {
    renderHeaderStats();
    const { seatMap, unassigned } = buildSeatState();
    const headerCells = ATTENDANCE_NUMBERS
      .map((number) => `<th scope="col">${number}</th>`)
      .join('');

    const bodyRows = CLASS_ROWS.map((row) => {
      const cells = ATTENDANCE_NUMBERS.map((number) => {
        const player = seatMap.get(`${row}-${number}`);
        const visualStatus = player ? player.status : 'offline';
        const title = player
          ? `${row}-${number}: ${player.name} / ${player.statusLabel}`
          : `${row}-${number}: オフライン`;
        return `
          <td class="attendance-cell" title="${title}">
            <span class="seat-dot seat-dot--${visualStatus}"></span>
          </td>
        `;
      }).join('');
      return `
        <tr>
          <th scope="row">${row === 'TEST' ? 'Test' : row}</th>
          ${cells}
        </tr>
      `;
    }).join('');

    els.attendanceBoard.innerHTML = `
      <thead>
        <tr>
          <th scope="col">クラス</th>
          ${headerCells}
        </tr>
      </thead>
      <tbody>
        ${bodyRows}
      </tbody>
    `;

    if (!unassigned.length) {
      els.unassignedSummary.textContent = '';
      return;
    }

    const names = unassigned
      .slice(0, 8)
      .map((item) => `${item.name}(${item.classId || '-'})`)
      .join('、');
    const extra = unassigned.length > 8 ? ` ほか ${unassigned.length - 8} 名` : '';
    els.unassignedSummary.textContent = `クラス行未解決: ${names}${extra}`;
  }

  function clampDurationSec(value) {
    return Math.max(DURATION_MIN_SEC, Math.min(DURATION_MAX_SEC, Math.round(Number(value || 300))));
  }

  function parseDurationInput(raw) {
    const text = String(raw || '').trim();
    if (!text) {
      return null;
    }
    if (/^\d+$/.test(text)) {
      const seconds = Number(text);
      if (!Number.isFinite(seconds)) return null;
      return clampDurationSec(seconds);
    }
    const match = text.match(/^(\d{1,2}):([0-5]\d)$/);
    if (!match) {
      return null;
    }
    const minutes = Number(match[1]);
    const seconds = Number(match[2]);
    return clampDurationSec(minutes * 60 + seconds);
  }

  function formatDurationInput(totalSec) {
    const sec = clampDurationSec(totalSec);
    const minutes = Math.floor(sec / 60);
    const seconds = sec % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function setDurationInputValue(totalSec) {
    els.durationInput.value = formatDurationInput(totalSec);
  }

  function adjustDurationInput(deltaSec) {
    const current = parseDurationInput(els.durationInput.value);
    const base = Number.isFinite(current) ? current : 300;
    setDurationInputValue(base + deltaSec);
  }

  function getSelectedValues(selectEl) {
    if (!selectEl) return [];
    return Array.from(selectEl.selectedOptions)
      .map((option) => String(option.value || '').trim())
      .filter(Boolean);
  }

  function setSelectOptions(selectEl, items, selectedValues, emptyLabel) {
    if (!selectEl) return;
    const selectedSet = new Set(Array.isArray(selectedValues) ? selectedValues : []);
    selectEl.innerHTML = '';
    if (!Array.isArray(items) || items.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = emptyLabel;
      option.disabled = true;
      option.selected = true;
      selectEl.appendChild(option);
      return;
    }

    items.forEach((item) => {
      const option = document.createElement('option');
      option.value = String(item.value || '');
      option.textContent = String(item.label || item.value || '');
      option.selected = selectedSet.has(option.value);
      selectEl.appendChild(option);
    });
  }

  function formatRecordTimestampLabel(timestampText) {
    const text = String(timestampText || '').trim();
    if (!text) {
      return '-';
    }
    const parsed = Date.parse(text);
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toLocaleString('ja-JP', { hour12: false });
    }
    return text;
  }

  function renderScoreCatalog() {
    const selected = getSelectedValues(els.deleteGameIdsSelect);
    const options = state.scoreCatalog.map((item) => {
      const gameId = String(item.gameId || '').trim();
      const count = Number(item.count || 0);
      const latest = formatRecordTimestampLabel(item.latestTimestampIso || item.latestTimestamp || '');
      return {
        value: gameId,
        label: `${gameId} (${count}件 / 最新 ${latest})`
      };
    });
    setSelectOptions(els.deleteGameIdsSelect, options, selected, 'gameId がありません');
    const selectedAfter = getSelectedValues(els.deleteGameIdsSelect);
    if (selectedAfter.length === 0) {
      state.scoreRecords = [];
      renderScoreRecords();
    } else {
      requestScoreRecords(selectedAfter, false);
    }
    requestAdminRankings(false);
  }

  function renderScoreRecords() {
    const selected = getSelectedValues(els.deleteRecordIdsSelect);
    const options = state.scoreRecords.map((record) => {
      const recordId = String(record.recordId || '');
      const gameId = String(record.gameId || '-');
      const classId = getDisplayClassId(record);
      const no = getDisplayAttendanceNo(record);
      const uid = String(record.uid || '-');
      const playerName = getDisplayPlayerName(record);
      const score = Number(record.score || 0);
      const timestamp = formatRecordTimestampLabel(record.timestamp);
      return {
        value: recordId,
        label: `${timestamp} | ${gameId} | ${classId}-${no} | ${uid} | ${playerName} | ${score}点`
      };
    });
    setSelectOptions(els.deleteRecordIdsSelect, options, selected, '対象レコードがありません');
  }

  function requestScoreCatalog(logOnFailure = true) {
    const ok = send({ t: 'admin_scores_query', mode: 'catalog' });
    if (!ok && logOnFailure) {
      addLog('gameId 一覧を取得できません（WS未接続）。');
    }
  }

  function requestScoreRecords(gameIds, logOnFailure = true) {
    const selectedGameIds = Array.isArray(gameIds) ? gameIds.filter(Boolean) : [];
    if (selectedGameIds.length === 0) {
      state.scoreRecords = [];
      renderScoreRecords();
      return;
    }
    const ok = send({ t: 'admin_scores_query', mode: 'records', gameIds: selectedGameIds });
    if (!ok && logOnFailure) {
      addLog('レコード一覧を取得できません（WS未接続）。');
    }
  }

  function requestAdminRankings(logOnFailure = true) {
    const selectedGameIds = getSelectedValues(els.deleteGameIdsSelect);
    const ok = send({ t: 'admin_scores_query', mode: 'rankings', gameIds: selectedGameIds });
    if (!ok && logOnFailure) {
      addLog('ランキングを取得できません（WS未接続）。');
    }
  }

  function syncOfflineModeUi() {
    const enabled = Boolean(state.offlineModeEnabled);
    els.offlineModeStatus.textContent = enabled ? 'オフラインモード ON' : 'オンライン運用';
    els.toggleOfflineModeBtn.textContent = enabled ? 'オフラインモード: ON' : 'オフラインモード: OFF';
    els.toggleOfflineModeBtn.classList.toggle('btn-danger', enabled);
    els.toggleOfflineModeBtn.classList.toggle('btn-secondary', !enabled);
    els.startAllBtn.disabled = enabled;
    els.startAllNoRankBtn.disabled = enabled;
  }

  function normalizeRankingRows(rows) {
    if (!Array.isArray(rows)) return [];
    return rows.map((row) => ({
      rank: Number(row.rank || 0),
      classId: String(row.classId || '-'),
      no: Number(row.no || 0),
      uid: String(row.uid || ''),
      playerName: String(row.playerName || '-'),
      score: Number(row.score || 0),
      accuracy: Number(row.accuracy || 0)
    }));
  }

  function normalizeRankingPayload(payload) {
    const source = payload && typeof payload === 'object' ? payload : {};
    const selectedGame = source.selectedGame && typeof source.selectedGame === 'object' ? source.selectedGame : {};
    const overall = source.overall && typeof source.overall === 'object' ? source.overall : {};
    const byClassSource = source.byClass && typeof source.byClass === 'object' ? source.byClass : {};
    const byClass = createEmptyClassRankingMap();
    RANKING_CLASS_TABS.forEach((classId) => {
      const row = byClassSource[classId] && typeof byClassSource[classId] === 'object'
        ? byClassSource[classId]
        : {};
      byClass[classId] = {
        total: Number(row.total || 0),
        items: normalizeRankingRows(row.items)
      };
    });
    return {
      selectedGame: {
        gameIds: Array.isArray(selectedGame.gameIds) ? selectedGame.gameIds.map((id) => String(id || '').trim()).filter(Boolean) : [],
        total: Number(selectedGame.total || 0),
        items: normalizeRankingRows(selectedGame.items)
      },
      overall: {
        total: Number(overall.total || 0),
        items: normalizeRankingRows(overall.items)
      },
      byClass
    };
  }

  function getCurrentRankingRows() {
    if (state.rankingTarget === 'selectedGame') {
      return state.rankings.selectedGame.items;
    }
    if (state.rankingTarget === 'overall') {
      return state.rankings.overall.items;
    }
    if (RANKING_CLASS_TABS.includes(state.rankingTarget)) {
      return state.rankings.byClass[state.rankingTarget].items;
    }
    return [];
  }

  function getClassSortWeight(classId) {
    const row = normalizeClassRow(classId);
    if (row >= 'A' && row <= 'H') {
      return row.charCodeAt(0) - 'A'.charCodeAt(0);
    }
    if (row === 'X') {
      return 8;
    }
    if (row === 'TEST') {
      return 9;
    }
    return 99;
  }

  function compareRosterRows(a, b) {
    const classCompare = getClassSortWeight(getDisplayClassId(a)) - getClassSortWeight(getDisplayClassId(b));
    if (classCompare !== 0) {
      return classCompare;
    }
    const noCompare = getDisplayAttendanceNo(a) - getDisplayAttendanceNo(b);
    if (noCompare !== 0) {
      return noCompare;
    }
    const uidA = String(a && a.uid || '');
    const uidB = String(b && b.uid || '');
    if (uidA !== uidB) {
      return uidA.localeCompare(uidB, 'ja');
    }
    return Number(a && a.rank || 0) - Number(b && b.rank || 0);
  }

  function getSortedRankingRows() {
    const rows = getCurrentRankingRows().slice();
    if (state.rankingSortMode === 'score') {
      rows.sort((a, b) => {
        const scoreA = Number(a && a.score || 0);
        const scoreB = Number(b && b.score || 0);
        if (scoreA !== scoreB) {
          return state.rankingScoreAsc ? scoreA - scoreB : scoreB - scoreA;
        }
        const accA = Number(a && a.accuracy || 0);
        const accB = Number(b && b.accuracy || 0);
        if (accA !== accB) {
          return state.rankingScoreAsc ? accA - accB : accB - accA;
        }
        return compareRosterRows(a, b);
      });
      return rows;
    }
    rows.sort(compareRosterRows);
    return rows;
  }

  function syncRankingSortUi() {
    if (els.rankingRosterSortBtn) {
      const isRoster = state.rankingSortMode === 'roster';
      els.rankingRosterSortBtn.classList.toggle('is-active', isRoster);
    }
    if (els.rankingScoreSortBtn) {
      const isScore = state.rankingSortMode === 'score';
      if (!isScore) {
        els.rankingScoreSortBtn.textContent = 'スコア順';
      } else {
        els.rankingScoreSortBtn.textContent = state.rankingScoreAsc ? 'スコア▲' : 'スコア▼';
      }
      els.rankingScoreSortBtn.classList.toggle('is-active', isScore);
    }
  }

  function getRankingScopeTitle() {
    if (state.rankingTarget === 'selectedGame') {
      return '選択gameId ランキング';
    }
    if (state.rankingTarget === 'overall') {
      return '全員ランキング';
    }
    if (RANKING_CLASS_TABS.includes(state.rankingTarget)) {
      return `${state.rankingTarget}組ランキング`;
    }
    return 'ランキング';
  }

  function getRankingScopeMeta() {
    if (state.rankingTarget === 'selectedGame') {
      const gameIds = state.rankings.selectedGame.gameIds;
      if (!gameIds.length) {
        return 'Record Control で gameId を選択すると、選択したゲームIDの範囲でランキング表示します。';
      }
      return `対象 gameId: ${gameIds.join(', ')} / ${state.rankings.selectedGame.items.length}名`;
    }
    if (state.rankingTarget === 'overall') {
      return `A〜H組の uid ごとのベストスコア / ${state.rankings.overall.items.length}名`;
    }
    if (RANKING_CLASS_TABS.includes(state.rankingTarget)) {
      const classRows = state.rankings.byClass[state.rankingTarget];
      return `${state.rankingTarget}組の uid ごとのベストスコア / ${classRows.items.length}名`;
    }
    return '';
  }

  function renderRankingTabs() {
    els.rankingTabs.forEach((button) => {
      const target = String(button.dataset.rankingTarget || '');
      const active = state.rankingTarget === target;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  function renderAdminRankings() {
    if (!els.adminRankingBody) return;

    const rows = getSortedRankingRows();
    els.adminRankingScopeTitle.textContent = getRankingScopeTitle();
    els.adminRankingScopeMeta.textContent = getRankingScopeMeta();
    renderRankingTabs();
    syncRankingSortUi();

    if (!rows.length) {
      els.adminRankingBody.innerHTML = '<tr><td colspan="6" class="muted">記録がありません。</td></tr>';
      return;
    }

    els.adminRankingBody.innerHTML = rows.slice(0, 200).map((row) => `
      <tr>
        <td>${Number(row.rank || 0)}</td>
        <td>${getDisplayClassId(row)}</td>
        <td>${getDisplayAttendanceNo(row)}</td>
        <td>${getDisplayPlayerName(row)}</td>
        <td>${Number(row.score || 0).toLocaleString('ja-JP')}</td>
        <td>${Number(row.accuracy || 0).toFixed(2)}%</td>
      </tr>
    `).join('');
  }

  function setRankingTarget(target, shouldRender = true) {
    const safeTarget = String(target || '');
    if (safeTarget === 'selectedGame' || safeTarget === 'overall' || RANKING_CLASS_TABS.includes(safeTarget)) {
      state.rankingTarget = safeTarget;
      if (shouldRender) {
        renderAdminRankings();
      }
    }
  }

  function buildCurrentRankingTsv() {
    const rows = getSortedRankingRows();
    const lines = ['順位\tクラス\t番号\t名前\tスコア\t正確率'];
    rows.slice(0, 200).forEach((row) => {
      lines.push([
        String(Number(row.rank || 0)),
        String(getDisplayClassId(row)),
        String(getDisplayAttendanceNo(row)),
        String(getDisplayPlayerName(row)),
        String(Number(row.score || 0)),
        `${Number(row.accuracy || 0).toFixed(2)}%`
      ].join('\t'));
    });
    return `${lines.join('\n')}\n`;
  }

  async function copyTextToClipboard(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'readonly');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  }

  function handleMessage(message) {
    syncServerClock(message.serverTime);

    if (message.t === 'welcome') {
      if (Object.prototype.hasOwnProperty.call(message, 'offlineModeEnabled')) {
        state.offlineModeEnabled = Boolean(message.offlineModeEnabled);
        syncOfflineModeUi();
      }
      addLog('管理画面がサーバーに接続されました。');
      requestScoreCatalog(false);
      requestAdminRankings(false);
      return;
    }

    if (message.t === 'admin_log_history') {
      (Array.isArray(message.entries) ? message.entries : []).forEach((entry) => {
        if (entry && entry.message) {
          addLog(entry.message);
        }
      });
      return;
    }

    if (message.t === 'admin_log') {
      addLog(String(message.message || ''));
      return;
    }

    if (message.t === 'lobby_state') {
      if (Object.prototype.hasOwnProperty.call(message, 'offlineModeEnabled')) {
        state.offlineModeEnabled = Boolean(message.offlineModeEnabled);
        syncOfflineModeUi();
      }
      state.classes = Array.isArray(message.classes) ? message.classes : [];
      renderAttendanceBoard();
      return;
    }

    if (message.t === 'class_state' && message.class) {
      const next = state.classes.slice();
      const index = next.findIndex((item) => item.classId === message.class.classId);
      if (index >= 0) {
        next[index] = message.class;
      } else {
        next.push(message.class);
      }
      state.classes = next;
      renderAttendanceBoard();
      return;
    }

    if (message.t === 'game_state') {
      addLog(`${message.classId}: game_state=${message.state}`);
      renderAttendanceBoard();
      return;
    }

    if (message.t === 'offline_mode') {
      state.offlineModeEnabled = Boolean(message.enabled);
      syncOfflineModeUi();
      addLog(state.offlineModeEnabled ? 'オフラインモードが ON になりました。' : 'オフラインモードが OFF になりました。');
      return;
    }

    if (message.t === 'force_stop') {
      addLog(`${String(message.classId || '-')} を強制終了しました。`);
      renderAttendanceBoard();
      return;
    }

    if (message.t === 'admin_start') {
      (message.results || []).forEach((result) => {
        if (result.ok) {
          addLog(`${result.classId}: ${new Date(result.startAt).toLocaleTimeString('ja-JP')} に開始予定`);
        } else if (result.reason === 'already_running') {
          addLog(`${result.classId}: 進行中のため再開始しませんでした。`);
        } else if (result.reason === 'offline_mode_active') {
          addLog(`${result.classId}: オフラインモード中のため開始しませんでした。`);
        } else {
          addLog(`${result.classId}: 開始できませんでした。`);
        }
      });
      if (message.ok) {
        addLog(message.showRank === false ? 'このゲームは結果画面で順位を表示しません。' : 'このゲームは結果画面で順位を表示します。');
      }
      return;
    }

    if (message.t === 'admin_offline_mode') {
      if (Object.prototype.hasOwnProperty.call(message, 'enabled')) {
        state.offlineModeEnabled = Boolean(message.enabled);
        syncOfflineModeUi();
      }
      if (message.ok) {
        addLog(state.offlineModeEnabled ? 'オフラインモードONを反映しました。' : 'オフラインモードOFFを反映しました。');
      }
      return;
    }

    if (message.t === 'admin_force_stop') {
      if (message.ok) {
        addLog(`強制終了を反映しました。停止クラス ${Number(message.stoppedClassCount || 0)} / 影響プレイヤー ${Number(message.affectedPlayerCount || 0)}`);
      } else {
        addLog('強制終了に失敗しました。');
      }
      return;
    }

    if (message.t === 'admin_scores_query') {
      if (!message.ok) {
        addLog(message.mode === 'rankings' ? 'ランキング取得に失敗しました。' : '記録一覧の取得に失敗しました。');
        return;
      }
      if (message.mode === 'catalog') {
        state.scoreCatalog = Array.isArray(message.items) ? message.items : [];
        renderScoreCatalog();
      } else if (message.mode === 'records') {
        state.scoreRecords = Array.isArray(message.items) ? message.items : [];
        renderScoreRecords();
      } else if (message.mode === 'rankings') {
        state.rankings = normalizeRankingPayload(message.rankings);
        renderAdminRankings();
      }
      return;
    }

    if (message.t === 'admin_clear_scores') {
      if (message.ok) {
        if (message.mode === 'all') {
          addLog(`記録全消去を反映しました。削除 ${Number(message.removedCount || 0)} 件 / 残り ${Number(message.remainingCount || 0)} 件`);
        } else if (message.mode === 'game') {
          addLog(`gameId=${message.gameId} を削除しました。削除 ${Number(message.removedCount || 0)} 件 / 残り ${Number(message.remainingCount || 0)} 件`);
        } else if (message.mode === 'games') {
          const list = Array.isArray(message.gameIds) ? message.gameIds.join(', ') : '';
          addLog(`選択 gameId を削除しました（${list || '-'}）。削除 ${Number(message.removedCount || 0)} 件 / 残り ${Number(message.remainingCount || 0)} 件`);
        } else if (message.mode === 'records') {
          addLog(`選択レコードを削除しました。削除 ${Number(message.removedCount || 0)} 件 / 残り ${Number(message.remainingCount || 0)} 件`);
        } else {
          addLog(`記録削除を反映しました。削除 ${Number(message.removedCount || 0)} 件 / 残り ${Number(message.remainingCount || 0)} 件`);
        }
        requestScoreCatalog(false);
        requestScoreRecords(getSelectedValues(els.deleteGameIdsSelect), false);
        requestAdminRankings(false);
      } else {
        addLog('記録削除に失敗しました。');
      }
      return;
    }

    if (message.t === 'error') {
      addLog(`エラー: ${message.message}`);
    }
  }

  function stopHeartbeat() {
    if (state.heartbeatTimer) {
      clearInterval(state.heartbeatTimer);
      state.heartbeatTimer = null;
    }
  }

  function startHeartbeat() {
    stopHeartbeat();
    state.heartbeatTimer = setInterval(() => {
      state.heartbeatSeq += 1;
      send({ t: 'heartbeat', seq: state.heartbeatSeq, clientTime: Date.now() });
    }, 10000);
  }

  function scheduleReconnect() {
    if (state.reconnectTimer) {
      return;
    }
    state.reconnectTimer = setTimeout(() => {
      state.reconnectTimer = null;
      connectWs();
    }, 3000);
  }

  function connectWs() {
    if (state.ws && (state.ws.readyState === WebSocket.OPEN || state.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    state.ws = new WebSocket(WS_URL);
    setConnectionBadge('WS: 接続中', 'connecting');

    state.ws.addEventListener('open', () => {
      setConnectionBadge('WS: 接続済み', 'connected');
      send({ t: 'hello', role: 'admin', clientTime: Date.now() });
      startHeartbeat();
    });

    state.ws.addEventListener('message', (event) => {
      let parsed;
      try {
        parsed = JSON.parse(event.data);
      } catch {
        return;
      }
      handleMessage(parsed);
    });

    state.ws.addEventListener('close', () => {
      stopHeartbeat();
      setConnectionBadge('WS: 切断', 'disconnected');
      addLog('WebSocket が切断されました。再接続を試みます。');
      scheduleReconnect();
    });

    state.ws.addEventListener('error', () => {
      setConnectionBadge('WS: エラー', 'disconnected');
      addLog('WebSocket エラーが発生しました。');
    });
  }

  function initStartControls() {
    setDurationInputValue(300);
    syncOfflineModeUi();

    els.durationInput.addEventListener('blur', () => {
      const durationSec = parseDurationInput(els.durationInput.value);
      if (!durationSec) {
        setDurationInputValue(300);
        return;
      }
      setDurationInputValue(durationSec);
    });

    els.durationUpBtn.addEventListener('click', () => {
      adjustDurationInput(DURATION_STEP_SEC);
    });

    els.durationDownBtn.addEventListener('click', () => {
      adjustDurationInput(-DURATION_STEP_SEC);
    });

    els.durationPresetButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const sec = clampDurationSec(Number(button.dataset.durationSec || 300));
        setDurationInputValue(sec);
      });
    });

    els.startAllBtn.addEventListener('click', () => {
      if (state.offlineModeEnabled) {
        addLog('オフラインモードON中は一斉開始できません。');
        return;
      }
      const durationSec = parseDurationInput(els.durationInput.value);
      if (!durationSec) {
        addLog('プレイ時間は mm:ss 形式で入力してください。例: 05:00');
        return;
      }
      setDurationInputValue(durationSec);
      send({ t: 'admin_start', scope: 'all', durationSec });
      addLog(`全クラス一斉開始を指示しました。プレイ時間 ${els.durationInput.value}`);
    });

    els.startAllNoRankBtn.addEventListener('click', () => {
      if (state.offlineModeEnabled) {
        addLog('オフラインモードON中は一斉開始できません。');
        return;
      }
      const durationSec = parseDurationInput(els.durationInput.value);
      if (!durationSec) {
        addLog('プレイ時間は mm:ss 形式で入力してください。例: 05:00');
        return;
      }
      setDurationInputValue(durationSec);
      send({ t: 'admin_start', scope: 'all', durationSec, showRank: false });
      addLog(`全体開始（順位非表示）を指示しました。プレイ時間 ${els.durationInput.value}`);
    });

    els.forceStopBtn.addEventListener('click', () => {
      const ok = window.confirm('進行中のゲームを強制終了し、全参加者を READY へ戻します。記録は残しません。続行しますか。');
      if (!ok) {
        return;
      }
      send({ t: 'admin_force_stop' });
      addLog('強制終了を指示しました。');
    });

    els.toggleOfflineModeBtn.addEventListener('click', () => {
      const next = !state.offlineModeEnabled;
      const confirmText = next
        ? 'オフラインモードを ON にします。必要なら進行中ゲームは強制終了されます。続行しますか。'
        : 'オフラインモードを OFF にしてオンライン運用へ戻します。進行中ゲームは強制終了されます。続行しますか。';
      const ok = window.confirm(confirmText);
      if (!ok) {
        return;
      }
      send({ t: 'admin_set_offline_mode', enabled: next });
      addLog(next ? 'オフラインモードONを指示しました。' : 'オフラインモードOFFを指示しました。');
    });
  }

  function initRecordControls() {
    renderScoreCatalog();
    renderScoreRecords();

    els.refreshScoreCatalogBtn.addEventListener('click', () => {
      requestScoreCatalog();
      addLog('gameId 一覧の更新を指示しました。');
    });

    els.deleteGameIdsSelect.addEventListener('change', () => {
      const selectedGameIds = getSelectedValues(els.deleteGameIdsSelect);
      requestScoreRecords(selectedGameIds, false);
      requestAdminRankings(false);
    });

    els.loadGameRecordsBtn.addEventListener('click', () => {
      const selectedGameIds = getSelectedValues(els.deleteGameIdsSelect);
      if (selectedGameIds.length === 0) {
        addLog('先に gameId を1つ以上選択してください。');
        return;
      }
      requestScoreRecords(selectedGameIds);
      requestAdminRankings(false);
      addLog(`選択 gameId (${selectedGameIds.length}件) のレコード一覧取得を指示しました。`);
    });

    els.clearAllRecordsBtn.addEventListener('click', () => {
      const ok = window.confirm('ローカル記録とスプレッドシート同期対象をすべて削除します。続行しますか。');
      if (!ok) {
        return;
      }
      send({ t: 'admin_clear_scores', mode: 'all' });
      addLog('記録全消去を指示しました。');
    });

    els.clearSelectedGamesBtn.addEventListener('click', () => {
      const selectedGameIds = getSelectedValues(els.deleteGameIdsSelect);
      if (selectedGameIds.length === 0) {
        addLog('削除する gameId を選択してください。');
        return;
      }
      const ok = window.confirm(`選択した ${selectedGameIds.length} 件の gameId の記録を削除します。続行しますか。`);
      if (!ok) {
        return;
      }
      send({ t: 'admin_clear_scores', mode: 'games', gameIds: selectedGameIds });
      addLog(`選択 gameId (${selectedGameIds.length}件) の記録削除を指示しました。`);
    });

    els.clearSelectedRecordsBtn.addEventListener('click', () => {
      const selectedRecordIds = getSelectedValues(els.deleteRecordIdsSelect);
      if (selectedRecordIds.length === 0) {
        addLog('削除するレコードを選択してください。');
        return;
      }
      const ok = window.confirm(`選択した ${selectedRecordIds.length} 件のレコードを削除します。続行しますか。`);
      if (!ok) {
        return;
      }
      send({ t: 'admin_clear_scores', mode: 'records', recordIds: selectedRecordIds });
      addLog(`選択レコード (${selectedRecordIds.length}件) の削除を指示しました。`);
    });
  }

  function initRankingControls() {
    renderAdminRankings();

    els.rankingTabs.forEach((button) => {
      button.addEventListener('click', () => {
        setRankingTarget(button.dataset.rankingTarget || 'selectedGame', true);
      });
    });

    if (els.rankingRosterSortBtn) {
      els.rankingRosterSortBtn.addEventListener('click', () => {
        state.rankingSortMode = 'roster';
        state.rankingScoreAsc = false;
        renderAdminRankings();
      });
    }

    if (els.rankingScoreSortBtn) {
      els.rankingScoreSortBtn.addEventListener('click', () => {
        if (state.rankingSortMode !== 'score') {
          state.rankingSortMode = 'score';
          state.rankingScoreAsc = false;
        } else {
          state.rankingScoreAsc = !state.rankingScoreAsc;
        }
        renderAdminRankings();
      });
    }

    if (els.copyAdminRankingBtn) {
      els.copyAdminRankingBtn.addEventListener('click', async () => {
        const rows = getSortedRankingRows();
        if (!rows.length) {
          addLog('コピー対象のランキングがありません。');
          return;
        }
        try {
          await copyTextToClipboard(buildCurrentRankingTsv());
          addLog('ランキングをTSV形式でクリップボードにコピーしました。');
        } catch (error) {
          addLog(`コピーに失敗しました: ${error && error.message ? error.message : 'unknown error'}`);
        }
      });
    }

    if (!els.refreshAdminRankingBtn) return;
    els.refreshAdminRankingBtn.addEventListener('click', () => {
      requestAdminRankings();
      addLog('ランキング更新を指示しました。');
    });
  }

  function init() {
    initStartControls();
    initRecordControls();
    initRankingControls();
    loadStudentMap();
    connectWs();
    renderAttendanceBoard();
    setInterval(renderHeaderStats, 1000);
  }

  init();
})();
