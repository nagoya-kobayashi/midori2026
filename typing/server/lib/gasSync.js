const fs = require('fs/promises');
const path = require('path');

const META_FILENAME = 'sheet-sync-meta.json';

function toTimestampMs(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }
  if (typeof value === 'string' && value.trim()) {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) {
      return Math.max(0, Math.round(asNumber));
    }
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return Math.max(0, parsed);
    }
  }
  return 0;
}

function createDefaultMeta() {
  return {
    localUpdatedAt: 0,
    remoteUpdatedAt: 0,
    localCsvUpdatedAt: 0,
    lastPulledAt: '',
    lastPushedAt: '',
    lastError: '',
    lastPushRecordKey: ''
  };
}

async function readMeta(metaPath) {
  try {
    const raw = await fs.readFile(metaPath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      ...createDefaultMeta(),
      ...(parsed && typeof parsed === 'object' ? parsed : {})
    };
  } catch {
    return createDefaultMeta();
  }
}

async function writeMeta(metaPath, meta) {
  const payload = JSON.stringify(meta, null, 2);
  await fs.writeFile(metaPath, payload, 'utf8');
}

async function fetchJson(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(options && options.headers ? options.headers : {})
      }
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 240)}`);
    }
    return text ? JSON.parse(text) : {};
  } finally {
    clearTimeout(timer);
  }
}

function buildRequestUrl(baseUrl, params) {
  const url = new URL(baseUrl);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }
    url.searchParams.set(key, String(value));
  });
  return url.toString();
}

function createRecordKey(record) {
  const timestamp = String(record && record.timestamp || '');
  const uid = String(record && record.uid || '');
  const playerId = String(record && record.playerId || '');
  const no = String(record && record.no || '');
  const gameId = String(record && record.gameId || '');
  return `${timestamp}::${uid || playerId || no}::${gameId}`;
}

function parseCsvLine(line) {
  const cells = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === ',' && !quoted) {
      cells.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells;
}

function parseCsvRecords(csvText) {
  const lines = String(csvText || '')
    .split(/\r?\n/)
    .filter((line) => line.trim());
  if (lines.length <= 1) {
    return [];
  }
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const record = {};
    headers.forEach((header, index) => {
      record[header] = values[index] ?? '';
    });
    return record;
  });
}

function createGasSync(options) {
  const {
    dataDir,
    config,
    log,
    readAllScores,
    readScoresCsv,
    replaceScores
  } = options;

  const metaPath = path.join(dataDir, META_FILENAME);
  const enabled = Boolean(config.GAS_SYNC_ENABLED && config.GAS_META_URL && config.GAS_DATA_URL && config.GAS_PUSH_URL);
  let meta = createDefaultMeta();
  let pushQueue = Promise.resolve();

  async function persistMeta() {
    await writeMeta(metaPath, meta);
  }

  async function refreshLocalUpdatedAtFromScores() {
    const records = await readAllScores();
    const latest = records.reduce((max, record) => Math.max(max, toTimestampMs(record.timestamp)), 0);
    if (latest > meta.localUpdatedAt) {
      meta.localUpdatedAt = latest;
      await persistMeta();
    }
  }

  async function refreshLocalCsvMeta() {
    if (typeof readScoresCsv !== 'function') {
      return '';
    }
    const csvText = await readScoresCsv();
    meta.localCsvUpdatedAt = Math.max(meta.localCsvUpdatedAt, meta.localUpdatedAt);
    await persistMeta();
    return csvText;
  }

  async function fetchRemoteMeta() {
    const payload = await fetchJson(
      buildRequestUrl(config.GAS_META_URL, {
        mode: 'meta',
        localUpdatedAt: meta.localUpdatedAt
      }),
      { method: 'GET' },
      config.GAS_TIMEOUT_MS
    );
    const remoteUpdatedAt = toTimestampMs(payload.updatedAt || payload.remoteUpdatedAt);
    return {
      remoteUpdatedAt,
      payload
    };
  }

  async function initialize() {
    meta = await readMeta(metaPath);
    await refreshLocalUpdatedAtFromScores();
    await refreshLocalCsvMeta();
    if (!enabled) {
      meta.lastError = '';
      await persistMeta();
      return { enabled: false, skipped: true };
    }
    try {
      const { remoteUpdatedAt } = await fetchRemoteMeta();
      meta.remoteUpdatedAt = Math.max(meta.remoteUpdatedAt, remoteUpdatedAt);
      if (remoteUpdatedAt > meta.localUpdatedAt) {
        const payload = await fetchJson(
          buildRequestUrl(config.GAS_DATA_URL, {
            mode: 'export',
            localUpdatedAt: meta.localUpdatedAt
          }),
          { method: 'GET' },
          config.GAS_TIMEOUT_MS
        );
        const records = Array.isArray(payload.records)
          ? payload.records
          : Array.isArray(payload.items)
            ? payload.items
            : typeof payload.csv === 'string'
              ? parseCsvRecords(payload.csv)
              : [];
        await replaceScores(records);
        const pulledUpdatedAt = toTimestampMs(payload.updatedAt || remoteUpdatedAt);
        meta.localUpdatedAt = Math.max(meta.localUpdatedAt, pulledUpdatedAt);
        meta.localCsvUpdatedAt = meta.localUpdatedAt;
        meta.remoteUpdatedAt = Math.max(meta.remoteUpdatedAt, pulledUpdatedAt);
        meta.lastPulledAt = new Date().toISOString();
        meta.lastError = '';
        await persistMeta();
        log('INFO', `GAS sync pulled ${records.length} records from spreadsheet`);
        return { enabled: true, pulled: true, count: records.length };
      }
      meta.lastError = '';
      await persistMeta();
      log('INFO', `GAS sync skipped pull remoteUpdatedAt=${remoteUpdatedAt} localUpdatedAt=${meta.localUpdatedAt}`);
      return { enabled: true, pulled: false };
    } catch (error) {
      meta.lastError = String(error && error.message || error);
      await persistMeta();
      log('WARN', `GAS sync initialize failed: ${meta.lastError}`);
      return { enabled: true, error: meta.lastError };
    }
  }

  async function pushRecord(record) {
    if (!enabled) {
      return { enabled: false, skipped: true };
    }
    const recordKey = createRecordKey(record);
    if (recordKey && meta.lastPushRecordKey === recordKey) {
      return { enabled: true, skipped: true, duplicate: true };
    }
    const recordUpdatedAt = toTimestampMs(record && record.timestamp) || Date.now();
    meta.localUpdatedAt = Math.max(meta.localUpdatedAt, recordUpdatedAt);
    const csvText = await refreshLocalCsvMeta();
    const csvRowCount = Math.max(0, csvText.split(/\r?\n/).filter((line) => line.trim()).length - 1);
    await persistMeta();
    try {
      const payload = await fetchJson(
        config.GAS_PUSH_URL,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            mode: 'append',
            localUpdatedAt: meta.localUpdatedAt,
            localCsvUpdatedAt: meta.localCsvUpdatedAt,
            remoteUpdatedAt: meta.remoteUpdatedAt,
            csvRowCount,
            record
          })
        },
        config.GAS_TIMEOUT_MS
      );
      const acknowledgedAt = toTimestampMs(payload.updatedAt || payload.remoteUpdatedAt || recordUpdatedAt);
      meta.remoteUpdatedAt = Math.max(meta.remoteUpdatedAt, acknowledgedAt);
      meta.localUpdatedAt = Math.max(meta.localUpdatedAt, acknowledgedAt);
      meta.localCsvUpdatedAt = Math.max(meta.localCsvUpdatedAt, meta.localUpdatedAt);
      meta.lastPushedAt = new Date().toISOString();
      meta.lastPushRecordKey = recordKey;
      meta.lastError = '';
      await persistMeta();
      log('INFO', `GAS sync pushed score record uid=${record.uid || '-'} gameId=${record.gameId}`);
      return { enabled: true, pushed: true };
    } catch (error) {
      meta.lastError = String(error && error.message || error);
      await persistMeta();
      log('WARN', `GAS sync push failed: ${meta.lastError}`);
      return { enabled: true, error: meta.lastError };
    }
  }

  async function pushSnapshot(reason = 'manual') {
    if (!enabled) {
      return { enabled: false, skipped: true };
    }
    const csvText = await refreshLocalCsvMeta();
    const records = await readAllScores();
    meta.localUpdatedAt = records.reduce((max, record) => Math.max(max, toTimestampMs(record.timestamp)), meta.localUpdatedAt);
    meta.localCsvUpdatedAt = Math.max(meta.localCsvUpdatedAt, meta.localUpdatedAt);
    await persistMeta();
    try {
      const payload = await fetchJson(
        config.GAS_PUSH_URL,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            mode: 'replace',
            localUpdatedAt: meta.localUpdatedAt,
            localCsvUpdatedAt: meta.localCsvUpdatedAt,
            remoteUpdatedAt: meta.remoteUpdatedAt,
            records,
            csv: csvText,
            reason
          })
        },
        config.GAS_TIMEOUT_MS
      );
      const acknowledgedAt = toTimestampMs(payload.updatedAt || payload.remoteUpdatedAt || meta.localUpdatedAt);
      meta.remoteUpdatedAt = Math.max(meta.remoteUpdatedAt, acknowledgedAt);
      meta.localUpdatedAt = Math.max(meta.localUpdatedAt, acknowledgedAt);
      meta.localCsvUpdatedAt = Math.max(meta.localCsvUpdatedAt, meta.localUpdatedAt);
      meta.lastPushedAt = new Date().toISOString();
      meta.lastError = '';
      meta.lastPushRecordKey = '';
      await persistMeta();
      log('INFO', `GAS sync replaced remote snapshot rows=${records.length} reason=${reason}`);
      return { enabled: true, pushed: true, rows: records.length };
    } catch (error) {
      meta.lastError = String(error && error.message || error);
      await persistMeta();
      log('WARN', `GAS sync replace failed: ${meta.lastError}`);
      return { enabled: true, error: meta.lastError };
    }
  }

  function queuePush(record) {
    pushQueue = pushQueue
      .then(() => pushRecord(record))
      .catch(async (error) => {
        meta.lastError = String(error && error.message || error);
        await persistMeta();
        log('WARN', `GAS sync queue failed: ${meta.lastError}`);
      });
    return pushQueue;
  }

  function queueReplaceAll(reason = 'manual') {
    pushQueue = pushQueue
      .then(() => pushSnapshot(reason))
      .catch(async (error) => {
        meta.lastError = String(error && error.message || error);
        await persistMeta();
        log('WARN', `GAS sync replace queue failed: ${meta.lastError}`);
      });
    return pushQueue;
  }

  function getStatus() {
    return {
      enabled,
      meta: { ...meta }
    };
  }

  return {
    initialize,
    queuePush,
    queueReplaceAll,
    getStatus
  };
}

module.exports = {
  createGasSync,
  toTimestampMs
};
