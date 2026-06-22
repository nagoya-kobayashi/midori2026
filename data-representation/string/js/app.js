(() => {
  "use strict";

  const ENCODINGS = {
    ascii: {
      id: "ascii",
      label: "ASCIIコード",
      tableLabel: "ASCIIコード表",
      defaultPage: "single"
    },
    jis: {
      id: "jis",
      label: "JISコード",
      tableLabel: "JISコード表",
      defaultPage: "24"
    },
    shiftjis: {
      id: "shiftjis",
      label: "シフトJISコード",
      tableLabel: "シフトJISコード表",
      defaultPage: "82"
    },
    eucjp: {
      id: "eucjp",
      label: "EUCコード",
      tableLabel: "EUCコード表",
      defaultPage: "A4"
    },
    unicode: {
      id: "unicode",
      label: "Unicode",
      tableLabel: "Unicode表",
      defaultPage: "30"
    }
  };

  const GROUP_COLORS = [
    "#38dff0",
    "#ffd166",
    "#75f09a",
    "#c7a1ff",
    "#ff5c78",
    "#6ee7ff",
    "#ff9f7a",
    "#b6ff6d"
  ];

  const BACKGROUND_SYMBOLS = ["0", "1", "JIS", "U+", "A4", "82", "あ", "字", "0x"];
  const HEX = "0123456789ABCDEF";
  const ASCII_CONTROL_NAMES = [
    "NUL", "SOH", "STX", "ETX", "EOT", "ENQ", "ACK", "BEL",
    "BS", "HT", "LF", "VT", "FF", "CR", "SO", "SI",
    "DLE", "DC1", "DC2", "DC3", "DC4", "NAK", "SYN", "ETB",
    "CAN", "EM", "SUB", "ESC", "FS", "GS", "RS", "US"
  ];

  const app = {
    canvas: null,
    ctx: null,
    dpr: 1,
    width: 1,
    height: 1,
    started: false,
    mode: "input",
    composing: false,
    currentEncoding: "ascii",
    currentPage: "single",
    inputValue: "",
    canSwitchEncoding: false,
    noticeTimer: 0,
    splashTimer: 0,
    conversionId: 0,
    railX: 0,
    encodings: {},
    particles: []
  };

  const dom = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    app.canvas = document.getElementById("stage");
    app.ctx = app.canvas.getContext("2d", { alpha: false });

    Object.assign(dom, {
      startOverlay: document.getElementById("startOverlay"),
      startButton: document.getElementById("startButton"),
      stageTitle: document.getElementById("stageTitle"),
      encodingBadge: document.getElementById("encodingBadge"),
      lengthBadge: document.getElementById("lengthBadge"),
      dataBadge: document.getElementById("dataBadge"),
      encodingPanel: document.getElementById("encodingPanel"),
      encodingButtons: Array.from(document.querySelectorAll(".encoding-button")),
      tableTitle: document.getElementById("tableTitle"),
      tableCaption: document.getElementById("tableCaption"),
      pageBadge: document.getElementById("pageBadge"),
      codeTable: document.getElementById("codeTable"),
      stringInput: document.getElementById("stringInput"),
      letterRail: document.getElementById("letterRail"),
      letterTrack: document.getElementById("letterTrack"),
      resultPanel: document.getElementById("resultPanel"),
      hexLine: document.getElementById("hexLine"),
      bitCounter: document.getElementById("bitCounter"),
      byteCounter: document.getElementById("byteCounter"),
      notice: document.getElementById("notice"),
      splash: document.getElementById("stepSplash"),
      frameFlash: document.getElementById("frameFlash"),
      flyLayer: document.getElementById("flyLayer"),
      footerReadout: document.getElementById("footerReadout"),
      clearButton: document.getElementById("clearButton")
    });

    initParticles();
    resizeCanvas();
    ensureEncoding(app.currentEncoding);
    configureInputMode();
    updateEncodingButtons();
    renderCodeTable(ENCODINGS[app.currentEncoding].defaultPage, null, false);
    updateUI();

    dom.startButton.addEventListener("click", startExperience);
    dom.clearButton.addEventListener("click", clearInput);
    dom.stringInput.addEventListener("beforeinput", handleBeforeInput);
    dom.stringInput.addEventListener("input", handleInput);
    dom.stringInput.addEventListener("compositionstart", () => {
      app.composing = true;
    });
    dom.stringInput.addEventListener("compositionend", () => {
      app.composing = false;
      applySanitizedInput("compose");
    });
    dom.encodingButtons.forEach((button) => {
      button.addEventListener("click", () => changeEncoding(button.dataset.encoding));
    });
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", resizeCanvas);

    requestAnimationFrame(frame);
  }

  async function startExperience() {
    if (app.started) {
      return;
    }

    app.started = true;
    const fullscreenPromise = requestFullscreenSafely();
    dom.startOverlay.classList.add("is-hidden");
    showSplash("開始");
    pulseFrame();
    updateUI();
    focusInputLater(160);

    const ok = await fullscreenPromise;
    if (!ok) {
      showNotice("全画面表示が拒否された場合は、Fキーで再試行できます。", 3600);
    }
  }

  async function requestFullscreenSafely() {
    const root = document.documentElement;
    if (document.fullscreenElement) {
      return true;
    }
    if (!root.requestFullscreen) {
      return false;
    }
    try {
      await root.requestFullscreen();
      return true;
    } catch (error) {
      return false;
    }
  }

  function handleKeyDown(event) {
    if (event.key === "Enter") {
      if (!app.started || app.composing || event.isComposing) {
        return;
      }
      event.preventDefault();
      if (app.mode === "input") {
        runConversion();
      } else if (app.mode === "result") {
        resetForInput(true);
      }
      return;
    }

    if ((event.key === "r" || event.key === "R" || event.code === "Home") && app.started) {
      event.preventDefault();
      clearInput();
      return;
    }

    if ((event.key === "f" || event.key === "F") && app.started) {
      event.preventDefault();
      if (document.fullscreenElement) {
        document.exitFullscreen?.();
      } else {
        requestFullscreenSafely().then((ok) => {
          if (!ok) {
            showNotice("全画面表示を開始できませんでした。", 2600);
          }
        });
      }
    }
  }

  function handleBeforeInput(event) {
    if (!app.started || app.mode !== "input" || app.composing || event.isComposing) {
      return;
    }
    if (!event.data || event.inputType.startsWith("delete")) {
      return;
    }

    const chars = Array.from(event.data);
    if (chars.some((char) => !getEntryForChar(char))) {
      event.preventDefault();
      showNotice("このコード表にない文字は入力できません。", 2200);
      pulseFrame();
    }
  }

  function handleInput() {
    if (app.composing) {
      return;
    }
    applySanitizedInput("input");
  }

  function applySanitizedInput(reason) {
    if (app.mode !== "input") {
      return;
    }

    const result = sanitizeString(dom.stringInput.value);
    if (result.value !== dom.stringInput.value) {
      dom.stringInput.value = result.value;
      showNotice("このコード表にない文字を取り除きました。", 2200);
      pulseFrame();
    }

    app.inputValue = result.value;
    const lastChar = lastOfString(app.inputValue);
    if (lastChar) {
      const entry = getEntryForChar(lastChar);
      if (entry) {
        renderCodeTable(entry.pageKey, entry, reason !== "startup");
      }
    } else {
      renderCodeTable(ENCODINGS[app.currentEncoding].defaultPage, null, false);
    }
    updateUI();
  }

  function sanitizeString(value) {
    const valid = [];
    let removed = 0;
    Array.from(value).forEach((char) => {
      if (getEntryForChar(char)) {
        valid.push(char);
      } else {
        removed += 1;
      }
    });
    return {
      value: valid.join(""),
      removed
    };
  }

  function clearInput() {
    if (app.mode === "converting") {
      return;
    }
    app.conversionId += 1;
    app.mode = "input";
    app.inputValue = "";
    dom.stringInput.disabled = false;
    dom.stringInput.value = "";
    dom.letterTrack.innerHTML = "";
    setRailOffset(0, 0);
    dom.resultPanel.hidden = true;
    dom.resultPanel.classList.remove("is-visible");
    dom.hexLine.textContent = "";
    dom.bitCounter.textContent = "0 bit";
    dom.byteCounter.textContent = "0 Byte";
    renderCodeTable(ENCODINGS[app.currentEncoding].defaultPage, null, false);
    updateUI();
    showNotice("");
    pulseFrame();
    configureInputMode();
    focusInputLater(30);
  }

  function resetForInput(revealEncodingPanel) {
    if (revealEncodingPanel) {
      app.canSwitchEncoding = true;
      dom.encodingPanel.hidden = false;
      document.body.classList.add("has-encoding-panel");
    }

    app.mode = "input";
    app.inputValue = "";
    dom.stringInput.disabled = false;
    dom.clearButton.disabled = false;
    setEncodingButtonsDisabled(false);
    dom.stringInput.value = "";
    dom.letterTrack.innerHTML = "";
    setRailOffset(0, 0);
    dom.resultPanel.hidden = true;
    dom.resultPanel.classList.remove("is-visible");
    dom.hexLine.textContent = "";
    dom.bitCounter.textContent = "0 bit";
    dom.byteCounter.textContent = "0 Byte";
    renderCodeTable(ENCODINGS[app.currentEncoding].defaultPage, null, true);
    updateUI();
    updateEncodingButtons();
    configureInputMode();
    showSplash("入力");
    pulseFrame();
    focusInputLater(80);
  }

  function changeEncoding(nextEncoding) {
    if (!ENCODINGS[nextEncoding] || app.mode !== "input") {
      return;
    }
    if (!app.canSwitchEncoding && nextEncoding !== app.currentEncoding) {
      return;
    }

    app.currentEncoding = nextEncoding;
    ensureEncoding(nextEncoding);
    configureInputMode();
    updateEncodingButtons();

    const before = dom.stringInput.value;
    const result = sanitizeString(before);
    dom.stringInput.value = result.value;
    app.inputValue = result.value;
    if (before !== result.value) {
      showNotice(ENCODINGS[nextEncoding].label + "で表せない文字を取り除きました。", 2800);
    }

    const lastChar = lastOfString(app.inputValue);
    const entry = lastChar ? getEntryForChar(lastChar) : null;
    renderCodeTable(entry ? entry.pageKey : ENCODINGS[nextEncoding].defaultPage, entry, true);
    updateUI();
    pulseFrame();
    focusInputLater(30);
  }

  async function runConversion() {
    if (app.mode !== "input") {
      return;
    }

    applySanitizedInput("convert");
    const entries = getEntriesFromInput();
    if (entries.length === 0) {
      showNotice("変換する文字を入力してください。", 2200);
      pulseFrame();
      dom.stringInput.focus();
      return;
    }

    const conversionId = app.conversionId + 1;
    app.conversionId = conversionId;
    app.mode = "converting";
    dom.stringInput.disabled = true;
    dom.clearButton.disabled = true;
    setEncodingButtonsDisabled(true);
    dom.resultPanel.hidden = true;
    dom.resultPanel.classList.remove("is-visible");
    dom.hexLine.textContent = "";
    dom.bitCounter.textContent = "0 bit";
    dom.byteCounter.textContent = "0 Byte";
    renderLetterTokens(entries);
    updateUI();
    showSplash("符号化");
    pulseFrame();

    let bitOffset = 0;
    for (let index = 0; index < entries.length; index += 1) {
      if (app.conversionId !== conversionId) {
        return;
      }

      const entry = entries[index];
      const token = dom.letterTrack.querySelector('[data-token-index="' + index + '"]');
      const timings = getConversionTiming(index, entries.length);
      setActiveToken(token);
      centerRailOnCell(token, timings.slide);
      renderCodeTable(entry.pageKey, entry, true);
      pulseFrame();
      await wait(timings.cell);

      if (token) {
        token.classList.add("is-receiving");
      }
      await flashCodeParts(entry, timings);
      flyEntryBits(entry, token, timings);
      await wait(timings.fly);

      if (token) {
        await replaceTokenWithBits(token, entry, index, bitOffset, timings);
      }
      bitOffset += entry.bitCount;
      await wait(timings.settle);
    }

    if (app.conversionId !== conversionId) {
      return;
    }

    dom.hexLine.textContent = "";
    dom.resultPanel.hidden = false;
    dom.resultPanel.classList.remove("is-visible");
    void dom.resultPanel.offsetWidth;
    dom.resultPanel.classList.add("is-visible");
    await countBits(entries, conversionId);

    if (app.conversionId !== conversionId) {
      return;
    }

    app.mode = "result";
    dom.clearButton.disabled = false;
    updateUI();
    showSplash(bitOffset + " bit");
    pulseFrame();
  }

  function renderLetterTokens(entries) {
    let html = "";
    entries.forEach((entry, index) => {
      html += [
        '<div class="letter-token" data-token-index="',
        index,
        '" data-rail-key="char-',
        index,
        '" style="--accent:',
        GROUP_COLORS[index % GROUP_COLORS.length],
        '">',
        escapeHtml(labelForChar(entry.char)),
        "</div>"
      ].join("");
    });
    dom.letterTrack.innerHTML = html;
    setRailOffset(0, 0);
  }

  function setActiveToken(token) {
    dom.letterTrack.querySelectorAll(".letter-token").forEach((item) => {
      item.classList.toggle("is-active", item === token);
    });
  }

  async function replaceTokenWithBits(token, entry, entryIndex, bitOffset, timings) {
    token.classList.add("is-vanishing");
    await wait(Math.max(120, Math.round(timings.slide * 0.28)));

    const snapshot = snapshotRailCells();
    token.insertAdjacentHTML("beforebegin", renderBitCells(entry, entryIndex, bitOffset));
    token.remove();
    const cells = Array.from(dom.letterTrack.querySelectorAll('[data-entry-index="' + entryIndex + '"].bit-cell'));
    centerRailOnCell(cells[Math.min(3, cells.length - 1)] || cells[0], timings.slide);
    animateRailFromSnapshot(snapshot, timings.slide);
    await wait(Math.max(80, Math.round(timings.slide * 0.42)));

    for (let index = 0; index < cells.length; index += 1) {
      cells[index].classList.add("is-revealed");
      await wait(timings.reveal);
    }
  }

  function renderBitCells(entry, entryIndex, bitOffset) {
    let offset = bitOffset;
    const parts = [];
    entry.bytes.forEach((byte, byteIndex) => {
      const bits = byteBinary(byte);
      const hex = hexByte(byte);
      for (let bitIndex = 0; bitIndex < bits.length; bitIndex += 1) {
        const hexDigit = bitIndex < 4 ? hex[0] : hex[1];
        parts.push([
          '<span class="letter-token bit-cell" data-entry-index="',
          entryIndex,
          '" data-byte-index="',
          byteIndex,
          '" data-rail-key="bit-',
          entryIndex,
          "-",
          byteIndex,
          "-",
          bitIndex,
          '" style="--accent:',
          GROUP_COLORS[entryIndex % GROUP_COLORS.length],
          '">',
          '<span class="bit" data-bit-index="',
          offset,
          '">',
          bits[bitIndex],
          "</span>",
          '<span class="hex-marker">',
          hexDigit,
          "</span>",
          "</span>"
        ].join(""));
        offset += 1;
      }
    });
    return parts.join("");
  }

  function snapshotRailCells() {
    const map = new Map();
    dom.letterTrack.querySelectorAll("[data-rail-key]").forEach((cell) => {
      map.set(cell.dataset.railKey, cell.getBoundingClientRect());
    });
    return map;
  }

  function animateRailFromSnapshot(snapshot, duration) {
    window.requestAnimationFrame(() => {
      dom.letterTrack.querySelectorAll("[data-rail-key]").forEach((cell) => {
        const oldRect = snapshot.get(cell.dataset.railKey);
        if (!oldRect) {
          return;
        }
        const newRect = cell.getBoundingClientRect();
        const dx = oldRect.left - newRect.left;
        const dy = oldRect.top - newRect.top;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
          return;
        }
        cell.style.transition = "none";
        cell.style.transform = "translate(" + dx + "px, " + dy + "px)";
        cell.getBoundingClientRect();
        cell.style.transition = "transform " + duration + "ms cubic-bezier(0.2, 0.82, 0.2, 1)";
        cell.style.transform = "";
        window.setTimeout(() => {
          cell.style.transition = "";
        }, duration + 40);
      });
    });
  }

  function centerRailOnCell(cell, duration) {
    if (!cell) {
      return;
    }

    const railRect = dom.letterRail.getBoundingClientRect();
    const cellRect = cell.getBoundingClientRect();
    const overflow = dom.letterTrack.scrollWidth - dom.letterRail.clientWidth;
    if (overflow <= 2) {
      setRailOffset(0, duration);
      return;
    }

    const targetX = railRect.left + railRect.width / 2;
    const cellX = cellRect.left + cellRect.width / 2;
    const nextX = clamp(app.railX + targetX - cellX, -overflow, 0);
    setRailOffset(nextX, duration);
  }

  function setRailOffset(x, duration) {
    app.railX = x;
    dom.letterTrack.style.transition = duration ? "transform " + duration + "ms cubic-bezier(0.2, 0.82, 0.2, 1)" : "none";
    dom.letterTrack.style.transform = "translateX(" + x + "px)";
    if (!duration) {
      dom.letterTrack.getBoundingClientRect();
      dom.letterTrack.style.transition = "";
    }
  }

  async function countBits(entries, conversionId) {
    const totalBits = entries.reduce((sum, entry) => sum + entry.bitCount, 0);
    const delay = totalBits > 240 ? 4 : totalBits > 128 ? 7 : totalBits > 64 ? 12 : 24;
    dom.bitCounter.textContent = "0 bit";
    dom.byteCounter.textContent = "0 Byte";

    for (let index = 0; index < totalBits; index += 1) {
      if (app.conversionId !== conversionId) {
        return;
      }
      const bit = dom.letterTrack.querySelector('[data-bit-index="' + index + '"]');
      if (bit) {
        bit.classList.add("is-counted");
        const bitCell = bit.closest(".bit-cell");
        if (bitCell) {
          bitCell.classList.add("has-counted");
          const entryIndex = bitCell.dataset.entryIndex;
          const byteIndex = bitCell.dataset.byteIndex;
          const byteCells = Array.from(dom.letterTrack.querySelectorAll('.bit-cell[data-entry-index="' + entryIndex + '"][data-byte-index="' + byteIndex + '"]'));
          if (byteCells.length > 0 && byteCells.every((cell) => cell.querySelector(".bit.is-counted"))) {
            byteCells.forEach((cell) => cell.classList.add("is-complete"));
          }
        }
      }
      const count = index + 1;
      dom.bitCounter.textContent = count + " bit";
      dom.byteCounter.textContent = Math.ceil(count / 8) + " Byte";
      await wait(delay);
    }
  }

  function flyEntryBits(entry, token, timings) {
    if (!token) {
      return;
    }

    const targetRect = token.getBoundingClientRect();
    const target = {
      x: targetRect.left + targetRect.width / 2,
      y: targetRect.top + targetRect.height / 2
    };
    const sources = [];

    if (entry.bytes.length > 1 || app.currentEncoding === "unicode") {
      sources.push({
        text: byteBinary(entry.bytes[0]),
        rect: dom.pageBadge.getBoundingClientRect()
      });
    }

    const rowHeader = findHeader("row", nibbleBinary(entry.cellByte >> 4));
    const colHeader = findHeader("col", nibbleBinary(entry.cellByte & 15));
    if (rowHeader) {
      sources.push({
        text: nibbleBinary(entry.cellByte >> 4),
        rect: rowHeader.getBoundingClientRect()
      });
    }
    if (colHeader) {
      sources.push({
        text: nibbleBinary(entry.cellByte & 15),
        rect: colHeader.getBoundingClientRect()
      });
    }

    sources.forEach((source, index) => {
      window.setTimeout(() => spawnFlyingBits(source.text, source.rect, target, timings.flyDuration), index * timings.flyStagger);
    });
  }

  function spawnFlyingBits(text, sourceRect, target, duration) {
    if (!sourceRect.width || !sourceRect.height) {
      return;
    }

    const startX = sourceRect.left + sourceRect.width / 2;
    const startY = sourceRect.top + sourceRect.height / 2;
    const item = document.createElement("div");
    item.className = "flying-bits";
    item.textContent = text;
    item.style.left = startX + "px";
    item.style.top = startY + "px";
    item.style.setProperty("--dx", target.x - startX + "px");
    item.style.setProperty("--dy", target.y - startY + "px");
    item.style.setProperty("--fly-duration", duration + "ms");
    dom.flyLayer.appendChild(item);
    window.setTimeout(() => item.remove(), duration + 90);
  }

  async function flashCodeParts(entry, timings) {
    const rowHeader = findHeader("row", nibbleBinary(entry.cellByte >> 4));
    const colHeader = findHeader("col", nibbleBinary(entry.cellByte & 15));
    if (entry.bytes.length > 1 || app.currentEncoding === "unicode") {
      flashElement(dom.pageBadge, timings.headerFlash);
      await wait(timings.headerStep);
    }
    flashElement(rowHeader, timings.headerFlash);
    await wait(timings.headerStep);
    flashElement(colHeader, timings.headerFlash);
    await wait(timings.headerStep);
  }

  function flashElement(element, duration) {
    if (!element) {
      return;
    }
    element.classList.remove("is-header-flash");
    void element.offsetWidth;
    element.style.setProperty("--header-flash-duration", duration + "ms");
    element.classList.add("is-header-flash");
    window.setTimeout(() => element.classList.remove("is-header-flash"), duration + 60);
  }

  function findHeader(kind, value) {
    return Array.from(dom.codeTable.querySelectorAll(".code-header")).find((header) => {
      return header.dataset.headerKind === kind && header.dataset.headerValue === value;
    });
  }

  function renderCodeTable(pageKey, activeEntry, animate) {
    const encoding = ENCODINGS[app.currentEncoding];
    const rows = getRowsForPage(app.currentEncoding, pageKey);
    const activeCellByte = activeEntry ? activeEntry.cellByte : -1;
    const activePage = activeEntry ? activeEntry.pageKey : "";
    const activeRow = activeEntry ? activeEntry.cellByte >> 4 : -1;
    const activeCol = activeEntry ? activeEntry.cellByte & 15 : -1;
    const pageChanged = app.currentPage !== pageKey;
    app.currentPage = pageKey;

    const parts = ['<div class="code-grid" style="--row-count:', rows.length, '">'];
    parts.push('<div class="code-corner">上位\\下位</div>');
    for (let col = 0; col < 16; col += 1) {
      const value = nibbleBinary(col);
      const classes = ["code-header", activePage === pageKey && activeCol === col ? "is-active" : ""].filter(Boolean).join(" ");
      parts.push('<div class="', classes, '" data-header-kind="col" data-header-value="', value, '">', value, "</div>");
    }

    rows.forEach((row) => {
      const rowValue = nibbleBinary(row);
      const rowClasses = ["code-header", activePage === pageKey && activeRow === row ? "is-active" : ""].filter(Boolean).join(" ");
      parts.push('<div class="', rowClasses, '" data-header-kind="row" data-header-value="', rowValue, '">', rowValue, "</div>");

      for (let col = 0; col < 16; col += 1) {
        const codeByte = row * 16 + col;
        const entry = getTableEntry(pageKey, codeByte);
        const displayCell = entry || getDisplayOnlyCell(pageKey, codeByte);
        const isActive = activePage === pageKey && activeCellByte === codeByte;
        const classes = [
          "code-cell",
          entry ? "is-supported" : "",
          displayCell && displayCell.kind === "control" ? "is-control" : "",
          isActive ? "is-active" : ""
        ].filter(Boolean).join(" ");
        const label = entry ? labelForChar(entry.char) : displayCell ? displayCell.label : "";
        const codeText = displayCell ? hexByte(codeByte) : "";
        const codeKey = entry ? entry.codeKey : displayCell ? displayCell.codeKey : "";
        parts.push('<div class="', classes, '" data-code-key="', escapeHtml(codeKey), '">');
        parts.push(displayCell ? escapeHtml(label) : "&middot;");
        if (codeText) {
          parts.push("<small>", codeText, "</small>");
        }
        parts.push("</div>");
      }
    });
    parts.push("</div>");

    dom.codeTable.innerHTML = parts.join("");
    dom.tableTitle.textContent = encoding.tableLabel;
    dom.tableCaption.textContent = pageCaption(app.currentEncoding, pageKey);
    dom.pageBadge.textContent = pageBadgeText(app.currentEncoding, pageKey);
    dom.pageBadge.classList.toggle("is-active", Boolean(activeEntry && activeEntry.pageKey === pageKey && activeEntry.bytes.length > 1));

    if (animate || pageChanged) {
      dom.codeTable.classList.remove("is-sliding");
      void dom.codeTable.offsetWidth;
      dom.codeTable.classList.add("is-sliding");
    }
  }

  function getTableEntry(pageKey, codeByte) {
    if (app.currentEncoding === "unicode") {
      const page = parseInt(pageKey, 16);
      if (!Number.isFinite(page)) {
        return null;
      }
      const cp = page * 256 + codeByte;
      if (!isPrintableCodePoint(cp)) {
        return null;
      }
      return makeUnicodeEntry(String.fromCodePoint(cp));
    }

    const data = ensureEncoding(app.currentEncoding);
    return data.codeToEntry.get(pageKey + "|" + hexByte(codeByte)) || null;
  }

  function getDisplayOnlyCell(pageKey, codeByte) {
    if (app.currentEncoding !== "ascii" || pageKey !== "single" || codeByte > 0x7F) {
      return null;
    }
    if (codeByte < 0x20) {
      return {
        kind: "control",
        label: ASCII_CONTROL_NAMES[codeByte],
        codeKey: "ascii-control:" + hexByte(codeByte)
      };
    }
    if (codeByte === 0x7F) {
      return {
        kind: "control",
        label: "DEL",
        codeKey: "ascii-control:7F"
      };
    }
    return null;
  }

  function getRowsForPage(encodingId, pageKey) {
    if (encodingId === "unicode") {
      return range(0, 15);
    }
    if (pageKey === "single") {
      if (encodingId === "ascii") {
        return range(0, 7);
      }
      if (encodingId === "shiftjis") {
        return [2, 3, 4, 5, 6, 7, 10, 11, 12, 13];
      }
      return [2, 3, 4, 5, 6, 7];
    }
    if (encodingId === "shiftjis") {
      return range(4, 15);
    }
    if (encodingId === "eucjp") {
      if (pageKey === "8E") {
        return [10, 11, 12, 13];
      }
      return range(10, 15);
    }
    return range(2, 7);
  }

  function pageCaption(encodingId, pageKey) {
    if (pageKey === "single") {
      if (encodingId === "ascii") {
        return "ASCII 0x00 - 0x7F";
      }
      return "1バイト文字のページ";
    }
    if (encodingId === "unicode") {
      return "U+" + pageKey + "00 - U+" + pageKey + "FF";
    }
    return "第1バイト " + byteBinary(parseInt(pageKey, 16)) + " のページ";
  }

  function pageBadgeText(encodingId, pageKey) {
    if (pageKey === "single") {
      if (encodingId === "ascii") {
        return "0x00-0x7F";
      }
      return "1 Byte";
    }
    if (encodingId === "unicode") {
      return "U+" + pageKey + "xx";
    }
    return "0x" + pageKey;
  }

  function getEntriesFromInput() {
    return Array.from(app.inputValue).map((char) => getEntryForChar(char)).filter(Boolean);
  }

  function getEntryForChar(char) {
    if (!char) {
      return null;
    }
    if (app.currentEncoding === "unicode") {
      return makeUnicodeEntry(char);
    }
    const data = ensureEncoding(app.currentEncoding);
    return data.charToEntry.get(char) || null;
  }

  function makeUnicodeEntry(char) {
    const cp = char.codePointAt(0);
    if (!isPrintableCodePoint(cp) || cp > 0xFFFF) {
      return null;
    }
    const bytes = [(cp >> 8) & 0xFF, cp & 0xFF];
    return makeEntry("unicode", char, bytes, "unicode");
  }

  function ensureEncoding(encodingId) {
    if (app.encodings[encodingId]) {
      return app.encodings[encodingId];
    }

    const data = {
      id: encodingId,
      charToEntry: new Map(),
      codeToEntry: new Map(),
      entries: [],
      pages: new Set()
    };

    if (encodingId === "ascii") {
      addAsciiEntries(data);
    } else if (encodingId === "jis") {
      addAsciiEntries(data);
      buildJisEntries(data);
    } else if (encodingId === "shiftjis") {
      addAsciiEntries(data);
      buildShiftJisEntries(data);
    } else if (encodingId === "eucjp") {
      addAsciiEntries(data);
      buildEucJpEntries(data);
    }

    app.encodings[encodingId] = data;
    return data;
  }

  function addAsciiEntries(data) {
    for (let byte = 0x20; byte <= 0x7E; byte += 1) {
      addEntry(data, String.fromCharCode(byte), [byte], "ascii");
    }
  }

  function buildJisEntries(data) {
    const decoder = createDecoder("euc-jp");
    if (!decoder) {
      showNotice("このブラウザではJISコード表の自動生成に対応していません。", 3600);
      return;
    }
    for (let lead = 0x21; lead <= 0x7E; lead += 1) {
      for (let trail = 0x21; trail <= 0x7E; trail += 1) {
        const char = decodeWith(decoder, [lead + 0x80, trail + 0x80]);
        addDecodedEntry(data, char, [lead, trail], "jis");
      }
    }
  }

  function buildShiftJisEntries(data) {
    const decoder = createDecoder("shift_jis");
    if (!decoder) {
      showNotice("このブラウザではシフトJISコード表の自動生成に対応していません。", 3600);
      return;
    }

    for (let byte = 0xA1; byte <= 0xDF; byte += 1) {
      addDecodedEntry(data, decodeWith(decoder, [byte]), [byte], "shiftjis");
    }

    const leads = range(0x81, 0x9F).concat(range(0xE0, 0xFC));
    const trails = range(0x40, 0x7E).concat(range(0x80, 0xFC));
    leads.forEach((lead) => {
      trails.forEach((trail) => {
        const char = decodeWith(decoder, [lead, trail]);
        addDecodedEntry(data, char, [lead, trail], "shiftjis");
      });
    });
  }

  function buildEucJpEntries(data) {
    const decoder = createDecoder("euc-jp");
    if (!decoder) {
      showNotice("このブラウザではEUCコード表の自動生成に対応していません。", 3600);
      return;
    }

    for (let trail = 0xA1; trail <= 0xDF; trail += 1) {
      addDecodedEntry(data, decodeWith(decoder, [0x8E, trail]), [0x8E, trail], "eucjp");
    }

    for (let lead = 0xA1; lead <= 0xFE; lead += 1) {
      for (let trail = 0xA1; trail <= 0xFE; trail += 1) {
        const char = decodeWith(decoder, [lead, trail]);
        addDecodedEntry(data, char, [lead, trail], "eucjp");
      }
    }
  }

  function createDecoder(label) {
    if (typeof TextDecoder === "undefined") {
      return null;
    }
    try {
      return new TextDecoder(label);
    } catch (error) {
      return null;
    }
  }

  function decodeWith(decoder, bytes) {
    try {
      return decoder.decode(new Uint8Array(bytes));
    } catch (error) {
      return "";
    }
  }

  function addDecodedEntry(data, decoded, bytes, source) {
    const chars = Array.from(decoded || "");
    if (chars.length !== 1) {
      return;
    }
    addEntry(data, chars[0], bytes, source);
  }

  function addEntry(data, char, bytes, source) {
    if (!isPrintableLegacyChar(char)) {
      return;
    }

    const entry = makeEntry(data.id, char, bytes, source);
    data.entries.push(entry);
    data.pages.add(entry.pageKey);
    data.codeToEntry.set(entry.pageKey + "|" + hexByte(entry.cellByte), entry);
    if (!data.charToEntry.has(char)) {
      data.charToEntry.set(char, entry);
    }
  }

  function makeEntry(encodingId, char, bytes, source) {
    const pageKey = bytes.length === 1 ? "single" : hexByte(bytes[0]);
    const cellByte = bytes.length === 1 ? bytes[0] : bytes[bytes.length - 1];
    return {
      encodingId,
      source,
      char,
      bytes,
      pageKey,
      cellByte,
      codeKey: encodingId + ":" + bytes.map(hexByte).join("-"),
      bitCount: bytes.length * 8,
      byteCount: bytes.length
    };
  }

  function isPrintableLegacyChar(char) {
    if (!char || char === "\uFFFD") {
      return false;
    }
    const cp = char.codePointAt(0);
    if (cp === 0x20) {
      return true;
    }
    if (cp < 0x20 || (cp >= 0x7F && cp <= 0x9F)) {
      return false;
    }
    return cp <= 0xFFFF;
  }

  function isPrintableCodePoint(cp) {
    if (!Number.isFinite(cp) || cp < 0 || cp > 0xFFFF) {
      return false;
    }
    if (cp === 0x20 || cp === 0x3000) {
      return true;
    }
    if (cp < 0x20 || (cp >= 0x7F && cp <= 0x9F)) {
      return false;
    }
    if (cp >= 0xD800 && cp <= 0xDFFF) {
      return false;
    }
    return true;
  }

  function updateUI() {
    const entries = getEntriesFromInput();
    const bitCount = entries.reduce((sum, entry) => sum + entry.bitCount, 0);
    const byteCount = entries.reduce((sum, entry) => sum + entry.byteCount, 0);
    const chars = Array.from(app.inputValue);
    const encoding = ENCODINGS[app.currentEncoding];

    let title = encoding.tableLabel;
    if (app.mode === "converting") {
      title = "文字をビット列へ変換中";
    } else if (app.mode === "result") {
      title = "変換完了";
    }

    dom.stageTitle.textContent = app.started ? title : "準備中";
    dom.encodingBadge.textContent = encoding.label;
    dom.lengthBadge.textContent = chars.length + "文字";
    dom.dataBadge.textContent = bitCount + " bit / " + byteCount + " Byte";
    dom.footerReadout.textContent = encoding.label + " / 入力 " + chars.length + "文字 / " + pageCaption(app.currentEncoding, app.currentPage);
  }

  function configureInputMode() {
    const japaneseMode = app.currentEncoding !== "ascii";
    dom.stringInput.type = japaneseMode ? "text" : "email";
    dom.stringInput.lang = japaneseMode ? "ja" : "en";
    dom.stringInput.inputMode = japaneseMode ? "text" : "email";
    dom.stringInput.setAttribute("inputmode", japaneseMode ? "text" : "email");
    dom.stringInput.setAttribute("data-ime-mode", japaneseMode ? "japanese" : "latin");
    dom.stringInput.style.imeMode = japaneseMode ? "active" : "disabled";
    document.body.classList.toggle("encoding-ascii", app.currentEncoding === "ascii");
    document.body.classList.toggle("encoding-japanese", japaneseMode);
  }

  function focusInputLater(delay) {
    window.setTimeout(() => {
      if (app.started && app.mode === "input") {
        dom.stringInput.focus({ preventScroll: true });
      }
    }, delay);
  }

  function getConversionTiming(index, total) {
    const slow = {
      cell: 420,
      headerStep: 240,
      headerFlash: 520,
      fly: 640,
      flyDuration: 600,
      flyStagger: 90,
      slide: 440,
      reveal: 72,
      settle: 160
    };

    if (index < 5) {
      return slow;
    }

    const pressure = total > 10 ? Math.min(0.18, (total - 10) * 0.018) : 0;
    const factor = clamp(0.54 - (index - 5) * 0.075 - pressure, 0.18, 0.54);
    return {
      cell: Math.round(slow.cell * factor),
      headerStep: Math.round(slow.headerStep * factor),
      headerFlash: Math.round(slow.headerFlash * factor),
      fly: Math.round(slow.fly * factor),
      flyDuration: Math.round(slow.flyDuration * factor),
      flyStagger: Math.round(slow.flyStagger * factor),
      slide: Math.round(slow.slide * factor),
      reveal: Math.max(18, Math.round(slow.reveal * factor)),
      settle: Math.round(slow.settle * factor)
    };
  }

  function updateEncodingButtons() {
    dom.encodingButtons.forEach((button) => {
      const active = button.dataset.encoding === app.currentEncoding;
      button.classList.toggle("is-active", active);
      button.disabled = app.mode === "converting" || (!app.canSwitchEncoding && !active);
    });
  }

  function setEncodingButtonsDisabled(disabled) {
    dom.encodingButtons.forEach((button) => {
      button.disabled = disabled || (!app.canSwitchEncoding && button.dataset.encoding !== app.currentEncoding);
    });
  }

  function showNotice(message, duration) {
    window.clearTimeout(app.noticeTimer);
    if (!message) {
      dom.notice.hidden = true;
      return;
    }
    dom.notice.textContent = message;
    dom.notice.hidden = false;
    app.noticeTimer = window.setTimeout(() => {
      dom.notice.hidden = true;
    }, duration || 3200);
  }

  function showSplash(text) {
    window.clearTimeout(app.splashTimer);
    dom.splash.textContent = text;
    dom.splash.hidden = false;
    dom.splash.classList.remove("is-visible");
    void dom.splash.offsetWidth;
    dom.splash.classList.add("is-visible");
    app.splashTimer = window.setTimeout(() => {
      dom.splash.hidden = true;
      dom.splash.classList.remove("is-visible");
    }, 900);
  }

  function pulseFrame() {
    dom.frameFlash.classList.remove("is-active");
    void dom.frameFlash.offsetWidth;
    dom.frameFlash.classList.add("is-active");
  }

  function initParticles() {
    app.particles = Array.from({ length: 130 }, (_, index) => ({
      x: seededNoise(index * 19 + 3),
      y: seededNoise(index * 29 + 7),
      speed: 0.012 + seededNoise(index * 37 + 11) * 0.036,
      sway: 8 + seededNoise(index * 43 + 13) * 28,
      size: 12 + seededNoise(index * 47 + 17) * 18,
      symbol: BACKGROUND_SYMBOLS[index % BACKGROUND_SYMBOLS.length],
      color: GROUP_COLORS[index % GROUP_COLORS.length]
    }));
  }

  function resizeCanvas() {
    app.dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    app.width = Math.max(1, window.innerWidth);
    app.height = Math.max(1, window.innerHeight);
    app.canvas.width = Math.floor(app.width * app.dpr);
    app.canvas.height = Math.floor(app.height * app.dpr);
    app.canvas.style.width = app.width + "px";
    app.canvas.style.height = app.height + "px";
    app.ctx.setTransform(app.dpr, 0, 0, app.dpr, 0, 0);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    drawBackground(now);
  }

  function drawBackground(now) {
    const ctx = app.ctx;
    ctx.clearRect(0, 0, app.width, app.height);

    const gradient = ctx.createLinearGradient(0, 0, app.width, app.height);
    gradient.addColorStop(0, "#061014");
    gradient.addColorStop(0.52, "#091920");
    gradient.addColorStop(1, "#101026");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, app.width, app.height);

    drawGrid(ctx, now);
    drawCodeMist(ctx, now);
  }

  function drawGrid(ctx, now) {
    const step = 42;
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = "rgba(165, 238, 255, 0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    const offset = (now * 0.006) % step;
    for (let x = -step + offset; x < app.width + step; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, app.height);
    }
    for (let y = -step + offset; y < app.height + step; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(app.width, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawCodeMist(ctx, now) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    app.particles.forEach((particle, index) => {
      const drift = (now * particle.speed * 0.05) % 1;
      const x = (particle.x * app.width + Math.sin(now * 0.0004 + index) * particle.sway + app.width) % app.width;
      const y = ((particle.y + drift) % 1) * app.height;
      const alpha = 0.08 + seededNoise(index * 31 + Math.floor(now / 900)) * 0.18;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color;
      ctx.font = "900 " + particle.size + "px Consolas, 'Courier New', 'Yu Gothic', monospace";
      ctx.fillText(particle.symbol, x, y);
    });
    ctx.restore();
  }

  function lastOfString(value) {
    const chars = Array.from(value);
    return chars.length ? chars[chars.length - 1] : "";
  }

  function labelForChar(char) {
    if (char === " ") {
      return "SP";
    }
    if (char === "\u3000") {
      return "空白";
    }
    return char;
  }

  function byteBinary(byte) {
    return (byte & 0xFF).toString(2).padStart(8, "0");
  }

  function nibbleBinary(nibble) {
    return (nibble & 15).toString(2).padStart(4, "0");
  }

  function hexByte(byte) {
    return HEX[(byte >> 4) & 15] + HEX[byte & 15];
  }

  function range(start, end) {
    const result = [];
    for (let value = start; value <= end; value += 1) {
      result.push(value);
    }
    return result;
  }

  function wait(ms) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function seededNoise(seed) {
    const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  window.StringDigital = {
    start: startExperience,
    clear: clearInput,
    setEncoding: changeEncoding,
    state: () => ({
      started: app.started,
      mode: app.mode,
      encoding: app.currentEncoding,
      value: app.inputValue,
      page: app.currentPage
    })
  };
})();
