(() => {
  const APP_CONFIG = window.TypingAppConfig || {};
  const SERVER_PUBLIC_HOST = String(APP_CONFIG.SERVER_PUBLIC_HOST || location.hostname || 'midori-st-sv');
  const SERVER_PORT = Number(APP_CONFIG.SERVER_PORT || 3100);
  const SERVER_PROTOCOL = String(APP_CONFIG.SERVER_PROTOCOL || (location.protocol === 'https:' ? 'https' : 'http'));
  const WS_PATH = String(APP_CONFIG.WS_PATH || '/ws');
  const PAGE_IS_HTTP = location.protocol === 'http:' || location.protocol === 'https:';
  const SERVER_BASE_URL = `${SERVER_PROTOCOL}://${SERVER_PUBLIC_HOST}${SERVER_PORT ? `:${SERVER_PORT}` : ''}`;
  const WS_URL = PAGE_IS_HTTP
    ? `${SERVER_PROTOCOL === 'https' ? 'wss' : 'ws'}://${SERVER_PUBLIC_HOST}${SERVER_PORT ? `:${SERVER_PORT}` : ''}${WS_PATH}`
    : '';
  const STUDENT_CSV_URL = './student.csv';
  const PLAYER_STORAGE_KEY = 'typing_player_v4';
  const STUDENT_CACHE_KEY = 'typing_student_cache_v2';
  const ROMAJI_PREF_STORAGE_KEY = 'typing_romaji_pref_v1';
  const READY_SETTINGS_STORAGE_KEY = 'typing_ready_settings_v1';
  const SOLO_SNAPSHOT_CACHE_KEY_PREFIX = 'typing_solo_snapshot_v1:';
  const OUTSIDE_SESSION_STORAGE_KEY = 'typing_outside_session_v1';
  const DEBUG_LAYOUT = new URL(location.href).searchParams.get('debug') === '1';
  const WS_CONNECT_TIMEOUT_MS = 2000;
  const OUTSIDE_AUTH_FALLBACK_DELAY_MS = 7000;
  const HIGH_COMBO_ANNOUNCE_START = 400;
  const HIGH_COMBO_ANNOUNCE_STEP = 100;
  const HOME_ROW_DISPLAY_KEYS = new Set(['a', 's', 'd', 'f', 'j', 'k', 'l', ';']);
  const PUBLIC_GAS_SYNC = (() => {
    const gasConfig = APP_CONFIG && typeof APP_CONFIG.GAS_SYNC === 'object' ? APP_CONFIG.GAS_SYNC : {};
    return {
      enabled: Boolean(gasConfig.clientEnabled),
      webAppUrl: String(gasConfig.clientWebAppUrl || gasConfig.webAppUrl || '').trim(),
      timeoutMs: Math.max(1000, Number(gasConfig.timeoutMs || 8000)),
      cacheTtlMs: Math.max(10_000, Number(gasConfig.clientCacheTtlMs || 300_000)),
      rankingLimit: Math.max(1, Math.min(200, Number(gasConfig.clientRankingLimit || 45))),
      recentLimit: Math.max(1, Math.min(100, Number(gasConfig.clientRecentLimit || 16)))
    };
  })();

  const KEY_LAYOUT = [['1',70,62,84,56],['2',164,62,84,56],['3',258,62,84,56],['4',352,62,84,56],['5',446,62,84,56],['6',540,62,84,56],['7',634,62,84,56],['8',728,62,84,56],['9',822,62,84,56],['0',916,62,84,56],['-',1010,62,84,56],['q',98,132,88,56],['w',192,132,88,56],['e',286,132,88,56],['r',380,132,88,56],['t',474,132,88,56],['y',568,132,88,56],['u',662,132,88,56],['i',756,132,88,56],['o',850,132,88,56],['p',944,132,88,56],['a',124,202,88,56],['s',218,202,88,56],['d',312,202,88,56],['f',406,202,88,56],['g',500,202,88,56],['h',594,202,88,56],['j',688,202,88,56],['k',782,202,88,56],['l',876,202,88,56],[';',970,202,88,56],['z',154,272,88,56],['x',248,272,88,56],['c',342,272,88,56],['v',436,272,88,56],['b',530,272,88,56],['n',624,272,88,56],['m',718,272,88,56],[',',812,272,88,56],['.',906,272,88,56],['/',1000,272,88,56],[' ',144,344,912,44]];
  const FINGER_HOME_KEYS = {
    lp: 'a',
    lr: 's',
    lm: 'd',
    li: 'f',
    th: ' ',
    ri: 'j',
    rm: 'k',
    rr: 'l',
    rp: ';'
  };
  const HAND_FINGERTIP_ANCHORS = {
    lp: { x: 168, y: 230 },
    lr: { x: 262, y: 230 },
    lm: { x: 356, y: 228 },
    li: { x: 450, y: 230 },
    th: { x: 600, y: 369 },
    ri: { x: 732, y: 230 },
    rm: { x: 826, y: 228 },
    rr: { x: 920, y: 230 },
    rp: { x: 1014, y: 230 }
  };

  const fingerMap = {
    q: 'lp', a: 'lp', z: 'lp', '1': 'lp',
    w: 'lr', s: 'lr', x: 'lr', '2': 'lr',
    e: 'lm', d: 'lm', c: 'lm', '3': 'lm',
    r: 'li', f: 'li', v: 'li', t: 'li', g: 'li', b: 'li', '4': 'li', '5': 'li',
    y: 'ri', h: 'ri', n: 'ri', u: 'ri', j: 'ri', m: 'ri', '6': 'ri', '7': 'ri',
    i: 'rm', k: 'rm', ',': 'rm', '8': 'rm',
    o: 'rr', l: 'rr', '.': 'rr', '9': 'rr',
    p: 'rp', ';': 'rp', '/': 'rp', '-': 'rp', '0': 'rp',
    ' ': 'th'
  };
  const RESULT_PANEL_DEFS = [
    { key: 'correctCount', groupId: 'resultCorrectGroup', valueId: 'resultCorrectValue', format: (value) => `${value}字` },
    { key: 'missCount', groupId: 'resultMissGroup', valueId: 'resultMissValue', format: (value) => `${value}回` },
    { key: 'accuracy', groupId: 'resultAccuracyGroup', valueId: 'resultAccuracyValue', format: (value) => `${Number(value).toFixed(1)}%` },
    { key: 'completedPrompts', groupId: 'resultCompletedGroup', valueId: 'resultCompletedValue', format: (value) => `${value}文` }
  ];
  const RESULT_SPEED_METRIC_DEFS = {
    englishWord: { label: '打鍵速度', unit: 'KPM', minDurationMs: 30_000 },
    japaneseText: { label: '文字速度', unit: 'WPM', minDurationMs: 30_000 }
  };
  const STAGE_COMBO_THRESHOLDS = [30, 80, 150, 300];
  let cachedStudentMap = null;
  const LOCAL_CHAT_TEST_USERS = Array.from({ length: 40 }, (_, index) => `テスト${index + 1}号`);
  const RESULT_SIDE_PANEL_X = 960;
  const RESULT_SIDE_PANEL_WIDTH = 350;
  const RESULT_SIDE_PANEL_SLANT = 24;
  const RESULT_SIDE_ICON_X = 1002;
  const RESULT_SIDE_LABEL_X = 1044;
  const RESULT_SIDE_VALUE_X = 1286;
  const RESULT_COMBO_PANEL_X = RESULT_SIDE_PANEL_X - 100;
  const RESULT_COMBO_PANEL_WIDTH = RESULT_SIDE_PANEL_WIDTH + 120;
  const RESULT_COMBO_PANEL_SLANT = RESULT_SIDE_PANEL_SLANT;
  const RESULT_COMBO_ICON_X = RESULT_COMBO_PANEL_X + 42;
  const RESULT_COMBO_LABEL_X = RESULT_COMBO_PANEL_X + 84;
  const RESULT_COMBO_VALUE_X = RESULT_COMBO_PANEL_X + RESULT_COMBO_PANEL_WIDTH - 24;
  const RESULT_COMBO_GAUGE_X = RESULT_COMBO_PANEL_X + 48;
  const RESULT_COMBO_GAUGE_Y = 622;
  const RESULT_COMBO_GAUGE_WIDTH = RESULT_COMBO_PANEL_WIDTH - 96;
  const RESULT_COMBO_GAUGE_HEIGHT = 16;
  const AUTH_HASH_ALGORITHM = 'SHA-256';
  const PLAY_SPRITE_TARGET_HEIGHT = 108;
  const DASH_MOTION_CONFIG = {
    motion_walk: { frameMs: 150, loop: true, source: 'thief_walk', frameRange: [0, 3], standingRef: 'motion_walk' },
    motion_run: { frameMs: 110, loop: true, source: 'thief_walk', frameRange: [4, 7], standingRef: 'motion_run' },
    motion_sprint: { frameMs: 88, loop: true, source: 'thief_run', frameRange: [4, 6], standingRef: 'motion_sprint' },
    motion_dashfx: { frameMs: 68, loop: true, source: 'thief_dashfx', frameRange: [0, 3], standingRef: 'motion_sprint' },
    motion_fall: { frameMs: 140, loop: false, source: 'thief_fall', frameRange: [0, 5], standingRef: 'motion_walk' }
  };

  function buildHexPath(x, y, w, h, slant = 18) {
    return `M ${x + slant} ${y} L ${x + w - slant} ${y} L ${x + w} ${y + h / 2} L ${x + w - slant} ${y + h} L ${x + slant} ${y + h} L ${x} ${y + h / 2} Z`;
  }

  function renderResultBackgroundSvg() {
    return `
      <svg id="resultBgSvg" class="result-bg-svg" viewBox="0 0 1350 700" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <pattern id="resultGridMinor" width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M 28 0 L 0 0 0 28" fill="none" stroke="rgba(0,255,255,0.07)" stroke-width="1"></path>
          </pattern>
          <pattern id="resultGridMajor" width="140" height="140" patternUnits="userSpaceOnUse">
            <rect width="140" height="140" fill="url(#resultGridMinor)"></rect>
            <path d="M 140 0 L 0 0 0 140" fill="none" stroke="rgba(0,255,255,0.14)" stroke-width="1.8"></path>
            <path d="M 70 0 L 70 140" fill="none" stroke="rgba(0,255,255,0.09)" stroke-width="1.1"></path>
            <path d="M 0 70 L 140 70" fill="none" stroke="rgba(0,255,255,0.09)" stroke-width="1.1"></path>
          </pattern>
          <pattern id="resultScanlines" width="8" height="8" patternUnits="userSpaceOnUse">
            <rect width="8" height="8" fill="transparent"></rect>
            <rect y="0" width="8" height="1" fill="rgba(255,255,255,0.045)"></rect>
            <rect y="4" width="8" height="1" fill="rgba(255,255,255,0.03)"></rect>
          </pattern>
          <radialGradient id="resultVignette" cx="50%" cy="46%" r="70%">
            <stop offset="0%" stop-color="rgba(10,14,26,0.04)"></stop>
            <stop offset="58%" stop-color="rgba(10,14,26,0.18)"></stop>
            <stop offset="100%" stop-color="rgba(10,14,26,0.72)"></stop>
          </radialGradient>
          <filter id="resultGlowCyanBg" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blurA"></feGaussianBlur>
            <feGaussianBlur in="SourceGraphic" stdDeviation="11" result="blurB"></feGaussianBlur>
            <feMerge>
              <feMergeNode in="blurB"></feMergeNode>
              <feMergeNode in="blurA"></feMergeNode>
              <feMergeNode in="SourceGraphic"></feMergeNode>
            </feMerge>
          </filter>
        </defs>
        <rect width="1350" height="700" fill="#0a0e1a"></rect>
        <rect width="1350" height="700" fill="url(#resultGridMajor)"></rect>
        <rect width="1350" height="700" fill="url(#resultScanlines)" opacity="0.34"></rect>
        <rect width="1350" height="700" fill="url(#resultVignette)"></rect>
        <g class="result-hud-bg-details">
          <path d="M 28 126 H 440" stroke="rgba(0,255,255,0.2)" stroke-width="2.6"></path>
          <path d="M 132 658 H 412" stroke="rgba(0,255,255,0.18)" stroke-width="3.6"></path>
          <path d="M 882 116 H 1274" stroke="rgba(255,204,0,0.14)" stroke-width="2.4"></path>
          <path d="M 905 528 H 1282" stroke="rgba(255,204,0,0.18)" stroke-width="3.2"></path>
          <path d="M 976 198 H 1282" stroke="rgba(0,255,255,0.1)" stroke-width="1.6"></path>
          <path d="M 976 290 H 1282" stroke="rgba(255,51,102,0.1)" stroke-width="1.6"></path>
          <path d="M 976 382 H 1282" stroke="rgba(0,255,255,0.1)" stroke-width="1.6"></path>
          <path d="M 976 474 H 1282" stroke="rgba(255,255,255,0.08)" stroke-width="1.6"></path>
        </g>
        <g class="result-speed-lines">
          <path d="M 24 214 H 332" class="cyan trail-1"></path>
          <path d="M 12 246 H 356" class="cyan trail-2"></path>
          <path d="M 18 284 H 308" class="cyan trail-3"></path>
          <path d="M 52 332 H 378" class="pink trail-4"></path>
          <path d="M 30 365 H 344" class="cyan trail-5"></path>
          <path d="M 26 404 H 286" class="pink trail-6"></path>
          <path d="M 82 442 H 338" class="cyan trail-7"></path>
        </g>
      </svg>`;
  }

  function renderResultHudSvg() {
    const chipClassX = 824;
    const chipClassWidth = 182;
    const chipPlayerX = 1026;
    const chipPlayerWidth = 196;
    const chipClassCenterX = chipClassX + chipClassWidth / 2;
    const chipPlayerCenterX = chipPlayerX + chipPlayerWidth / 2;
    const chipClassPath = buildHexPath(chipClassX, 38, chipClassWidth, 54, 18);
    const chipPlayerPath = buildHexPath(chipPlayerX, 38, chipPlayerWidth, 54, 18);
    const scorePlatePath = buildHexPath(482, 246, 354, 214, 30);
    const heatTickCount = Math.max(8, Math.floor((RESULT_COMBO_GAUGE_WIDTH - 28) / 16));
    const heatTickXs = Array.from({ length: heatTickCount }, (_, index) => RESULT_COMBO_GAUGE_X + 14 + index * 16);
    const flameXs = [40, 108, 176, 244, 312].map((offset) => RESULT_COMBO_GAUGE_X + offset);
    const statusPaths = {
      correct: buildHexPath(RESULT_SIDE_PANEL_X, 164, RESULT_SIDE_PANEL_WIDTH, 78, RESULT_SIDE_PANEL_SLANT),
      miss: buildHexPath(RESULT_SIDE_PANEL_X, 256, RESULT_SIDE_PANEL_WIDTH, 78, RESULT_SIDE_PANEL_SLANT),
      accuracy: buildHexPath(RESULT_SIDE_PANEL_X, 348, RESULT_SIDE_PANEL_WIDTH, 78, RESULT_SIDE_PANEL_SLANT),
      completed: buildHexPath(RESULT_SIDE_PANEL_X, 440, RESULT_SIDE_PANEL_WIDTH, 78, RESULT_SIDE_PANEL_SLANT),
      combo: buildHexPath(RESULT_COMBO_PANEL_X, 546, RESULT_COMBO_PANEL_WIDTH, 114, RESULT_COMBO_PANEL_SLANT)
    };
    return `
      <svg id="resultHudSvg" class="result-hud-svg" viewBox="0 0 1350 700" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="resultGoldFill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#fff1a6"></stop>
            <stop offset="45%" stop-color="#ffcc00"></stop>
            <stop offset="100%" stop-color="#ff9f1a"></stop>
          </linearGradient>
          <linearGradient id="resultCyanStroke" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#00ffff"></stop>
            <stop offset="100%" stop-color="#6cf6ff"></stop>
          </linearGradient>
          <linearGradient id="resultGreenFill" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#00ff99"></stop>
            <stop offset="100%" stop-color="#82ffd3"></stop>
          </linearGradient>
          <linearGradient id="resultRedFill" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#ff3366"></stop>
            <stop offset="100%" stop-color="#ff809f"></stop>
          </linearGradient>
          <linearGradient id="resultBlueFill" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#00ffff"></stop>
            <stop offset="100%" stop-color="#78bfff"></stop>
          </linearGradient>
          <linearGradient id="resultComboFill" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#ffb347"></stop>
            <stop offset="55%" stop-color="#ff7a18"></stop>
            <stop offset="100%" stop-color="#ff3366"></stop>
          </linearGradient>
          <filter id="resultGlowCyan" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blurA"></feGaussianBlur>
            <feGaussianBlur in="SourceGraphic" stdDeviation="11" result="blurB"></feGaussianBlur>
            <feMerge>
              <feMergeNode in="blurB"></feMergeNode>
              <feMergeNode in="blurA"></feMergeNode>
              <feMergeNode in="SourceGraphic"></feMergeNode>
            </feMerge>
          </filter>
          <filter id="resultGlowGold" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blurA"></feGaussianBlur>
            <feGaussianBlur in="SourceGraphic" stdDeviation="14" result="blurB"></feGaussianBlur>
            <feMerge>
              <feMergeNode in="blurB"></feMergeNode>
              <feMergeNode in="blurA"></feMergeNode>
              <feMergeNode in="SourceGraphic"></feMergeNode>
            </feMerge>
          </filter>
          <filter id="resultGlowGreen" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blurA"></feGaussianBlur>
            <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blurB"></feGaussianBlur>
            <feMerge>
              <feMergeNode in="blurB"></feMergeNode>
              <feMergeNode in="blurA"></feMergeNode>
              <feMergeNode in="SourceGraphic"></feMergeNode>
            </feMerge>
          </filter>
          <filter id="resultGlowRed" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blurA"></feGaussianBlur>
            <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blurB"></feGaussianBlur>
            <feMerge>
              <feMergeNode in="blurB"></feMergeNode>
              <feMergeNode in="blurA"></feMergeNode>
              <feMergeNode in="SourceGraphic"></feMergeNode>
            </feMerge>
          </filter>
          <clipPath id="resultHeatClip">
            <path d="M ${RESULT_COMBO_GAUGE_X} ${RESULT_COMBO_GAUGE_Y} L ${RESULT_COMBO_GAUGE_X + RESULT_COMBO_GAUGE_WIDTH} ${RESULT_COMBO_GAUGE_Y} L ${RESULT_COMBO_GAUGE_X + RESULT_COMBO_GAUGE_WIDTH} ${RESULT_COMBO_GAUGE_Y + RESULT_COMBO_GAUGE_HEIGHT + 6} L ${RESULT_COMBO_GAUGE_X} ${RESULT_COMBO_GAUGE_Y + RESULT_COMBO_GAUGE_HEIGHT + 6} Z"></path>
          </clipPath>
        </defs>
        <g id="resultHeadGroup" class="result-hud-head">
          <path d="${chipClassPath}" class="hud-chip cyan"></path>
          <path d="${chipPlayerPath}" class="hud-chip gold"></path>
          <text id="resultClassChip" x="${chipClassCenterX}" y="72" class="hud-chip-text">クラス -</text>
          <text id="resultPlayerChip" x="${chipPlayerCenterX}" y="72" class="hud-chip-text">-</text>
        </g>

        <g id="resultEmblemGroup" class="result-hud-emblem">
          <path d="M 612 78 L 669 135 L 612 192 L 555 135 Z" fill="rgba(255,204,0,0.08)" stroke="url(#resultGoldFill)" stroke-width="4" filter="url(#resultGlowGold)"></path>
          <path d="M 612 92 L 655 135 L 612 178 L 569 135 Z" fill="rgba(0,255,255,0.12)" stroke="url(#resultCyanStroke)" stroke-width="3" filter="url(#resultGlowCyan)"></path>
          <path d="M 528 126 L 566 112 L 566 158 L 528 144 L 496 160 L 496 110 Z" fill="rgba(255,204,0,0.18)" stroke="url(#resultGoldFill)" stroke-width="3" filter="url(#resultGlowGold)"></path>
          <path d="M 676 116 L 704 128 L 720 116 L 720 154 L 704 144 L 676 156 Z" fill="rgba(255,204,0,0.18)" stroke="url(#resultGoldFill)" stroke-width="3" filter="url(#resultGlowGold)"></path>
          <text id="resultRankLetter" x="612" y="149" class="result-rank-letter" text-anchor="middle"></text>
          <text x="804" y="155" class="result-rank-text" text-anchor="middle">RANK</text>
        </g>

        <g id="resultScoreGroup" class="result-hud-score">
          <path d="${scorePlatePath}" class="result-score-plate"></path>
          <path d="M 510 232 H 808" stroke="rgba(255,204,0,0.34)" stroke-width="3" filter="url(#resultGlowGold)"></path>
          <path d="M 522 472 H 796" stroke="rgba(255,204,0,0.26)" stroke-width="2" filter="url(#resultGlowGold)"></path>
          <path d="M 635 214 L 728 246 L 728 476 L 635 510 L 542 476 L 542 246 Z" class="result-score-core"></path>
          <text x="659" y="318" class="result-score-label" text-anchor="middle">SCORE</text>
          <text id="resultScoreValue" x="659" y="416" class="result-score-value" text-anchor="middle">0</text>
        </g>

        <g id="resultRankGroup" class="result-rank-group">
          <text x="659" y="520" class="result-rank-sub-label" text-anchor="middle">クラス順位</text>
          <text id="resultClassRankValue" x="659" y="586" class="result-class-rank-value" text-anchor="middle"></text>
        </g>

        <g id="resultSpeedGroup" class="result-speed-group hidden">
          <text id="resultKpmValue" x="659" y="628" class="result-speed-value" text-anchor="middle"></text>
          <text id="resultWpmValue" x="659" y="658" class="result-speed-value" text-anchor="middle"></text>
        </g>

        <g id="resultCorrectGroup" class="result-metric-group result-metric-group--correct">
          <path d="${statusPaths.correct}" class="result-metric-panel result-metric-panel--green"></path>
          <text x="${RESULT_SIDE_ICON_X}" y="212" class="result-metric-icon result-metric-icon--green">✓</text>
          <text x="${RESULT_SIDE_LABEL_X}" y="202" class="result-metric-label">文字数</text>
          <text id="resultCorrectValue" x="${RESULT_SIDE_VALUE_X}" y="215" class="result-metric-value result-metric-value--green" text-anchor="end">0</text>
        </g>

        <g id="resultMissGroup" class="result-metric-group result-metric-group--miss">
          <path d="${statusPaths.miss}" class="result-metric-panel result-metric-panel--red"></path>
          <text x="${RESULT_SIDE_ICON_X}" y="304" class="result-metric-icon result-metric-icon--red">✕</text>
          <text x="${RESULT_SIDE_LABEL_X}" y="294" class="result-metric-label">ミス</text>
          <text id="resultMissValue" x="${RESULT_SIDE_VALUE_X}" y="307" class="result-metric-value result-metric-value--red" text-anchor="end">0</text>
        </g>

        <g id="resultAccuracyGroup" class="result-metric-group result-metric-group--accuracy">
          <path d="${statusPaths.accuracy}" class="result-metric-panel result-metric-panel--blue"></path>
          <text x="${RESULT_SIDE_ICON_X}" y="396" class="result-metric-icon result-metric-icon--blue">◉</text>
          <text x="${RESULT_SIDE_LABEL_X}" y="386" class="result-metric-label">正確率</text>
          <text id="resultAccuracyValue" x="${RESULT_SIDE_VALUE_X}" y="399" class="result-metric-value result-metric-value--blue" text-anchor="end">0.0%</text>
        </g>

        <g id="resultCompletedGroup" class="result-metric-group result-metric-group--completed">
          <path d="${statusPaths.completed}" class="result-metric-panel result-metric-panel--grey"></path>
          <text x="${RESULT_SIDE_ICON_X}" y="488" class="result-metric-icon result-metric-icon--grey">▣</text>
          <text x="${RESULT_SIDE_LABEL_X}" y="478" class="result-metric-label">完了文</text>
          <text id="resultCompletedValue" x="${RESULT_SIDE_VALUE_X}" y="491" class="result-metric-value result-metric-value--grey" text-anchor="end">0</text>
        </g>

        <g id="resultComboGroup" class="result-combo-group">
          <path d="${statusPaths.combo}" class="result-combo-panel"></path>
          <text id="resultComboIcon" x="${RESULT_COMBO_ICON_X}" y="590" class="result-combo-icon">★</text>
          <text id="resultComboLabel" x="${RESULT_COMBO_LABEL_X}" y="590" class="result-combo-label">最大コンボ</text>
          <text id="resultComboValue" x="${RESULT_COMBO_VALUE_X}" y="602" class="result-combo-value" text-anchor="end">0回</text>
          <rect x="${RESULT_COMBO_GAUGE_X}" y="${RESULT_COMBO_GAUGE_Y}" width="${RESULT_COMBO_GAUGE_WIDTH}" height="${RESULT_COMBO_GAUGE_HEIGHT}" rx="4" fill="rgba(255,255,255,0.08)" stroke="rgba(255,204,0,0.35)" stroke-width="1.2"></rect>
          <rect id="resultHeatFill" x="${RESULT_COMBO_GAUGE_X}" y="${RESULT_COMBO_GAUGE_Y}" width="0" height="${RESULT_COMBO_GAUGE_HEIGHT}" rx="4" fill="url(#resultComboFill)" filter="url(#resultGlowGold)"></rect>
          <g class="result-heat-ticks" clip-path="url(#resultHeatClip)">
            ${heatTickXs.map((x) => `<path d="M ${x} ${RESULT_COMBO_GAUGE_Y} V ${RESULT_COMBO_GAUGE_Y + RESULT_COMBO_GAUGE_HEIGHT}" opacity="0.28"></path>`).join('')}
          </g>
          <g id="resultComboFlames" class="result-flame-polys">
            <path d="M ${flameXs[0]} 618 L ${flameXs[0] + 8} 605 L ${flameXs[0] + 16} 618 Z"></path>
            <path d="M ${flameXs[1]} 618 L ${flameXs[1] + 10} 600 L ${flameXs[1] + 22} 618 Z"></path>
            <path d="M ${flameXs[2]} 618 L ${flameXs[2] + 8} 604 L ${flameXs[2] + 17} 618 Z"></path>
            <path d="M ${flameXs[3]} 618 L ${flameXs[3] + 10} 599 L ${flameXs[3] + 22} 618 Z"></path>
            <path d="M ${flameXs[4]} 618 L ${flameXs[4] + 10} 604 L ${flameXs[4] + 18} 618 Z"></path>
          </g>
        </g>
      </svg>`;
  }

  function renderHandsOverlaySvg() {
    return `
      <svg id="handsOverlay" class="hands-overlay" viewBox="0 0 1200 520" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="palmFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#fde4d2"></stop>
            <stop offset="100%" stop-color="#efb28f"></stop>
          </linearGradient>
          <linearGradient id="fingerFill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#fee8d7"></stop>
            <stop offset="100%" stop-color="#f3b48a"></stop>
          </linearGradient>
          <filter id="softShadow" x="-12%" y="-12%" width="124%" height="130%">
            <feDropShadow dx="0" dy="10" stdDeviation="8" flood-color="#c48c72" flood-opacity="0.18"></feDropShadow>
          </filter>
          <clipPath id="handCrop">
            <rect x="0" y="0" width="1200" height="418"></rect>
          </clipPath>
          <g id="leftHand">
            <path
              d="M118 520 C120 476 144 432 184 398 C230 360 290 344 348 352 C403 360 454 392 482 440 C496 464 504 491 506 520 Z"
              fill="url(#palmFill)"
              stroke="#d89d80"
              stroke-width="5"
              stroke-linejoin="round"></path>
            <g fill="none" stroke="url(#fingerFill)" stroke-linecap="round" stroke-linejoin="round">
              <path d="M214 404 C193 358 178 297 168 230" stroke-width="36"></path>
              <path d="M274 398 C265 353 262 293 262 230" stroke-width="38"></path>
              <path d="M336 394 C340 348 347 289 356 228" stroke-width="40"></path>
              <path d="M404 402 C417 360 431 302 450 230" stroke-width="40"></path>
              <path d="M422 444 C455 422 492 397 540 372" stroke-width="36"></path>
            </g>
            <g fill="none" stroke="#d89d80" stroke-linecap="round" stroke-linejoin="round">
              <path d="M214 404 C193 358 178 297 168 230" stroke-width="5"></path>
              <path d="M274 398 C265 353 262 293 262 230" stroke-width="5"></path>
              <path d="M336 394 C340 348 347 289 356 228" stroke-width="5"></path>
              <path d="M404 402 C417 360 431 302 450 230" stroke-width="5"></path>
              <path d="M422 444 C455 422 492 397 540 372" stroke-width="5"></path>
              <path d="M232 430 C250 411 270 395 294 382" stroke-width="4" opacity="0.4"></path>
              <path d="M286 428 C310 408 336 394 364 384" stroke-width="4" opacity="0.4"></path>
              <path d="M346 430 C374 412 402 400 428 392" stroke-width="4" opacity="0.4"></path>
            </g>
          </g>
        </defs>
        <g filter="url(#softShadow)" opacity="0.94" clip-path="url(#handCrop)">
          <use href="#leftHand"></use>
          <g transform="translate(1182 0) scale(-1 1)">
            <use href="#leftHand"></use>
          </g>
        </g>
        <g class="hand-anchor-layer ${DEBUG_LAYOUT ? 'visible' : ''}">
          <circle class="hand-anchor" data-finger="lp" cx="168" cy="230" r="7"></circle>
          <circle class="hand-anchor" data-finger="lr" cx="262" cy="230" r="7"></circle>
          <circle class="hand-anchor" data-finger="lm" cx="356" cy="228" r="7"></circle>
          <circle class="hand-anchor" data-finger="li" cx="450" cy="230" r="7"></circle>
          <circle class="hand-anchor" data-finger="th" cx="600" cy="369" r="7"></circle>
          <circle class="hand-anchor" data-finger="ri" cx="732" cy="230" r="7"></circle>
          <circle class="hand-anchor" data-finger="rm" cx="826" cy="228" r="7"></circle>
          <circle class="hand-anchor" data-finger="rr" cx="920" cy="230" r="7"></circle>
          <circle class="hand-anchor" data-finger="rp" cx="1014" cy="230" r="7"></circle>
        </g>
      </svg>`;
  }

  function render() {
    const root = document.getElementById('appRoot') || document.body;
    root.innerHTML = `
      <div id="connectionBadge" class="badge floating-status disconnected">未接続</div>
      <main class="layout student-layout">
        <section class="card hero-card">
          <div>
            <p class="eyebrow">Client First</p>
            <h2>uid があれば student.csv から参加者情報を読み込み、server.js が無くても練習できます</h2>
            <p class="hero-copy">開始同期、ランキング、保存はサーバーを使い、問題表示と入力判定はクライアントで処理します。</p>
          </div>
          <div class="hero-side">
            <div class="phase-strip" id="phaseStrip">
              <span class="phase-chip" data-phase="join">参加</span>
              <span class="phase-chip" data-phase="waiting">待機</span>
              <span class="phase-chip" data-phase="playing">プレイ</span>
              <span class="phase-chip" data-phase="result">結果</span>
            </div>
            <p id="systemNotice" class="system-note">初期化しています。</p>
            <dl class="hero-meta">
              <div><dt>参加クラス</dt><dd id="currentClassChip">-</dd></div>
              <div><dt>参加者名</dt><dd id="currentPlayerChip">-</dd></div>
              <div><dt>動作モード</dt><dd id="modeChip">-</dd></div>
            </dl>
          </div>
        </section>
        <section id="joinPanel" class="card hidden">
          <div class="section-header"><div><p class="eyebrow">Step 1</p><h2>参加情報を入力</h2></div></div>
          <form id="joinForm" class="inline-form">
            <div class="form-item"><label for="playerName">名前</label><input id="playerName" maxlength="20"></div>
            <div class="form-item"><label for="classId">クラス</label><input id="classId" maxlength="16"></div>
            <button class="btn-primary" type="submit">参加する</button>
          </form>
          <div class="inline-actions">
            <p id="joinHint" class="muted">名前とクラスを入力してください。</p>
            <button id="clearPlayerBtn" class="btn-secondary" type="button">入力をリセット</button>
          </div>
        </section>
        <section id="waitingPanel" class="card hidden">
          <div class="section-header">
            <div><p class="eyebrow">Step 2</p><h2>開始待機</h2></div>
            <button id="changeIdentityBtn" class="btn-secondary" type="button">参加者を変更</button>
          </div>
          <div class="waiting-grid">
            <div class="waiting-box emphasis-box">
              <p id="waitingMessage" class="waiting-message">サーバー接続を確認しています。</p>
              <p class="waiting-sub" id="waitingModeNote">server.js が無ければソロプレイに切り替えます。</p>
            </div>
            <dl class="mini-stats">
              <div><dt>参加クラス</dt><dd id="waitingClass">-</dd></div>
              <div><dt>接続状況</dt><dd id="waitingPlayers">接続 0 / 待機 0 / プレイ中 0 / 終了 0</dd></div>
            </dl>
          </div>
          <div class="inline-actions">
            <span></span>
            <button id="offlineStartBtn" class="btn-primary hidden" type="button">ソロプレイを開始</button>
          </div>
        </section>
        <section id="outsideAuthPanel" class="card outside-auth-card hidden">
          <div class="section-header">
            <div>
              <p class="eyebrow">Outside Access</p>
              <h2>校外オンライン ログイン</h2>
            </div>
          </div>
          <div id="outsideAuthStoredStep" class="outside-auth-step hidden">
            <p id="outsideAuthStoredUid" class="outside-auth-target"></p>
            <div class="outside-auth-session-card">
              <span class="outside-auth-session-label">Session ID</span>
              <code id="outsideAuthStoredSessionId" class="outside-auth-session-value">-</code>
            </div>
            <div class="outside-auth-actions">
              <button id="outsideAuthStoredStartBtn" class="btn-primary" type="button">スタートする</button>
              <button id="outsideAuthStoredResetBtn" class="btn-secondary" type="button">別のユーザでログインし直す</button>
            </div>
            <p id="outsideAuthStoredHint" class="muted">この端末に保存されたセッションがあります。</p>
          </div>
          <div id="outsideAuthIdStep" class="outside-auth-step">
            <form id="outsideAuthIdForm" class="outside-auth-form">
              <div class="form-item">
                <label for="outsideAuthUidInput">ID</label>
                <input id="outsideAuthUidInput" maxlength="64" autocomplete="username" placeholder="例: 2026A01">
              </div>
              <button class="btn-primary" type="submit">次へ</button>
            </form>
            <p id="outsideAuthIdHint" class="muted">IDを入力してください。</p>
          </div>
          <div id="outsideAuthPasswordStep" class="outside-auth-step hidden">
            <p id="outsideAuthPasswordTarget" class="outside-auth-target"></p>
            <form id="outsideAuthPasswordForm" class="outside-auth-form">
              <div class="form-item">
                <label for="outsideAuthPasswordInput">パスワード</label>
                <input id="outsideAuthPasswordInput" type="password" maxlength="64" autocomplete="current-password">
              </div>
              <button class="btn-primary" type="submit">ログイン</button>
            </form>
            <div class="inline-actions">
              <button id="outsideAuthBackBtn" class="btn-secondary" type="button">ID入力に戻る</button>
            </div>
            <p id="outsideAuthPasswordHint" class="muted"></p>
          </div>
        </section>
        <section id="gamePanel" class="card hidden">
          <div class="game-head">
            <div id="timeCard" class="kpi focus time-kpi" data-level="normal">
              <div class="label">残り時間</div>
              <div id="remainingTime" class="value">05:00</div>
            </div>
            <div id="promptBox" class="prompt-box">
              <div id="promptEffectLayer" class="prompt-effect-layer"></div>
              <div id="missOverlay" class="miss-overlay hidden">
                <div id="missKana" class="miss-kana">-</div>
                <div id="missRomaji" class="miss-romaji">-</div>
                <div class="miss-help">BackSpace でリカバリー</div>
              </div>
              <div class="prompt-subline">
                <p class="prompt-reading prompt-line">
                  <span id="readingTyped" class="prompt-typed"></span><span id="readingFlash" class="prompt-flash"></span><span id="readingCurrent" class="prompt-current" data-state="idle"></span><span id="readingRemaining" class="prompt-remaining"></span>
                </p>
              </div>
              <p id="promptText" class="prompt-text">-</p>
              <div class="prompt-subline">
                <p class="prompt-romaji prompt-line">
                  <span id="romajiTyped" class="prompt-typed"></span><span id="romajiFlash" class="prompt-flash"></span><span id="romajiCurrent" class="prompt-current" data-state="idle"></span><span id="romajiRemaining" class="prompt-remaining"></span>
                </p>
              </div>
            </div>
            <div id="comboCard" class="kpi combo-kpi" data-tier="0">
              <div id="comboEffectLayer" class="combo-effect-layer"></div>
              <div class="label">コンボ</div>
              <div id="comboValue" class="value combo-value">0</div>
            </div>
          </div>
        </section>
        <section id="keyboardPanel" class="card hidden">
          <div class="keyboard-stage">
            <img src="./assets/keyboard-base.svg" class="keyboard-base" alt="キーボード図">
            <canvas id="playSpriteCanvas" class="play-sprite-canvas" aria-hidden="true"></canvas>
            <div id="keyboard" class="keyboard-grid"></div>
            <svg id="fingerArrowLayer" class="finger-arrow-layer" viewBox="0 0 1200 520" preserveAspectRatio="none" aria-hidden="true"></svg>
            ${renderHandsOverlaySvg()}
            <div id="homeRowLabels" class="home-row-label-layer" aria-hidden="true"></div>
            <div class="finger-dots">
              <span class="finger-dot" data-finger="lp" style="left:14%;top:72%;"></span>
              <span class="finger-dot" data-finger="lr" style="left:20.8%;top:66.5%;"></span>
              <span class="finger-dot" data-finger="lm" style="left:27.8%;top:62.5%;"></span>
              <span class="finger-dot" data-finger="li" style="left:35.2%;top:66%;"></span>
              <span class="finger-dot" data-finger="th" style="left:50%;top:80.8%;"></span>
              <span class="finger-dot" data-finger="ri" style="left:64.8%;top:66%;"></span>
              <span class="finger-dot" data-finger="rm" style="left:72.2%;top:62.5%;"></span>
              <span class="finger-dot" data-finger="rr" style="left:79.2%;top:66.5%;"></span>
              <span class="finger-dot" data-finger="rp" style="left:86%;top:72%;"></span>
            </div>
            <svg id="layoutDebugLayer" class="layout-debug-layer ${DEBUG_LAYOUT ? '' : 'hidden'}" viewBox="0 0 1200 520" preserveAspectRatio="none" aria-hidden="true"></svg>
            <pre id="layoutDebugPanel" class="layout-debug-panel ${DEBUG_LAYOUT ? '' : 'hidden'}"></pre>
            <div id="nextKeyOverlay" class="next-key-overlay hidden" aria-hidden="true">
              <span id="nextKeyOverlayLabel" class="next-key-overlay-label"></span>
            </div>
          </div>
        </section>
        <aside id="chatPanel" class="card chat-panel hidden" aria-live="polite">
          <div class="chat-panel-inner">
            <div class="chat-panel-header">
              <p class="eyebrow">Message</p>
              <h3>チャット</h3>
            </div>
            <div id="chatList" class="chat-list"></div>
          </div>
        </aside>
        <section id="resultPanel" class="card hidden">
          <div id="resultStage" class="result-stage">
            <div id="resultIntro" class="result-intro">
              <div class="result-intro-text">終了</div>
            </div>
            ${renderResultBackgroundSvg()}
            <div id="resultConfettiLayer" class="result-confetti-layer" aria-hidden="true"></div>
            <canvas id="resultSpriteCanvas" class="result-sprite-canvas" aria-hidden="true"></canvas>
            <div id="resultShell" class="result-shell">
              ${renderResultHudSvg()}
              <div id="resultOutsidePasswordPanel" class="result-auth-panel result-auth-floating hidden">
                <div id="resultOutsidePasswordConfigured" class="result-auth-configured hidden">
                  <span>校外アクセス用パスワード設定済み</span>
                  <button id="resultOutsidePasswordResetBtn" class="btn-secondary" type="button">リセット</button>
                </div>
                <div id="resultOutsidePasswordSetup" class="result-auth-setup">
                  <label class="result-auth-label" for="resultOutsidePasswordInput">校外アクセス用パスワード</label>
                  <div class="result-auth-input-row">
                    <input id="resultOutsidePasswordInput" type="password" maxlength="64" autocomplete="new-password" placeholder="パスワードを入力">
                    <button id="resultOutsidePasswordSetBtn" class="btn-primary" type="button">校外アクセス用パスワードを設定</button>
                  </div>
                </div>
                <p id="resultOutsidePasswordHint" class="result-auth-hint"></p>
              </div>
              <div class="result-overlay">
                <div id="resultInfo" class="result-info"></div>
                <div id="resultActions" class="result-panel-actions">
                  <a id="rankingLink" class="btn btn-primary hidden" href="./ranking.html">クラスランキングを見る</a>
                  <button id="playAgainBtn" class="btn-secondary" type="button">待機画面に戻る</button>
                  <button id="changeIdentityResultBtn" class="btn-secondary hidden" type="button">参加者を変更</button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <div id="readyOverlay" class="ready-overlay hidden" aria-hidden="true">
          <div class="ready-inner">
          <div id="readySessionBar" class="ready-session-bar hidden">
            <div id="readyOutsideAuthIdentity" class="ready-auth-identity hidden"></div>
            <button id="readyLogoutBtn" class="ready-logout-btn hidden" type="button">ログアウト</button>
          </div>
          <div id="readyTitle" class="ready-title">READY</div>
          <div id="readyHint" class="ready-hint">スペースキーを押したらスタートします</div>
          <div id="readyOutsidePasswordPanel" class="ready-auth-panel hidden">
            <div id="readyOutsidePasswordConfigured" class="ready-auth-configured hidden">
              <span>校外アクセス用パスワード設定済み</span>
              <button id="readyOutsidePasswordResetBtn" class="btn-secondary" type="button">リセット</button>
            </div>
            <div id="readyOutsidePasswordSetup" class="ready-auth-setup">
              <label class="ready-auth-label" for="readyOutsidePasswordInput">校外アクセス用パスワード</label>
              <div class="ready-auth-input-row">
                <input id="readyOutsidePasswordInput" type="password" maxlength="64" autocomplete="new-password" placeholder="パスワードを入力">
                <button id="readyOutsidePasswordSetBtn" class="btn-primary" type="button">校外アクセス用パスワードを設定</button>
              </div>
            </div>
            <p id="readyOutsidePasswordHint" class="ready-auth-hint"></p>
          </div>
          <label id="retryByKanaOptionWrap" class="ready-option hidden">
            <input id="retryByKanaOption" class="ready-option-input" type="checkbox">
            <span>タイプミスした際にひらがなの単位で再入力とする</span>
          </label>
        </div>
      </div>`;
  }

  render();

  const els = {
    connectionBadge: document.getElementById('connectionBadge'),
    systemNotice: document.getElementById('systemNotice'),
    phaseStrip: document.getElementById('phaseStrip'),
    currentClassChip: document.getElementById('currentClassChip'),
    currentPlayerChip: document.getElementById('currentPlayerChip'),
    modeChip: document.getElementById('modeChip'),
    joinPanel: document.getElementById('joinPanel'),
    joinForm: document.getElementById('joinForm'),
    playerNameInput: document.getElementById('playerName'),
    classIdInput: document.getElementById('classId'),
    joinHint: document.getElementById('joinHint'),
    clearPlayerBtn: document.getElementById('clearPlayerBtn'),
    waitingPanel: document.getElementById('waitingPanel'),
    waitingMessage: document.getElementById('waitingMessage'),
    waitingModeNote: document.getElementById('waitingModeNote'),
    waitingClass: document.getElementById('waitingClass'),
    waitingPlayers: document.getElementById('waitingPlayers'),
    offlineStartBtn: document.getElementById('offlineStartBtn'),
    outsideAuthPanel: document.getElementById('outsideAuthPanel'),
    outsideAuthStoredStep: document.getElementById('outsideAuthStoredStep'),
    outsideAuthStoredUid: document.getElementById('outsideAuthStoredUid'),
    outsideAuthStoredSessionId: document.getElementById('outsideAuthStoredSessionId'),
    outsideAuthStoredStartBtn: document.getElementById('outsideAuthStoredStartBtn'),
    outsideAuthStoredResetBtn: document.getElementById('outsideAuthStoredResetBtn'),
    outsideAuthStoredHint: document.getElementById('outsideAuthStoredHint'),
    outsideAuthIdStep: document.getElementById('outsideAuthIdStep'),
    outsideAuthPasswordStep: document.getElementById('outsideAuthPasswordStep'),
    outsideAuthIdForm: document.getElementById('outsideAuthIdForm'),
    outsideAuthUidInput: document.getElementById('outsideAuthUidInput'),
    outsideAuthIdHint: document.getElementById('outsideAuthIdHint'),
    outsideAuthPasswordForm: document.getElementById('outsideAuthPasswordForm'),
    outsideAuthPasswordInput: document.getElementById('outsideAuthPasswordInput'),
    outsideAuthPasswordHint: document.getElementById('outsideAuthPasswordHint'),
    outsideAuthPasswordTarget: document.getElementById('outsideAuthPasswordTarget'),
    outsideAuthBackBtn: document.getElementById('outsideAuthBackBtn'),
    changeIdentityBtn: document.getElementById('changeIdentityBtn'),
    gamePanel: document.getElementById('gamePanel'),
    keyboardPanel: document.getElementById('keyboardPanel'),
    chatPanel: document.getElementById('chatPanel'),
    chatList: document.getElementById('chatList'),
    timeCard: document.getElementById('timeCard'),
    remainingTime: document.getElementById('remainingTime'),
    promptBox: document.getElementById('promptBox'),
    promptEffectLayer: document.getElementById('promptEffectLayer'),
    missOverlay: document.getElementById('missOverlay'),
    missKana: document.getElementById('missKana'),
    missRomaji: document.getElementById('missRomaji'),
    comboCard: document.getElementById('comboCard'),
    comboEffectLayer: document.getElementById('comboEffectLayer'),
    comboValue: document.getElementById('comboValue'),
    promptText: document.getElementById('promptText'),
    readingTyped: document.getElementById('readingTyped'),
    readingFlash: document.getElementById('readingFlash'),
    readingCurrent: document.getElementById('readingCurrent'),
    readingRemaining: document.getElementById('readingRemaining'),
    romajiTyped: document.getElementById('romajiTyped'),
    romajiFlash: document.getElementById('romajiFlash'),
    romajiCurrent: document.getElementById('romajiCurrent'),
    romajiRemaining: document.getElementById('romajiRemaining'),
    keyboard: document.getElementById('keyboard'),
    homeRowLabels: document.getElementById('homeRowLabels'),
    playSpriteCanvas: document.getElementById('playSpriteCanvas'),
    fingerArrowLayer: document.getElementById('fingerArrowLayer'),
    fingerDots: Array.from(document.querySelectorAll('.finger-dot')),
    handsOverlay: document.getElementById('handsOverlay'),
    layoutDebugLayer: document.getElementById('layoutDebugLayer'),
    layoutDebugPanel: document.getElementById('layoutDebugPanel'),
    nextKeyOverlay: document.getElementById('nextKeyOverlay'),
    nextKeyOverlayLabel: document.getElementById('nextKeyOverlayLabel'),
    readyOverlay: document.getElementById('readyOverlay'),
    readyTitle: document.getElementById('readyTitle'),
    readyHint: document.getElementById('readyHint'),
    readyOutsidePasswordPanel: document.getElementById('readyOutsidePasswordPanel'),
    readyOutsidePasswordConfigured: document.getElementById('readyOutsidePasswordConfigured'),
    readyOutsidePasswordSetup: document.getElementById('readyOutsidePasswordSetup'),
    readyOutsidePasswordInput: document.getElementById('readyOutsidePasswordInput'),
    readyOutsidePasswordSetBtn: document.getElementById('readyOutsidePasswordSetBtn'),
    readyOutsidePasswordResetBtn: document.getElementById('readyOutsidePasswordResetBtn'),
    readyOutsidePasswordHint: document.getElementById('readyOutsidePasswordHint'),
    retryByKanaOptionWrap: document.getElementById('retryByKanaOptionWrap'),
    retryByKanaOption: document.getElementById('retryByKanaOption'),
    readySessionBar: document.getElementById('readySessionBar'),
    readyOutsideAuthIdentity: document.getElementById('readyOutsideAuthIdentity'),
    resultPanel: document.getElementById('resultPanel'),
    resultStage: document.getElementById('resultStage'),
    resultIntro: document.getElementById('resultIntro'),
    resultBgSvg: document.getElementById('resultBgSvg'),
    resultConfettiLayer: document.getElementById('resultConfettiLayer'),
    resultSpriteCanvas: document.getElementById('resultSpriteCanvas'),
    resultShell: document.getElementById('resultShell'),
    resultHudSvg: document.getElementById('resultHudSvg'),
    resultHeadGroup: document.getElementById('resultHeadGroup'),
    resultEmblemGroup: document.getElementById('resultEmblemGroup'),
    resultClassChip: document.getElementById('resultClassChip'),
    resultPlayerChip: document.getElementById('resultPlayerChip'),
    resultRankLetter: document.getElementById('resultRankLetter'),
    resultCorrectGroup: document.getElementById('resultCorrectGroup'),
    resultMissGroup: document.getElementById('resultMissGroup'),
    resultAccuracyGroup: document.getElementById('resultAccuracyGroup'),
    resultCompletedGroup: document.getElementById('resultCompletedGroup'),
    resultComboGroup: document.getElementById('resultComboGroup'),
    resultComboIcon: document.getElementById('resultComboIcon'),
    resultComboLabel: document.getElementById('resultComboLabel'),
    resultScoreGroup: document.getElementById('resultScoreGroup'),
    resultRankGroup: document.getElementById('resultRankGroup'),
    resultSpeedGroup: document.getElementById('resultSpeedGroup'),
    resultCorrectValue: document.getElementById('resultCorrectValue'),
    resultMissValue: document.getElementById('resultMissValue'),
    resultAccuracyValue: document.getElementById('resultAccuracyValue'),
    resultCompletedValue: document.getElementById('resultCompletedValue'),
    resultComboValueHud: document.getElementById('resultComboValue'),
    resultComboFlames: document.getElementById('resultComboFlames'),
    resultHeatFill: document.getElementById('resultHeatFill'),
    resultScoreValue: document.getElementById('resultScoreValue'),
    resultClassRankValue: document.getElementById('resultClassRankValue'),
    resultKpmValue: document.getElementById('resultKpmValue'),
    resultWpmValue: document.getElementById('resultWpmValue'),
    resultInfo: document.getElementById('resultInfo'),
    resultOutsidePasswordPanel: document.getElementById('resultOutsidePasswordPanel'),
    resultOutsidePasswordConfigured: document.getElementById('resultOutsidePasswordConfigured'),
    resultOutsidePasswordSetup: document.getElementById('resultOutsidePasswordSetup'),
    resultOutsidePasswordInput: document.getElementById('resultOutsidePasswordInput'),
    resultOutsidePasswordSetBtn: document.getElementById('resultOutsidePasswordSetBtn'),
    resultOutsidePasswordResetBtn: document.getElementById('resultOutsidePasswordResetBtn'),
    resultOutsidePasswordHint: document.getElementById('resultOutsidePasswordHint'),
    resultActions: document.getElementById('resultActions'),
    rankingLink: document.getElementById('rankingLink'),
    playAgainBtn: document.getElementById('playAgainBtn'),
    changeIdentityResultBtn: document.getElementById('changeIdentityResultBtn'),
    readyLogoutBtn: document.getElementById('readyLogoutBtn')
  };
  const handAnchorElements = new Map(Array.from(document.querySelectorAll('.hand-anchor')).map((node) => [node.dataset.finger, node]));

  const state = {
    ws: null,
    reconnectTimer: null,
    wsConnectTimer: null,
    outsideAuthFallbackTimer: null,
    heartbeatTimer: null,
    countdownTimer: null,
    serverOffsetMs: 0,
    serverAvailable: false,
    adminOfflineMode: false,
    joined: false,
    player: { uid: '', classId: '', classRow: '', attendanceNo: 0, playerName: '', playerId: '' },
    classState: null,
    ready: { active: false, mode: 'idle', timer: null },
    inputLock: { active: false, timer: null, shakeTimer: null, missKey: '', nextKeys: [], pendingComboReset: false, startedAt: 0, comboAtMiss: 0 },
    romajiPrefs: {},
    phase: 'join',
    config: { gameDurationSec: 300, startDelayMs: 3000, promptQueueSize: 220 },
    game: null,
    runtime: { durationOverrideSec: readDurationOverrideSec() },
    settings: { retryByKanaOnMiss: true },
    result: { runId: 0, timers: [], infoLines: [], serverLines: [], rankSummary: null, scoreSequenceDone: false, rankRevealDone: false },
    chat: { messages: [], nextId: 1, botTimer: null, timelineTimers: [], scheduleKey: '' },
    offline: { snapshot: null, fetchPromise: null, syncPromise: null },
    outsideAuth: {
      active: false,
      loggedIn: false,
      resumingStoredSession: false,
      uid: '',
      sessionId: '',
      pendingUid: '',
      pendingSalt: '',
      pendingIdentity: null,
      requestSeq: 0
    },
    sprite: {
      meta: null,
      image: null,
      loaded: false,
      error: '',
      rafId: 0,
      playDrawRect: null,
      resultDrawRect: null,
      playMotionKey: '',
      playMotionStartedAt: 0,
      resultMotionKey: '',
      resultMotionStartedAt: 0,
      resultSequenceStartedAt: 0
    }
  };

  const keyElements = new Map();
  const homeRowLabelElements = new Map();
  const keyLayoutMap = new Map(KEY_LAYOUT.map(([key, x, y, w, h]) => [key, { x, y, w, h }]));
  const flashTimers = { keyActive: new Map(), keyMiss: new Map(), promptReading: null, promptRomaji: null, comboFeedback: null };
  const promptFlash = { reading: '', romaji: '' };

  function setBadge(text, cls) { els.connectionBadge.textContent = text; els.connectionBadge.className = `badge floating-status ${cls}`; }
  function setNotice(text) { els.systemNotice.textContent = text; }
  function isLocalTestMode() {
    return Boolean(Number.isFinite(state.runtime.durationOverrideSec) && state.runtime.durationOverrideSec > 0);
  }
  function isServerOnlineMode() {
    return Boolean(state.serverAvailable && !state.adminOfflineMode);
  }
  function isOutsideOnlineMode() {
    return Boolean(!state.serverAvailable && !isLocalTestMode() && state.outsideAuth.loggedIn);
  }
  function isOutsideOnlineResultMode() {
    return Boolean(state.phase === 'result' && state.game && state.game.localOnly && isOutsideOnlineMode());
  }
  function buildLocalPracticeGameId(seed) {
    if (isOutsideOnlineMode()) {
      const classId = String(state.player.classId || '').trim() || 'unknown';
      return `local_${classId}`;
    }
    return `local_${seed}`;
  }
  function refreshConnectionBadge() {
    if (isServerOnlineMode()) {
      setBadge('校内オンライン', 'connected');
      return;
    }
    if (!state.serverAvailable && state.outsideAuth.loggedIn) {
      setBadge('外部オンライン', 'connecting');
      return;
    }
    setBadge('オフライン', 'local');
  }
  function getOfflineStartMode() {
    return isLocalTestMode() ? 'test' : 'solo';
  }
  function modeLabel() {
    if (state.game && state.game.localOnly) {
      if (!state.serverAvailable && state.outsideAuth.loggedIn && !isLocalTestMode()) return '校外オンライン';
      return isLocalTestMode() ? 'ローカルテスト' : 'ソロプレイ';
    }
    if (isServerOnlineMode()) return state.game && state.phase === 'playing' ? '同期プレイ' : '管理待機';
    if (state.serverAvailable && state.adminOfflineMode) return 'オフライン待機';
    if (state.outsideAuth.active && state.outsideAuth.loggedIn) return '校外オンライン';
    if (state.outsideAuth.active && !state.outsideAuth.loggedIn) return '校外ログイン待ち';
    return isLocalTestMode() ? 'ローカルテスト待機' : 'ソロ待機';
  }
  function isLocalPracticeActive() {
    return Boolean(state.game && state.game.localOnly && (state.phase === 'countdown' || state.phase === 'playing'));
  }
  function clearReadyTimer() {
    if (state.ready.timer) {
      clearTimeout(state.ready.timer);
      state.ready.timer = null;
    }
  }
  function clearWsConnectTimer() {
    if (state.wsConnectTimer) {
      clearTimeout(state.wsConnectTimer);
      state.wsConnectTimer = null;
    }
  }
  function clearReconnectTimer() {
    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = null;
    }
  }
  function clearOutsideAuthFallbackTimer() {
    if (state.outsideAuthFallbackTimer) {
      clearTimeout(state.outsideAuthFallbackTimer);
      state.outsideAuthFallbackTimer = null;
    }
  }
  function resetConnectionRuntimeForReentry() {
    clearReconnectTimer();
    clearWsConnectTimer();
    clearOutsideAuthFallbackTimer();
    stopHeartbeat();
    if (state.ws) {
      try { state.ws.close(); } catch {}
    }
    state.ws = null;
    state.serverAvailable = false;
    state.adminOfflineMode = false;
    state.joined = false;
    state.classState = null;
  }
  function scheduleOutsideAuthFallback() {
    if (state.outsideAuthFallbackTimer) {
      return;
    }
    state.outsideAuthFallbackTimer = setTimeout(() => {
      state.outsideAuthFallbackTimer = null;
      if (state.serverAvailable || state.game) {
        return;
      }
      showOfflineEntryAfterServerDisconnect();
    }, OUTSIDE_AUTH_FALLBACK_DELAY_MS);
  }
  function setReadyOverlay(active, title = 'READY', hint = 'スペースキーを押したらスタートします', mode = 'ready') {
    state.ready.active = Boolean(active);
    state.ready.mode = state.ready.active ? mode : 'idle';
    els.readyTitle.textContent = title;
    els.readyHint.textContent = hint;
    els.readyOverlay.classList.toggle('hidden', !state.ready.active);
    els.readyOverlay.setAttribute('aria-hidden', state.ready.active ? 'false' : 'true');
    els.readyOverlay.dataset.mode = state.ready.mode;
    els.retryByKanaOptionWrap.classList.add('hidden');
    document.body.classList.toggle('ready-mode', state.ready.active);
    syncReadyLogoutButton();
    if (state.ready.active) {
      refreshReadyOutsidePasswordPanel();
    } else {
      hideReadyOutsidePasswordPanel();
    }
  }
  function getKeyDisplayText(key) {
    if (key === ' ') return 'Space';
    if (/^[a-z]$/.test(key)) return key.toUpperCase();
    return key;
  }
  function now() { return state.serverAvailable ? Date.now() + state.serverOffsetMs : Date.now(); }
  function readDurationOverrideSec() {
    const raw = new URL(location.href).searchParams.get('time');
    if (!raw) return null;
    const seconds = Number(raw);
    if (!Number.isFinite(seconds)) return null;
    const normalized = Math.max(10, Math.min(3600, Math.round(seconds)));
    return normalized;
  }
  function applyDurationOverride() {
    const overrideSec = state.runtime.durationOverrideSec;
    if (Number.isFinite(overrideSec) && overrideSec > 0) {
      state.config.gameDurationSec = overrideSec;
    }
  }
  function canUseClientGas() {
    return Boolean(PUBLIC_GAS_SYNC.enabled && PUBLIC_GAS_SYNC.webAppUrl);
  }
  function isOutsideAuthRequired() {
    return Boolean(PAGE_IS_HTTP && !state.serverAvailable && !isLocalTestMode() && canUseClientGas());
  }
  function readOutsideSession() {
    try {
      const raw = localStorage.getItem(OUTSIDE_SESSION_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      const uid = String(parsed.uid || '').trim();
      const sessionId = String(parsed.sessionId || '').trim();
      if (!uid || !sessionId) return null;
      return { uid, sessionId };
    } catch {
      return null;
    }
  }
  function writeOutsideSession(uid, sessionId) {
    try {
      localStorage.setItem(OUTSIDE_SESSION_STORAGE_KEY, JSON.stringify({
        uid: String(uid || '').trim(),
        sessionId: String(sessionId || '').trim(),
        updatedAt: Date.now()
      }));
    } catch {}
  }
  function clearOutsideSession() {
    try {
      localStorage.removeItem(OUTSIDE_SESSION_STORAGE_KEY);
    } catch {}
  }
  function invalidateOutsideAuthRequests() {
    state.outsideAuth.requestSeq += 1;
    return state.outsideAuth.requestSeq;
  }
  function isOutsideAuthRequestActive(token, options = {}) {
    const allowReady = Boolean(options && options.allowReady);
    return Boolean(
      token === state.outsideAuth.requestSeq
      && !state.serverAvailable
      && (
        state.phase === 'auth'
        || (allowReady && state.ready.active)
      )
    );
  }
  function resetOutsideAuthUi() {
    if (els.outsideAuthUidInput) {
      els.outsideAuthUidInput.value = '';
    }
    if (els.outsideAuthPasswordInput) {
      els.outsideAuthPasswordInput.value = '';
    }
    if (els.outsideAuthStoredUid) {
      els.outsideAuthStoredUid.textContent = '';
    }
    if (els.outsideAuthStoredSessionId) {
      els.outsideAuthStoredSessionId.textContent = '-';
    }
    setOutsideAuthHint(els.outsideAuthStoredHint, '');
    setOutsideAuthHint(els.outsideAuthIdHint, '');
    setOutsideAuthHint(els.outsideAuthPasswordHint, '');
  }
  function setStoredOutsideSessionDisplay(session) {
    const stored = session && typeof session === 'object' ? session : null;
    const uid = String(stored && stored.uid || '').trim();
    const sessionId = String(stored && stored.sessionId || '').trim();
    if (els.outsideAuthStoredUid) {
      els.outsideAuthStoredUid.textContent = uid ? `保存済み ID: ${uid}` : '';
    }
    if (els.outsideAuthStoredSessionId) {
      els.outsideAuthStoredSessionId.textContent = sessionId || '-';
    }
  }
  function resetOutsideAuthState() {
    state.outsideAuth.pendingUid = '';
    state.outsideAuth.pendingSalt = '';
    state.outsideAuth.pendingIdentity = null;
  }
  function applyOutsideAuthSession(uid, sessionId) {
    state.outsideAuth.active = true;
    state.outsideAuth.loggedIn = true;
    state.outsideAuth.resumingStoredSession = false;
    state.outsideAuth.uid = String(uid || '').trim();
    state.outsideAuth.sessionId = String(sessionId || '').trim();
    writeOutsideSession(state.outsideAuth.uid, state.outsideAuth.sessionId);
  }
  function clearOutsideAuthSession(options = {}) {
    state.outsideAuth.loggedIn = false;
    state.outsideAuth.resumingStoredSession = false;
    state.outsideAuth.uid = '';
    state.outsideAuth.sessionId = '';
    if (!options || !options.preserveStoredSession) {
      clearOutsideSession();
    }
  }
  function formatReadyOutsideAuthIdentity() {
    const classId = String(state.player.classId || '').trim() || '-';
    const attendanceNo = Number(state.player.attendanceNo || 0);
    const noText = attendanceNo > 0 ? String(attendanceNo) : '-';
    const playerName = String(state.player.playerName || '').trim() || '-';
    return `${classId} ${noText} ${playerName}`;
  }
  function syncReadyLogoutButton() {
    const visible = Boolean(
      els.readySessionBar
      && els.readyLogoutBtn
      && state.ready.active
      && state.ready.mode === 'ready'
      && !state.serverAvailable
      && state.outsideAuth.loggedIn
      && state.outsideAuth.active
    );
    if (els.readySessionBar) {
      els.readySessionBar.classList.toggle('hidden', !visible);
    }
    if (els.readyLogoutBtn) {
      els.readyLogoutBtn.classList.toggle('hidden', !visible);
    }
    if (els.readyOutsideAuthIdentity) {
      els.readyOutsideAuthIdentity.classList.toggle('hidden', !visible);
      els.readyOutsideAuthIdentity.textContent = visible ? formatReadyOutsideAuthIdentity() : '';
    }
  }
  function syncResultActions() {
    if (!els.resultActions) return;
    const visible = Boolean(state.phase === 'result' && state.result.scoreSequenceDone);
    const outsideReplayMode = isOutsideOnlineResultMode();
    els.resultActions.classList.toggle('is-visible', visible);
    els.resultActions.classList.toggle('result-panel-actions--outside-replay', outsideReplayMode);
    if (els.rankingLink) {
      els.rankingLink.classList.add('hidden');
    }
    if (els.changeIdentityResultBtn) {
      els.changeIdentityResultBtn.classList.add('hidden');
    }
    if (els.playAgainBtn) {
      els.playAgainBtn.textContent = outsideReplayMode ? 'もう1度プレイする' : '待機画面に戻る';
    }
  }
  function randomAuthSalt(length = 3) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const safeLength = Math.max(1, Math.floor(Number(length || 1)));
    let value = '';
    for (let index = 0; index < safeLength; index += 1) {
      value += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return value;
  }
  function encodeUtf8Bytes(text) {
    if (typeof TextEncoder !== 'undefined') {
      return Array.from(new TextEncoder().encode(String(text || '')));
    }
    const encoded = unescape(encodeURIComponent(String(text || '')));
    const bytes = [];
    for (let index = 0; index < encoded.length; index += 1) {
      bytes.push(encoded.charCodeAt(index) & 0xff);
    }
    return bytes;
  }
  function sha256HexFallback(text) {
    const bytes = encodeUtf8Bytes(text);
    const bitLength = bytes.length * 8;
    bytes.push(0x80);
    while ((bytes.length % 64) !== 56) {
      bytes.push(0x00);
    }
    for (let index = 7; index >= 0; index -= 1) {
      bytes.push((bitLength >>> (index * 8)) & 0xff);
    }
    const k = [
      0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
      0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
      0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
      0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
      0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
      0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
      0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
      0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
    ];
    const h = [
      0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,
      0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19
    ];
    const rightRotate = (value, bits) => (value >>> bits) | (value << (32 - bits));
    for (let offset = 0; offset < bytes.length; offset += 64) {
      const w = new Array(64);
      for (let index = 0; index < 16; index += 1) {
        const i = offset + index * 4;
        w[index] = ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0;
      }
      for (let index = 16; index < 64; index += 1) {
        const s0 = (rightRotate(w[index - 15], 7) ^ rightRotate(w[index - 15], 18) ^ (w[index - 15] >>> 3)) >>> 0;
        const s1 = (rightRotate(w[index - 2], 17) ^ rightRotate(w[index - 2], 19) ^ (w[index - 2] >>> 10)) >>> 0;
        w[index] = (w[index - 16] + s0 + w[index - 7] + s1) >>> 0;
      }
      let a = h[0];
      let b = h[1];
      let c = h[2];
      let d = h[3];
      let e = h[4];
      let f = h[5];
      let g = h[6];
      let hh = h[7];
      for (let index = 0; index < 64; index += 1) {
        const s1 = (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) >>> 0;
        const ch = ((e & f) ^ (~e & g)) >>> 0;
        const temp1 = (hh + s1 + ch + k[index] + w[index]) >>> 0;
        const s0 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) >>> 0;
        const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
        const temp2 = (s0 + maj) >>> 0;
        hh = g;
        g = f;
        f = e;
        e = (d + temp1) >>> 0;
        d = c;
        c = b;
        b = a;
        a = (temp1 + temp2) >>> 0;
      }
      h[0] = (h[0] + a) >>> 0;
      h[1] = (h[1] + b) >>> 0;
      h[2] = (h[2] + c) >>> 0;
      h[3] = (h[3] + d) >>> 0;
      h[4] = (h[4] + e) >>> 0;
      h[5] = (h[5] + f) >>> 0;
      h[6] = (h[6] + g) >>> 0;
      h[7] = (h[7] + hh) >>> 0;
    }
    return h.map((value) => value.toString(16).padStart(8, '0')).join('');
  }
  async function sha256Hex(text) {
    if (window.crypto && window.crypto.subtle && typeof window.crypto.subtle.digest === 'function') {
      const hashBuffer = await window.crypto.subtle.digest(AUTH_HASH_ALGORITHM, new TextEncoder().encode(String(text || '')));
      return Array.from(new Uint8Array(hashBuffer)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
    }
    return sha256HexFallback(text);
  }
  async function postGasJson(payload) {
    if (!canUseClientGas()) {
      throw new Error('GAS unavailable');
    }
    return fetchJsonWithTimeout(PUBLIC_GAS_SYNC.webAppUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain'
      },
      body: JSON.stringify(payload || {})
    });
  }
  async function fetchAuthStatusFromGas(uid) {
    return fetchJsonWithTimeout(buildGasClientUrl({
      mode: 'auth_status',
      uid
    }), { method: 'GET' });
  }
  async function fetchAuthSaltFromGas(uid) {
    return fetchJsonWithTimeout(buildGasClientUrl({
      mode: 'auth_get_salt',
      uid
    }), { method: 'GET' });
  }
  async function validateAuthSessionOnGas(uid, sessionId) {
    return fetchJsonWithTimeout(buildGasClientUrl({
      mode: 'auth_validate_session',
      uid,
      sessionId
    }), { method: 'GET' });
  }
  async function setOutsidePasswordOnGas(uid, passwordPlain) {
    const salt = randomAuthSalt(3);
    const passwordHash = await sha256Hex(`${String(passwordPlain || '')}${salt}`);
    return postGasJson({
      mode: 'auth_set_password',
      uid,
      salt,
      passwordHash
    });
  }
  async function resetOutsidePasswordOnGas(uid) {
    return postGasJson({
      mode: 'auth_reset_password',
      uid
    });
  }
  async function loginOutsideOnGas(uid, salt, passwordPlain) {
    const passwordHash = await sha256Hex(`${String(passwordPlain || '')}${String(salt || '')}`);
    return postGasJson({
      mode: 'auth_login',
      uid,
      passwordHash
    });
  }
  async function logoutOutsideOnGas(uid, sessionId) {
    return postGasJson({
      mode: 'auth_logout',
      uid,
      sessionId
    });
  }
  function buildSoloSnapshotCacheKey(classId) {
    return `${SOLO_SNAPSHOT_CACHE_KEY_PREFIX}${String(classId || '').trim().toUpperCase()}`;
  }
  function readSoloSnapshotCache(classId) {
    try {
      const raw = localStorage.getItem(buildSoloSnapshotCacheKey(classId));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed;
    } catch {
      return null;
    }
  }
  function writeSoloSnapshotCache(classId, snapshot) {
    if (!classId || !snapshot) return;
    try {
      localStorage.setItem(buildSoloSnapshotCacheKey(classId), JSON.stringify({
        classId: String(classId || '').trim(),
        updatedAt: Number(snapshot.updatedAt || 0),
        fetchedAt: Date.now(),
        snapshot
      }));
    } catch {}
  }
  function buildGasClientUrl(params = {}) {
    const url = new URL(PUBLIC_GAS_SYNC.webAppUrl);
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      url.searchParams.set(key, String(value));
    });
    if (PUBLIC_GAS_SYNC.token) {
      url.searchParams.set('token', PUBLIC_GAS_SYNC.token);
    }
    return url.toString();
  }
  async function fetchJsonWithTimeout(url, options = {}, timeoutMs = PUBLIC_GAS_SYNC.timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...(options.headers || {})
        }
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${text.slice(0, 160)}`);
      }
      return text ? JSON.parse(text) : {};
    } finally {
      clearTimeout(timer);
    }
  }
  function parseEventTimeline(raw) {
    let list = raw;
    if (typeof raw === 'string' && raw.trim()) {
      try {
        list = JSON.parse(raw);
      } catch {
        list = [];
      }
    }
    if (!Array.isArray(list)) return [];
    return list.map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const event = String(entry.event || '').trim();
      if (!event) return null;
      const normalized = {
        event,
        atMs: Math.max(0, Math.round(Number(entry.atMs || 0)))
      };
      if (event === 'achievement') normalized.comboThreshold = Math.max(0, Math.round(Number(entry.comboThreshold || 0)));
      if (event === 'critical_miss') normalized.comboAtMiss = Math.max(0, Math.round(Number(entry.comboAtMiss || 0)));
      return normalized;
    }).filter(Boolean);
  }
  function normalizeSnapshotRecord(record) {
    return {
      timestamp: String(record && record.timestamp || ''),
      gameId: String(record && record.gameId || ''),
      classId: String(record && record.classId || ''),
      uid: String(record && record.uid || ''),
      no: Number(record && record.no || 0),
      playerId: String(record && record.playerId || ''),
      playerName: String(record && record.playerName || ''),
      score: Number(record && record.score || 0),
      accuracy: Number(record && record.accuracy || 0),
      missCount: Number(record && record.missCount || 0),
      completedPrompts: Number(record && record.completedPrompts || 0),
      maxCombo: Number(record && record.maxCombo || 0),
      durationSec: Number(record && record.durationSec || 0),
      eventTimeline: parseEventTimeline(record && record.eventTimeline),
      rank: Number(record && record.rank || 0)
    };
  }
  function parseRecordTimestampMs(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
    const text = String(value || '').trim();
    if (!text) return NaN;
    const match = text.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d{1,4}))?$/);
    if (match) {
      const [, year, month, day, hour, minute, second, fraction = '0'] = match;
      const milliseconds = Math.floor(Number(String(fraction).padEnd(4, '0').slice(0, 4)) / 10);
      return Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour) - 9, Number(minute), Number(second), milliseconds);
    }
    const direct = Date.parse(text);
    return Number.isFinite(direct) ? direct : NaN;
  }
  function getSnapshotRecordIdentity(record) {
    const uid = String(record && record.uid || '').trim();
    if (uid) return `uid:${uid}`;
    const playerId = String(record && record.playerId || '').trim();
    if (playerId) return playerId;
    return `name:${String(record && record.classId || '').trim()}:${String(record && record.playerName || '').trim()}`;
  }
  function normalizeClassSnapshot(payload, classId = state.player.classId) {
    if (!payload || typeof payload !== 'object') return null;
    return {
      classId: String(payload.classId || classId || ''),
      updatedAt: Number(payload.updatedAt || 0),
      rowCount: Number(payload.rowCount || 0),
      rankingMode: String(payload.rankingMode || 'best'),
      items: Array.isArray(payload.items) ? payload.items.map(normalizeSnapshotRecord) : [],
      recentRecords: Array.isArray(payload.recentRecords) ? payload.recentRecords.map(normalizeSnapshotRecord) : []
    };
  }
  async function fetchClassMetaFromGas(classId) {
    if (!canUseClientGas() || !classId) return null;
    return fetchJsonWithTimeout(buildGasClientUrl({
      mode: 'class_meta',
      classId
    }), { method: 'GET' });
  }
  async function fetchClassSnapshotFromGas(classId) {
    if (!canUseClientGas() || !classId) return null;
    const payload = await fetchJsonWithTimeout(buildGasClientUrl({
      mode: 'class_snapshot',
      classId,
      limit: PUBLIC_GAS_SYNC.rankingLimit,
      recentLimit: PUBLIC_GAS_SYNC.recentLimit
    }), { method: 'GET' });
    return normalizeClassSnapshot(payload, classId);
  }
  async function ensureOfflineClassSnapshot(options = {}) {
    const force = Boolean(options.force);
    const classId = String((options.classId || state.player.classId || '')).trim();
    if (!classId || !canUseClientGas()) return null;
    const cache = readSoloSnapshotCache(classId);
    const cacheFresh = cache && (Date.now() - Number(cache.fetchedAt || 0) < PUBLIC_GAS_SYNC.cacheTtlMs);
    if (!force && cacheFresh && cache.snapshot) {
      state.offline.snapshot = normalizeClassSnapshot(cache.snapshot, classId);
      return state.offline.snapshot;
    }
    if (state.offline.fetchPromise && !force) {
      return state.offline.fetchPromise;
    }
    state.offline.fetchPromise = (async () => {
      try {
        if (!force && cache && cache.snapshot) {
          const meta = await fetchClassMetaFromGas(classId);
          if (meta && Number(meta.updatedAt || 0) <= Number(cache.updatedAt || 0)) {
            state.offline.snapshot = normalizeClassSnapshot(cache.snapshot, classId);
            writeSoloSnapshotCache(classId, state.offline.snapshot);
            return state.offline.snapshot;
          }
        }
        const snapshot = await fetchClassSnapshotFromGas(classId);
        if (snapshot) {
          state.offline.snapshot = snapshot;
          writeSoloSnapshotCache(classId, snapshot);
          return snapshot;
        }
      } catch {
        if (cache && cache.snapshot) {
          state.offline.snapshot = normalizeClassSnapshot(cache.snapshot, classId);
          return state.offline.snapshot;
        }
      } finally {
        state.offline.fetchPromise = null;
      }
      return null;
    })();
    return state.offline.fetchPromise;
  }
  function getOfflinePlayerId() {
    if (state.player.uid) return `uid:${state.player.uid}`;
    if (state.player.playerId && !String(state.player.playerId).startsWith('test:')) return state.player.playerId;
    return `name:${String(state.player.classId || '').trim()}:${String(state.player.playerName || '').trim()}`;
  }
  function compareRankingRecords(a, b) {
    if (Number(a.score || 0) !== Number(b.score || 0)) return Number(b.score || 0) - Number(a.score || 0);
    if (Number(a.accuracy || 0) !== Number(b.accuracy || 0)) return Number(b.accuracy || 0) - Number(a.accuracy || 0);
    if (Number(a.missCount || 0) !== Number(b.missCount || 0)) return Number(a.missCount || 0) - Number(b.missCount || 0);
    return (parseRecordTimestampMs(String(a.timestamp || '')) || 0) - (parseRecordTimestampMs(String(b.timestamp || '')) || 0);
  }
  function isBetterRankingRecord(candidate, current) {
    return compareRankingRecords(candidate, current) < 0;
  }
  function buildRankSummaryFromSnapshot(snapshot, candidateRecord = null) {
    const items = Array.isArray(snapshot && snapshot.items) ? snapshot.items.map(normalizeSnapshotRecord) : [];
    const playerIdentity = candidateRecord ? getSnapshotRecordIdentity(candidateRecord) : getOfflinePlayerId();
    const existingIndex = items.findIndex((item) => {
      return getSnapshotRecordIdentity(item) === playerIdentity;
    });
    if (candidateRecord) {
      if (existingIndex >= 0) {
        if (isBetterRankingRecord(candidateRecord, items[existingIndex])) {
          items[existingIndex] = normalizeSnapshotRecord(candidateRecord);
        }
      } else {
        items.push(normalizeSnapshotRecord(candidateRecord));
      }
    }
    const ranked = items
      .sort(compareRankingRecords)
      .map((item, index) => ({ ...item, rank: index + 1 }));
    const row = ranked.find((item) => {
      return getSnapshotRecordIdentity(item) === playerIdentity;
    });
    return {
      rank: row ? row.rank : null,
      total: ranked.length,
      score: row ? row.score : null,
      accuracy: row ? row.accuracy : null
    };
  }
  function buildOfflineResultRecord() {
    const summary = calcScore(state.game.stats);
    const speedMetrics = buildResultSpeedMetricValues();
    state.game.stats.score = summary.score;
    state.game.stats.accuracy = summary.accuracy;
    return {
      timestamp: new Date().toISOString(),
      classId: String(state.player.classId || '').trim(),
      uid: String(state.player.uid || '').trim(),
      no: Math.max(0, Math.round(Number(state.player.attendanceNo || 0))),
      playerId: getOfflinePlayerId(),
      playerName: String(state.player.playerName || '').trim(),
      score: Number(summary.score || 0),
      accuracy: Number(summary.accuracy || 0),
      correctCount: Number(state.game.stats.correctCount || 0),
      missCount: Number(state.game.stats.missCount || 0),
      completedPrompts: Number(state.game.stats.completedPrompts || 0),
      durationSec: Number(state.config.gameDurationSec || 300),
      inputCount: Number(state.game.stats.inputCount || 0),
      maxCombo: Number(state.game.stats.maxCombo || 0),
      kpm: Number(speedMetrics.kpm || 0),
      wpm: Number(speedMetrics.wpm || 0),
      eventTimeline: JSON.stringify(Array.isArray(state.game.eventTimeline) ? state.game.eventTimeline : []),
      gameId: String(state.game.gameId || '')
    };
  }
  async function submitOfflineRecord(record, options = {}) {
    if (!canUseClientGas()) return null;
    const appendAll = Boolean(options && options.appendAll);
    const payload = await postGasJson({
      mode: appendAll ? 'client_append_record' : 'client_submit_if_best',
      limit: PUBLIC_GAS_SYNC.rankingLimit,
      recentLimit: PUBLIC_GAS_SYNC.recentLimit,
      record
    });
    return normalizeClassSnapshot(payload, record.classId)
      ? {
          accepted: Boolean(payload.accepted),
          appended: Boolean(payload.appended),
          snapshot: normalizeClassSnapshot(payload, record.classId),
          rankSummary: payload.rankSummary || null
        }
      : null;
  }
  async function syncOfflineResult(record) {
    const currentSnapshot = state.offline.snapshot || await ensureOfflineClassSnapshot();
    if (currentSnapshot) {
      state.result.rankSummary = buildRankSummaryFromSnapshot(currentSnapshot, record);
    }
    if (state.phase === 'result' && state.result.rankRevealDone && state.result.rankSummary) {
      els.resultClassRankValue.textContent = formatResultRank(state.result.rankSummary);
    }
    if (state.phase === 'result' && state.result.scoreSequenceDone && !state.result.rankRevealDone && state.result.rankSummary) {
      revealResultRank(state.result.runId, true);
    }
    const freshSnapshot = await ensureOfflineClassSnapshot({ force: true });
    if (freshSnapshot) {
      state.result.rankSummary = buildRankSummaryFromSnapshot(freshSnapshot, record);
    }
    if (!isLocalTestMode() && !state.adminOfflineMode && canUseClientGas()) {
      const appendAllOutsideOnline = isOutsideOnlineMode();
      const currentBest = freshSnapshot && Array.isArray(freshSnapshot.items)
        ? freshSnapshot.items.find((item) => getSnapshotRecordIdentity(item) === getSnapshotRecordIdentity(record))
        : null;
      if (appendAllOutsideOnline || !currentBest || isBetterRankingRecord(record, currentBest)) {
        try {
          const response = await submitOfflineRecord(record, { appendAll: appendAllOutsideOnline });
          if (response && response.snapshot) {
            state.offline.snapshot = response.snapshot;
            writeSoloSnapshotCache(record.classId, response.snapshot);
            state.result.rankSummary = response.rankSummary || buildRankSummaryFromSnapshot(response.snapshot, record);
          }
        } catch {
          // keep local summary
        }
      }
    }
    if (state.phase === 'result' && state.result.rankRevealDone && state.result.rankSummary) {
      els.resultClassRankValue.textContent = formatResultRank(state.result.rankSummary);
    }
    if (state.phase === 'result' && state.result.scoreSequenceDone && state.result.rankSummary) {
      revealResultRank(state.result.runId, true);
    }
  }
  function readReadySettings() {
    try {
      const raw = JSON.parse(localStorage.getItem(READY_SETTINGS_STORAGE_KEY) || '{}');
      return {
        retryByKanaOnMiss: raw.retryByKanaOnMiss === undefined ? true : Boolean(raw.retryByKanaOnMiss)
      };
    } catch {
      return { retryByKanaOnMiss: true };
    }
  }
  function saveReadySettings() {
    try {
      localStorage.setItem(READY_SETTINGS_STORAGE_KEY, JSON.stringify(state.settings));
    } catch {}
  }
  function syncReadySettingsUi() {
    if (els.retryByKanaOption) {
      els.retryByKanaOption.checked = Boolean(state.settings.retryByKanaOnMiss);
    }
  }
  function boxWidth(box) { return Math.max(1, Number(box.x1) - Number(box.x0) + 1); }
  function boxHeight(box) { return Math.max(1, Number(box.y1) - Number(box.y0) + 1); }
  function lerp(start, end, progress) { return start + (end - start) * progress; }
  function clamp01(value) { return Math.max(0, Math.min(1, value)); }
  function easeOutCubic(value) { return 1 - Math.pow(1 - clamp01(value), 3); }
  function loadImageAsset(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`画像を読み込めません: ${src}`));
      image.src = src;
    });
  }
  async function loadDashSpriteMeta() {
    if (window.DashSpriteData) return window.DashSpriteData;
    const response = await fetch('./assets/dash.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`dash.json の読み込みに失敗しました: ${response.status}`);
    return response.json();
  }
  async function loadDashSpriteAssets() {
    try {
      const [meta, image] = await Promise.all([
        loadDashSpriteMeta(),
        loadImageAsset('./assets/dash.png')
      ]);
      state.sprite.meta = meta;
      state.sprite.image = image;
      state.sprite.loaded = true;
      state.sprite.error = '';
    } catch (error) {
      state.sprite.loaded = false;
      state.sprite.error = error instanceof Error ? error.message : 'dash スプライトを読み込めませんでした';
      setNotice(state.sprite.error);
    }
  }
  function getMotionFrames(motionKey) {
    if (!(state.sprite.meta && state.sprite.meta.frames)) return [];
    const config = DASH_MOTION_CONFIG[motionKey];
    if (config && config.source) {
      const sourceFrames = state.sprite.meta.frames[config.source] || [];
      const range = Array.isArray(config.frameRange) ? config.frameRange : [0, sourceFrames.length - 1];
      return sourceFrames.slice(range[0], range[1] + 1);
    }
    return state.sprite.meta.frames[motionKey] || [];
  }
  function fitFrameToBox(frameBox, referenceBox, targetHeight, maxWidth = Infinity, maxHeight = Infinity) {
    const baseScale = targetHeight / boxHeight(referenceBox);
    let width = boxWidth(frameBox) * baseScale;
    let height = boxHeight(frameBox) * baseScale;
    const limitScale = Math.min(
      1,
      Number.isFinite(maxWidth) ? maxWidth / Math.max(width, 1) : 1,
      Number.isFinite(maxHeight) ? maxHeight / Math.max(height, 1) : 1
    );
    width *= limitScale;
    height *= limitScale;
    return { width, height, scale: baseScale * limitScale };
  }
  function ensureCanvasContext(canvas) {
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.round(rect.width * dpr);
    const height = Math.round(rect.height * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    return { ctx, width: rect.width, height: rect.height };
  }
  function drawSpriteShadow(ctx, cx, cy, width, alpha = 0.16) {
    ctx.save();
    ctx.fillStyle = `rgba(15, 23, 42, ${alpha})`;
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.max(18, width * 0.34), Math.max(7, width * 0.08), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  function drawSpriteFrame(ctx, frameBox, dx, dy, dWidth, dHeight, options = {}) {
    const image = state.sprite.image;
    if (!image || !frameBox) return;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    if (options.shadowColor) {
      ctx.shadowColor = options.shadowColor;
      ctx.shadowBlur = options.shadowBlur || 18;
      ctx.shadowOffsetY = options.shadowOffsetY || 2;
    }
    ctx.drawImage(
      image,
      frameBox.x0,
      frameBox.y0,
      boxWidth(frameBox),
      boxHeight(frameBox),
      dx,
      dy,
      dWidth,
      dHeight
    );
    ctx.restore();
  }
  function touchMotionClock(slot, motionKey, timestamp, explicitStartAt = null) {
    const keyName = slot === 'play' ? 'playMotionKey' : 'resultMotionKey';
    const startedName = slot === 'play' ? 'playMotionStartedAt' : 'resultMotionStartedAt';
    const nextStartedAt = explicitStartAt ?? timestamp;
    if (state.sprite[keyName] !== motionKey) {
      state.sprite[keyName] = motionKey;
      state.sprite[startedName] = nextStartedAt;
    } else if (!state.sprite[startedName]) {
      state.sprite[startedName] = nextStartedAt;
    }
    return state.sprite[startedName];
  }
  function resolveMotionFrame(motionKey, elapsedMs) {
    const frames = getMotionFrames(motionKey);
    if (!frames.length) return null;
    const config = DASH_MOTION_CONFIG[motionKey] || DASH_MOTION_CONFIG.motion_walk;
    const index = config.loop
      ? Math.floor(Math.max(0, elapsedMs) / config.frameMs) % frames.length
      : Math.min(frames.length - 1, Math.floor(Math.max(0, elapsedMs) / config.frameMs));
    return frames[index];
  }
  function getPlaySpriteMotion() {
    if (!state.game) return '';
    if (state.ready.active || state.game.readyGate) return 'motion_walk';
    if (state.inputLock.active) return 'motion_fall';
    const combo = Number(state.game.stats.combo || 0);
    if (combo >= 150) return 'motion_dashfx';
    if (combo >= 80) return 'motion_sprint';
    if (combo >= 30) return 'motion_run';
    return 'motion_walk';
  }
  function getPlayTravelProgress() {
    if (!state.game || state.game.readyGate) return 0;
    const total = Math.max(1, Number(state.game.endAt) - Number(state.game.startAt));
    const current = state.game.localOnly ? Date.now() : now();
    return clamp01((current - Number(state.game.startAt)) / total);
  }
  function renderPlaySprite(timestamp) {
    const canvasState = ensureCanvasContext(els.playSpriteCanvas);
    if (!canvasState) return;
    if (!state.sprite.loaded || !state.game || state.phase !== 'playing') return;
    const motionKey = getPlaySpriteMotion();
    if (!motionKey) return;
    const explicitStartAt = motionKey === 'motion_fall' && state.inputLock.startedAt ? state.inputLock.startedAt : null;
    const motionStartedAt = touchMotionClock('play', motionKey, timestamp, explicitStartAt);
    const frameBox = resolveMotionFrame(motionKey, timestamp - motionStartedAt);
    if (!frameBox) return;
    const config = DASH_MOTION_CONFIG[motionKey] || DASH_MOTION_CONFIG.motion_walk;
    const referenceFrames = getMotionFrames(config.standingRef);
    const referenceBox = referenceFrames[0] || frameBox;
    const sizing = fitFrameToBox(frameBox, referenceBox, PLAY_SPRITE_TARGET_HEIGHT, canvasState.width * 0.32, canvasState.height * 0.5);
    const progress = getPlayTravelProgress();
    const paddingX = Math.max(18, canvasState.width * 0.024);
    const travelStart = paddingX;
    const travelEnd = canvasState.width - sizing.width - paddingX;
    const drawX = lerp(travelStart, travelEnd, progress);
    const drawY = canvasState.height - sizing.height - Math.max(6, canvasState.height * 0.018);
    state.sprite.playDrawRect = { x: drawX, y: drawY, width: sizing.width, height: sizing.height };
    drawSpriteShadow(canvasState.ctx, drawX + sizing.width * 0.54, drawY + sizing.height * 0.96, sizing.width, motionKey === 'motion_dashfx' ? 0.22 : 0.15);
    drawSpriteFrame(canvasState.ctx, frameBox, drawX, drawY, sizing.width, sizing.height, {
      shadowColor: motionKey === 'motion_dashfx' ? 'rgba(168, 85, 247, 0.28)' : 'rgba(15, 23, 42, 0.08)',
      shadowBlur: motionKey === 'motion_dashfx' ? 26 : 14
    });
  }
  function renderResultSprite(timestamp) {
    const canvasState = ensureCanvasContext(els.resultSpriteCanvas);
    if (!canvasState) return;
    if (!state.sprite.loaded || state.phase !== 'result') return;
    const motionKey = 'motion_run';
    const motionStartedAt = touchMotionClock('result', motionKey, timestamp);
    const frameBox = resolveMotionFrame(motionKey, timestamp - motionStartedAt);
    if (!frameBox) return;
    if (!state.sprite.resultSequenceStartedAt) state.sprite.resultSequenceStartedAt = timestamp;
    const introProgress = easeOutCubic((timestamp - state.sprite.resultSequenceStartedAt) / 1600);
    const referenceBox = getMotionFrames('motion_run')[0] || frameBox;
    const leftAreaWidth = canvasState.width * 0.5;
    const maxHeightByWidth = leftAreaWidth / (boxWidth(frameBox) / boxHeight(frameBox));
    const targetHeight = Math.min(canvasState.height * 0.94, maxHeightByWidth);
    const startHeight = Math.min(120, targetHeight * 0.36);
    const currentHeight = lerp(startHeight, targetHeight, introProgress);
    const sizing = fitFrameToBox(frameBox, referenceBox, currentHeight, leftAreaWidth * 0.98, canvasState.height * 0.9);
    const drawX = lerp(8, 14, introProgress * 0.4) - 15;
    const drawY = canvasState.height - sizing.height + 20;
    state.sprite.resultDrawRect = { x: drawX, y: drawY, width: sizing.width, height: sizing.height };
    drawSpriteShadow(canvasState.ctx, drawX + sizing.width * 0.48, drawY + sizing.height * 0.98, sizing.width * 1.1, 0.18);
    drawSpriteFrame(canvasState.ctx, frameBox, drawX, drawY, sizing.width, sizing.height, {
      shadowColor: 'rgba(56, 189, 248, 0.22)',
      shadowBlur: 22
    });
  }
  function renderDashSprites(timestamp) {
    renderPlaySprite(timestamp);
    renderResultSprite(timestamp);
    state.sprite.rafId = requestAnimationFrame(renderDashSprites);
  }
  function startDashSpriteLoop() {
    if (state.sprite.rafId) cancelAnimationFrame(state.sprite.rafId);
    state.sprite.rafId = requestAnimationFrame(renderDashSprites);
  }
  function readRomajiPrefs() {
    try {
      return JSON.parse(localStorage.getItem(ROMAJI_PREF_STORAGE_KEY) || '{}');
    } catch {
      return {};
    }
  }
  function saveRomajiPrefs() {
    try {
      localStorage.setItem(ROMAJI_PREF_STORAGE_KEY, JSON.stringify(state.romajiPrefs));
    } catch {}
  }
  function rememberTokenPreference(token, option) {
    if (!token || !option) return;
    state.romajiPrefs[token] = option;
    saveRomajiPrefs();
  }
  function getHomeFingerPosition(finger) {
    const homeKey = finger ? FINGER_HOME_KEYS[finger] : '';
    if (!homeKey || !keyLayoutMap.has(homeKey)) return null;
    const homeRect = keyLayoutMap.get(homeKey);
    if (homeKey === ' ') {
      return {
        x: homeRect.x + homeRect.w / 2,
        y: homeRect.y + homeRect.h * 0.64
      };
    }
    return {
      x: homeRect.x + homeRect.w / 2,
      y: homeRect.y + homeRect.h * 0.5
    };
  }
  function positionFingerDots() {
    els.fingerDots.forEach((dot) => {
      const pos = getHomeFingerPosition(dot.dataset.finger);
      if (!pos) return;
      dot.style.left = `${(pos.x / 1200) * 100}%`;
      dot.style.top = `${(pos.y / 520) * 100}%`;
    });
    renderLayoutDebug();
  }
  function getRectCenter(rect) {
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  }
  function toStagePoint(point, stageRect) {
    return {
      x: ((point.x - stageRect.left) / stageRect.width) * 1200,
      y: ((point.y - stageRect.top) / stageRect.height) * 520
    };
  }
  function renderLayoutDebug() {
    if (!DEBUG_LAYOUT || !els.layoutDebugLayer || !els.layoutDebugPanel || !els.handsOverlay) return;
    const stageRect = els.handsOverlay.getBoundingClientRect();
    if (!stageRect.width || !stageRect.height) return;
    const entries = Object.entries(FINGER_HOME_KEYS).map(([finger, key]) => {
      const keyNode = keyElements.get(key);
      const handNode = handAnchorElements.get(finger);
      if (!keyNode || !handNode) return null;
      const keyCenterPx = getRectCenter(keyNode.getBoundingClientRect());
      const handCenterPx = getRectCenter(handNode.getBoundingClientRect());
      return {
        finger,
        key,
        keyCenterPx,
        handCenterPx,
        keyStage: toStagePoint(keyCenterPx, stageRect),
        handStage: toStagePoint(handCenterPx, stageRect)
      };
    }).filter(Boolean);
    els.layoutDebugLayer.innerHTML = entries.map((entry) => {
      const dx = entry.handCenterPx.x - entry.keyCenterPx.x;
      const dy = entry.handCenterPx.y - entry.keyCenterPx.y;
      return `
        <circle cx="${entry.keyStage.x}" cy="${entry.keyStage.y}" r="7" fill="rgba(34,197,94,0.18)" stroke="#16a34a" stroke-width="2.5"></circle>
        <circle cx="${entry.handStage.x}" cy="${entry.handStage.y}" r="5" fill="rgba(239,68,68,0.18)" stroke="#dc2626" stroke-width="2"></circle>
        <line x1="${entry.keyStage.x}" y1="${entry.keyStage.y}" x2="${entry.handStage.x}" y2="${entry.handStage.y}" stroke="rgba(59,130,246,0.78)" stroke-width="2.5" stroke-dasharray="5 4"></line>
        <text x="${entry.keyStage.x + 10}" y="${entry.keyStage.y - 10}" fill="#16a34a" font-size="16" font-weight="800">${entry.key.toUpperCase()}</text>
        <text x="${entry.handStage.x + 8}" y="${entry.handStage.y + 18}" fill="#dc2626" font-size="14" font-weight="800">${entry.finger}</text>
        <text x="${entry.keyStage.x + 12}" y="${entry.keyStage.y + 16}" fill="#2563eb" font-size="12" font-weight="700">dx ${dx.toFixed(1)} / dy ${dy.toFixed(1)}</text>
      `;
    }).join('');
    els.layoutDebugPanel.textContent = entries.map((entry) => {
      const dx = entry.handCenterPx.x - entry.keyCenterPx.x;
      const dy = entry.handCenterPx.y - entry.keyCenterPx.y;
      return `${entry.finger} ${entry.key.toUpperCase()}  keyPx(${entry.keyCenterPx.x.toFixed(1)},${entry.keyCenterPx.y.toFixed(1)})  handPx(${entry.handCenterPx.x.toFixed(1)},${entry.handCenterPx.y.toFixed(1)})  d(${dx.toFixed(1)},${dy.toFixed(1)})`;
    }).join('\n');
  }
  function restartBodyAnimation(className, durationMs) {
    document.body.classList.remove(className);
    void document.body.offsetWidth;
    document.body.classList.add(className);
    if (state.inputLock.shakeTimer) clearTimeout(state.inputLock.shakeTimer);
    state.inputLock.shakeTimer = setTimeout(() => {
      document.body.classList.remove(className);
      state.inputLock.shakeTimer = null;
    }, durationMs);
  }
  function updateIdentity() {
    els.currentClassChip.textContent = state.player.classId || '-';
    els.currentPlayerChip.textContent = state.player.playerName || '-';
    els.waitingClass.textContent = state.player.classId || '-';
    els.playerNameInput.value = state.player.playerName || '';
    els.classIdInput.value = state.player.classId || '';
    if (els.outsideAuthPasswordTarget) {
      const name = state.outsideAuth.pendingIdentity && state.outsideAuth.pendingIdentity.playerName
        ? state.outsideAuth.pendingIdentity.playerName
        : (state.player.playerName || '');
      const classId = state.outsideAuth.pendingIdentity && state.outsideAuth.pendingIdentity.classId
        ? state.outsideAuth.pendingIdentity.classId
        : (state.player.classId || '');
      els.outsideAuthPasswordTarget.textContent = name ? `${classId || '-'} ${name}` : '';
    }
    els.modeChip.textContent = modeLabel();
    refreshConnectionBadge();
    syncReadyLogoutButton();
    if (state.ready.active) {
      refreshReadyOutsidePasswordPanel();
    }
  }
  function stopLocalChatSimulation() {
    if (state.chat.botTimer) {
      clearTimeout(state.chat.botTimer);
      state.chat.botTimer = null;
    }
    if (Array.isArray(state.chat.timelineTimers) && state.chat.timelineTimers.length) {
      state.chat.timelineTimers.forEach((timerId) => clearTimeout(timerId));
      state.chat.timelineTimers = [];
    }
    state.chat.scheduleKey = '';
  }
  function shouldRunLocalChatSimulation() {
    return Boolean(
      state.phase === 'playing'
      && state.game
      && state.game.localOnly
      && !state.serverAvailable
      && !state.ready.active
      && !state.game.readyGate
    );
  }
  function formatChatMessageText(message) {
    return escapeHtml(message.text || '');
  }
  function renderChatMessages() {
    if (!els.chatList) return;
    els.chatList.innerHTML = state.chat.messages.map((message) => {
      const classes = [
        'chat-message',
        message.side === 'self' ? 'chat-message--self' : 'chat-message--other',
        message.kind ? `chat-message--${message.kind}` : ''
      ].filter(Boolean).join(' ');
      return `
        <div class="${classes}">
          <div class="chat-name">${escapeHtml(message.name || '')}</div>
          <div class="chat-bubble">${formatChatMessageText(message)}</div>
        </div>
      `;
    }).join('');
    els.chatList.scrollTop = els.chatList.scrollHeight;
  }
  function clearChatMessages() {
    state.chat.messages = [];
    state.chat.nextId = 1;
    renderChatMessages();
  }
  function addChatMessage({ name, text, side = 'other', kind = 'info' }) {
    state.chat.messages.push({
      id: state.chat.nextId++,
      name,
      text,
      side,
      kind
    });
    if (state.chat.messages.length > 40) {
      state.chat.messages = state.chat.messages.slice(-40);
    }
    renderChatMessages();
  }
  function recordLocalTimelineEvent(entry) {
    if (!state.game || !state.game.localOnly || !entry || typeof entry !== 'object') return;
    if (!Array.isArray(state.game.eventTimeline)) state.game.eventTimeline = [];
    state.game.eventTimeline.push({
      ...entry,
      atMs: Math.max(0, Math.round(Date.now() - Number(state.game.startAt || Date.now())))
    });
    if (state.game.eventTimeline.length > 24) {
      state.game.eventTimeline = state.game.eventTimeline.slice(-24);
    }
  }
  function emitServerChatEvent(eventType, payload = {}) {
    if (!state.game || state.game.localOnly || !state.serverAvailable) return;
    send({
      t: 'feed_event',
      gameId: state.game.gameId,
      event: eventType,
      ...payload
    });
  }
  function getSelfChatName() {
    return state.player.playerName || 'あなた';
  }
  function emitStageAchievementMessage(comboThreshold, side = 'self', name = getSelfChatName(), fromServer = false) {
    addChatMessage({
      name,
      side,
      kind: comboThreshold >= 300 ? 'achievement-max' : 'achievement',
      text: `コンボ数[${comboThreshold}]を達成♪`
    });
    if (!fromServer && side === 'self') {
      if (state.game && state.game.localOnly) {
        recordLocalTimelineEvent({ event: 'achievement', comboThreshold });
      }
      emitServerChatEvent('achievement', { comboThreshold });
    }
  }
  function emitHighComboMilestones(maxCombo) {
    if (!state.game) return;
    const targetMax = Math.floor(Number(maxCombo || 0));
    if (!Number.isFinite(targetMax) || targetMax < HIGH_COMBO_ANNOUNCE_START) return;
    let nextThreshold = Math.floor(Number(state.game.nextHighComboAnnouncement || HIGH_COMBO_ANNOUNCE_START));
    if (!Number.isFinite(nextThreshold) || nextThreshold < HIGH_COMBO_ANNOUNCE_START) {
      nextThreshold = HIGH_COMBO_ANNOUNCE_START;
    }
    while (nextThreshold <= targetMax) {
      emitStageAchievementMessage(nextThreshold);
      nextThreshold += HIGH_COMBO_ANNOUNCE_STEP;
    }
    state.game.nextHighComboAnnouncement = nextThreshold;
  }
  function emitCriticalMissMessage(comboAtMiss, side = 'self', name = getSelfChatName(), fromServer = false) {
    addChatMessage({
      name,
      side,
      kind: 'critical-miss',
      text: `コンボ数[${comboAtMiss}]で痛恨のミス！！！`
    });
    if (!fromServer && side === 'self') {
      if (state.game && state.game.localOnly) {
        recordLocalTimelineEvent({ event: 'critical_miss', comboAtMiss });
      }
      emitServerChatEvent('critical_miss', { comboAtMiss });
    }
  }
  function scheduleOfflineSnapshotChat(snapshot) {
    const offlinePlayerIdentity = getOfflinePlayerId();
    const bestRecords = Array.isArray(snapshot && snapshot.items)
      ? snapshot.items.filter((record) => getSnapshotRecordIdentity(record) !== offlinePlayerIdentity)
      : [];
    if (!bestRecords.length || !state.game) {
      scheduleNextLocalChatMessage();
      return;
    }
    const durationMs = Math.max(15_000, Number(state.config.gameDurationSec || 300) * 1000);
    const replayEvents = bestRecords.flatMap((record) => {
      const sourceDurationMs = Math.max(1000, Number(record.durationSec || state.config.gameDurationSec || 300) * 1000);
      const timeline = Array.isArray(record.eventTimeline) ? record.eventTimeline : [];
      return timeline.map((entry) => ({
        ...entry,
        playerName: getDisplayNameFromSnapshotRecord(record, 'クラスメイト'),
        offsetMs: Math.round(1200 + Math.min(1, Math.max(0, Number(entry.atMs || 0) / sourceDurationMs)) * Math.max(durationMs - 2600, 800))
      }));
    }).sort((a, b) => Number(a.offsetMs || 0) - Number(b.offsetMs || 0));
    const scheduleSpreadsheetReplayUntilEnd = (entries, emitEntry) => {
      const queue = Array.isArray(entries)
        ? entries
          .map((entry) => ({
            ...entry,
            offsetMs: Math.max(200, Math.round(Number(entry && entry.offsetMs || 0)))
          }))
          .sort((a, b) => Number(a.offsetMs || 0) - Number(b.offsetMs || 0))
        : [];
      if (!queue.length || !state.game) return false;
      const endAt = Number(state.game.endAt || 0);
      const nowMs = Date.now();
      if (!Number.isFinite(endAt) || endAt <= nowMs + 300) return false;
      const cycleSpanMs = Math.max(
        3000,
        queue.reduce((max, entry) => Math.max(max, Number(entry.offsetMs || 0)), 0) + 1200
      );
      let cycleStartMs = nowMs;
      let cursor = 0;
      const scheduleNext = () => {
        if (!shouldRunLocalChatSimulation()) return;
        const now = Date.now();
        if (now >= endAt - 120) return;
        while (true) {
          if (cursor >= queue.length) {
            cursor = 0;
            cycleStartMs += cycleSpanMs;
          }
          const entry = queue[cursor];
          const dueAtMs = cycleStartMs + Number(entry.offsetMs || 0);
          if (dueAtMs >= endAt - 120) {
            return;
          }
          if (dueAtMs <= now + 8) {
            cursor += 1;
            continue;
          }
          const scheduledIndex = cursor;
          const timerId = setTimeout(() => {
            if (!shouldRunLocalChatSimulation()) return;
            emitEntry(queue[scheduledIndex]);
            cursor = scheduledIndex + 1;
            scheduleNext();
          }, Math.max(16, dueAtMs - Date.now()));
          state.chat.timelineTimers = [timerId];
          return;
        }
      };
      scheduleNext();
      return true;
    };
    if (replayEvents.length) {
      scheduleSpreadsheetReplayUntilEnd(replayEvents, (entry) => {
        if (entry.event === 'achievement') {
          emitStageAchievementMessage(Number(entry.comboThreshold || 0), 'other', entry.playerName, true);
          return;
        }
        if (entry.event === 'critical_miss') {
          emitCriticalMissMessage(Number(entry.comboAtMiss || 0), 'other', entry.playerName, true);
        }
      });
      return;
    }
    const sorted = bestRecords
      .slice()
      .sort((a, b) => (Date.parse(String(a.timestamp || '')) || 0) - (Date.parse(String(b.timestamp || '')) || 0));
    const firstTs = Date.parse(String(sorted[0].timestamp || '')) || 0;
    const lastTs = Date.parse(String(sorted[sorted.length - 1].timestamp || '')) || firstTs;
    const span = Math.max(1, lastTs - firstTs);
    const scoreReplayQueue = sorted.map((record, index) => {
      const ts = Date.parse(String(record.timestamp || '')) || firstTs;
      const progress = sorted.length === 1
        ? 0.45
        : Math.max(index / Math.max(sorted.length - 1, 1), (ts - firstTs) / span);
      const offsetMs = Math.round(1200 + progress * Math.max(durationMs - 2600, 800));
      return { record, offsetMs };
    });
    scheduleSpreadsheetReplayUntilEnd(scoreReplayQueue, ({ record }) => {
      if (!shouldRunLocalChatSimulation()) return;
      addChatMessage({
        name: getDisplayNameFromSnapshotRecord(record, 'クラスメイト'),
        side: 'other',
        kind: 'info',
        text: `最近スコア ${Number(record.score || 0).toLocaleString('ja-JP')}`
      });
    });
  }
  function scheduleNextLocalChatMessage() {
    stopLocalChatSimulation();
    if (!shouldRunLocalChatSimulation()) return;
    const delayMs = 1400 + Math.random() * 3600;
    state.chat.botTimer = setTimeout(() => {
      state.chat.botTimer = null;
      if (!shouldRunLocalChatSimulation()) return;
      const name = LOCAL_CHAT_TEST_USERS[Math.floor(Math.random() * LOCAL_CHAT_TEST_USERS.length)];
      const isAchievement = Math.random() < 0.7;
      if (isAchievement) {
        const threshold = STAGE_COMBO_THRESHOLDS[Math.floor(Math.random() * STAGE_COMBO_THRESHOLDS.length)];
        emitStageAchievementMessage(threshold, 'other', name);
      } else {
        const comboAtMiss = 30 + Math.floor(Math.random() * 271);
        emitCriticalMissMessage(comboAtMiss, 'other', name);
      }
      scheduleNextLocalChatMessage();
    }, delayMs);
  }
  function refreshLocalChatSimulation() {
    if (!shouldRunLocalChatSimulation()) {
      stopLocalChatSimulation();
      return;
    }
    const sourceToken = state.offline.snapshot && Array.isArray(state.offline.snapshot.items) && state.offline.snapshot.items.length
      ? `snapshot:${Number(state.offline.snapshot.updatedAt || 0)}`
      : 'fallback';
    const scheduleKey = `${state.game ? state.game.gameId : 'none'}:${state.player.classId}:${getOfflineStartMode()}:${sourceToken}`;
    if (state.chat.scheduleKey === scheduleKey) return;
    stopLocalChatSimulation();
    state.chat.scheduleKey = scheduleKey;
    if (state.offline.snapshot && Array.isArray(state.offline.snapshot.items) && state.offline.snapshot.items.length) {
      scheduleOfflineSnapshotChat(state.offline.snapshot);
      return;
    }
    scheduleNextLocalChatMessage();
    state.chat.scheduleKey = scheduleKey;
  }
  function setPhase(next) {
    state.phase = next;
    document.body.dataset.phase = next;
    els.joinPanel.classList.toggle('hidden', next !== 'join');
    els.waitingPanel.classList.toggle('hidden', !(next === 'waiting' || next === 'countdown'));
    els.outsideAuthPanel.classList.toggle('hidden', next !== 'auth');
    els.gamePanel.classList.toggle('hidden', next !== 'playing');
    els.keyboardPanel.classList.toggle('hidden', next !== 'playing');
    els.chatPanel.classList.toggle('hidden', next !== 'playing');
    els.resultPanel.classList.toggle('hidden', next !== 'result');
    Array.from(els.phaseStrip.querySelectorAll('.phase-chip')).forEach((chip) => {
      const active = chip.dataset.phase === next
        || (next === 'countdown' && chip.dataset.phase === 'waiting')
        || (next === 'auth' && chip.dataset.phase === 'join');
      chip.classList.toggle('active', active);
    });
    refreshLocalChatSimulation();
    syncResultActions();
  }
  function formatRemaining(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }
  function calcScore(stats) {
    const attempts = stats.correctCount + stats.missCount;
    const accuracyRate = attempts > 0 ? stats.correctCount / attempts : 0;
    const completedStageCounts = stats && typeof stats.completedStageCounts === 'object' ? stats.completedStageCounts : {};
    const completedBonus =
      Number(completedStageCounts.alphabetSingle || 0) * 2 +
      Number(completedStageCounts.alphabetTriple || 0) * 4 +
      Number(completedStageCounts.englishWord || 0) * 6 +
      Number(completedStageCounts.japaneseWord || 0) * 8 +
      Number(completedStageCounts.japaneseSentence || 0) * 12;
    const raw = stats.correctCount * 10 + completedBonus + stats.maxCombo * 10 - stats.missCount * 15;
    return { score: Math.max(0, Math.round(raw * accuracyRate)), accuracy: Number((accuracyRate * 100).toFixed(2)) };
  }
  function getScoreRankLetter(score) {
    const normalized = Number(score || 0);
    if (normalized >= 17000) return '神';
    if (normalized >= 12000) return 'S';
    if (normalized >= 8000) return 'A';
    if (normalized >= 5000) return 'B';
    if (normalized >= 3000) return 'C';
    return 'D';
  }
  function getUnlockedPromptStage(maxCombo) {
    return window.PromptCatalog && typeof window.PromptCatalog.getStageByCombo === 'function'
      ? window.PromptCatalog.getStageByCombo(maxCombo)
      : 0;
  }
  function pickPromptForGame(stage, promptIndex, seed) {
    if (!window.PromptCatalog || typeof window.PromptCatalog.pickPrompt !== 'function') {
      return { id: `fallback_${promptIndex}`, text: 'A', reading: 'a', category: 'fallback', stage: 0, stageLabel: 'alphabet_single' };
    }
    return normalizePromptForGame(window.PromptCatalog.pickPrompt({ stage, index: promptIndex, seed }), stage);
  }
  function createTrackedStageMetrics() {
    return {
      activeKey: '',
      activeStartedAt: 0,
      englishWord: { entered: false, activeMs: 0, inputCount: 0, charCount: 0 },
      japaneseText: { entered: false, activeMs: 0, inputCount: 0, charCount: 0 }
    };
  }
  function createCompletedStageCounts() {
    return {
      alphabetSingle: 0,
      alphabetTriple: 0,
      englishWord: 0,
      japaneseWord: 0,
      japaneseSentence: 0
    };
  }
  function normalizeCompletedStageCounts(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const base = createCompletedStageCounts();
    Object.keys(base).forEach((key) => {
      base[key] = Math.max(0, Math.round(Number(source[key] || 0)));
    });
    return base;
  }
  function getCompletedStageCountKey(prompt = getCurrentPrompt()) {
    const stageLabel = String(prompt && prompt.stageLabel || '');
    if (stageLabel === 'alphabet_single') return 'alphabetSingle';
    if (stageLabel === 'alphabet_triple') return 'alphabetTriple';
    if (stageLabel === 'english_word') return 'englishWord';
    if (stageLabel === 'japanese_word') return 'japaneseWord';
    if (stageLabel === 'japanese_sentence') return 'japaneseSentence';
    return '';
  }
  function normalizeTrackedStageMetrics(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const base = createTrackedStageMetrics();
    const normalizeBucket = (bucket = {}) => ({
      entered: Boolean(bucket.entered),
      activeMs: Math.max(0, Math.round(Number(bucket.activeMs || 0))),
      inputCount: Math.max(0, Math.round(Number(bucket.inputCount || 0))),
      charCount: Math.max(0, Math.round(Number(bucket.charCount || 0)))
    });
    return {
      activeKey: String(source.activeKey || base.activeKey || ''),
      activeStartedAt: Math.max(0, Math.round(Number(source.activeStartedAt || 0))),
      englishWord: normalizeBucket(source.englishWord),
      japaneseText: normalizeBucket(source.japaneseText || source.japaneseSentence)
    };
  }
  function getTrackedStageMetricKey(prompt = getCurrentPrompt()) {
    const stageLabel = String(prompt && prompt.stageLabel || '');
    if (stageLabel === 'english_word') return 'englishWord';
    if (stageLabel === 'japanese_word' || stageLabel === 'japanese_sentence') return 'japaneseText';
    return '';
  }
  function getTrackedStageClockMs() {
    if (!state.game) return Date.now();
    const current = state.game.localOnly ? Date.now() : now();
    return Math.max(Number(state.game.startAt || current), current);
  }
  function ensureTrackedStageMetrics() {
    if (!state.game) return createTrackedStageMetrics();
    state.game.stats.stageMetrics = normalizeTrackedStageMetrics(state.game.stats.stageMetrics);
    return state.game.stats.stageMetrics;
  }
  function syncTrackedStageMetrics(nowMs = getTrackedStageClockMs()) {
    if (!state.game || state.game.readyGate) return;
    const metrics = ensureTrackedStageMetrics();
    const safeNow = Math.max(0, Math.round(nowMs));
    const nextKey = getTrackedStageMetricKey();
    if (metrics.activeKey && metrics.activeKey !== nextKey && metrics.activeStartedAt) {
      metrics[metrics.activeKey].activeMs += Math.max(0, safeNow - metrics.activeStartedAt);
    }
    if (metrics.activeKey !== nextKey) {
      metrics.activeKey = nextKey;
      metrics.activeStartedAt = nextKey ? safeNow : 0;
      if (nextKey) metrics[nextKey].entered = true;
      return;
    }
    if (nextKey && !metrics.activeStartedAt) {
      metrics.activeStartedAt = safeNow;
      metrics[nextKey].entered = true;
    }
  }
  function flushTrackedStageMetrics(nowMs = getTrackedStageClockMs()) {
    if (!state.game || state.game.readyGate) return;
    const metrics = ensureTrackedStageMetrics();
    const safeNow = Math.max(0, Math.round(nowMs));
    if (metrics.activeKey && metrics.activeStartedAt) {
      metrics[metrics.activeKey].activeMs += Math.max(0, safeNow - metrics.activeStartedAt);
      metrics.activeStartedAt = safeNow;
    }
  }
  function buildResultSpeedMetrics() {
    if (!state.game) return [];
    const metrics = normalizeTrackedStageMetrics(state.game.stats.stageMetrics);
    const rows = [];
    const reachedJapaneseWordStage = Number(state.game && state.game.unlockedStage || 0) >= 3;
    if (metrics.englishWord.entered && (metrics.englishWord.activeMs >= RESULT_SPEED_METRIC_DEFS.englishWord.minDurationMs || reachedJapaneseWordStage)) {
      const kpm = Math.round(metrics.englishWord.inputCount * 60000 / Math.max(metrics.englishWord.activeMs, 1));
      rows.push({ key: 'kpm', value: kpm, text: `${RESULT_SPEED_METRIC_DEFS.englishWord.label} ${kpm} ${RESULT_SPEED_METRIC_DEFS.englishWord.unit}` });
    }
    if (metrics.japaneseText.entered && metrics.japaneseText.activeMs >= RESULT_SPEED_METRIC_DEFS.japaneseText.minDurationMs) {
      const wpm = Math.round(metrics.japaneseText.charCount * 60000 / Math.max(metrics.japaneseText.activeMs, 1));
      rows.push({ key: 'wpm', value: wpm, text: `${RESULT_SPEED_METRIC_DEFS.japaneseText.label} ${wpm} ${RESULT_SPEED_METRIC_DEFS.japaneseText.unit}` });
    }
    return rows;
  }
  function buildResultSpeedMetricValues() {
    const rows = buildResultSpeedMetrics();
    return {
      kpm: Number((rows.find((row) => row.key === 'kpm') || {}).value || 0),
      wpm: Number((rows.find((row) => row.key === 'wpm') || {}).value || 0)
    };
  }
  function updateResultSpeedMetrics() {
    if (!els.resultSpeedGroup || !els.resultKpmValue || !els.resultWpmValue) return;
    const rows = buildResultSpeedMetrics();
    const yPositions = rows.length >= 2 ? [628, 658] : [644, 658];
    els.resultKpmValue.textContent = rows[0] ? rows[0].text : '';
    els.resultWpmValue.textContent = rows[1] ? rows[1].text : '';
    els.resultKpmValue.setAttribute('y', String(yPositions[0]));
    els.resultWpmValue.setAttribute('y', String(yPositions[1]));
    els.resultSpeedGroup.classList.toggle('hidden', rows.length === 0);
    els.resultSpeedGroup.dataset.rows = String(rows.length);
  }
  function updateComboDisplay() {
    const combo = state.game ? Number(state.game.stats.combo || 0) : 0;
    els.comboValue.textContent = String(combo);
    els.comboCard.dataset.tier = String(state.game ? Number(state.game.unlockedStage || 0) : 0);
    els.comboCard.dataset.lock = state.inputLock.active ? 'true' : 'false';
  }
  function spawnComboBurst(kind) {
    const layer = els.comboEffectLayer;
    const card = els.comboCard;
    if (!layer || !card) return;
    const layerRect = layer.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const count = kind === 'saved' ? 18 : 14;
    for (let index = 0; index < count; index += 1) {
      const particle = document.createElement('span');
      particle.className = `combo-particle combo-particle--${kind}`;
      particle.style.left = `${cardRect.left - layerRect.left + 20 + Math.random() * Math.max(cardRect.width - 40, 24)}px`;
      particle.style.top = `${cardRect.top - layerRect.top + 16 + Math.random() * Math.max(cardRect.height - 32, 24)}px`;
      particle.style.setProperty('--dx', `${(Math.random() - 0.5) * 84}px`);
      particle.style.setProperty('--dy', `${-18 - Math.random() * 48}px`);
      particle.style.setProperty('--rot', `${(Math.random() - 0.5) * 420}deg`);
      particle.style.setProperty('--size', `${3 + Math.random() * 5}px`);
      layer.appendChild(particle);
      particle.addEventListener('animationend', () => particle.remove(), { once: true });
    }
  }
  function triggerComboFeedback(kind) {
    if (!kind) return;
    if (flashTimers.comboFeedback) {
      clearTimeout(flashTimers.comboFeedback);
      flashTimers.comboFeedback = null;
    }
    els.comboCard.dataset.feedback = kind;
    spawnComboBurst(kind);
    flashTimers.comboFeedback = setTimeout(() => {
      els.comboCard.dataset.feedback = 'idle';
      flashTimers.comboFeedback = null;
    }, 900);
  }
  function updateTimeDisplay(remainingMs) {
    els.remainingTime.textContent = formatRemaining(remainingMs);
    let level = 'normal';
    if (remainingMs <= 10_000) level = 'danger';
    else if (remainingMs <= 60_000) level = 'warning';
    els.timeCard.dataset.level = level;
  }
  function primeOfflineReadyData(force = false) {
    if (!canUseClientGas()) {
      if (state.ready.active && state.ready.mode === 'ready-loading') {
        setReadyOverlay(true, 'READY', 'スペースキーを押したらスタートします', 'ready');
      }
      return;
    }
    ensureOfflineClassSnapshot({ force }).then(() => {
      refreshLocalChatSimulation();
      if (state.ready.active && state.ready.mode === 'ready-loading') {
        setReadyOverlay(true, 'READY', 'スペースキーを押したらスタートします', 'ready');
        setNotice(isLocalTestMode() ? 'ローカルテストモードです。記録は更新しません。' : 'ソロプレイモードです。スペースキーで開始できます。');
      }
    }).catch(() => {
      if (state.ready.active && state.ready.mode === 'ready-loading') {
        setReadyOverlay(true, 'READY', 'スペースキーを押したらスタートします', 'ready');
        setNotice(isLocalTestMode()
          ? 'ローカルテストモードです。記録取得に失敗しましたが開始できます。'
          : 'ソロプレイモードです。記録取得に失敗しましたが開始できます。');
      }
    });
  }
  function setOutsideAuthHint(node, text) {
    if (!node) return;
    node.textContent = String(text || '');
  }
  function showOutsideAuthStep(step, hintText = '') {
    const isStoredStep = step === 'stored';
    const isPasswordStep = step === 'password';
    const isIdStep = !isStoredStep && !isPasswordStep;
    els.outsideAuthStoredStep.classList.toggle('hidden', !isStoredStep);
    els.outsideAuthIdStep.classList.toggle('hidden', !isIdStep);
    els.outsideAuthPasswordStep.classList.toggle('hidden', !isPasswordStep);
    if (isStoredStep) {
      setOutsideAuthHint(
        els.outsideAuthStoredHint,
        hintText || 'この端末に保存されたセッションがあります。'
      );
      if (els.outsideAuthStoredStartBtn) {
        els.outsideAuthStoredStartBtn.focus();
      }
      return;
    }
    if (isPasswordStep) {
      if (els.outsideAuthPasswordInput) {
        els.outsideAuthPasswordInput.value = '';
        els.outsideAuthPasswordInput.focus();
      }
      setOutsideAuthHint(els.outsideAuthPasswordHint, hintText || '');
    } else {
      setOutsideAuthHint(els.outsideAuthIdHint, hintText || 'IDを入力してください。');
      if (els.outsideAuthUidInput) {
        els.outsideAuthUidInput.focus();
      }
    }
  }
  async function resumeStoredOutsideSession(options = {}) {
    const auto = Boolean(options && options.auto);
    const activeRequestOptions = auto ? { allowReady: true } : {};
    const stored = readOutsideSession();
    if (!stored || !stored.uid || !stored.sessionId) {
      clearOutsideAuthSession();
      resetOutsideAuthState();
      setStoredOutsideSessionDisplay(null);
      if (auto) {
        showOutsideAuthGate('校外オンラインです。IDとパスワードでログインしてください。');
      } else {
        showOutsideAuthStep('id', '保存済みセッションが見つかりません。IDを入力してください。');
      }
      return false;
    }
    const token = invalidateOutsideAuthRequests();
    state.outsideAuth.resumingStoredSession = true;
    if (!auto) {
      setOutsideAuthHint(els.outsideAuthStoredHint, '保存済みセッションを確認しています。');
    }
    try {
      const identity = await resolveIdentityByUid(stored.uid, { strict: true });
      if (!isOutsideAuthRequestActive(token, activeRequestOptions)) {
        return false;
      }
      if (!identity) {
        clearOutsideAuthSession();
        resetOutsideAuthState();
        setStoredOutsideSessionDisplay(null);
        if (auto) {
          showOutsideAuthGate('保存済みIDを確認できませんでした。IDとパスワードでログインしてください。');
        } else {
          showOutsideAuthStep('id', '保存済みIDを確認できませんでした。IDを入力してください。');
        }
        return false;
      }
      const validation = await validateAuthSessionOnGas(stored.uid, stored.sessionId);
      if (!isOutsideAuthRequestActive(token, activeRequestOptions)) {
        return false;
      }
      if (!validation || validation.ok !== true || validation.valid !== true) {
        clearOutsideAuthSession();
        resetOutsideAuthState();
        setStoredOutsideSessionDisplay(null);
        if (auto) {
          showOutsideAuthGate('保存済みセッションが無効です。IDとパスワードでログインしてください。');
        } else {
          showOutsideAuthStep('id', '保存済みセッションが無効です。IDとパスワードでログインしてください。');
        }
        return false;
      }
      state.player = identity;
      savePlayer();
      applyOutsideAuthSession(stored.uid, String(validation.sessionId || stored.sessionId));
      state.outsideAuth.resumingStoredSession = false;
      resetOutsideAuthState();
      updateIdentity();
      setNotice(auto ? '保存済みセッションを確認しました。スペースキーで開始できます。' : '保存済みセッションを読み込みました。READY へ進みます。');
      showReadyLanding('ready');
      return true;
    } catch {
      if (!isOutsideAuthRequestActive(token, activeRequestOptions)) {
        return false;
      }
      state.outsideAuth.resumingStoredSession = false;
      if (auto) {
        showOutsideAuthGate('保存済みセッションの確認に失敗しました。IDとパスワードでログインしてください。');
      } else {
        setOutsideAuthHint(els.outsideAuthStoredHint, 'セッション確認に失敗しました。再度お試しください。');
      }
      return false;
    }
  }
  function startAutoResumeOutsideSession(entryHint = '') {
    const stored = readOutsideSession();
    if (!stored || !stored.uid || !stored.sessionId) {
      showOutsideAuthGate(entryHint || '校外オンラインです。IDとパスワードでログインしてください。');
      return false;
    }
    if (state.outsideAuth.resumingStoredSession) {
      setReadyOverlay(true, 'READY', '保存済みセッションを確認しています', 'connecting');
      setNotice('保存済みセッションを確認しています。');
      return true;
    }
    state.outsideAuth.active = true;
    state.outsideAuth.loggedIn = false;
    state.outsideAuth.uid = '';
    state.outsideAuth.sessionId = '';
    state.outsideAuth.resumingStoredSession = true;
    updateIdentity();
    stopTick();
    stopLocalChatSimulation();
    state.game = null;
    state.classState = null;
    state.sprite.playDrawRect = null;
    clearPromptFlash();
    clearChatMessages();
    setPhase('playing');
    applyDurationOverride();
    updateTimeDisplay(state.config.gameDurationSec * 1000);
    updateGuide();
    els.offlineStartBtn.classList.add('hidden');
    setReadyOverlay(true, 'READY', '保存済みセッションを確認しています', 'connecting');
    setNotice('保存済みセッションを確認しています。');
    resumeStoredOutsideSession({ auto: true });
    return true;
  }
  async function showOutsideAuthGate(entryHint = '') {
    invalidateOutsideAuthRequests();
    state.outsideAuth.active = true;
    state.outsideAuth.loggedIn = false;
    state.outsideAuth.resumingStoredSession = false;
    state.outsideAuth.uid = '';
    state.outsideAuth.sessionId = '';
    updateIdentity();
    setReadyOverlay(false);
    setPhase('auth');
    els.offlineStartBtn.classList.add('hidden');
    resetOutsideAuthState();
    resetOutsideAuthUi();
    setStoredOutsideSessionDisplay(null);
    setNotice(entryHint || '校外オンラインです。ログインしてください。');
    showOutsideAuthStep('id', entryHint || 'IDを入力してください。');
    return false;
  }
  async function logoutOutsideSession() {
    invalidateOutsideAuthRequests();
    clearOutsideAuthSession();
    resetOutsideAuthState();
    setNotice('この端末からログアウトしました。');
    await showOutsideAuthGate('この端末の保存済みセッションを削除しました。IDとパスワードでログインしてください。');
  }
  function showReadyLanding(mode = 'connecting') {
    let targetMode = String(mode || 'connecting');
    if (isLocalTestMode()) {
      targetMode = 'ready';
    }
    if (targetMode === 'server-wait' && state.adminOfflineMode) {
      targetMode = 'ready';
    }
    if (targetMode === 'ready' && isOutsideAuthRequired() && !state.outsideAuth.loggedIn) {
      startAutoResumeOutsideSession('校外オンラインです。IDとパスワードでログインしてください。');
      return;
    }
    state.outsideAuth.active = !state.serverAvailable && state.outsideAuth.loggedIn;
    stopTick();
    stopLocalChatSimulation();
    state.game = null;
    state.classState = null;
    state.sprite.playDrawRect = null;
    clearPromptFlash();
    clearChatMessages();
    setPhase('playing');
    if (targetMode !== 'server-wait') {
      applyDurationOverride();
    }
    updateTimeDisplay(state.config.gameDurationSec * 1000);
    updateGuide();

    if (targetMode === 'server-wait') {
      setReadyOverlay(true, 'READY', '管理画面からの開始を待っています', 'server-wait');
      setNotice('管理画面からの開始を待っています。');
      els.offlineStartBtn.classList.add('hidden');
      return;
    }
    if (targetMode === 'connecting') {
      setReadyOverlay(true, 'READY', 'サーバー接続を確認しています', 'connecting');
      setNotice(`サーバー接続を確認しています。2秒で接続できない場合は${isLocalTestMode() ? 'ローカルテスト' : 'ソロプレイ'}モードになります。`);
      primeOfflineReadyData(false);
      return;
    }

    if (state.serverAvailable && state.adminOfflineMode) {
      setReadyOverlay(true, 'READY', 'スペースキーを押したらスタートします', 'ready');
      els.offlineStartBtn.classList.remove('hidden');
      setNotice('管理画面でオフラインモード中です。各端末で個別にプレイできます。記録は保存しません。');
      return;
    }

    if (canUseClientGas()) {
      setReadyOverlay(true, 'READY', 'クラス記録を読み込んでいます', 'ready-loading');
      if (!state.serverAvailable && state.outsideAuth.loggedIn) {
        setNotice('校外オンラインでクラス記録を読み込んでいます。');
      } else {
        setNotice(isLocalTestMode() ? 'ローカルテスト用にクラス記録を読み込んでいます。' : 'ソロプレイ用にクラス記録を読み込んでいます。');
      }
      primeOfflineReadyData(false);
      return;
    }
    setReadyOverlay(true, 'READY', 'スペースキーを押したらスタートします', 'ready');
    els.offlineStartBtn.classList.remove('hidden');
    setNotice(isLocalTestMode() ? 'ローカルテストモードです。記録は更新しません。' : 'ソロプレイモードです。スペースキーで開始できます。');
  }
  function applyAdminOfflineMode(enabled) {
    const next = Boolean(enabled);
    const changed = state.adminOfflineMode !== next;
    state.adminOfflineMode = next;
    refreshConnectionBadge();
    updateIdentity();
    if (!changed || !state.serverAvailable) {
      return;
    }
    if (state.adminOfflineMode) {
      if (!state.game) {
        showReadyLanding('ready');
      }
      setNotice('管理画面でオフラインモードが有効です。各端末で個別にプレイできます。');
    } else {
      if (!state.game) {
        showReadyLanding('server-wait');
      }
      setNotice('管理画面からの開始待機に戻りました。');
    }
  }
  function handleForceStopEvent(message = {}) {
    unlockMissLock(false, false, false);
    clearPromptFlash();
    clearReadyTimer();
    stopTick();
    stopLocalChatSimulation();
    clearChatMessages();
    resetResultPanel();
    if (state.game && state.game.clearBurstTimer) {
      clearTimeout(state.game.clearBurstTimer);
      state.game.clearBurstTimer = null;
    }
    state.game = null;
    showReadyLanding(isServerOnlineMode() ? 'server-wait' : 'ready');
    if (isServerOnlineMode()) {
      setNotice('管理画面から強制終了されました。開始待機へ戻ります。');
      els.waitingMessage.textContent = '管理画面からの開始を待っています。';
      els.waitingModeNote.textContent = 'サーバー同期中です。';
      els.offlineStartBtn.classList.add('hidden');
      return;
    }
    setNotice('管理画面から強制終了されました。オフラインで再開できます。');
    if (!isLocalTestMode()) {
      els.waitingModeNote.textContent = 'オフラインモード';
    }
    els.offlineStartBtn.classList.remove('hidden');
  }
  function returnToServerReadyFromLocalPractice() {
    if (!isLocalPracticeActive()) return false;
    unlockMissLock(false, false, false);
    clearPromptFlash();
    clearReadyTimer();
    stopLocalChatSimulation();
    clearChatMessages();
    resetResultPanel();
    showReadyLanding(isServerOnlineMode() ? 'server-wait' : 'ready');
    if (isServerOnlineMode()) {
      els.offlineStartBtn.classList.add('hidden');
      els.waitingMessage.textContent = '管理画面からの開始を待っています。';
      els.waitingModeNote.textContent = 'サーバー同期中です。';
      setNotice(`サーバーに接続しました。${isLocalTestMode() ? 'ローカルテスト' : 'ソロプレイ'}を終了し、管理画面からの開始待機へ戻ります。`);
    } else {
      els.offlineStartBtn.classList.remove('hidden');
      setNotice('オフラインモードのため、個別プレイを継続できます。');
    }
    return true;
  }
  function uniqList(items) { return Array.from(new Set(items.filter(Boolean))); }
  function countKanaChars(text) { return Array.from(String(text || '')).length; }
  function isConsonantChar(char) { return /^[bcdfghjklmnpqrstvwxyz]$/i.test(char); }
  function buildSplitDigraphOptions(token) {
    const chars = Array.from(String(token || ''));
    if (chars.length !== 2) return [];
    const headOptions = window.RomajiCore && window.RomajiCore.MONOGRAPHS
      ? window.RomajiCore.MONOGRAPHS[chars[0]]
      : null;
    const tailOptions = window.RomajiCore && window.RomajiCore.MONOGRAPHS
      ? window.RomajiCore.MONOGRAPHS[chars[1]]
      : null;
    if (!headOptions || !tailOptions) return [];
    return uniqList(headOptions.flatMap((head) => tailOptions.map((tail) => `${head}${tail}`)));
  }
  function normalizePromptForGame(prompt, stageHint = null) {
    if (!prompt) return null;
    if (window.PromptCatalog && typeof window.PromptCatalog.normalizePrompt === 'function') {
      return window.PromptCatalog.normalizePrompt(prompt, stageHint == null ? prompt.stage : stageHint);
    }
    return {
      ...prompt,
      reading: window.RomajiCore && typeof window.RomajiCore.normalizeReading === 'function'
        ? window.RomajiCore.normalizeReading(prompt.reading || '')
        : String(prompt.reading || '')
    };
  }
  function logBrokenPromptSession(prompt, session, context, typed = '') {
    if (!prompt || !session || typeof session.getNextKeys !== 'function' || typeof session.isComplete !== 'function') return;
    if (session.isComplete()) return;
    const nextKeys = session.getNextKeys();
    if (Array.isArray(nextKeys) && nextKeys.length) return;
    const reading = String(prompt.reading || '');
    const normalizedReading = window.RomajiCore && typeof window.RomajiCore.normalizeReading === 'function'
      ? window.RomajiCore.normalizeReading(reading)
      : reading;
    const tokens = window.RomajiCore && typeof window.RomajiCore.tokenizeKana === 'function'
      ? window.RomajiCore.tokenizeKana(normalizedReading)
      : [];
    console.warn('[typing-debug] prompt session has no next keys', {
      context,
      id: prompt.id || '',
      text: prompt.text || '',
      reading,
      normalizedReading,
      typed: String(typed || ''),
      tokens
    });
  }
  function createPromptSession(prompt, typed = '') {
    const normalizedPrompt = normalizePromptForGame(prompt);
    const session = window.RomajiCore.createTypingSession(normalizedPrompt ? normalizedPrompt.reading : '');
    const restoredTyped = String(typed || '');
    for (const char of restoredTyped) session.inputKey(char);
    logBrokenPromptSession(normalizedPrompt, session, 'createPromptSession', restoredTyped);
    return { prompt: normalizedPrompt, session };
  }
  function getKanaTokenOptions(tokens, index, cache) {
    if (index >= tokens.length) return [''];
    if (cache[index]) return cache[index];
    const token = tokens[index];
    let options;
    if (token === 'っ') {
      const nextOptions = index + 1 < tokens.length ? getKanaTokenOptions(tokens, index + 1, cache).filter(Boolean) : [];
      const doubled = uniqList(nextOptions.map((option) => option[0]).filter((char) => isConsonantChar(char)));
      options = uniqList([...doubled, 'xtu', 'ltu', 'xtsu', 'ltsu']);
    } else if (token === 'ん') {
      const nextOptions = index + 1 < tokens.length ? getKanaTokenOptions(tokens, index + 1, cache).filter(Boolean) : [];
      const needDoubleN = nextOptions.some((option) => /^[aiueoyn]/.test(option));
      options = needDoubleN ? ['nn', 'xn'] : ['n', 'nn', 'xn'];
    } else if (window.RomajiCore.DIGRAPHS[token]) {
      options = uniqList([...window.RomajiCore.DIGRAPHS[token], ...buildSplitDigraphOptions(token)]);
    } else if (window.RomajiCore.MONOGRAPHS[token]) {
      options = window.RomajiCore.MONOGRAPHS[token];
    } else {
      options = [String(token || '').toLowerCase()];
    }
    cache[index] = uniqList(options.map((item) => String(item || '').toLowerCase()));
    return cache[index];
  }
  function resolveReadingState(tokens, typed, index, optionCache, memo) {
    const memoKey = `${index}|${typed}`;
    if (memo.has(memoKey)) return memo.get(memoKey);
    let result = null;
    if (index >= tokens.length) {
      result = typed.length === 0 ? { completedCount: index, currentState: 'done' } : null;
    } else {
      const options = getKanaTokenOptions(tokens, index, optionCache);
      for (const option of options) {
        if (!typed.startsWith(option)) continue;
        const next = resolveReadingState(tokens, typed.slice(option.length), index + 1, optionCache, memo);
        if (next) {
          result = next;
          break;
        }
      }
      if (!result) {
        if (!typed) {
          result = { completedCount: index, currentState: 'idle' };
        } else if (options.some((option) => option.startsWith(typed))) {
          result = { completedCount: index, currentState: 'partial' };
        }
      }
    }
    memo.set(memoKey, result);
    return result;
  }
  function buildReadingSegments(reading, typed) {
    const tokens = window.RomajiCore.tokenizeKana(reading);
    const resolved = resolveReadingState(tokens, typed, 0, Object.create(null), new Map())
      || { completedCount: 0, currentState: typed ? 'partial' : 'idle' };
    const currentToken = resolved.completedCount < tokens.length ? tokens[resolved.completedCount] : '';
    const remainingStart = currentToken ? resolved.completedCount + 1 : resolved.completedCount;
    return {
      typed: tokens.slice(0, resolved.completedCount).join(''),
      current: currentToken,
      currentState: resolved.currentState,
      remaining: tokens.slice(remainingStart).join(''),
      completedCount: resolved.completedCount
    };
  }
  function resolveCurrentTokenGuide(tokens, typed, index, optionCache, memo) {
    const memoKey = `${index}|${typed}`;
    if (memo.has(memoKey)) return memo.get(memoKey);
    let result = null;
    if (index >= tokens.length) {
      result = typed.length === 0 ? { index, token: '', typedPart: '', options: [] } : null;
    } else {
      const options = getKanaTokenOptions(tokens, index, optionCache);
      for (const option of options) {
        if (!typed.startsWith(option)) continue;
        const next = resolveCurrentTokenGuide(tokens, typed.slice(option.length), index + 1, optionCache, memo);
        if (next) {
          result = next;
          break;
        }
      }
      if (!result) {
        if (!typed) {
          result = { index, token: tokens[index], typedPart: '', options };
        } else {
          const viableOptions = options.filter((option) => option.startsWith(typed));
          if (viableOptions.length) result = { index, token: tokens[index], typedPart: typed, options: viableOptions };
        }
      }
    }
    memo.set(memoKey, result);
    return result;
  }
  function choosePreferredTokenOption(token, options) {
    if (!Array.isArray(options) || !options.length) return '';
    const preferred = state.romajiPrefs[token];
    if (preferred && options.includes(preferred)) return preferred;
    return options[0];
  }
  function buildPreferredTail(tokens, startIndex, optionCache) {
    let tail = '';
    for (let index = startIndex; index < tokens.length; index += 1) {
      const options = getKanaTokenOptions(tokens, index, optionCache);
      tail += choosePreferredTokenOption(tokens[index], options);
    }
    return tail;
  }
  function getCurrentTokenGuide(reading, typed) {
    const tokens = window.RomajiCore.tokenizeKana(reading);
    const optionCache = Object.create(null);
    const resolved = resolveCurrentTokenGuide(tokens, typed, 0, optionCache, new Map());
    return resolved || { token: '', typedPart: '', options: [] };
  }
  function getDisplayGuide(reading, typed) {
    const tokens = window.RomajiCore.tokenizeKana(reading);
    const optionCache = Object.create(null);
    const current = resolveCurrentTokenGuide(tokens, typed, 0, optionCache, new Map())
      || { index: tokens.length, token: '', typedPart: '', options: [] };
    if (!current.token) {
      return {
        typed,
        remaining: '',
        candidate: typed,
        nextKey: '',
        currentToken: '',
        currentTyped: '',
        currentOptions: [],
        preferredOption: ''
      };
    }
    const preferredOption = choosePreferredTokenOption(current.token, current.options);
    const remaining = `${preferredOption.slice(current.typedPart.length)}${buildPreferredTail(tokens, current.index + 1, optionCache)}`;
    return {
      typed,
      remaining,
      candidate: `${typed}${remaining}`,
      nextKey: remaining.slice(0, 1),
      currentToken: current.token,
      currentTyped: current.typedPart,
      currentOptions: current.options,
      preferredOption
    };
  }
  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function buildMissRomajiMarkup(options, typedPart) {
    if (!Array.isArray(options) || !options.length) return '?';
    const safeTypedPart = String(typedPart || '');
    return options.map((option) => {
      const full = String(option || '');
      const typedPrefix = safeTypedPart && full.startsWith(safeTypedPart) ? safeTypedPart : '';
      const remaining = typedPrefix ? full.slice(typedPrefix.length) : full;
      return [
        '<span class="miss-romaji-option">',
        typedPrefix ? `<span class="miss-romaji-typed">${escapeHtml(typedPrefix)}</span>` : '',
        `<span class="miss-romaji-rest">${escapeHtml(remaining)}</span>`,
        '</span>'
      ].join('');
    }).join('<span class="miss-romaji-sep"> / </span>');
  }
  function pushResultTimer(id) {
    state.result.timers.push(id);
    return id;
  }
  function clearResultTimers() {
    state.result.timers.forEach((id) => clearTimeout(id));
    state.result.timers = [];
  }
  function setResultInfoLines(baseLines = [], serverLines = state.result.serverLines) {
    state.result.infoLines = Array.isArray(baseLines) ? baseLines.filter(Boolean) : [];
    state.result.serverLines = Array.isArray(serverLines) ? serverLines.filter(Boolean) : [];
    const lines = [...state.result.infoLines, ...state.result.serverLines];
    els.resultInfo.innerHTML = lines.map((line) => `<div>${escapeHtml(line)}</div>`).join('');
  }
  function shouldShowReadyOutsidePasswordPanel() {
    if (!state.ready.active) return false;
    if (!(state.ready.mode === 'ready' || state.ready.mode === 'ready-loading' || state.ready.mode === 'server-wait')) return false;
    return Boolean(state.serverAvailable && state.player.uid && canUseClientGas());
  }
  function hideReadyOutsidePasswordPanel() {
    if (!els.readyOutsidePasswordPanel) return;
    els.readyOutsidePasswordPanel.classList.add('hidden');
    els.readyOutsidePasswordConfigured.classList.add('hidden');
    els.readyOutsidePasswordSetup.classList.remove('hidden');
    els.readyOutsidePasswordHint.textContent = '';
    if (els.readyOutsidePasswordInput) {
      els.readyOutsidePasswordInput.value = '';
    }
  }
  function setReadyOutsidePasswordPanelConfigured(configured, hintText = '') {
    if (!els.readyOutsidePasswordPanel) return;
    els.readyOutsidePasswordPanel.classList.remove('hidden');
    els.readyOutsidePasswordConfigured.classList.toggle('hidden', !configured);
    els.readyOutsidePasswordSetup.classList.toggle('hidden', configured);
    els.readyOutsidePasswordHint.textContent = String(hintText || '');
    if (!configured && els.readyOutsidePasswordInput) {
      els.readyOutsidePasswordInput.value = '';
    }
  }
  async function refreshReadyOutsidePasswordPanel() {
    if (!shouldShowReadyOutsidePasswordPanel()) {
      hideReadyOutsidePasswordPanel();
      return;
    }
    const targetUid = String(state.player.uid || '').trim();
    setReadyOutsidePasswordPanelConfigured(false, '設定状態を確認しています。');
    try {
      const status = await fetchAuthStatusFromGas(targetUid);
      if (!shouldShowReadyOutsidePasswordPanel() || String(state.player.uid || '').trim() !== targetUid) {
        return;
      }
      const configured = Boolean(status && status.ok === true && status.configured === true);
      if (configured) {
        setReadyOutsidePasswordPanelConfigured(true, '');
      } else {
        setReadyOutsidePasswordPanelConfigured(false, '校外アクセスで使うパスワードを設定してください。');
      }
    } catch {
      if (!shouldShowReadyOutsidePasswordPanel() || String(state.player.uid || '').trim() !== targetUid) {
        return;
      }
      setReadyOutsidePasswordPanelConfigured(false, '状態確認に失敗しました。再度お試しください。');
    }
  }
  function hideResultOutsidePasswordPanel() {
    if (!els.resultOutsidePasswordPanel) return;
    els.resultOutsidePasswordPanel.classList.add('hidden');
    els.resultOutsidePasswordConfigured.classList.add('hidden');
    els.resultOutsidePasswordSetup.classList.remove('hidden');
    els.resultOutsidePasswordHint.textContent = '';
    if (els.resultOutsidePasswordInput) {
      els.resultOutsidePasswordInput.value = '';
    }
  }
  function setResultOutsidePasswordPanelConfigured(configured, hintText = '') {
    if (!els.resultOutsidePasswordPanel) return;
    els.resultOutsidePasswordPanel.classList.remove('hidden');
    els.resultOutsidePasswordConfigured.classList.toggle('hidden', !configured);
    els.resultOutsidePasswordSetup.classList.toggle('hidden', configured);
    els.resultOutsidePasswordHint.textContent = String(hintText || '');
    if (!configured && els.resultOutsidePasswordInput) {
      els.resultOutsidePasswordInput.value = '';
    }
  }
  async function refreshResultOutsidePasswordPanel() {
    if (!state.serverAvailable || !state.player.uid || !canUseClientGas() || state.phase !== 'result') {
      hideResultOutsidePasswordPanel();
      return;
    }
    setResultOutsidePasswordPanelConfigured(false, '設定状態を確認しています。');
    try {
      const status = await fetchAuthStatusFromGas(state.player.uid);
      const configured = Boolean(status && status.ok === true && status.configured === true);
      if (configured) {
        setResultOutsidePasswordPanelConfigured(true, '');
      } else {
        setResultOutsidePasswordPanelConfigured(false, '校外アクセスで使うパスワードを設定してください。');
      }
    } catch {
      setResultOutsidePasswordPanelConfigured(false, '状態確認に失敗しました。再度お試しください。');
    }
  }
  function setResultHeatGauge(maxCombo) {
    if (!els.resultHeatFill) return;
    const clamped = Math.max(0, Math.min(1, Number(maxCombo || 0) / 500));
    els.resultHeatFill.setAttribute('width', String(Math.round(RESULT_COMBO_GAUGE_WIDTH * clamped)));
  }
  function clearResultGroupState() {
    [
      els.resultHeadGroup,
      els.resultEmblemGroup,
      els.resultRankGroup,
      els.resultSpeedGroup,
      els.resultCorrectGroup,
      els.resultMissGroup,
      els.resultAccuracyGroup,
      els.resultCompletedGroup,
      els.resultComboGroup,
      els.resultScoreGroup
    ].forEach((node) => node && node.classList.remove('is-live', 'is-hot', 'is-value-settled', 'is-score-live'));
    [
      els.resultCorrectValue,
      els.resultMissValue,
      els.resultAccuracyValue,
      els.resultCompletedValue,
      els.resultComboValueHud,
      els.resultScoreValue,
      els.resultClassRankValue,
      els.resultKpmValue,
      els.resultWpmValue
    ].forEach((node) => node && node.classList.remove('is-rolling', 'is-settled', 'is-score-settled'));
  }
  function resetResultPanel() {
    clearResultTimers();
    state.result.runId += 1;
    state.result.infoLines = [];
    state.result.serverLines = [];
    state.result.rankSummary = null;
    state.result.scoreSequenceDone = false;
    state.result.rankRevealDone = false;
    state.sprite.resultDrawRect = null;
    els.resultIntro.classList.remove('hidden', 'is-exit');
    els.resultShell.classList.remove('is-live');
    els.resultActions.classList.remove('is-visible');
    clearResultGroupState();
    els.resultCorrectValue.textContent = '0';
    els.resultMissValue.textContent = '0';
    els.resultAccuracyValue.textContent = '0.0%';
    els.resultCompletedValue.textContent = '0';
    els.resultComboValueHud.textContent = '0回';
    els.resultScoreValue.textContent = '0';
    els.resultClassRankValue.textContent = '';
    els.resultKpmValue.textContent = '';
    els.resultWpmValue.textContent = '';
    els.resultRankGroup.classList.add('hidden');
    els.resultSpeedGroup.classList.add('hidden');
    setResultHeatGauge(0);
    els.resultInfo.innerHTML = '';
    hideResultOutsidePasswordPanel();
    els.resultConfettiLayer.innerHTML = '';
    els.resultClassChip.textContent = `クラス ${state.player.classId || '-'}`;
    els.resultPlayerChip.textContent = `${state.player.playerName || '-'}`;
    els.resultRankLetter.textContent = '';
    state.sprite.resultSequenceStartedAt = 0;
    state.sprite.resultMotionStartedAt = 0;
    state.sprite.resultMotionKey = '';
  }
  function waitForResultStep(ms, runId) {
    return new Promise((resolve) => {
      pushResultTimer(setTimeout(() => resolve(runId === state.result.runId), ms));
    });
  }
  function buildRollingValue(targetText, progress, elapsedMs = 0) {
    const chars = String(targetText).split('');
    const digitIndexes = chars.map((char, index) => (/\d/.test(char) ? index : -1)).filter((index) => index >= 0);
    const reelStep = Math.floor(elapsedMs / 19);
    const order = digitIndexes.slice().reverse();
    const settleStart = 0.12;
    const settleEnd = 0.68;
    const settleStride = order.length > 1 ? (settleEnd - settleStart) / (order.length - 1) : 0;
    const settleThresholds = new Map(order.map((digitIndex, rank) => [digitIndex, settleStart + rank * settleStride]));
    return chars.map((char, index) => {
      if (!/\d/.test(char)) return char;
      const threshold = settleThresholds.get(index) ?? 1;
      if (progress >= threshold) return char;
      const rank = order.indexOf(index);
      return String((Number(char) + reelStep + index * 3 + rank * 2) % 10);
    }).join('');
  }
  function collectResultLayoutDebugRects() {
    const pick = (node, label) => {
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return {
        part: label,
        x: Number(rect.x.toFixed(1)),
        y: Number(rect.y.toFixed(1)),
        width: Number(rect.width.toFixed(1)),
        height: Number(rect.height.toFixed(1)),
        right: Number(rect.right.toFixed(1)),
        bottom: Number(rect.bottom.toFixed(1))
      };
    };
    const pickCanvasDraw = (canvas, drawRect, label) => {
      if (!canvas || !drawRect) return null;
      const rect = canvas.getBoundingClientRect();
      return {
        part: label,
        x: Number((rect.left + drawRect.x).toFixed(1)),
        y: Number((rect.top + drawRect.y).toFixed(1)),
        width: Number(drawRect.width.toFixed(1)),
        height: Number(drawRect.height.toFixed(1)),
        right: Number((rect.left + drawRect.x + drawRect.width).toFixed(1)),
        bottom: Number((rect.top + drawRect.y + drawRect.height).toFixed(1))
      };
    };
    return [
      {
        part: 'viewport',
        x: 0,
        y: 0,
        width: Number(window.innerWidth.toFixed(1)),
        height: Number(window.innerHeight.toFixed(1)),
        right: Number(window.innerWidth.toFixed(1)),
        bottom: Number(window.innerHeight.toFixed(1))
      },
      pick(document.getElementById('appRoot'), 'appRoot'),
      pick(document.querySelector('.layout.student-layout'), 'studentLayout'),
      pick(els.resultPanel, 'resultPanel'),
      pick(els.resultStage, 'resultStage'),
      pick(els.resultHudSvg, 'resultHudSvg'),
      pick(els.resultHeadGroup, 'headGroup'),
      pick(els.resultEmblemGroup, 'emblemGroup'),
      pick(els.resultScoreGroup, 'scoreGroup'),
      pick(els.resultRankGroup, 'rankGroup'),
      pick(els.resultSpeedGroup, 'speedGroup'),
      pick(els.resultCorrectGroup, 'correctGroup'),
      pick(els.resultMissGroup, 'missGroup'),
      pick(els.resultAccuracyGroup, 'accuracyGroup'),
      pick(els.resultCompletedGroup, 'completedGroup'),
      pick(els.resultComboGroup, 'comboGroup'),
      pick(els.resultComboIcon, 'comboIcon'),
      pick(els.resultComboLabel, 'comboLabel'),
      pick(els.resultComboValueHud, 'comboValue'),
      pick(els.resultComboFlames, 'comboFlames'),
      pick(els.resultHeatFill, 'comboHeatFill'),
      pick(els.resultKpmValue, 'kpmValue'),
      pick(els.resultWpmValue, 'wpmValue'),
      pick(els.resultSpriteCanvas, 'spriteCanvas'),
      pickCanvasDraw(els.resultSpriteCanvas, state.sprite.resultDrawRect, 'spriteDrawRect'),
      pick(els.resultInfo, 'resultInfo')
    ].filter(Boolean);
  }
  function logResultLayoutDebug(source = 'result') {
    const rows = collectResultLayoutDebugRects();
    if (!rows.length) return;
    console.groupCollapsed(`[typing-result-debug] ${source}`);
    console.table(rows);
    console.groupEnd();
    window.typingDebug = window.typingDebug || {};
    window.typingDebug.resultLayout = () => {
      const latest = collectResultLayoutDebugRects();
      console.table(latest);
      return latest;
    };
  }
  function queueResultLayoutDebug(source = 'result') {
    requestAnimationFrame(() => requestAnimationFrame(() => logResultLayoutDebug(source)));
  }
  function animateSlotValue(node, finalText, duration, runId, finalClass = 'is-settled') {
    return new Promise((resolve) => {
      if (!node || runId !== state.result.runId) {
        resolve(false);
        return;
      }
      const startedAt = performance.now();
      node.classList.add('is-rolling');
      const tick = () => {
        if (runId !== state.result.runId) {
          node.classList.remove('is-rolling', finalClass);
          resolve(false);
          return;
        }
        const elapsedMs = performance.now() - startedAt;
        const progress = Math.min(1, elapsedMs / duration);
        node.textContent = progress >= 1 ? finalText : buildRollingValue(finalText, Math.max(0, progress - 0.12), elapsedMs);
        if (progress >= 1) {
          node.classList.remove('is-rolling');
          node.classList.add(finalClass);
          pushResultTimer(setTimeout(() => node.classList.remove(finalClass), 520));
          resolve(true);
          return;
        }
        pushResultTimer(setTimeout(tick, 26));
      };
      tick();
    });
  }
  function animateRankValue(node, finalText, duration, runId, finalClass = 'is-settled') {
    return new Promise((resolve) => {
      if (!node || runId !== state.result.runId) {
        resolve(false);
        return;
      }
      const sequence = ['D', 'C', 'B', 'A', 'S'];
      const startedAt = performance.now();
      node.classList.add('is-rolling');
      const tick = () => {
        if (runId !== state.result.runId) {
          node.classList.remove('is-rolling', finalClass);
          resolve(false);
          return;
        }
        const elapsedMs = performance.now() - startedAt;
        const progress = Math.min(1, elapsedMs / duration);
        if (progress >= 1) {
          node.textContent = finalText;
          node.classList.remove('is-rolling');
          node.classList.add(finalClass);
          pushResultTimer(setTimeout(() => node.classList.remove(finalClass), 520));
          resolve(true);
          return;
        }
        node.textContent = sequence[Math.floor(elapsedMs / 66) % sequence.length];
        pushResultTimer(setTimeout(tick, 24));
      };
      tick();
    });
  }
  function animateResultHeatGauge(maxCombo, duration, runId) {
    return new Promise((resolve) => {
      const node = els.resultHeatFill;
      if (!node || runId !== state.result.runId) {
        resolve(false);
        return;
      }
      const targetRatio = Math.max(0, Math.min(1, Number(maxCombo || 0) / 500));
      const targetWidth = Math.round(RESULT_COMBO_GAUGE_WIDTH * targetRatio);
      const startedAt = performance.now();
      const tick = () => {
        if (runId !== state.result.runId) {
          resolve(false);
          return;
        }
        const progress = easeOutCubic(Math.min(1, (performance.now() - startedAt) / duration));
        node.setAttribute('width', String(Math.round(targetWidth * progress)));
        if (progress >= 1) {
          resolve(true);
          return;
        }
        pushResultTimer(setTimeout(tick, 24));
      };
      tick();
    });
  }
  function formatResultRank(rankSummary = state.result.rankSummary) {
    if (!rankSummary || !Number.isFinite(Number(rankSummary.rank))) return '';
    return `${Number(rankSummary.rank)}位`;
  }
  function shouldShowResultRank() {
    return Boolean(!state.game || state.game.showRank !== false);
  }
  async function revealResultRank(runId, animated = true) {
    if (runId !== state.result.runId || state.result.rankRevealDone) return false;
    if (!shouldShowResultRank()) return false;
    const rankText = formatResultRank();
    if (!rankText) return false;
    state.result.rankRevealDone = true;
    els.resultRankGroup.classList.remove('hidden');
    els.resultRankGroup.classList.add('is-live', 'is-hot');
    if (!animated) {
      els.resultClassRankValue.textContent = rankText;
      els.resultRankGroup.classList.remove('is-hot');
      els.resultRankGroup.classList.add('is-value-settled');
      return true;
    }
    const shown = await waitForResultStep(180, runId);
    if (!shown) return false;
    const revealed = await animateSlotValue(els.resultClassRankValue, rankText, 900, runId);
    if (!revealed) return false;
    els.resultRankGroup.classList.remove('is-hot');
    els.resultRankGroup.classList.add('is-value-settled');
    updateResultSpeedMetrics();
    els.resultSpeedGroup.classList.add('is-live');
    queueResultLayoutDebug('result-rank');
    queueResultLayoutDebug('result-speed');
    return true;
  }
  function spawnResultConfettiBurst(count = 56) {
    const layer = els.resultConfettiLayer;
    if (!layer) return;
    const palette = ['#22c55e', '#38bdf8', '#f472b6', '#facc15', '#fb7185', '#a855f7', '#f97316'];
    for (let i = 0; i < count; i += 1) {
      const piece = document.createElement('span');
      piece.className = `result-confetti result-confetti--${i % 4 === 0 ? 'spark' : 'paper'}`;
      piece.style.left = `${4 + Math.random() * 92}%`;
      piece.style.top = `${-8 + Math.random() * 14}%`;
      piece.style.background = palette[i % palette.length];
      piece.style.setProperty('--dx', `${(Math.random() - 0.5) * 260}px`);
      piece.style.setProperty('--dy', `${280 + Math.random() * 260}px`);
      piece.style.setProperty('--rot-start', `${(Math.random() - 0.5) * 180}deg`);
      piece.style.setProperty('--rot-end', `${(Math.random() - 0.5) * 960}deg`);
      piece.style.setProperty('--duration', `${1600 + Math.random() * 900}ms`);
      piece.style.setProperty('--delay', `${Math.random() * 180}ms`);
      piece.style.setProperty('--size', `${8 + Math.random() * 11}px`);
      layer.appendChild(piece);
      piece.addEventListener('animationend', () => piece.remove(), { once: true });
    }
  }
  function triggerResultCelebration(runId) {
    [0, 240, 620, 1080].forEach((delay, index) => {
      pushResultTimer(setTimeout(() => {
        if (runId !== state.result.runId) return;
        spawnResultConfettiBurst(60 - index * 8);
      }, delay));
    });
  }
  async function playResultSequence(reason) {
    if (!state.game) return;
    resetResultPanel();
    const runId = state.result.runId;
    const summary = calcScore(state.game.stats);
    state.game.stats.score = summary.score;
    state.game.stats.accuracy = summary.accuracy;
    updateResultSpeedMetrics();
    els.resultClassChip.textContent = `クラス ${state.player.classId || '-'}`;
    els.resultPlayerChip.textContent = `${state.player.playerName || '-'}`;
    setResultInfoLines([], []);
    refreshResultOutsidePasswordPanel();
    setResultHeatGauge(0);
    const introHold = await waitForResultStep(1100, runId);
    if (!introHold) return;
    els.resultIntro.classList.add('is-exit');
    els.resultShell.classList.add('is-live');
    els.resultHeadGroup.classList.add('is-live');
    els.resultEmblemGroup.classList.add('is-live');
    els.resultScoreGroup.classList.add('is-live');
    const introFade = await waitForResultStep(420, runId);
    if (!introFade) return;
    els.resultIntro.classList.add('hidden');
    queueResultLayoutDebug('result-live');
    for (const entry of RESULT_PANEL_DEFS) {
      const group = els[entry.groupId];
      const valueNode = els[entry.valueId];
      if (!group || !valueNode) continue;
      group.classList.add('is-live', 'is-hot');
      const shown = await waitForResultStep(170, runId);
      if (!shown) return;
      const animated = await animateSlotValue(valueNode, entry.format(state.game.stats[entry.key]), 980, runId);
      if (!animated) return;
      group.classList.remove('is-hot');
      group.classList.add('is-value-settled');
      const stepped = await waitForResultStep(120, runId);
      if (!stepped) return;
    }
    els.resultComboGroup.classList.add('is-live', 'is-hot');
    const comboShown = await waitForResultStep(180, runId);
    if (!comboShown) return;
    const comboAnimated = await animateSlotValue(els.resultComboValueHud, `${state.game.stats.maxCombo}回`, 1100, runId);
    if (!comboAnimated) return;
    const heatAnimated = await animateResultHeatGauge(state.game.stats.maxCombo, 620, runId);
    if (!heatAnimated) return;
    els.resultComboGroup.classList.remove('is-hot');
    els.resultComboGroup.classList.add('is-value-settled');
    const scoreShown = await waitForResultStep(220, runId);
    if (!scoreShown) return;
    els.resultScoreGroup.classList.add('is-hot');
    const scoreAnimated = await animateSlotValue(els.resultScoreValue, state.game.stats.score.toLocaleString('ja-JP'), 1540, runId, 'is-score-settled');
    if (!scoreAnimated) return;
    els.resultScoreGroup.classList.remove('is-hot');
    els.resultScoreGroup.classList.add('is-score-live');
    els.resultEmblemGroup.classList.add('is-hot');
    const rankAnimated = await animateRankValue(els.resultRankLetter, getScoreRankLetter(state.game.stats.score), 760, runId);
    if (!rankAnimated) return;
    els.resultEmblemGroup.classList.remove('is-hot');
    state.result.scoreSequenceDone = true;
    if (state.result.rankSummary && shouldShowResultRank()) {
      const rankShown = await revealResultRank(runId, true);
      if (!rankShown && runId !== state.result.runId) return;
    } else {
      updateResultSpeedMetrics();
      els.resultSpeedGroup.classList.add('is-live');
      queueResultLayoutDebug('result-speed');
    }
    queueResultLayoutDebug('result-final');
    triggerResultCelebration(runId);
    syncResultActions();
  }
  function spawnPromptClearBurst() {
    const layer = els.promptEffectLayer;
    if (!layer) return;
    const layerRect = layer.getBoundingClientRect();
    const targets = [
      els.readingTyped.parentElement,
      els.promptText,
      els.romajiTyped.parentElement
    ].filter(Boolean);
    targets.forEach((target, groupIndex) => {
      const rect = target.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const count = Math.max(18, Math.min(48, Math.round(rect.width / 8)));
      for (let i = 0; i < count; i += 1) {
        const particle = document.createElement('span');
        particle.className = `prompt-particle ${i % 4 === 0 ? 'prompt-particle--spark' : 'prompt-particle--clear'}`;
        particle.style.left = `${rect.left - layerRect.left + Math.random() * rect.width}px`;
        particle.style.top = `${rect.top - layerRect.top + Math.random() * rect.height}px`;
        particle.style.setProperty('--dx', `${(Math.random() - 0.5) * (80 + groupIndex * 12)}px`);
        particle.style.setProperty('--dy', `${-20 - Math.random() * 54 + (Math.random() - 0.5) * 26}px`);
        particle.style.setProperty('--rot', `${(Math.random() - 0.5) * 520}deg`);
        particle.style.setProperty('--size', `${2 + Math.random() * 5}px`);
        particle.style.animationDelay = `${Math.random() * 70}ms`;
        layer.appendChild(particle);
        particle.addEventListener('animationend', () => particle.remove(), { once: true });
      }
    });
  }
  function splitPromptFlash(typedText, flashText) {
    if (!flashText || !typedText.endsWith(flashText)) {
      return { stable: typedText, flash: '' };
    }
    return {
      stable: typedText.slice(0, Math.max(0, typedText.length - flashText.length)),
      flash: flashText
    };
  }
  function clearPromptFlash(kind) {
    const clearOne = (name, timerKey) => {
      promptFlash[name] = '';
      if (flashTimers[timerKey]) {
        clearTimeout(flashTimers[timerKey]);
        flashTimers[timerKey] = null;
      }
    };
    if (!kind || kind === 'reading') clearOne('reading', 'promptReading');
    if (!kind || kind === 'romaji') clearOne('romaji', 'promptRomaji');
  }
  function spawnPromptBurst(kind, text) {
    const target = kind === 'reading' ? els.readingFlash : els.romajiFlash;
    const layer = els.promptEffectLayer;
    if (!target || !layer || !text) return;
    const targetRect = target.getBoundingClientRect();
    const layerRect = layer.getBoundingClientRect();
    if (targetRect.width <= 0 || targetRect.height <= 0) return;
    const count = Math.max(10, Math.min(24, text.length * 8));
    for (let i = 0; i < count; i += 1) {
      const particle = document.createElement('span');
      particle.className = `prompt-particle ${i % 3 === 0 ? 'prompt-particle--spark' : 'prompt-particle--shard'}`;
      const baseX = targetRect.left - layerRect.left + (Math.random() * Math.max(targetRect.width, 10));
      const baseY = targetRect.top - layerRect.top + targetRect.height * (0.3 + Math.random() * 0.45);
      particle.style.left = `${baseX}px`;
      particle.style.top = `${baseY}px`;
      particle.style.setProperty('--dx', `${(Math.random() - 0.5) * 64}px`);
      particle.style.setProperty('--dy', `${-10 - Math.random() * 26 + (Math.random() - 0.5) * 24}px`);
      particle.style.setProperty('--rot', `${(Math.random() - 0.5) * 320}deg`);
      particle.style.setProperty('--size', `${2 + Math.random() * 4}px`);
      particle.style.animationDelay = `${Math.random() * 40}ms`;
      layer.appendChild(particle);
      particle.addEventListener('animationend', () => particle.remove(), { once: true });
    }
  }
  function flashPromptSegment(kind, text) {
    if (!text) return;
    const timerKey = kind === 'reading' ? 'promptReading' : 'promptRomaji';
    promptFlash[kind] = text;
    if (flashTimers[timerKey]) clearTimeout(flashTimers[timerKey]);
    updateGuide();
    spawnPromptBurst(kind, text);
    flashTimers[timerKey] = setTimeout(() => {
      promptFlash[kind] = '';
      flashTimers[timerKey] = null;
      updateGuide();
    }, 180);
  }
  function hideMissOverlay() {
    els.promptBox.classList.remove('miss-active');
    els.missOverlay.classList.add('hidden');
    els.missKana.textContent = '-';
    els.missRomaji.innerHTML = '-';
  }
  function unlockMissLock(shouldRefresh = true, preserveCombo = false, showOutcome = true) {
    if (state.inputLock.timer) {
      clearTimeout(state.inputLock.timer);
      state.inputLock.timer = null;
    }
    if (state.inputLock.shakeTimer) {
      clearTimeout(state.inputLock.shakeTimer);
      state.inputLock.shakeTimer = null;
    }
    if (!preserveCombo && state.inputLock.pendingComboReset && state.game) {
      state.game.stats.combo = 0;
    }
    const hadPendingReset = state.inputLock.pendingComboReset;
    const comboAtMiss = Number(state.inputLock.comboAtMiss || 0);
    state.inputLock.active = false;
    state.inputLock.missKey = '';
    state.inputLock.nextKeys = [];
    state.inputLock.pendingComboReset = false;
    state.inputLock.startedAt = 0;
    state.inputLock.comboAtMiss = 0;
    document.body.classList.remove('miss-shake', 'input-locked');
    hideMissOverlay();
    if (showOutcome && hadPendingReset) {
      triggerComboFeedback(preserveCombo ? 'saved' : 'lost');
      if (!preserveCombo && comboAtMiss >= 30) {
        emitCriticalMissMessage(comboAtMiss);
      }
    }
    if (shouldRefresh) updateGuide();
  }
  function lockInputOnMiss(kana, romajiOptions, typedPart, wrongKey, nextKeys) {
    unlockMissLock(false, true, false);
    state.inputLock.active = true;
    state.inputLock.pendingComboReset = true;
    state.inputLock.startedAt = performance.now();
    state.inputLock.comboAtMiss = Number(state.game && state.game.stats ? state.game.stats.combo || 0 : 0);
    els.missKana.textContent = kana || '?';
    els.missRomaji.innerHTML = buildMissRomajiMarkup(romajiOptions, typedPart);
    state.inputLock.missKey = wrongKey || '';
    state.inputLock.nextKeys = Array.isArray(nextKeys) ? nextKeys.slice() : [];
    els.promptBox.classList.add('miss-active');
    els.missOverlay.classList.remove('hidden');
    document.body.classList.add('input-locked');
    restartBodyAnimation('miss-shake', 420);
    state.inputLock.timer = setTimeout(() => unlockMissLock(), 2000);
  }
  function updatePromptProgress(prompt, session, displayGuide = getDisplayGuide(prompt.reading, session.getTyped())) {
    const readingState = buildReadingSegments(prompt.reading, session.getTyped());
    const readingDisplay = splitPromptFlash(readingState.typed, promptFlash.reading);
    const romajiDisplay = splitPromptFlash(displayGuide.typed, promptFlash.romaji);
    els.promptText.textContent = prompt.text;
    els.readingTyped.textContent = readingDisplay.stable;
    els.readingFlash.textContent = readingDisplay.flash;
    els.readingCurrent.textContent = readingState.current;
    els.readingCurrent.dataset.state = readingState.current ? 'active' : 'done';
    els.readingRemaining.textContent = readingState.remaining;
    els.romajiTyped.textContent = romajiDisplay.stable;
    els.romajiFlash.textContent = romajiDisplay.flash;
    els.romajiCurrent.textContent = displayGuide.remaining.slice(0, 1);
    els.romajiCurrent.dataset.state = displayGuide.remaining ? 'active' : 'done';
    els.romajiRemaining.textContent = displayGuide.remaining.slice(1);
    return { readingState, displayGuide };
  }
  function rebuildCurrentPromptSession(prompt, typed = '') {
    if (!prompt) return null;
    const rebuilt = createPromptSession(prompt, typed);
    state.game.currentPrompt = rebuilt.prompt;
    state.game.session = rebuilt.session;
    return rebuilt.session;
  }
  function rewindCurrentKanaOnMiss(prompt, typedBefore, displayGuideBefore) {
    if (!state.game || !prompt || !displayGuideBefore) return null;
    const currentTyped = String(displayGuideBefore.currentTyped || '');
    if (!currentTyped) return getDisplayGuide(prompt.reading, state.game.session.getTyped());
    const nextTyped = String(typedBefore || '').slice(0, Math.max(0, String(typedBefore || '').length - currentTyped.length));
    rebuildCurrentPromptSession(prompt, nextTyped);
    state.game.stats.correctCount = Math.max(0, Number(state.game.stats.correctCount || 0) - currentTyped.length);
    clearPromptFlash();
    return getDisplayGuide(prompt.reading, state.game.session.getTyped());
  }
  function getCurrentPrompt() {
    return state.game ? state.game.currentPrompt || null : null;
  }
    function buildKeyboard() {
      els.keyboard.innerHTML = '';
      if (els.homeRowLabels) els.homeRowLabels.innerHTML = '';
      keyElements.clear();
      homeRowLabelElements.clear();
      KEY_LAYOUT.forEach(([key, x, y, w, h]) => {
        const node = document.createElement('div');
        const isHomeRowKey = HOME_ROW_DISPLAY_KEYS.has(key);
        node.className = `key ${key === ' ' ? 'key-space' : ''}${isHomeRowKey ? ' key-home-base' : ''}`;
        node.dataset.key = key;
        const label = document.createElement('span');
        label.className = 'key-label';
        label.textContent = isHomeRowKey ? '' : getKeyDisplayText(key);
        node.appendChild(label);
        node.style.left = `${(x / 1200) * 100}%`; node.style.top = `${(y / 520) * 100}%`; node.style.width = `${(w / 1200) * 100}%`; node.style.height = `${(h / 520) * 100}%`;
        els.keyboard.appendChild(node); keyElements.set(key, node);
        if (isHomeRowKey && els.homeRowLabels) {
          const overlayLabel = document.createElement('span');
          overlayLabel.className = 'home-row-label';
          overlayLabel.dataset.key = key;
          overlayLabel.textContent = getKeyDisplayText(key);
          overlayLabel.style.left = `${(x / 1200) * 100}%`;
          overlayLabel.style.top = `${(y / 520) * 100}%`;
          overlayLabel.style.width = `${(w / 1200) * 100}%`;
          overlayLabel.style.height = `${(h / 520) * 100}%`;
          els.homeRowLabels.appendChild(overlayLabel);
          homeRowLabelElements.set(key, overlayLabel);
        }
      });
      positionFingerDots();
    }
    function updateNextKeyOverlay(nextKey, alert = false) {
      if (!nextKey || !keyLayoutMap.has(nextKey)) {
        els.nextKeyOverlay.classList.add('hidden');
        els.nextKeyOverlay.classList.remove('alert');
        els.nextKeyOverlayLabel.textContent = '';
        return;
      }
      const keyRect = keyLayoutMap.get(nextKey);
      els.nextKeyOverlay.classList.remove('hidden');
      els.nextKeyOverlay.classList.toggle('alert', Boolean(alert));
      els.nextKeyOverlay.style.left = `${((keyRect.x + keyRect.w / 2) / 1200) * 100}%`;
      els.nextKeyOverlay.style.top = `${((keyRect.y + keyRect.h / 2) / 520) * 100}%`;
      els.nextKeyOverlayLabel.textContent = getKeyDisplayText(nextKey);
      els.nextKeyOverlayLabel.classList.toggle('space', nextKey === ' ');
    }
    function updateFingerArrow(nextKey) {
    const layer = els.fingerArrowLayer;
    if (!layer) return;
    const finger = fingerMap[nextKey];
    const start = getHomeFingerPosition(finger);
    if (!nextKey || !finger || !start || !keyLayoutMap.has(nextKey)) {
      layer.innerHTML = '';
      return;
    }
    const keyRect = keyLayoutMap.get(nextKey);
    const end = { x: keyRect.x + keyRect.w / 2, y: keyRect.y + keyRect.h / 2 };
    if (Math.hypot(end.x - start.x, end.y - start.y) < 12) {
      layer.innerHTML = '';
      return;
    }
    const distance = Math.hypot(end.x - start.x, end.y - start.y);
    const lift = Math.max(28, Math.min(82, distance * 0.2));
    const control = {
      x: (start.x + end.x) / 2,
      y: Math.min(start.y, end.y) - lift
    };
    layer.innerHTML = `
      <defs>
        <marker id="fingerArrowHead" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="userSpaceOnUse">
          <path d="M0,0 L12,6 L0,12 Z" fill="rgba(220, 38, 38, 0.82)"></path>
        </marker>
      </defs>
      <path class="finger-arrow-track" d="M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}" marker-end="url(#fingerArrowHead)"></path>
      <path class="finger-arrow-flow" d="M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}"></path>
      <circle class="finger-arrow-origin" cx="${start.x}" cy="${start.y}" r="5"></circle>
      <circle class="finger-arrow-target" cx="${end.x}" cy="${end.y}" r="8"></circle>
    `;
  }
  function setFinger(keys) {
    const active = new Set(keys.map((key) => fingerMap[key]).filter(Boolean));
    els.fingerDots.forEach((dot) => dot.classList.toggle('active', active.has(dot.dataset.finger)));
  }
  function flashKey(key, miss) {
    const node = keyElements.get(key); if (!node) return;
    const cls = miss ? 'key-miss' : 'key-active'; const bucket = miss ? flashTimers.keyMiss : flashTimers.keyActive;
    if (bucket.has(key)) clearTimeout(bucket.get(key));
    node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls);
    bucket.set(key, setTimeout(() => { node.classList.remove(cls); bucket.delete(key); }, 180));
  }
    function updateGuide() {
      keyElements.forEach((node) => node.classList.remove('key-next', 'key-next-alert', 'key-miss-lock'));
      if (!state.game || !state.game.session) {
      els.promptText.textContent = '-';
      els.readingTyped.textContent = '';
      els.readingFlash.textContent = '';
      els.readingCurrent.textContent = '-';
      els.readingCurrent.dataset.state = 'idle';
      els.readingRemaining.textContent = '';
      els.romajiTyped.textContent = '';
      els.romajiFlash.textContent = '';
      els.romajiCurrent.textContent = '-';
        els.romajiCurrent.dataset.state = 'idle';
        els.romajiRemaining.textContent = '';
        updateComboDisplay();
        setFinger([]);
        updateFingerArrow('');
        updateNextKeyOverlay('', false);
        return;
      }
    const prompt = getCurrentPrompt();
    if (!prompt) return;
    const displayGuide = getDisplayGuide(prompt.reading, state.game.session.getTyped());
    updatePromptProgress(prompt, state.game.session, displayGuide);
    updateComboDisplay();
    const highlightKey = state.inputLock.active && state.inputLock.nextKeys.length
      ? state.inputLock.nextKeys[0]
      : displayGuide.nextKey;
    if (highlightKey) {
      const node = keyElements.get(highlightKey);
      if (node) {
        node.classList.add('key-next');
        if (state.inputLock.active) node.classList.add('key-next-alert');
      }
    }
      if (state.inputLock.active && state.inputLock.missKey) {
        const missNode = keyElements.get(state.inputLock.missKey);
        if (missNode) missNode.classList.add('key-miss-lock');
      }
      setFinger(highlightKey ? [highlightKey] : []);
      updateFingerArrow(highlightKey);
      updateNextKeyOverlay(highlightKey, state.inputLock.active);
    }
  function startTick() {
    stopTick();
    const tick = () => {
      if (!state.game) return;
    const current = state.game.localOnly ? Date.now() : now();
    if (current < state.game.startAt) {
      if (state.game.localOnly) {
        setPhase('countdown');
        els.waitingMessage.textContent = `開始まで ${formatRemaining(state.game.startAt - current)}`;
      } else {
        setPhase('playing');
        const countdown = Math.max(1, Math.ceil((state.game.startAt - current) / 1000));
        setReadyOverlay(true, String(countdown), '', 'countdown');
        updateTimeDisplay(Math.max(0, state.game.endAt - state.game.startAt));
        setNotice('管理画面の開始指示を受信しました。まもなく開始します。');
      }
      return;
    }
      if (current >= state.game.endAt) { finishGame(state.game.localOnly ? 'local' : 'server'); return; }
      if (!state.game.readyGate && state.ready.active && state.ready.mode === 'countdown') {
        setReadyOverlay(false);
      }
      setPhase('playing');
      updateTimeDisplay(state.game.endAt - current);
    };
    tick();
    state.countdownTimer = setInterval(tick, 100);
  }
    function stopTick() { if (state.countdownTimer) { clearInterval(state.countdownTimer); state.countdownTimer = null; } }
    function prepareCurrentPromptSession(typed = '') {
      if (!state.game) return;
      const prepared = createPromptSession(
        pickPromptForGame(state.game.unlockedStage, state.game.promptIndex, state.game.promptSeed),
        typed
      );
      state.game.currentPrompt = prepared.prompt;
      state.game.session = prepared.session;
      syncTrackedStageMetrics();
    }
    function beginReadyCountdown() {
      if (!state.game || !state.game.readyGate || state.ready.mode === 'countdown') return;
      clearReadyTimer();
    const sequence = ['3', '2', '1'];
    let index = 0;
    const advance = () => {
      if (!state.game || !state.game.readyGate) return;
      if (index >= sequence.length) {
        activateReadyPractice();
        return;
      }
      setReadyOverlay(true, sequence[index], '', 'countdown');
      setNotice(`開始まで ${sequence[index]}`);
      index += 1;
      state.ready.timer = setTimeout(advance, 1000);
    };
    advance();
  }
    function activateReadyPractice() {
      if (!state.game || !state.game.readyGate) return;
      clearReadyTimer();
      const startAt = Date.now();
      state.game.readyGate = false;
      state.game.startAt = startAt;
      state.game.endAt = startAt + state.config.gameDurationSec * 1000;
      prepareCurrentPromptSession();
      setReadyOverlay(false);
      updateTimeDisplay(state.config.gameDurationSec * 1000);
      updateGuide();
      startTick();
      setNotice(isLocalTestMode() ? 'ローカルテストを開始します。' : 'ソロプレイを開始します。');
    }
  function beginGame(payload) {
    const resume = payload.resume || null;
    unlockMissLock(false, false, false);
    clearPromptFlash();
    clearReadyTimer();
    setReadyOverlay(false);
    resetResultPanel();
    clearChatMessages();
    stopLocalChatSimulation();
    const promptSeed = Number.isFinite(payload.promptSeed)
      ? Number(payload.promptSeed)
      : Number.isFinite(payload.startAt)
          ? Number(payload.startAt)
          : Date.now();
    state.game = {
      localOnly: Boolean(payload.localOnly),
      gameId: payload.gameId,
      startAt: Number(payload.startAt),
      endAt: Number(payload.endAt),
      showRank: payload.showRank !== false,
      promptIndex: resume ? Number(resume.promptIndex || 0) : 0,
        promptSeed,
        unlockedStage: 0,
        currentPrompt: null,
        session: null,
        stats: { score: 0, accuracy: 0, correctCount: 0, missCount: 0, combo: 0, maxCombo: 0, completedPrompts: 0, completedStageCounts: createCompletedStageCounts(), inputCount: 0, stageMetrics: createTrackedStageMetrics() },
        eventTimeline: resume ? parseEventTimeline(resume.eventTimeline) : [],
        nextHighComboAnnouncement: HIGH_COMBO_ANNOUNCE_START,
        clearBurstTimer: null,
        readyGate: Boolean(payload.readyGate)
      };
      state.sprite.playMotionKey = '';
      state.sprite.playMotionStartedAt = 0;
      if (resume && resume.stats) state.game.stats = { ...state.game.stats, ...resume.stats };
      state.game.stats.completedStageCounts = normalizeCompletedStageCounts(state.game.stats.completedStageCounts);
      state.game.stats.stageMetrics = normalizeTrackedStageMetrics(state.game.stats.stageMetrics);
      state.game.unlockedStage = getUnlockedPromptStage(state.game.stats.maxCombo);
      state.game.nextHighComboAnnouncement = Math.max(
        HIGH_COMBO_ANNOUNCE_START,
        (Math.floor(Math.max(0, Number(state.game.stats.maxCombo || 0)) / HIGH_COMBO_ANNOUNCE_STEP) + 1) * HIGH_COMBO_ANNOUNCE_STEP
      );
      if (!state.game.readyGate) {
        const typed = resume ? String(resume.typed || '') : '';
        prepareCurrentPromptSession(typed);
      }
      updateIdentity();
      updateGuide();
      refreshLocalChatSimulation();
    if (state.game.readyGate) {
      updateTimeDisplay(state.config.gameDurationSec * 1000);
      setPhase('playing');
      setReadyOverlay(true, 'READY', 'スペースキーを押したらスタートします', 'ready');
      setNotice('スペースキーを押したらスタートします。');
      return;
    }
    startTick();
    setNotice(state.game.localOnly ? (isLocalTestMode() ? 'ローカルテストを開始します。' : 'ソロプレイを開始します。') : '管理者の開始指示を受信しました。');
  }
  function startLocalPractice() {
    if (isLocalPracticeActive()) return;
    const seed = Date.now();
    beginGame({ localOnly: true, gameId: buildLocalPracticeGameId(seed), startAt: 0, endAt: 0, promptSeed: seed, readyGate: true });
  }
  function finishGame(reason) {
    if (!state.game || state.phase === 'result') return;
    flushTrackedStageMetrics();
    const localOnly = Boolean(state.game.localOnly);
    const offlineRecord = localOnly ? buildOfflineResultRecord() : null;
    unlockMissLock(false, false, false);
    clearPromptFlash();
    clearReadyTimer();
    setReadyOverlay(false);
    stopLocalChatSimulation();
    if (state.game.clearBurstTimer) {
      clearTimeout(state.game.clearBurstTimer);
      state.game.clearBurstTimer = null;
    }
    stopTick();
    setPhase('result');
    state.sprite.resultSequenceStartedAt = performance.now();
    state.sprite.resultMotionKey = '';
    state.sprite.resultMotionStartedAt = 0;
    els.rankingLink.href = `./ranking.html?classId=${encodeURIComponent(state.player.classId)}`;
    if (offlineRecord) {
      const snapshot = state.offline.snapshot || readSoloSnapshotCache(state.player.classId);
      state.result.rankSummary = snapshot ? buildRankSummaryFromSnapshot(snapshot.snapshot || snapshot, offlineRecord) : null;
      state.offline.syncPromise = syncOfflineResult(offlineRecord).catch(() => null);
    }
    playResultSequence(reason);
    if (!state.game.localOnly && state.serverAvailable) {
      send({
        t: 'submit_score',
        gameId: state.game.gameId,
        metrics: {
          ...state.game.stats,
          ...buildResultSpeedMetricValues()
        }
      });
    }
  }
  function applyClassState(data) {
    state.classState = data;
    els.waitingPlayers.textContent = `接続 ${data.counters.connected} / 待機 ${data.counters.waiting} / プレイ中 ${data.counters.playing} / 終了 ${data.counters.finished}`;
  }
  function send(payload) { if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return false; state.ws.send(JSON.stringify(payload)); return true; }
  function sendProgress() {
    if (!state.game || state.game.localOnly || !state.serverAvailable) return;
    send({
      t: 'progress',
      gameId: state.game.gameId,
      promptIndex: state.game.promptIndex,
      typed: state.game.session ? state.game.session.getTyped() : '',
      stats: state.game.stats
    });
  }
  function startHeartbeat() {
    stopHeartbeat();
    state.heartbeatTimer = setInterval(() => send({ t: 'heartbeat', clientTime: Date.now() }), 10000);
  }
  function stopHeartbeat() {
    if (state.heartbeatTimer) {
      clearInterval(state.heartbeatTimer);
      state.heartbeatTimer = null;
    }
  }
  function handleMessage(message) {
    if (message.serverTime) state.serverOffsetMs = Number(message.serverTime) - Date.now();
    if (message.t === 'welcome') {
      clearOutsideAuthFallbackTimer();
      clearWsConnectTimer();
      invalidateOutsideAuthRequests();
      resetOutsideAuthState();
      resetOutsideAuthUi();
      if (message.config && typeof message.config === 'object') {
        state.config = { ...state.config, ...message.config };
      }
      state.serverAvailable = true;
      state.adminOfflineMode = Boolean(message.offlineModeEnabled);
      state.outsideAuth.active = false;
      applyDurationOverride();
      updateIdentity();
      refreshLocalChatSimulation();
      startHeartbeat();
      const interruptedLocalPractice = state.adminOfflineMode ? false : returnToServerReadyFromLocalPractice();
      if (!state.game) {
        showReadyLanding(state.adminOfflineMode ? 'ready' : 'server-wait');
      }
      if (!interruptedLocalPractice) {
        setNotice(state.adminOfflineMode
          ? '管理画面でオフラインモード中です。各端末で個別にプレイできます。'
          : 'サーバーに接続しました。管理画面からの開始を待っています。');
      }
      send({
        t: 'join',
        classId: state.player.classId,
        classRow: state.player.classRow,
        attendanceNo: state.player.attendanceNo,
        uid: state.player.uid,
        playerName: state.player.playerName,
        playerId: state.player.playerId
      });
      return;
    }
    if (message.t === 'join' && message.ok) {
      state.joined = true;
      if (Object.prototype.hasOwnProperty.call(message, 'offlineModeEnabled')) {
        applyAdminOfflineMode(Boolean(message.offlineModeEnabled));
      }
      applyClassState(message.classState);
      updateIdentity();
      if (isServerOnlineMode()) {
        els.waitingMessage.textContent = '管理画面からの開始を待っています。';
        els.waitingModeNote.textContent = 'サーバー同期中です。';
        els.offlineStartBtn.classList.add('hidden');
        if (!isLocalPracticeActive() && !state.game) showReadyLanding('server-wait');
      } else {
        els.waitingMessage.textContent = '管理画面でオフラインモード中です。';
        els.waitingModeNote.textContent = 'スペースキーで個別に開始できます。';
        els.offlineStartBtn.classList.remove('hidden');
        if (!isLocalPracticeActive() && !state.game) showReadyLanding('ready');
      }
      return;
    }
    if (message.t === 'class_state' && message.class && message.class.classId === state.player.classId) { applyClassState(message.class); return; }
    if (message.t === 'offline_mode') {
      applyAdminOfflineMode(Boolean(message.enabled));
      return;
    }
    if (message.t === 'force_stop') {
      if (Object.prototype.hasOwnProperty.call(message, 'offlineModeEnabled')) {
        applyAdminOfflineMode(Boolean(message.offlineModeEnabled));
      }
      handleForceStopEvent(message);
      return;
    }
    if (message.t === 'game_state' && message.classId === state.player.classId) {
      if (message.state === 'running') beginGame({ localOnly: false, gameId: message.gameId, startAt: message.startAt, endAt: message.endAt, showRank: message.showRank !== false, prompts: message.prompts || [], resume: message.resume || null });
      if (message.state === 'ended') finishGame('server-ended');
      return;
    }
    if (message.t === 'result') {
      state.result.rankSummary = message.rankSummary || null;
      if (state.phase === 'result' && state.result.scoreSequenceDone && !state.result.rankRevealDone && state.result.rankSummary && shouldShowResultRank()) {
        revealResultRank(state.result.runId, true);
      }
      return;
    }
    if (message.t === 'class_feed' && state.game && message.gameId === state.game.gameId) {
      if (message.event === 'achievement' && Number.isFinite(Number(message.comboThreshold))) {
        emitStageAchievementMessage(Number(message.comboThreshold), 'other', String(message.playerName || '参加者'), true);
      }
      if (message.event === 'critical_miss' && Number.isFinite(Number(message.comboAtMiss))) {
        emitCriticalMissMessage(Number(message.comboAtMiss), 'other', String(message.playerName || '参加者'), true);
      }
      return;
    }
  }
  function showOfflineEntryAfterServerDisconnect() {
    if (isOutsideAuthRequired() && !state.outsideAuth.loggedIn) {
      els.offlineStartBtn.classList.add('hidden');
      if (state.phase === 'auth') {
        return;
      }
      startAutoResumeOutsideSession('校外オンラインです。IDとパスワードでログインしてください。');
      return;
    }
    showReadyLanding('ready');
  }
  function connectWs() {
    if (isLocalTestMode()) {
      clearOutsideAuthFallbackTimer();
      state.serverAvailable = false;
      state.adminOfflineMode = false;
      state.joined = false;
      updateIdentity();
      els.offlineStartBtn.classList.remove('hidden');
      els.waitingMessage.textContent = 'ローカルテストモードです。スペースキーで開始できます。';
      els.waitingModeNote.textContent = 'オフライン（記録は更新しません）';
      if (!state.game) {
        showReadyLanding('ready');
      }
      return;
    }
    if (!WS_URL) {
      clearOutsideAuthFallbackTimer();
      els.offlineStartBtn.classList.remove('hidden');
      els.waitingMessage.textContent = isLocalTestMode() ? 'サーバー未接続です。スペースキーでローカルテストを開始できます。' : 'サーバー未接続です。スペースキーでソロプレイを開始できます。';
      els.waitingModeNote.textContent = isLocalTestMode() ? 'ローカルテストモード' : 'ソロプレイモード';
      refreshConnectionBadge();
      if (!state.game) showOfflineEntryAfterServerDisconnect();
      return;
    }
    if (state.ws && (state.ws.readyState === WebSocket.OPEN || state.ws.readyState === WebSocket.CONNECTING)) return;
    clearWsConnectTimer();
    const ws = new WebSocket(WS_URL);
    state.ws = ws;
    refreshConnectionBadge();
    state.wsConnectTimer = setTimeout(() => {
      if (state.ws !== ws || state.serverAvailable) return;
      try { ws.close(); } catch {}
      if (!state.game) {
        els.offlineStartBtn.classList.remove('hidden');
        els.waitingMessage.textContent = isLocalTestMode() ? 'サーバー未接続です。スペースキーでローカルテストを開始できます。' : 'サーバー未接続です。スペースキーでソロプレイを開始できます。';
        els.waitingModeNote.textContent = isLocalTestMode() ? 'ローカルテストモード' : 'ソロプレイモード';
        scheduleOutsideAuthFallback();
      }
    }, WS_CONNECT_TIMEOUT_MS);
    ws.addEventListener('open', () => {
      if (state.ws !== ws) return;
      send({ t: 'hello', role: 'student', clientTime: Date.now() });
    });
    ws.addEventListener('message', (event) => {
      if (state.ws !== ws) return;
      try { handleMessage(JSON.parse(event.data)); } catch {}
    });
    ws.addEventListener('close', () => {
      if (state.ws !== ws) return;
      state.ws = null;
      clearWsConnectTimer();
      stopHeartbeat();
      state.serverAvailable = false;
      state.adminOfflineMode = false;
      state.joined = false;
      updateIdentity();
      refreshLocalChatSimulation();
      if (!isLocalPracticeActive() && state.phase !== 'playing') {
        els.offlineStartBtn.classList.remove('hidden');
        els.waitingMessage.textContent = isLocalTestMode() ? 'サーバー未接続です。必要ならローカルテストを開始できます。' : 'サーバー未接続です。必要ならソロプレイを開始できます。';
        els.waitingModeNote.textContent = 'Node.js サーバー接続が復旧すると、管理画面からの開始待機に戻ります。';
      }
      if (!state.game) {
        scheduleOutsideAuthFallback();
      }
      if (!state.reconnectTimer) state.reconnectTimer = setTimeout(() => { state.reconnectTimer = null; connectWs(); }, 5000);
    });
    ws.addEventListener('error', () => {
      if (state.ws !== ws) return;
      clearWsConnectTimer();
      if (!state.serverAvailable) {
        refreshConnectionBadge();
        els.offlineStartBtn.classList.remove('hidden');
        if (!state.game) scheduleOutsideAuthFallback();
      }
    });
  }
  function parseCsvLine(line) {
    const cells = []; let cell = ''; let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '\"') { if (quoted && line[i + 1] === '\"') { cell += '\"'; i += 1; } else quoted = !quoted; continue; }
      if (char === ',' && !quoted) { cells.push(cell.trim()); cell = ''; continue; }
      cell += char;
    }
    cells.push(cell.trim()); return cells;
  }
  function deriveClassRow(classId) {
    const upper = String(classId || '').trim().toUpperCase();
    if (/^TEST/.test(upper)) {
      return 'TEST';
    }
    const match = upper.match(/([A-HX])$/);
    return match ? match[1] : '';
  }
  function normalizeAttendanceNo(value, uid = '') {
    const direct = Math.floor(Number(value));
    if (Number.isFinite(direct) && direct >= 0 && direct <= 45) {
      return direct;
    }
    const uidMatch = String(uid || '').match(/(\d{1,2})$/);
    if (uidMatch) {
      const fallback = Number(uidMatch[1]);
      if (Number.isFinite(fallback) && fallback >= 0 && fallback <= 45) {
        return fallback;
      }
    }
    return 0;
  }
  function cacheStudents(map) { localStorage.setItem(STUDENT_CACHE_KEY, JSON.stringify(map)); }
  function readStudentCache() { try { return JSON.parse(localStorage.getItem(STUDENT_CACHE_KEY) || '{}'); } catch { return {}; } }
  function getCachedStudentMap() {
    if (cachedStudentMap && typeof cachedStudentMap === 'object') {
      return cachedStudentMap;
    }
    cachedStudentMap = readStudentCache();
    return cachedStudentMap;
  }
  function parseStudentCsvMap(text) {
    const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) {
      return {};
    }
    const head = parseCsvLine(lines[0] || '').map((value) => value.toLowerCase());
    const headerMap = {
      uid: head.findIndex((value) => value === 'uid' || value === 'id'),
      classId: head.findIndex((value) => value === 'classid' || value === 'class_id'),
      classValue: head.findIndex((value) => value === 'class'),
      name: head.findIndex((value) => value === 'playername' || value === 'name' || value === 'studentname'),
      attendance: head.findIndex((value) => value === 'attendanceno' || value === 'attendance' || value === 'seatno' || value === 'seat' || value === 'number' || value === 'no')
    };
    const readValue = (row, index) => index >= 0 ? String(row[index] || '').trim() : '';
    const buildClassId = (row) => {
      const classValue = readValue(row, headerMap.classValue);
      if (classValue) return classValue.toUpperCase();
      const explicitClassId = readValue(row, headerMap.classId);
      if (explicitClassId) return explicitClassId;
      return '';
    };
    const map = {};
    lines.slice(1).forEach((line) => {
      const row = parseCsvLine(line);
      const rowUid = readValue(row, headerMap.uid);
      const classId = buildClassId(row);
      const playerName = readValue(row, headerMap.name);
      if (!rowUid || !classId || !playerName) return;
      map[rowUid] = {
        classId,
        playerName,
        attendanceNo: readValue(row, headerMap.attendance)
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
      const map = parseStudentCsvMap(text);
      cacheStudents(map);
      cachedStudentMap = map;
      return map;
    } catch {
      const fallbackMap = readStudentCache();
      cachedStudentMap = fallbackMap;
      return fallbackMap;
    }
  }
  function getDisplayNameFromSnapshotRecord(record, fallback = 'クラスメイト') {
    const uid = String(record && record.uid || '').trim();
    if (uid) {
      const student = getCachedStudentMap()[uid];
      if (student && student.playerName) {
        return String(student.playerName);
      }
    }
    const fromRecord = String(record && record.playerName || '').trim();
    if (fromRecord) {
      return fromRecord;
    }
    return uid || fallback;
  }
  function buildIdentityFromStudentMap(uid, map, note) {
    const safeUid = String(uid || '').trim();
    const source = map && map[safeUid];
    if (!safeUid || !source) return null;
    return {
      uid: safeUid,
      classId: source.classId,
      classRow: deriveClassRow(source.classId),
      attendanceNo: normalizeAttendanceNo(source.attendanceNo, safeUid),
      playerName: source.playerName,
      playerId: `uid:${safeUid}`,
      note
    };
  }
  async function resolveIdentityByUid(uid, options = {}) {
    const targetUid = String(uid || '').trim();
    const strict = Boolean(options.strict);
    if (!targetUid) {
      return null;
    }
    const map = await loadStudentMap();
    const resolved = buildIdentityFromStudentMap(
      targetUid,
      map,
      `uid=${targetUid} を student.csv から読み込みました。`
    );
    if (resolved) {
      return resolved;
    }
    if (strict) {
      return null;
    }
    return {
      uid: targetUid,
      classId: 'test',
      classRow: deriveClassRow('test'),
      attendanceNo: normalizeAttendanceNo('', targetUid),
      playerName: 'test',
      playerId: `uid:${targetUid}`,
      note: `uid=${targetUid} は student.csv で見つからなかったため test を使用します。`
    };
  }
  async function resolveIdentity() {
    const uid = new URL(location.href).searchParams.get('uid') || '';
    if (!uid) {
      return {
        uid: '',
        classId: 'test',
        classRow: deriveClassRow('test'),
        attendanceNo: 0,
        playerName: 'test',
        playerId: `test:${Date.now()}`,
        note: 'uid 未指定のため test を使用します。'
      };
    }
    const resolved = await resolveIdentityByUid(uid, { strict: false });
    if (resolved) {
      return resolved;
    }
    return {
      uid,
      classId: 'test',
      classRow: deriveClassRow('test'),
      attendanceNo: normalizeAttendanceNo('', uid),
      playerName: 'test',
      playerId: `uid:${uid}`,
      note: `uid=${uid} を解決できなかったため test を使用します。`
    };
  }
  async function handleOutsideAuthIdSubmit(event) {
    event.preventDefault();
    if (!isOutsideAuthRequired()) {
      showReadyLanding('ready');
      return;
    }
    const uid = String(els.outsideAuthUidInput.value || '').trim();
    if (!uid) {
      setOutsideAuthHint(els.outsideAuthIdHint, 'IDを入力してください。');
      return;
    }
    const token = invalidateOutsideAuthRequests();
    setOutsideAuthHint(els.outsideAuthIdHint, 'IDを確認しています。');
    try {
      const identity = await resolveIdentityByUid(uid, { strict: true });
      if (!isOutsideAuthRequestActive(token)) {
        return;
      }
      if (!identity) {
        setOutsideAuthHint(els.outsideAuthIdHint, 'IDが見つかりません。確認してください。');
        return;
      }
      const saltResponse = await fetchAuthSaltFromGas(uid);
      if (!isOutsideAuthRequestActive(token)) {
        return;
      }
      if (!saltResponse || saltResponse.ok !== true || saltResponse.configured !== true || !saltResponse.salt) {
        setOutsideAuthHint(els.outsideAuthIdHint, '校外アクセス用パスワードが未設定です。校内で設定してください。');
        return;
      }
      state.outsideAuth.pendingUid = uid;
      state.outsideAuth.pendingSalt = String(saltResponse.salt || '');
      state.outsideAuth.pendingIdentity = identity;
      updateIdentity();
      showOutsideAuthStep('password', 'パスワードを入力してください。');
    } catch {
      if (!isOutsideAuthRequestActive(token)) {
        return;
      }
      setOutsideAuthHint(els.outsideAuthIdHint, '認証情報の取得に失敗しました。時間をおいて再度お試しください。');
    }
  }
  async function handleOutsideAuthPasswordSubmit(event) {
    event.preventDefault();
    const uid = String(state.outsideAuth.pendingUid || '').trim();
    const salt = String(state.outsideAuth.pendingSalt || '').trim();
    const identity = state.outsideAuth.pendingIdentity;
    const password = String(els.outsideAuthPasswordInput.value || '');
    if (!uid || !salt || !identity) {
      showOutsideAuthStep('id', '先にIDを入力してください。');
      return;
    }
    if (!password) {
      setOutsideAuthHint(els.outsideAuthPasswordHint, 'パスワードを入力してください。');
      return;
    }
    const token = invalidateOutsideAuthRequests();
    setOutsideAuthHint(els.outsideAuthPasswordHint, 'ログインしています。');
    try {
      const login = await loginOutsideOnGas(uid, salt, password);
      if (!isOutsideAuthRequestActive(token)) {
        return;
      }
      if (!login || login.ok !== true || !login.sessionId) {
        setOutsideAuthHint(els.outsideAuthPasswordHint, 'ログインに失敗しました。IDまたはパスワードを確認してください。');
        return;
      }
      applyOutsideAuthSession(uid, String(login.sessionId || ''));
      state.player = identity;
      savePlayer();
      resetOutsideAuthState();
      updateIdentity();
      setNotice('校外オンラインにログインしました。スペースキーで開始できます。');
      showReadyLanding('ready');
    } catch {
      if (!isOutsideAuthRequestActive(token)) {
        return;
      }
      setOutsideAuthHint(els.outsideAuthPasswordHint, 'ログイン通信に失敗しました。再度お試しください。');
    }
  }
  async function handleResultOutsidePasswordSet() {
    if (!state.serverAvailable || !state.player.uid) return;
    const password = String(els.resultOutsidePasswordInput.value || '').trim();
    if (!password) {
      els.resultOutsidePasswordHint.textContent = 'パスワードを入力してください。';
      return;
    }
    els.resultOutsidePasswordHint.textContent = '設定しています。';
    if (els.readyOutsidePasswordHint && shouldShowReadyOutsidePasswordPanel()) {
      els.readyOutsidePasswordHint.textContent = '設定しています。';
    }
    try {
      const response = await setOutsidePasswordOnGas(state.player.uid, password);
      if (!response || response.ok !== true) {
        els.resultOutsidePasswordHint.textContent = '設定に失敗しました。再度お試しください。';
        if (els.readyOutsidePasswordHint && shouldShowReadyOutsidePasswordPanel()) {
          els.readyOutsidePasswordHint.textContent = '設定に失敗しました。再度お試しください。';
        }
        return;
      }
      setResultOutsidePasswordPanelConfigured(true, '設定しました。');
      if (shouldShowReadyOutsidePasswordPanel()) {
        setReadyOutsidePasswordPanelConfigured(true, '設定しました。');
      }
    } catch {
      els.resultOutsidePasswordHint.textContent = '設定に失敗しました。再度お試しください。';
      if (els.readyOutsidePasswordHint && shouldShowReadyOutsidePasswordPanel()) {
        els.readyOutsidePasswordHint.textContent = '設定に失敗しました。再度お試しください。';
      }
    }
  }
  async function handleResultOutsidePasswordReset() {
    if (!state.serverAvailable || !state.player.uid) return;
    els.resultOutsidePasswordHint.textContent = 'リセットしています。';
    if (els.readyOutsidePasswordHint && shouldShowReadyOutsidePasswordPanel()) {
      els.readyOutsidePasswordHint.textContent = 'リセットしています。';
    }
    try {
      const response = await resetOutsidePasswordOnGas(state.player.uid);
      if (!response || response.ok !== true) {
        els.resultOutsidePasswordHint.textContent = 'リセットに失敗しました。';
        if (els.readyOutsidePasswordHint && shouldShowReadyOutsidePasswordPanel()) {
          els.readyOutsidePasswordHint.textContent = 'リセットに失敗しました。';
        }
        return;
      }
      setResultOutsidePasswordPanelConfigured(false, 'パスワードを再設定してください。');
      if (shouldShowReadyOutsidePasswordPanel()) {
        setReadyOutsidePasswordPanelConfigured(false, 'パスワードを再設定してください。');
      }
    } catch {
      els.resultOutsidePasswordHint.textContent = 'リセットに失敗しました。';
      if (els.readyOutsidePasswordHint && shouldShowReadyOutsidePasswordPanel()) {
        els.readyOutsidePasswordHint.textContent = 'リセットに失敗しました。';
      }
    }
  }
  async function handleReadyOutsidePasswordSet() {
    if (!state.serverAvailable || !state.player.uid || !shouldShowReadyOutsidePasswordPanel()) return;
    const password = String(els.readyOutsidePasswordInput.value || '').trim();
    if (!password) {
      els.readyOutsidePasswordHint.textContent = 'パスワードを入力してください。';
      return;
    }
    els.readyOutsidePasswordHint.textContent = '設定しています。';
    try {
      const response = await setOutsidePasswordOnGas(state.player.uid, password);
      if (!response || response.ok !== true) {
        els.readyOutsidePasswordHint.textContent = '設定に失敗しました。再度お試しください。';
        return;
      }
      setReadyOutsidePasswordPanelConfigured(true, '設定しました。');
    } catch {
      els.readyOutsidePasswordHint.textContent = '設定に失敗しました。再度お試しください。';
    }
  }
  async function handleReadyOutsidePasswordReset() {
    if (!state.serverAvailable || !state.player.uid || !shouldShowReadyOutsidePasswordPanel()) return;
    els.readyOutsidePasswordHint.textContent = 'リセットしています。';
    try {
      const response = await resetOutsidePasswordOnGas(state.player.uid);
      if (!response || response.ok !== true) {
        els.readyOutsidePasswordHint.textContent = 'リセットに失敗しました。';
        return;
      }
      setReadyOutsidePasswordPanelConfigured(false, 'パスワードを再設定してください。');
    } catch {
      els.readyOutsidePasswordHint.textContent = 'リセットに失敗しました。';
    }
  }
  function onKeydown(event) {
      if (state.phase !== 'playing') return;
      if (state.ready.active) {
        const isSpaceStart = event.code === 'Space' || event.key === ' ' || event.key === 'Spacebar';
        if (isSpaceStart && state.ready.mode === 'ready-loading') {
          event.preventDefault();
          setNotice(isLocalTestMode()
            ? 'クラス記録を読み込んでいます。読み込み後にローカルテストを開始できます。'
            : 'クラス記録を読み込んでいます。読み込み後にソロプレイを開始できます。');
          return;
        }
        if (isSpaceStart && state.ready.mode === 'ready') {
          event.preventDefault();
          if (!state.game) {
            startLocalPractice();
          }
          beginReadyCountdown();
        }
        return;
    }
    if (!state.game) return;
    if (!state.game.localOnly && now() < state.game.startAt) {
      event.preventDefault();
      return;
    }
    if (event.key === 'Backspace') {
      event.preventDefault();
      if (state.inputLock.active) unlockMissLock(true, true, true);
      return;
    }
    if (state.inputLock.active) {
      event.preventDefault();
      return;
    }
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    const key = window.RomajiCore.normalizeInputKey(event.key); if (!key) return;
    event.preventDefault();
    const promptBefore = getCurrentPrompt();
    const trackedStageKey = getTrackedStageMetricKey(promptBefore);
    const typedBefore = state.game.session.getTyped();
    const displayGuideBefore = promptBefore ? getDisplayGuide(promptBefore.reading, typedBefore) : null;
    const readingBefore = promptBefore ? buildReadingSegments(promptBefore.reading, state.game.session.getTyped()) : null;
    const result = state.game.session.inputKey(key); flashKey(key, !result.accepted); state.game.stats.inputCount += 1;
    if (trackedStageKey === 'englishWord') {
      ensureTrackedStageMetrics().englishWord.inputCount += 1;
    }
    if (result.accepted) {
      state.game.stats.correctCount += 1;
      const typedDelta = state.game.session.getTyped().slice(typedBefore.length);
      if (typedDelta) flashPromptSegment('romaji', typedDelta);
      if (promptBefore && readingBefore) {
        const readingAfter = buildReadingSegments(promptBefore.reading, state.game.session.getTyped());
        if (readingAfter.completedCount > readingBefore.completedCount) {
          const readingDelta = readingAfter.typed.slice(readingBefore.typed.length);
          const comboGain = countKanaChars(readingDelta);
          state.game.stats.combo += comboGain;
          state.game.stats.maxCombo = Math.max(state.game.stats.maxCombo, state.game.stats.combo);
          if (trackedStageKey === 'japaneseText' && readingDelta) {
            ensureTrackedStageMetrics().japaneseText.charCount += countKanaChars(readingDelta);
          }
          if (displayGuideBefore && displayGuideBefore.currentToken) {
            const actualOption = `${displayGuideBefore.currentTyped}${typedDelta}`;
            if (displayGuideBefore.currentOptions.includes(actualOption)) {
              rememberTokenPreference(displayGuideBefore.currentToken, actualOption);
            }
          }
          if (readingDelta) flashPromptSegment('reading', readingDelta);
        }
      }
    }
    else {
      state.game.stats.missCount += 1;
      let missGuide = displayGuideBefore;
      if (state.settings.retryByKanaOnMiss && promptBefore && displayGuideBefore) {
        missGuide = rewindCurrentKanaOnMiss(promptBefore, typedBefore, displayGuideBefore) || displayGuideBefore;
      }
      lockInputOnMiss(
        readingBefore && readingBefore.current ? readingBefore.current : (promptBefore ? promptBefore.reading.charAt(0) : '?'),
        missGuide ? missGuide.currentOptions : [],
        missGuide ? missGuide.currentTyped : '',
        key,
        missGuide && missGuide.nextKey ? [missGuide.nextKey] : []
      );
    }
    if (result.accepted && result.completed) {
      spawnPromptClearBurst();
      state.game.stats.completedPrompts += 1;
      const completedStageKey = getCompletedStageCountKey(getCurrentPrompt());
      if (completedStageKey) {
        state.game.stats.completedStageCounts = normalizeCompletedStageCounts(state.game.stats.completedStageCounts);
        state.game.stats.completedStageCounts[completedStageKey] += 1;
      }
      if (state.game.clearBurstTimer) clearTimeout(state.game.clearBurstTimer);
      const previousStage = Number(state.game.unlockedStage || 0);
      const nextStage = Math.max(previousStage, getUnlockedPromptStage(state.game.stats.maxCombo));
      state.game.unlockedStage = nextStage;
      if (nextStage > previousStage) {
        for (let stageIndex = previousStage; stageIndex < nextStage; stageIndex += 1) {
          const threshold = STAGE_COMBO_THRESHOLDS[stageIndex];
          if (threshold) emitStageAchievementMessage(threshold);
        }
      }
      emitHighComboMilestones(state.game.stats.maxCombo);
      state.game.promptIndex += 1;
      clearPromptFlash();
      const nextPrepared = createPromptSession(
        pickPromptForGame(state.game.unlockedStage, state.game.promptIndex, state.game.promptSeed)
      );
      state.game.currentPrompt = nextPrepared.prompt;
      state.game.session = nextPrepared.session;
      syncTrackedStageMetrics();
      state.game.clearBurstTimer = setTimeout(() => {
        if (state.game) state.game.clearBurstTimer = null;
      }, 720);
    }
    updateGuide();
    sendProgress();
  }
  function changeIdentity() {
    send({ t: 'leave' });
    unlockMissLock(false, false, false);
    stopLocalChatSimulation();
    clearChatMessages();
    resetResultPanel();
    setPhase('join');
    setNotice('参加情報を変更できます。');
  }
  function savePlayer() { localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(state.player)); }
  async function init() {
    if (!window.RomajiCore || !window.PromptCatalog) throw new Error('必要なクライアントライブラリを読み込めませんでした');
    resetConnectionRuntimeForReentry();
    const urlUid = String(new URL(location.href).searchParams.get('uid') || '').trim();
    const storedOutsideSession = readOutsideSession();
    if (
      urlUid
      && storedOutsideSession
      && storedOutsideSession.uid
      && storedOutsideSession.uid !== urlUid
    ) {
      clearOutsideSession();
    }
    resetOutsideAuthState();
    buildKeyboard();
    startDashSpriteLoop();
    loadDashSpriteAssets();
    state.romajiPrefs = readRomajiPrefs();
    state.settings = readReadySettings();
    syncReadySettingsUi();
    applyDurationOverride();
    state.player = await resolveIdentity();
    savePlayer(); updateIdentity();
    els.joinHint.textContent = state.player.note; els.waitingModeNote.textContent = state.player.note;
    register();
    renderChatMessages();
    showReadyLanding(isLocalTestMode() ? 'ready' : (PAGE_IS_HTTP ? 'connecting' : 'ready'));
    connectWs();
    if (!isLocalTestMode()) {
      els.waitingMessage.textContent = 'サーバー接続を確認しています。';
      els.waitingModeNote.textContent = `2秒で接続できなければ${isLocalTestMode() ? 'ローカルテスト' : 'ソロプレイ'}モードへ切り替えます。`;
    }
  }
  function register() {
    els.joinForm.addEventListener('submit', (event) => {
      event.preventDefault();
      state.player.playerName = els.playerNameInput.value.trim() || 'test';
      state.player.classId = els.classIdInput.value.trim() || 'test';
      state.player.classRow = deriveClassRow(state.player.classId);
      state.player.attendanceNo = normalizeAttendanceNo(state.player.attendanceNo, state.player.uid);
      if (!state.player.playerId) state.player.playerId = `test:${Date.now()}`;
      savePlayer(); updateIdentity();
      if (!(state.serverAvailable && send({
        t: 'join',
        classId: state.player.classId,
        classRow: state.player.classRow,
        attendanceNo: state.player.attendanceNo,
        uid: state.player.uid,
        playerName: state.player.playerName,
        playerId: state.player.playerId
      }))) {
        connectWs();
      }
      if (!state.game) {
        if (isServerOnlineMode()) {
          showReadyLanding('server-wait');
        } else if (state.serverAvailable) {
          showReadyLanding('ready');
        } else {
          showReadyLanding(PAGE_IS_HTTP ? 'connecting' : 'ready');
        }
      }
    });
    els.clearPlayerBtn.addEventListener('click', () => { els.playerNameInput.value = ''; els.classIdInput.value = ''; });
    els.changeIdentityBtn.addEventListener('click', changeIdentity);
    els.changeIdentityResultBtn.addEventListener('click', changeIdentity);
    els.outsideAuthStoredStartBtn.addEventListener('click', () => {
      resumeStoredOutsideSession();
    });
    els.outsideAuthStoredResetBtn.addEventListener('click', () => {
      invalidateOutsideAuthRequests();
      clearOutsideAuthSession();
      resetOutsideAuthState();
      setStoredOutsideSessionDisplay(null);
      setNotice('保存済みセッションを削除しました。別のIDでログインできます。');
      showOutsideAuthStep('id', '保存済みセッションを削除しました。IDを入力してください。');
    });
    els.outsideAuthIdForm.addEventListener('submit', handleOutsideAuthIdSubmit);
    els.outsideAuthPasswordForm.addEventListener('submit', handleOutsideAuthPasswordSubmit);
    els.outsideAuthBackBtn.addEventListener('click', () => {
      invalidateOutsideAuthRequests();
      showOutsideAuthStep('id', 'IDを入力してください。');
    });
    els.resultOutsidePasswordSetBtn.addEventListener('click', () => {
      handleResultOutsidePasswordSet();
    });
    els.resultOutsidePasswordResetBtn.addEventListener('click', () => {
      handleResultOutsidePasswordReset();
    });
    els.readyOutsidePasswordSetBtn.addEventListener('click', () => {
      handleReadyOutsidePasswordSet();
    });
    els.readyOutsidePasswordResetBtn.addEventListener('click', () => {
      handleReadyOutsidePasswordReset();
    });
    els.readyLogoutBtn.addEventListener('click', () => {
      logoutOutsideSession();
    });
    els.playAgainBtn.addEventListener('click', () => {
      unlockMissLock(false, false, false);
      stopLocalChatSimulation();
      clearChatMessages();
      resetResultPanel();
      state.game = null;
      const onlineMode = isServerOnlineMode();
      els.offlineStartBtn.classList.toggle('hidden', onlineMode);
      showReadyLanding(onlineMode ? 'server-wait' : 'ready');
    });
    els.offlineStartBtn.addEventListener('click', startLocalPractice);
    els.retryByKanaOption.addEventListener('change', (event) => {
      state.settings.retryByKanaOnMiss = Boolean(event.target.checked);
      saveReadySettings();
      syncReadySettingsUi();
    });
    document.addEventListener('keydown', onKeydown);
    window.addEventListener('resize', () => positionFingerDots());
    window.addEventListener('pageshow', (event) => {
      if (!event.persisted) return;
      resetConnectionRuntimeForReentry();
      updateIdentity();
      if (!state.game) {
        showReadyLanding(isLocalTestMode() ? 'ready' : (PAGE_IS_HTTP ? 'connecting' : 'ready'));
        connectWs();
      }
    });
    window.addEventListener('beforeunload', () => send({ t: 'leave' }));
  }

  init().catch((error) => {
    setBadge('エラー', 'disconnected');
    setNotice(`初期化に失敗しました: ${error.message}`);
  });
})();
