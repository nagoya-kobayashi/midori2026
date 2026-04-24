(() => {
  const APP_CONFIG = window.TypingAppConfig || {};
  const SERVER_PUBLIC_HOST = String(APP_CONFIG.SERVER_PUBLIC_HOST || location.hostname || 'midori-st-sv');
  const SERVER_PORT = Number(APP_CONFIG.SERVER_PORT || 3100);
  const SERVER_PROTOCOL = String(APP_CONFIG.SERVER_PROTOCOL || (location.protocol === 'https:' ? 'https' : 'http'));
  const API_BASE_URL = `${SERVER_PROTOCOL}://${SERVER_PUBLIC_HOST}${SERVER_PORT ? `:${SERVER_PORT}` : ''}`;
  const STUDENT_CSV_URL = './student.csv';
  const els = {
    classSelect: document.getElementById('classSelect'),
    refreshBtn: document.getElementById('refreshRanking'),
    status: document.getElementById('rankingStatus'),
    updatedAt: document.getElementById('updatedAt'),
    tbody: document.getElementById('rankingTbody'),
    modeLabel: document.getElementById('modeLabel'),
    classCounter: document.getElementById('classCounter')
  };

  let refreshTimer = null;
  let studentMap = {};

  function setStatus(text) {
    els.status.textContent = text;
  }

  function formatDate(isoString) {
    if (!isoString) {
      return '-';
    }
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) {
      return isoString;
    }
    return `${date.toLocaleDateString('ja-JP')} ${date.toLocaleTimeString('ja-JP')}`;
  }

  async function fetchJson(url) {
    const response = await fetch(`${API_BASE_URL}${url}`, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
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
    const uidIndex = head.findIndex((value) => value === 'uid' || value === 'id');
    const nameIndex = head.findIndex((value) => value === 'playername' || value === 'name' || value === 'studentname');
    if (uidIndex < 0 || nameIndex < 0) {
      return {};
    }
    const map = {};
    lines.slice(1).forEach((line) => {
      const row = parseCsvLine(line);
      const uid = String(row[uidIndex] || '').trim();
      const name = String(row[nameIndex] || '').trim();
      if (!uid || !name) {
        return;
      }
      map[uid] = name;
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
      studentMap = parseStudentCsvMap(text);
    } catch {
      studentMap = {};
    }
  }

  function getDisplayName(item) {
    const uid = String(item && item.uid || '').trim();
    if (uid && studentMap[uid]) {
      return studentMap[uid];
    }
    const fromRecord = String(item && item.playerName || '').trim();
    if (fromRecord) {
      return fromRecord;
    }
    return uid || '-';
  }

  function renderRows(items) {
    els.tbody.innerHTML = '';

    if (!items.length) {
      const row = document.createElement('tr');
      row.innerHTML = '<td colspan="5" class="muted">このクラスの記録はまだありません。</td>';
      els.tbody.appendChild(row);
      return;
    }

    items.forEach((item) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${item.rank}</td>
        <td>${getDisplayName(item)}</td>
        <td>${item.score}</td>
        <td>${Number(item.accuracy).toFixed(2)}%</td>
        <td>${formatDate(item.timestamp)}</td>
      `;
      els.tbody.appendChild(row);
    });
  }

  async function loadClasses(preferredClassId = '') {
    const data = await fetchJson('/api/classes');
    const classes = Array.isArray(data.classes) ? data.classes : [];

    els.classCounter.textContent = String(classes.length);
    els.classSelect.innerHTML = '';

    classes.forEach((item) => {
      const option = document.createElement('option');
      option.value = item.classId;
      option.textContent = item.classId;
      els.classSelect.appendChild(option);
    });

    const queryClassId = new URLSearchParams(location.search).get('classId') || '';
    const targetClassId = preferredClassId || queryClassId;

    if (targetClassId) {
      els.classSelect.value = targetClassId;
    }

    if (!els.classSelect.value && classes.length > 0) {
      els.classSelect.value = classes[0].classId;
    }
  }

  async function loadRanking() {
    const classId = els.classSelect.value;
    if (!classId) {
      renderRows([]);
      setStatus('クラスを選択してください。');
      return;
    }

    setStatus('ランキング取得中...');

    try {
      const data = await fetchJson(`/api/ranking?classId=${encodeURIComponent(classId)}`);
      renderRows(Array.isArray(data.items) ? data.items : []);
      els.modeLabel.textContent = data.mode || 'best';
      els.updatedAt.textContent = formatDate(new Date().toISOString());
      setStatus(`件数: ${data.total || 0} / クラス: ${classId}`);
    } catch (error) {
      setStatus(`取得失敗: ${error.message}`);
    }
  }

  async function refreshAll() {
    try {
      await loadStudentMap();
      await loadClasses(els.classSelect.value);
      await loadRanking();
    } catch (error) {
      setStatus(`読み込み失敗: ${error.message}`);
    }
  }

  function startAutoRefresh() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
    }
    refreshTimer = setInterval(loadRanking, 15000);
  }

  function init() {
    els.refreshBtn.addEventListener('click', refreshAll);

    els.classSelect.addEventListener('change', () => {
      const classId = els.classSelect.value;
      const url = new URL(location.href);
      if (classId) {
        url.searchParams.set('classId', classId);
      }
      history.replaceState({}, '', url);
      loadRanking();
    });

    refreshAll();
    startAutoRefresh();
  }

  init();
})();
