(function () {
  "use strict";

  const VIEW_SIZE = 10;
  const PREFILLED_RATIO = 0.1;
  const STORAGE_PREFIX = "crosswordProgress:";
  const HELP_STORAGE_KEY = "crosswordMoveHelpSeen";
  const CONFIG = window.CROSSWORD_CONFIG || {};

  const els = {
    loginScreen: document.getElementById("loginScreen"),
    gameScreen: document.getElementById("gameScreen"),
    authStatus: document.getElementById("authStatus"),
    authIdentity: document.getElementById("authIdentity"),
    authClassLine: document.getElementById("authClassLine"),
    authNameLine: document.getElementById("authNameLine"),
    authError: document.getElementById("authError"),
    authLoginButton: document.getElementById("authLoginButton"),
    authStartButton: document.getElementById("authStartButton"),
    authLogoutButton: document.getElementById("authLogoutButton"),
    playerBadge: document.getElementById("playerBadge"),
    scoreBadge: document.getElementById("scoreBadge"),
    crosswordGrid: document.getElementById("crosswordGrid"),
    hintBox: document.getElementById("hintBox"),
    cardGrid: document.getElementById("cardGrid"),
    rankingList: document.getElementById("rankingList"),
    moveHelp: document.getElementById("moveHelp"),
    moveHelpClose: document.getElementById("moveHelpClose"),
    termOverlay: document.getElementById("termOverlay"),
    termTitle: document.getElementById("termTitle"),
    termExplanation: document.getElementById("termExplanation"),
    termCloseButton: document.getElementById("termCloseButton"),
    confettiLayer: document.getElementById("confettiLayer")
  };

  const state = {
    terms: [],
    termsById: new Map(),
    students: [],
    studentsByUid: new Map(),
    board: new Map(),
    startCells: new Map(),
    prefilledCells: new Set(),
    bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    cursor: { x: 0, y: 0 },
    viewport: { x: 0, y: 0 },
    selectedStudent: null,
    currentStudent: null,
    cellPlacements: new Map(),
    cardPlacements: new Map(),
    cardSlots: [],
    cardSlotMemory: new Map(),
    solvedWords: new Set(),
    remoteProgress: new Map(),
    previousCounts: new Map(),
    lastSolvedAt: new Map(),
    displayNameByUid: new Map(),
    authUser: null,
    sharedStateInitialized: false,
    overlayQueue: [],
    overlayOpen: false,
    cursorGuideVisible: false,
    pollTimer: 0
  };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    bindEvents();
    try {
      const [termRows, studentRows] = await Promise.all([
        loadCsv("crossword_terms.csv"),
        loadCsv("student.csv")
      ]);
      state.students = prepareStudents(studentRows);
      state.studentsByUid = new Map(state.students.map((student) => [student.uid, student]));
      state.terms = prepareTerms(termRows);
      state.termsById = new Map(state.terms.map((term) => [term.id, term]));
      buildBoard();
    } catch (error) {
      showAuthError("データを読み込めません。");
      console.error(error);
      return;
    }

    await runAuthFlow();
  }

  function bindEvents() {
    els.authLoginButton.addEventListener("click", handleLoginClick);
    els.authStartButton.addEventListener("click", startGame);
    els.authLogoutButton.addEventListener("click", handleLogoutClick);
    els.moveHelpClose.addEventListener("click", closeMoveHelp);
    els.termCloseButton.addEventListener("click", closeTermOverlay);
    els.crosswordGrid.addEventListener("click", handleBoardClick);
    document.addEventListener("keydown", handleKeydown);
    window.addEventListener("resize", () => {
      if (state.currentStudent) {
        renderCards();
      }
    });
  }

  async function runAuthFlow() {
    if (!window.MidoriAuth) {
      showAuthError("認証モジュールを読み込めませんでした。ページを再読み込みしてください。");
      return;
    }

    setAuthStatus("ログインを確認しています…");
    try {
      const result = await window.MidoriAuth.start({
        appId: "crossword",
        appName: "クロスワード",
        authRequired: false,
        showLoginButton: false
      });
      applyAuthResult(result);
    } catch (error) {
      showAuthError(error && error.userMessage ? error.userMessage : "認証エラーが発生しました。");
    }
  }

  function applyAuthResult(result) {
    if (result && result.mode === "user" && result.user) {
      const student = resolveAuthStudent(result.user);
      if (!student) {
        showLoginPrompt("ログイン中のユーザは1年生の名簿にありません。別のユーザでログインしてください。");
        return;
      }
      state.selectedStudent = student;
      state.authUser = result.user;
      const displayName = String(result.user.displayName || "").trim();
      if (displayName) {
        state.displayNameByUid.set(student.uid, displayName);
      }
      showIdentity(student);
      return;
    }
    state.authUser = null;
    showLoginPrompt();
  }

  function resolveAuthStudent(user) {
    const uid = String(user.userId || "").trim();
    if (!uid) {
      return null;
    }
    return state.studentsByUid.get(uid) || null;
  }

  function showIdentity(student) {
    els.authStatus.hidden = true;
    els.authError.hidden = true;
    els.authIdentity.hidden = false;
    els.authClassLine.textContent = `${student.className}組 ${student.no}番`;
    els.authNameLine.textContent = student.name;
    els.authLoginButton.hidden = true;
    els.authStartButton.hidden = false;
    els.authLogoutButton.hidden = false;
    els.authStartButton.focus();
  }

  function showLoginPrompt(message) {
    state.selectedStudent = null;
    els.authIdentity.hidden = true;
    els.authError.hidden = !message;
    if (message) {
      els.authError.textContent = message;
    }
    setAuthStatus("ログインしてください。");
    els.authLoginButton.hidden = false;
    els.authStartButton.hidden = true;
    els.authLogoutButton.hidden = true;
    els.authLoginButton.focus();
  }

  function setAuthStatus(text) {
    els.authStatus.textContent = text;
    els.authStatus.hidden = false;
  }

  function showAuthError(message) {
    els.authIdentity.hidden = true;
    els.authStatus.hidden = true;
    els.authLoginButton.hidden = true;
    els.authStartButton.hidden = true;
    els.authLogoutButton.hidden = true;
    els.authError.hidden = false;
    els.authError.textContent = message;
  }

  async function handleLoginClick() {
    await promptLoginDialog();
  }

  async function handleLogoutClick() {
    state.selectedStudent = null;
    hideAuthPanelContent();
    clearAuthIdentityDisplay();
    if (window.MidoriAuth && typeof window.MidoriAuth.logout === "function") {
      try {
        await window.MidoriAuth.logout();
      } catch (error) {
        /* ローカル状態はクリア済み。 */
      }
    }
    await promptLoginDialog();
  }

  function hideAuthPanelContent() {
    els.authStatus.hidden = true;
    els.authIdentity.hidden = true;
    els.authError.hidden = true;
    els.authLoginButton.hidden = true;
    els.authStartButton.hidden = true;
    els.authLogoutButton.hidden = true;
  }

  function clearAuthIdentityDisplay() {
    els.authClassLine.textContent = "";
    els.authNameLine.textContent = "";
  }

  async function promptLoginDialog() {
    if (!window.MidoriAuth) {
      showAuthError("認証モジュールを読み込めませんでした。");
      return;
    }
    try {
      const result = await window.MidoriAuth.showLoginDialog({
        appName: "クロスワード",
        required: true
      });
      applyAuthResult(result);
    } catch (error) {
      if (error && error.reason === "login_cancelled") {
        showLoginPrompt();
        return;
      }
      showLoginPrompt(error && error.userMessage ? error.userMessage : "ログインできませんでした。");
    }
  }

  async function loadCsv(path) {
    const embedded = window.CROSSWORD_EMBEDDED_CSV?.[path];

    try {
      const response = await fetch(`${path}?v=${Date.now()}`, { cache: "no-store" });
      if (response.ok) {
        return parseCsv(await response.text());
      }
      if (embedded != null) {
        console.warn(`${path}: ${response.status}; using embedded data`);
        return parseCsv(embedded);
      }
      throw new Error(`${path}: ${response.status}`);
    } catch (error) {
      if (embedded != null) {
        console.warn(`${path}: fetch failed; using embedded data`, error);
        return parseCsv(embedded);
      }
      throw error;
    }
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let value = "";
    let inQuotes = false;
    const source = text.replace(/^\uFEFF/, "");

    for (let i = 0; i < source.length; i += 1) {
      const char = source[i];
      const next = source[i + 1];

      if (inQuotes) {
        if (char === "\"" && next === "\"") {
          value += "\"";
          i += 1;
        } else if (char === "\"") {
          inQuotes = false;
        } else {
          value += char;
        }
        continue;
      }

      if (char === "\"") {
        inQuotes = true;
      } else if (char === ",") {
        row.push(value);
        value = "";
      } else if (char === "\n") {
        row.push(value.replace(/\r$/, ""));
        rows.push(row);
        row = [];
        value = "";
      } else {
        value += char;
      }
    }

    if (value.length > 0 || row.length > 0) {
      row.push(value.replace(/\r$/, ""));
      rows.push(row);
    }

    const headers = rows.shift() || [];
    return rows
      .filter((items) => items.some((item) => item.trim() !== ""))
      .map((items) => {
        const record = {};
        headers.forEach((header, index) => {
          record[header] = items[index] || "";
        });
        return record;
      });
  }

  function prepareStudents(rows) {
    return rows
      .filter((row) => row.year.trim() === "1")
      .map((row) => ({
        uid: row.id.trim(),
        year: row.year.trim(),
        className: row.class.trim().toUpperCase(),
        no: String(Number(row.no)),
        name: row.name.trim(),
        kana: row.kana.trim()
      }))
      .filter((student) => student.uid && student.className && student.no !== "NaN")
      .sort((a, b) => (
        Number(a.year) - Number(b.year)
        || a.className.localeCompare(b.className)
        || Number(a.no) - Number(b.no)
      ));
  }

  function prepareTerms(rows) {
    const active = rows
      .map((row, index) => {
        const x = Number(row.x);
        const y = Number(row.y);
        const direction = row["タテ/ヨコ"].trim();
        const rawTerm = row["用語(カタカナ)"].trim();
        const term = normalizeAnswerText(rawTerm);
        if (!term || !["タテ", "ヨコ"].includes(direction) || x < 0 || y < 0) {
          return null;
        }
        return {
          csvIndex: index,
          number: row["番号"].trim(),
          kanji: row["用語(漢字)"].trim(),
          term,
          rawTerm,
          x,
          y,
          direction,
          hint: row["ヒント文"].trim(),
          explanation: row["解説文"].trim(),
          chars: Array.from(term),
          cells: []
        };
      })
      .filter(Boolean);

    const numberCounts = active.reduce((counts, term) => {
      counts.set(term.number, (counts.get(term.number) || 0) + 1);
      return counts;
    }, new Map());

    return active.map((term) => {
      const duplicated = numberCounts.get(term.number) > 1;
      const directionCode = term.direction === "タテ" ? "V" : "H";
      const id = duplicated ? `${term.number}_${directionCode}_${term.x}_${term.y}` : term.number;
      return { ...term, id };
    });
  }

  function buildBoard() {
    const xs = [];
    const ys = [];

    state.terms.forEach((term) => {
      const startKey = keyOf(term.x, term.y);
      if (!state.startCells.has(startKey)) {
        state.startCells.set(startKey, []);
      }
      state.startCells.get(startKey).push(term);

      term.cells = term.chars.map((char, index) => {
        const x = term.direction === "ヨコ" ? term.x + index : term.x;
        const y = term.direction === "タテ" ? term.y + index : term.y;
        const key = keyOf(x, y);
        xs.push(x);
        ys.push(y);

        if (!state.board.has(key)) {
          state.board.set(key, { x, y, answer: char, wordIds: new Set() });
        }
        const cell = state.board.get(key);
        cell.wordIds.add(term.id);
        return { x, y, key, char };
      });
    });

    state.bounds = {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys)
    };

    const first = state.terms[0] || { x: 0, y: 0 };
    state.cursor = { x: first.x, y: first.y };
    initializePrefilledCells();
    updateViewport();
  }

  function initializePrefilledCells() {
    state.prefilledCells.clear();
    const cells = [...state.board.values()];
    const targetCount = Math.ceil(cells.length * PREFILLED_RATIO);

    cells.forEach((cell) => {
      if (cell.answer === "ー") {
        state.prefilledCells.add(keyOf(cell.x, cell.y));
      }
    });

    cells
      .filter((cell) => !state.prefilledCells.has(keyOf(cell.x, cell.y)))
      .sort((a, b) => stableCellScore(a) - stableCellScore(b))
      .slice(0, Math.max(0, targetCount - state.prefilledCells.size))
      .forEach((cell) => state.prefilledCells.add(keyOf(cell.x, cell.y)));
  }

  function stableCellScore(cell) {
    let hash = 2166136261;
    const source = `${cell.x},${cell.y},${cell.answer}`;
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function startGame() {
    if (!state.selectedStudent) {
      return;
    }

    state.currentStudent = state.selectedStudent;
    state.cursorGuideVisible = true;
    loadLocalProgress();
    state.previousCounts.set(state.currentStudent.uid, state.solvedWords.size);
    els.loginScreen.hidden = true;
    els.gameScreen.hidden = false;
    renderAll();
    fetchSharedState();
  }

  function loadLocalProgress() {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${state.currentStudent.uid}`);
    try {
      const ids = JSON.parse(raw || "[]");
      state.solvedWords = new Set(ids.filter((id) => state.termsById.has(id)));
    } catch {
      state.solvedWords = new Set();
    }
  }

  function saveLocalProgress() {
    localStorage.setItem(
      `${STORAGE_PREFIX}${state.currentStudent.uid}`,
      JSON.stringify([...state.solvedWords])
    );
  }

  function showMoveHelpOnce() {
    if (localStorage.getItem(HELP_STORAGE_KEY)) {
      return;
    }
    els.moveHelp.hidden = false;
  }

  function closeMoveHelp() {
    localStorage.setItem(HELP_STORAGE_KEY, "1");
    els.moveHelp.hidden = true;
  }

  function handleKeydown(event) {
    if (!state.currentStudent || !els.termOverlay.hidden || !els.moveHelp.hidden) {
      return;
    }

    const moves = {
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0]
    };
    const move = moves[event.key];
    if (event.key === "Delete") {
      event.preventDefault();
      removePlacementAt(keyOf(state.cursor.x, state.cursor.y));
      return;
    }
    if (!move) {
      return;
    }

    event.preventDefault();
    moveCursor(move[0], move[1]);
  }

  function moveCursor(dx, dy) {
    state.cursor.x = clamp(state.cursor.x + dx, state.bounds.minX, state.bounds.maxX);
    state.cursor.y = clamp(state.cursor.y + dy, state.bounds.minY, state.bounds.maxY);
    state.cursorGuideVisible = false;
    updateViewport();
    renderBoard();
    renderHints();
    renderCards();
  }

  function handleBoardClick(event) {
    const cellNode = event.target.closest(".cell");
    if (!cellNode || !els.crosswordGrid.contains(cellNode)) {
      return;
    }

    const key = cellNode.dataset.key;
    const point = pointFromKey(key);
    if (!point) {
      return;
    }

    const cursorChanged = point.x !== state.cursor.x || point.y !== state.cursor.y;
    state.cursor = point;
    if (cursorChanged) {
      state.cursorGuideVisible = false;
    }
    updateViewport();

    if (isRemovablePlacement(key)) {
      removePlacementAt(key);
      return;
    }

    renderBoard();
    renderHints();
    renderCards();
  }

  function updateViewport() {
    state.viewport.x = viewportStart(state.cursor.x, state.bounds.minX, state.bounds.maxX);
    state.viewport.y = viewportStart(state.cursor.y, state.bounds.minY, state.bounds.maxY);
  }

  function viewportStart(cursorValue, minValue, maxValue) {
    const maxStart = Math.max(minValue, maxValue - VIEW_SIZE + 1);
    return clamp(cursorValue - Math.floor(VIEW_SIZE / 2), minValue, maxStart);
  }

  function renderAll() {
    renderTopBar();
    renderBoard();
    renderHints();
    renderCards();
    renderRanking();
  }

  function renderTopBar() {
    const student = state.currentStudent;
    const count = state.solvedWords.size;
    const rank = calculateRank();

    els.playerBadge.textContent = `${formatClass(student)} ${student.no}番 ${student.name}`;
    els.scoreBadge.innerHTML = "";

    const score = document.createElement("span");
    score.className = "score-count";
    score.textContent = `${count}問`;
    els.scoreBadge.appendChild(score);

    const rankNode = document.createElement("span");
    rankNode.className = "rank-count";
    rankNode.textContent = `${rank}位`;
    els.scoreBadge.appendChild(rankNode);
  }

  function calculateRank() {
    if (!state.currentStudent) {
      return 1;
    }
    const classmates = getClassmates();
    const selfCount = state.solvedWords.size;
    let higher = 0;
    classmates.forEach((student) => {
      if (student.uid === state.currentStudent.uid) {
        return;
      }
      if (getRemoteCount(student.uid) > selfCount) {
        higher += 1;
      }
    });
    return higher + 1;
  }

  function renderBoard() {
    const fragment = document.createDocumentFragment();
    for (let row = 0; row < VIEW_SIZE; row += 1) {
      for (let col = 0; col < VIEW_SIZE; col += 1) {
        const x = state.viewport.x + col;
        const y = state.viewport.y + row;
        const key = keyOf(x, y);
        const cell = state.board.get(key);
        const node = document.createElement("div");
        node.className = "cell";
        node.dataset.key = key;

        if (cell) {
          const solved = isCellSolved(key);
          const prefilled = isCellPrefilled(key);
          const char = getDisplayChar(key);
          node.classList.add("is-open");
          if (char) {
            node.classList.add("has-input");
            node.textContent = char;
          }
          if (solved) {
            node.classList.add("is-solved");
          }
          if (prefilled) {
            node.classList.add("is-prefilled");
          }
          if (isRemovablePlacement(key)) {
            node.classList.add("is-removable");
            node.title = "クリックで戻す";
          }
          if (state.startCells.has(key)) {
            node.classList.add("is-start");
            node.dataset.label = startCellLabel(key);
          }
        }

        if (x === state.cursor.x && y === state.cursor.y) {
          node.classList.add("is-cursor");
        }
        fragment.appendChild(node);
      }
    }
    appendCursorGuide(fragment);
    els.crosswordGrid.replaceChildren(fragment);
  }

  function appendCursorGuide(fragment) {
    if (!state.cursorGuideVisible) {
      return;
    }
    const col = state.cursor.x - state.viewport.x + 1;
    const row = state.cursor.y - state.viewport.y + 1;
    if (col < 1 || col > VIEW_SIZE || row < 1 || row > VIEW_SIZE) {
      return;
    }

    const guide = document.createElement("div");
    guide.className = "cursor-guide";
    guide.style.gridColumn = String(col);
    guide.style.gridRow = String(row);
    guide.innerHTML = [
      '<span class="guide-arrow guide-up">↑</span>',
      '<span class="guide-arrow guide-right">→</span>',
      '<span class="guide-arrow guide-down">↓</span>',
      '<span class="guide-arrow guide-left">←</span>',
      '<span class="guide-text">矢印キーで移動</span>'
    ].join("");
    fragment.appendChild(guide);
  }

  function startCellLabel(key) {
    return state.startCells
      .get(key)
      .map((term) => term.number)
      .filter(Boolean)
      .join("/");
  }

  function renderHints() {
    const startTerms = state.startCells.get(keyOf(state.cursor.x, state.cursor.y)) || [];
    const vertical = startTerms.find((term) => term.direction === "タテ");
    const horizontal = startTerms.find((term) => term.direction === "ヨコ");

    els.hintBox.replaceChildren(
      hintLine("タテ", vertical ? vertical.hint : ""),
      hintLine("ヨコ", horizontal ? horizontal.hint : "")
    );
  }

  function hintLine(label, text) {
    const line = document.createElement("div");
    line.textContent = `${label}：${text}`;
    return line;
  }

  function renderCards() {
    updateCardSize();
    const cards = getVisibleCards();
    const fragment = document.createDocumentFragment();

    cards.forEach((card) => {
      const node = document.createElement("button");
      node.type = "button";
      node.className = "letter-card";

      node.textContent = card.char;
      node.dataset.cardKey = card.cardKey;
      if (card.correct) {
        node.classList.add("is-correct");
        node.disabled = true;
      } else if (card.used) {
        node.classList.add("is-used");
        if (card.movable) {
          node.classList.add("is-movable");
          node.addEventListener("click", () => swapPlacedCardToCursor(card));
        } else {
          node.disabled = true;
        }
      } else {
        node.addEventListener("click", () => placeCard(card, node));
      }
      fragment.appendChild(node);
    });

    els.cardGrid.replaceChildren(fragment);
  }

  function getVisibleCards() {
    const cards = [];
    for (let y = state.viewport.y; y < state.viewport.y + VIEW_SIZE; y += 1) {
      for (let x = state.viewport.x; x < state.viewport.x + VIEW_SIZE; x += 1) {
        const key = keyOf(x, y);
        const cell = state.board.get(key);
        if (!cell) {
          continue;
        }
        if (state.prefilledCells.has(key)) {
          continue;
        }
        cards.push({
          cardKey: key,
          char: cell.answer,
          x,
          y,
          used: state.cardPlacements.has(key),
          correct: isCardCorrect(key),
          movable: isCardMovable(key)
        });
      }
    }

    return reconcileCardSlots(cards);
  }

  function updateCardSize() {
    const pane = els.cardGrid.parentElement;
    if (!pane) {
      return;
    }
    const paneStyles = getComputedStyle(pane);
    const paddingY = parseFloat(paneStyles.paddingTop) + parseFloat(paneStyles.paddingBottom);
    const paddingX = parseFloat(paneStyles.paddingLeft) + parseFloat(paneStyles.paddingRight);
    const availH = Math.max(0, pane.clientHeight - paddingY);
    const availW = Math.max(0, pane.clientWidth - paddingX);
    const gap = parseFloat(getComputedStyle(els.cardGrid).gap) || 7;
    const byHeight = (availH - 5 * gap) / 6;
    const byWidth = (availW - 5 * gap) / 6;
    const size = Math.max(28, Math.floor(Math.min(byHeight, byWidth)));
    els.cardGrid.style.setProperty("--card-size", size + "px");
  }

  function reconcileCardSlots(cards) {
    const cardsByKey = new Map(cards.map((card) => [card.cardKey, card]));
    const visibleKeys = new Set(cardsByKey.keys());
    const usedSlots = new Set();
    const targetSlotCount = cards.length;

    state.cardSlots = state.cardSlots
      .slice(0, targetSlotCount)
      .concat(Array(Math.max(0, targetSlotCount - state.cardSlots.length)).fill(null))
      .map((cardKey) => {
        if (!cardKey || !visibleKeys.has(cardKey) || usedSlots.has(cardKey)) {
          return null;
        }
        usedSlots.add(cardKey);
        return cardKey;
      });

    let missingCards = cards.filter((card) => !usedSlots.has(card.cardKey));
    let emptyIndexes = state.cardSlots
      .map((cardKey, index) => (cardKey ? -1 : index))
      .filter((index) => index >= 0);

    missingCards = missingCards.filter((card) => {
      const rememberedIndex = state.cardSlotMemory.get(card.cardKey);
      if (!emptyIndexes.includes(rememberedIndex)) {
        return true;
      }
      state.cardSlots[rememberedIndex] = card.cardKey;
      usedSlots.add(card.cardKey);
      emptyIndexes = emptyIndexes.filter((index) => index !== rememberedIndex);
      return false;
    });

    emptyIndexes.forEach((slotIndex) => {
      const next = missingCards.shift();
      if (!next) {
        return;
      }
      state.cardSlots[slotIndex] = next.cardKey;
      usedSlots.add(next.cardKey);
    });

    const cursorKey = keyOf(state.cursor.x, state.cursor.y);
    if (visibleKeys.has(cursorKey) && !usedSlots.has(cursorKey)) {
      const replaceIndex = getCardSlotReplacementIndex(cardsByKey);
      if (replaceIndex >= 0) {
        state.cardSlots[replaceIndex] = cursorKey;
      }
    }

    state.cardSlots.forEach((cardKey, index) => {
      if (cardKey) {
        state.cardSlotMemory.set(cardKey, index);
      }
    });

    return state.cardSlots.map((cardKey) => (cardKey ? cardsByKey.get(cardKey) || null : null));
  }

  function getCardSlotReplacementIndex(cardsByKey) {
    for (let index = state.cardSlots.length - 1; index >= 0; index -= 1) {
      const cardKey = state.cardSlots[index];
      if (cardKey && !state.cardPlacements.has(cardKey) && !isCellSolved(cardKey)) {
        return index;
      }
    }

    for (let index = state.cardSlots.length - 1; index >= 0; index -= 1) {
      const cardKey = state.cardSlots[index];
      if (cardKey && !state.cardPlacements.has(cardKey)) {
        return index;
      }
    }

    let bestIndex = -1;
    let bestDistance = -Infinity;
    state.cardSlots.forEach((cardKey, index) => {
      const card = cardsByKey.get(cardKey);
      if (!card) {
        return;
      }
      const distance = Math.abs(card.x - state.cursor.x) + Math.abs(card.y - state.cursor.y);
      if (distance > bestDistance || (distance === bestDistance && index > bestIndex)) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    return bestIndex;
  }

  function placeCard(card, cardNode) {
    const targetKey = keyOf(state.cursor.x, state.cursor.y);
    const targetCell = state.board.get(targetKey);
    if (!targetCell || isCellLocked(targetKey) || state.cardPlacements.has(card.cardKey)) {
      pulseCursor();
      return;
    }

    const previousTargetKey = state.cardPlacements.get(card.cardKey);
    if (previousTargetKey) {
      state.cellPlacements.delete(previousTargetKey);
    }

    const occupying = state.cellPlacements.get(targetKey);
    if (occupying) {
      state.cardPlacements.delete(occupying.cardKey);
    }

    state.cardPlacements.set(card.cardKey, targetKey);
    state.cellPlacements.set(targetKey, { char: card.char, cardKey: card.cardKey });
    animateCardToCursor(cardNode, card.char);
    evaluateWordsAt(targetKey);
    renderBoard();
    renderCards();
  }

  function swapPlacedCardToCursor(card) {
    const fromKey = state.cardPlacements.get(card.cardKey);
    const toKey = keyOf(state.cursor.x, state.cursor.y);
    if (!fromKey || !state.board.has(toKey) || isCellLocked(toKey) || !isKeyInViewport(fromKey)) {
      pulseCursor();
      return;
    }

    const occupying = state.cellPlacements.get(toKey);
    if (occupying && isCellLocked(toKey)) {
      pulseCursor();
      return;
    }

    state.cellPlacements.delete(fromKey);
    state.cardPlacements.set(card.cardKey, toKey);
    state.cellPlacements.set(toKey, { char: card.char, cardKey: card.cardKey });

    if (occupying) {
      state.cardPlacements.set(occupying.cardKey, fromKey);
      state.cellPlacements.set(fromKey, occupying);
      evaluateWordsAt(fromKey);
    }

    evaluateWordsAt(toKey);
    renderBoard();
    renderCards();
  }

  function removePlacementAt(key) {
    if (!isRemovablePlacement(key)) {
      pulseCursor();
      return;
    }

    const placement = state.cellPlacements.get(key);
    state.cellPlacements.delete(key);
    state.cardPlacements.delete(placement.cardKey);
    renderBoard();
    renderHints();
    renderCards();
  }

  function animateCardToCursor(cardNode, char) {
    const targetNode = els.crosswordGrid.querySelector(`.cell[data-key="${keyOf(state.cursor.x, state.cursor.y)}"]`);
    if (!targetNode) {
      return;
    }

    const from = cardNode.getBoundingClientRect();
    const to = targetNode.getBoundingClientRect();
    const clone = document.createElement("div");
    clone.className = "flying-card";
    clone.textContent = char;
    clone.style.left = `${from.left}px`;
    clone.style.top = `${from.top}px`;
    clone.style.width = `${from.width}px`;
    clone.style.height = `${from.height}px`;
    clone.style.fontSize = getComputedStyle(cardNode).fontSize;
    document.body.appendChild(clone);

    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const sx = to.width / Math.max(from.width, 1);
    const sy = to.height / Math.max(from.height, 1);

    clone.animate(
      [
        { transform: "translate3d(0, 0, 0) scale(1)" },
        { transform: `translate3d(${dx}px, ${dy}px, 0) scale(${sx}, ${sy})` }
      ],
      { duration: 360, easing: "cubic-bezier(.2,.75,.25,1)", fill: "forwards" }
    ).finished.finally(() => clone.remove());
  }

  function pulseCursor() {
    const cursorNode = els.crosswordGrid.querySelector(".cell.is-cursor");
    if (!cursorNode) {
      return;
    }
    cursorNode.animate(
      [
        { transform: "scale(1)" },
        { transform: "scale(0.92)" },
        { transform: "scale(1)" }
      ],
      { duration: 160, easing: "ease-out" }
    );
  }

  function evaluateWordsAt(cellKey) {
    const cell = state.board.get(cellKey);
    if (!cell) {
      return;
    }

    const newlySolved = [];
    cell.wordIds.forEach((wordId) => {
      if (state.solvedWords.has(wordId)) {
        return;
      }
      const term = state.termsById.get(wordId);
      if (term && isWordCorrect(term)) {
        newlySolved.push(term);
      }
    });

    newlySolved.forEach(markWordSolved);
  }

  function isWordCorrect(term) {
    return term.cells.every((cell) => normalizeAnswerChar(getDisplayChar(cell.key)) === normalizeAnswerChar(cell.char));
  }

  function markWordSolved(term) {
    state.solvedWords.add(term.id);
    state.lastSolvedAt.set(state.currentStudent.uid, new Date().toISOString());
    saveLocalProgress();
    postCorrect(term.id);
    state.previousCounts.set(state.currentStudent.uid, state.solvedWords.size);
    enqueueOverlay(term);
    renderTopBar();
    renderRanking();
  }

  function getDisplayChar(key) {
    const cell = state.board.get(key);
    if (!cell) {
      return "";
    }
    if (isCellPrefilled(key)) {
      return cell.answer;
    }
    if (isCellSolved(key)) {
      return cell.answer;
    }
    return state.cellPlacements.get(key)?.char || "";
  }

  function isCellPrefilled(key) {
    return state.prefilledCells.has(key);
  }

  function isCellSolved(key) {
    const cell = state.board.get(key);
    if (!cell) {
      return false;
    }
    return [...cell.wordIds].some((wordId) => state.solvedWords.has(wordId));
  }

  function isCellLocked(key) {
    return isCellPrefilled(key) || isCellSolved(key);
  }

  function isRemovablePlacement(key) {
    return state.cellPlacements.has(key) && !isCellLocked(key);
  }

  function isCardCorrect(cardKey) {
    if (isCellLocked(cardKey)) {
      return true;
    }
    const targetKey = state.cardPlacements.get(cardKey);
    return Boolean(targetKey && isCellLocked(targetKey));
  }

  function isCardMovable(cardKey) {
    const targetKey = state.cardPlacements.get(cardKey);
    return Boolean(targetKey && isRemovablePlacement(targetKey) && isKeyInViewport(targetKey));
  }

  function isKeyInViewport(key) {
    const point = pointFromKey(key);
    if (!point) {
      return false;
    }
    return point.x >= state.viewport.x
      && point.x < state.viewport.x + VIEW_SIZE
      && point.y >= state.viewport.y
      && point.y < state.viewport.y + VIEW_SIZE;
  }

  function enqueueOverlay(term) {
    state.overlayQueue.push(term);
    if (!state.overlayOpen) {
      showNextOverlay();
    }
  }

  function showNextOverlay() {
    const term = state.overlayQueue.shift();
    if (!term) {
      state.overlayOpen = false;
      return;
    }
    state.overlayOpen = true;
    launchConfetti();
    window.setTimeout(() => {
      els.termTitle.textContent = term.kanji || term.term;
      els.termExplanation.textContent = term.explanation;
      els.termOverlay.hidden = false;
    }, 760);
  }

  function normalizeAnswerChar(char) {
    const replacements = {
      "ァ": "ア",
      "ィ": "イ",
      "ゥ": "ウ",
      "ェ": "エ",
      "ォ": "オ",
      "ぁ": "ア",
      "ぃ": "イ",
      "ぅ": "ウ",
      "ぇ": "エ",
      "ぉ": "オ"
    };
    const normalized = String(char || "").normalize("NFKC");
    return replacements[normalized] || normalized;
  }

  function normalizeAnswerText(text) {
    return Array.from(String(text || ""))
      .map(normalizeAnswerChar)
      .join("");
  }

  function closeTermOverlay() {
    els.termOverlay.hidden = true;
    state.overlayOpen = false;
    renderAll();
    showNextOverlay();
  }

  function launchConfetti() {
    els.confettiLayer.replaceChildren();
    const colors = ["#1976d2", "#f4b000", "#e64a45", "#21a67a", "#7b61ff", "#ff7f32"];
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < 120; i += 1) {
      const piece = document.createElement("span");
      piece.className = "confetti-piece";
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.background = colors[i % colors.length];
      piece.style.animationDelay = `${Math.random() * 220}ms`;
      piece.style.animationDuration = `${950 + Math.random() * 760}ms`;
      piece.style.setProperty("--drift", `${Math.random() * 220 - 110}px`);
      piece.style.setProperty("--spin", `${Math.random() * 720 - 360}deg`);
      fragment.appendChild(piece);
    }
    els.confettiLayer.appendChild(fragment);
    window.setTimeout(() => els.confettiLayer.replaceChildren(), 2100);
  }

  function renderRanking() {
    if (!els.rankingList || !state.currentStudent) {
      return;
    }

    const selfUid = state.currentStudent.uid;
    const entries = getClassmates().map((student) => {
      const isSelf = student.uid === selfUid;
      const count = isSelf ? state.solvedWords.size : getRemoteCount(student.uid);
      const lastSolvedAt = state.lastSolvedAt.get(student.uid) || "";
      return {
        student,
        isSelf,
        count,
        lastSolvedAt,
        name: rankingDisplayName(student)
      };
    });

    entries.sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      if (a.lastSolvedAt && b.lastSolvedAt) {
        return a.lastSolvedAt.localeCompare(b.lastSolvedAt);
      }
      if (a.lastSolvedAt) {
        return -1;
      }
      if (b.lastSolvedAt) {
        return 1;
      }
      return Number(a.student.no) - Number(b.student.no);
    });

    const fragment = document.createDocumentFragment();
    entries.slice(0, 10).forEach((entry, index) => {
      const item = document.createElement("li");
      item.className = `ranking-item${entry.isSelf ? " is-self" : ""}`;

      const rank = document.createElement("span");
      rank.className = "ranking-rank";
      rank.textContent = `${index + 1}位`;

      const name = document.createElement("span");
      name.className = "ranking-name";
      name.textContent = entry.name;

      const meta = document.createElement("span");
      meta.className = "ranking-meta";

      const count = document.createElement("span");
      count.className = "ranking-count";
      count.textContent = `${entry.count}問`;
      meta.appendChild(count);

      const formatted = formatLastSolvedAt(entry.lastSolvedAt);
      if (formatted) {
        const time = document.createElement("span");
        time.className = "ranking-time";
        time.textContent = formatted;
        meta.appendChild(time);
      }

      item.appendChild(rank);
      item.appendChild(name);
      item.appendChild(meta);
      fragment.appendChild(item);
    });

    els.rankingList.replaceChildren(fragment);
  }

  function rankingDisplayName(student) {
    const displayName = state.displayNameByUid.get(student.uid) || "";
    if (displayName) {
      return `${student.no}:${displayName}`;
    }
    return student.name;
  }

  function formatLastSolvedAt(value) {
    if (!value) {
      return "";
    }
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      return "";
    }
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    return `${m}/${d} ${hh}:${mm}`;
  }

  async function fetchSharedState() {
    if (!state.currentStudent || !getGasUrl()) {
      return;
    }

    try {
      const data = await getSharedState();
      applySharedState(data);
    } catch (error) {
      console.warn("shared state fetch failed", error);
    } finally {
      scheduleNextPoll();
    }
  }

  function scheduleNextPoll() {
    window.clearTimeout(state.pollTimer);
    if (!state.currentStudent || !getGasUrl()) {
      return;
    }
    const min = Number(CONFIG.pollMinMs) || 20000;
    const max = Number(CONFIG.pollMaxMs) || 30000;
    const delay = Math.max(1000, min + Math.random() * Math.max(0, max - min));
    state.pollTimer = window.setTimeout(fetchSharedState, delay);
  }

  async function getSharedState() {
    const url = getGasUrl();
    try {
      return await requestJsonp(url, { action: "state", t: Date.now() });
    } catch {
      const response = await fetch(withParams(url, { action: "state", t: Date.now() }), {
        cache: "no-store"
      });
      if (!response.ok) {
        throw new Error(`state: ${response.status}`);
      }
      return response.json();
    }
  }

  function applySharedState(data) {
    const rows = Array.isArray(data) ? data : data.rows;
    if (!Array.isArray(rows)) {
      return;
    }

    rows.forEach((row) => {
      const uid = String(row.uid || "").trim();
      if (!uid) {
        return;
      }
      const solved = new Set();
      Object.entries(row).forEach(([key, value]) => {
        if (key === "uid") {
          return;
        }
        if (key === "displayName") {
          const dn = String(value || "").trim();
          if (dn) {
            state.displayNameByUid.set(uid, dn);
          }
          return;
        }
        if (key === "lastSolvedAt") {
          const ts = String(value || "").trim();
          if (ts) {
            state.lastSolvedAt.set(uid, ts);
          }
          return;
        }
        if (isTruthyCell(value) && state.termsById.has(key)) {
          solved.add(key);
        }
      });
      state.remoteProgress.set(uid, solved);
      const localSelfCount = uid === state.currentStudent.uid ? state.solvedWords.size : 0;
      state.previousCounts.set(uid, Math.max(solved.size, localSelfCount));
    });

    const remoteSelf = state.remoteProgress.get(state.currentStudent.uid);
    if (remoteSelf) {
      let changed = false;
      remoteSelf.forEach((wordId) => {
        if (!state.solvedWords.has(wordId)) {
          state.solvedWords.add(wordId);
          changed = true;
        }
      });
      if (changed) {
        saveLocalProgress();
      }
    }

    state.sharedStateInitialized = true;
    renderTopBar();
    renderBoard();
    renderCards();
    renderRanking();
  }

  function postCorrect(wordId) {
    const url = getGasUrl();
    if (!url || !state.currentStudent) {
      return;
    }
    const payload = JSON.stringify({
      action: "markCorrect",
      uid: state.currentStudent.uid,
      wordId,
      name: state.currentStudent.name,
      displayName: state.authUser?.displayName || "",
      year: state.currentStudent.year,
      className: state.currentStudent.className,
      no: state.currentStudent.no
    });
    const blob = new Blob([payload], { type: "text/plain;charset=UTF-8" });

    if (navigator.sendBeacon && navigator.sendBeacon(url, blob)) {
      return;
    }

    fetch(url, {
      method: "POST",
      mode: "no-cors",
      body: payload,
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      keepalive: true
    }).catch((error) => console.warn("shared state post failed", error));
  }

  function requestJsonp(url, params) {
    return new Promise((resolve, reject) => {
      const callback = `__crosswordJsonp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const script = document.createElement("script");
      const timer = window.setTimeout(() => {
        cleanup();
        reject(new Error("JSONP timeout"));
      }, 10000);

      function cleanup() {
        window.clearTimeout(timer);
        script.remove();
        delete window[callback];
      }

      window[callback] = (payload) => {
        cleanup();
        resolve(payload);
      };
      script.onerror = () => {
        cleanup();
        reject(new Error("JSONP failed"));
      };
      script.src = withParams(url, { ...params, callback });
      document.head.appendChild(script);
    });
  }

  function getGasUrl() {
    return String(CONFIG.gasUrl || "").trim();
  }

  function withParams(url, params) {
    const parsed = new URL(url, window.location.href);
    Object.entries(params).forEach(([key, value]) => parsed.searchParams.set(key, value));
    return parsed.toString();
  }

  function getClassmates() {
    if (!state.currentStudent) {
      return [];
    }
    return state.students.filter((student) => (
      student.year === state.currentStudent.year
      && student.className === state.currentStudent.className
    ));
  }

  function getRemoteCount(uid) {
    return state.remoteProgress.get(uid)?.size || 0;
  }

  function isTruthyCell(value) {
    return value === 1 || value === "1" || value === true || value === "TRUE";
  }

  function formatClass(student) {
    return student.className;
  }

  function keyOf(x, y) {
    return `${x},${y}`;
  }

  function pointFromKey(key) {
    const [xText, yText] = String(key || "").split(",");
    const x = Number(xText);
    const y = Number(yText);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }
    return { x, y };
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
}());
