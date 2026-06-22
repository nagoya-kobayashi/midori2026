(() => {
  "use strict";

  const MAX_BITS = 32;
  const MAX_VALUE = (2 ** MAX_BITS) - 1;
  const SPEED_MIN = 1;
  const SPEED_MAX = 10000;
  const HOLD_DELAY_MS = 310;
  const HOLD_RENDER_MS = 48;
  const CARRY_PRELUDE_MS = 420;
  const CARRY_ROLL_MS = 330;
  const DIVISION_FALLBACK_VALUE = 1228;
  const INTRO_ROLL_MS = 1180;
  const DIVISION_SPLASH_MS = 360;
  const DIVISION_ROLL_MS = 1180;
  const REMAINDER_ORIGIN_MS = 560;
  const REMAINDER_FLIGHT_MS = 480;

  const SYMBOLS = {
    decimal: "0123456789".split(""),
    binary: "01".split(""),
    hex: "0123456789ABCDEF".split("")
  };

  const BASE = {
    decimal: 10,
    binary: 2,
    hex: 16
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

  const BACKGROUND_SYMBOLS = ["0", "1", "A", "F", "9", "+1"];

  const app = {
    canvas: null,
    ctx: null,
    dpr: 1,
    width: 1,
    height: 1,
    started: false,
    mode: "count",
    value: 0,
    divisionInitialValue: 0,
    divisor: 2,
    remainders: [],
    divisionBusy: false,
    divisionTimer: 0,
    fastRollSteps: 0,
    newestRemainderIndex: -1,
    speed: 8,
    spaceDown: false,
    holdDelayTimer: 0,
    holdTimer: 0,
    holdActive: false,
    holdLastAt: 0,
    holdLastRenderAt: 0,
    holdStepRemainder: 0,
    holdPendingSteps: 0,
    carryPreludeTimer: 0,
    carryPreludeActive: false,
    carryPreludePlan: null,
    queuedSteps: 0,
    noticeTimer: 0,
    splashTimer: 0,
    lastCarryFxAt: 0,
    lastUsedUpFxAt: 0,
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
      valueBadge: document.getElementById("valueBadge"),
      bitBadge: document.getElementById("bitBadge"),
      limitBadge: document.getElementById("limitBadge"),
      divisionControls: document.getElementById("divisionControls"),
      divisionValueForm: document.getElementById("divisionValueForm"),
      divisionValueInput: document.getElementById("divisionValueInput"),
      divisionValueButton: document.getElementById("divisionValueButton"),
      divisorButtons: Array.from(document.querySelectorAll(".divisor-button")),
      decimalDigits: document.getElementById("decimalDigits"),
      binaryDigits: document.getElementById("binaryDigits"),
      hexDigits: document.getElementById("hexDigits"),
      decimalMetrics: document.getElementById("decimalMetrics"),
      binaryMetrics: document.getElementById("binaryMetrics"),
      hexMetrics: document.getElementById("hexMetrics"),
      speedRange: document.getElementById("speedRange"),
      speedOutput: document.getElementById("speedOutput"),
      resetButton: document.getElementById("resetButton"),
      remainderStage: document.getElementById("remainderStage"),
      remainderTrack: document.getElementById("remainderTrack"),
      notice: document.getElementById("notice"),
      splash: document.getElementById("stepSplash"),
      frameFlash: document.getElementById("frameFlash"),
      carryLayer: document.getElementById("carryLayer")
    });

    initParticles();
    resizeCanvas();
    updateSpeed(Number(dom.speedRange.value));
    renderAll(0, 0, false);
    updateUI(0, 0, false);

    dom.startButton.addEventListener("click", startExperience);
    dom.resetButton.addEventListener("click", resetValue);
    dom.divisionValueInput.max = String(MAX_VALUE);
    dom.divisionValueForm.addEventListener("submit", handleDivisionValueSubmit);
    dom.divisorButtons.forEach((button) => {
      button.addEventListener("click", () => selectDivisor(Number(button.dataset.divisor)));
    });
    dom.speedRange.addEventListener("input", () => updateSpeed(Number(dom.speedRange.value)));
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", stopHoldRepeat);
    window.addEventListener("resize", () => {
      resizeCanvas();
      queueFitDigits();
      queueFitRemainders();
    });

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
    updateUI(app.value, app.value, false);
    queueFitDigits();

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
    if (event.code === "Enter" || event.code === "NumpadEnter") {
      if (app.mode === "division" && event.target === dom.divisionValueInput) {
        return;
      }
      event.preventDefault();
      if (!app.started) {
        startExperience();
        return;
      }
      if (event.repeat || app.mode !== "count") {
        return;
      }
      enterDivisionMode();
      return;
    }

    if (event.code === "Space") {
      event.preventDefault();
      if (!app.started) {
        startExperience();
        return;
      }
      if (app.mode === "division") {
        if (!event.repeat) {
          divideOnce();
        }
        return;
      }
      if (app.spaceDown) {
        return;
      }
      app.spaceDown = true;
      incrementValue();
      app.holdDelayTimer = window.setTimeout(startHoldRepeat, HOLD_DELAY_MS);
      return;
    }

    if (event.key === "r" || event.key === "R" || event.code === "Home") {
      if (app.started) {
        event.preventDefault();
        resetValue();
      }
      return;
    }

    if (event.key === "f" || event.key === "F") {
      if (app.started) {
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
  }

  function handleKeyUp(event) {
    if (event.code === "Space") {
      stopHoldRepeat();
    }
  }

  function startHoldRepeat() {
    if (!app.spaceDown || app.holdTimer) {
      return;
    }
    app.holdActive = true;
    completeCarryPreludeForHold();
    app.holdLastAt = performance.now();
    app.holdLastRenderAt = app.holdLastAt;
    app.holdStepRemainder = 0;
    app.holdPendingSteps = 0;
    app.holdTimer = window.requestAnimationFrame(runHoldRepeat);
  }

  function runHoldRepeat(now) {
    if (!app.spaceDown) {
      app.holdTimer = 0;
      return;
    }

    const elapsed = Math.max(0, now - app.holdLastAt);
    app.holdLastAt = now;
    app.holdStepRemainder += (app.speed * elapsed) / 1000;

    const steps = Math.floor(app.holdStepRemainder);
    if (steps > 0) {
      app.holdStepRemainder -= steps;
      app.holdPendingSteps += steps;
    }

    if (app.holdPendingSteps > 0 && now - app.holdLastRenderAt >= HOLD_RENDER_MS) {
      const pendingSteps = app.holdPendingSteps;
      app.holdPendingSteps = 0;
      app.holdLastRenderAt = now;
      if (applyHoldIncrement(pendingSteps)) {
        showMaxValue();
        return;
      }
    }

    app.holdTimer = window.requestAnimationFrame(runHoldRepeat);
  }

  function stopHoldRepeat() {
    const wasHolding = app.holdActive;
    const pendingSteps = app.holdPendingSteps;
    app.spaceDown = false;
    app.holdActive = false;
    window.clearTimeout(app.holdDelayTimer);
    if (app.holdTimer) {
      window.cancelAnimationFrame(app.holdTimer);
    }
    app.holdDelayTimer = 0;
    app.holdTimer = 0;
    app.holdStepRemainder = 0;
    app.holdPendingSteps = 0;

    if (wasHolding && pendingSteps > 0 && app.value < MAX_VALUE) {
      applyHoldIncrement(pendingSteps);
    }
    if (wasHolding) {
      app.fastRollSteps = 0;
      renderAll(app.value, app.value, false);
      updateUI(app.value, app.value, false);
    }
  }

  function completeCarryPreludeForHold() {
    if (!app.carryPreludeActive || !app.carryPreludePlan) {
      return;
    }

    const plan = app.carryPreludePlan;
    window.clearTimeout(app.carryPreludeTimer);
    app.carryPreludeTimer = 0;
    app.carryPreludeActive = false;
    app.carryPreludePlan = null;
    app.queuedSteps = 0;
    app.value = plan.newValue;
    app.fastRollSteps = 4;
    renderAll(plan.oldValue, plan.newValue, true, getSmoothCountEffects());
    updateUI(plan.oldValue, plan.newValue, false);
  }

  function applyHoldIncrement(amount) {
    const room = MAX_VALUE - app.value;
    if (room <= 0) {
      return true;
    }

    const steps = Math.min(Math.max(0, Math.floor(amount)), room);
    if (steps <= 0) {
      return false;
    }

    const oldValue = app.value;
    const newValue = oldValue + steps;
    const duration = clamp(48 - Math.log10(Math.max(1, app.speed)) * 2, 40, 48);
    app.value = newValue;
    app.fastRollSteps = 4;
    document.documentElement.style.setProperty("--fast-roll-duration", Math.round(duration) + "ms");
    renderAll(oldValue, newValue, true, getSmoothCountEffects());
    updateUI(oldValue, newValue, false);
    return newValue >= MAX_VALUE;
  }

  function getSmoothCountEffects() {
    const effects = { suppressAuxiliary: true };
    Object.keys(BASE).forEach((kind) => {
      effects[kind] = { suppressCarry: true };
    });
    return effects;
  }

  function updateSpeed(value) {
    const speed = clamp(Math.round(value), SPEED_MIN, SPEED_MAX);
    app.speed = speed;
    dom.speedRange.value = String(speed);
    dom.speedOutput.textContent = formatNumber(speed) + " / 秒";
    const rollDuration = clamp(360 - speed * 11, 82, 320);
    document.documentElement.style.setProperty("--roll-duration", Math.round(rollDuration) + "ms");
  }

  function incrementValue(amount = 1) {
    if (!app.started) {
      startExperience();
      return;
    }

    requestIncrement(amount);
  }

  function requestIncrement(amount) {
    const requestedSteps = Math.max(0, Math.floor(Number(amount) || 0));
    if (requestedSteps <= 0) {
      return;
    }

    if (app.carryPreludeActive) {
      app.queuedSteps = clamp(app.queuedSteps + requestedSteps, 0, MAX_VALUE - app.value);
      return;
    }

    const room = MAX_VALUE - app.value;
    if (room <= 0) {
      showMaxValue();
      return;
    }

    const steps = Math.min(requestedSteps, room);
    const oldValue = app.value;
    const newValue = oldValue + steps;

    if (steps === 1 && hasAnyCarryOut(oldValue, newValue)) {
      beginCarryPrelude(oldValue, newValue);
      return;
    }

    applyValueChange(oldValue, newValue, steps === 1);

    if (steps < requestedSteps || newValue >= MAX_VALUE) {
      showMaxValue();
    }
  }

  function beginCarryPrelude(oldValue, newValue) {
    const plan = buildCarryPreludePlan(oldValue, newValue);
    if (plan.stepCount <= 0) {
      applyValueChange(oldValue, newValue, true);
      return;
    }

    app.carryPreludeActive = true;
    app.carryPreludePlan = plan;
    renderCarryPreludeUsedUp(plan, 0);
  }

  function renderCarryPreludeUsedUp(plan, stepIndex) {
    if (!app.carryPreludeActive || app.carryPreludePlan !== plan) {
      return;
    }

    if (stepIndex >= plan.stepCount) {
      finishCarryPrelude(plan);
      return;
    }

    renderAll(plan.oldValue, plan.oldValue, false, getCarryPreludeStepEffects(plan, stepIndex, "used-up"));
    updateUI(plan.oldValue, plan.oldValue, false);
    pulseFrame();

    app.carryPreludeTimer = window.setTimeout(() => {
      renderCarryPreludeCarry(plan, stepIndex);
    }, CARRY_PRELUDE_MS);
  }

  function renderCarryPreludeCarry(plan, stepIndex) {
    if (!app.carryPreludeActive || app.carryPreludePlan !== plan) {
      return;
    }

    renderAll(plan.oldValue, plan.oldValue, true, getCarryPreludeStepEffects(plan, stepIndex, "carry"));
    updateUI(plan.oldValue, plan.oldValue, false);
    pulseFrame();

    app.carryPreludeTimer = window.setTimeout(() => {
      renderCarryPreludeUsedUp(plan, stepIndex + 1);
    }, CARRY_ROLL_MS);
  }

  function finishCarryPrelude(plan) {
    if (!app.carryPreludeActive || app.carryPreludePlan !== plan) {
      return;
    }

    app.carryPreludeActive = false;
    app.carryPreludeTimer = 0;
    app.carryPreludePlan = null;
    applyValueChange(plan.oldValue, plan.newValue, true, getCarryPreludeFinalEffects(plan));
    flushQueuedSteps();
  }

  function applyValueChange(oldValue, newValue, animate, effects = {}) {
    app.value = newValue;
    renderAll(oldValue, newValue, animate, effects);
    updateUI(oldValue, newValue, animate);
    pulseFrame();
  }

  function flushQueuedSteps() {
    const steps = app.queuedSteps;
    app.queuedSteps = 0;
    if (steps > 0) {
      requestIncrement(steps);
    }
  }

  function clearCarryPrelude() {
    window.clearTimeout(app.carryPreludeTimer);
    app.carryPreludeTimer = 0;
    app.carryPreludeActive = false;
    app.carryPreludePlan = null;
    app.queuedSteps = 0;
  }

  function showMaxValue() {
    stopHoldRepeat();
    showNotice("32bitで表せる最大値に到達しました。", 2600);
    showSplash("32 bit 最大");
    pulseFrame();
  }

  function enterDivisionMode() {
    if (app.mode !== "count" || app.divisionBusy) {
      return;
    }

    stopHoldRepeat();
    clearCarryPrelude();
    clearDivisionTimer();
    app.mode = "division";
    const oldValue = app.value;
    const startValue = oldValue === 0 ? DIVISION_FALLBACK_VALUE : oldValue;
    app.value = startValue;
    app.divisionInitialValue = startValue;
    app.divisor = 2;
    app.remainders = [];
    app.newestRemainderIndex = -1;
    app.divisionBusy = true;
    document.body.classList.add("division-mode", "division-transition");
    updateDivisorButtons();
    renderRemainders();

    app.fastRollSteps = oldValue === startValue ? 0 : 14;
    document.documentElement.style.setProperty("--fast-roll-duration", INTRO_ROLL_MS + "ms");
    renderAll(oldValue, startValue, oldValue !== startValue, getDivisionIntroEffects());
    updateUI(oldValue, startValue, oldValue !== startValue);
    syncDivisionValueInput(startValue, true);
    showSplash("÷2");
    pulseFrame();

    app.divisionTimer = window.setTimeout(() => {
      app.fastRollSteps = 0;
      app.divisionBusy = false;
      app.divisionTimer = 0;
      document.body.classList.remove("division-transition");
      renderAll(app.value, app.value, false);
      updateUI(app.value, app.value, false);
    }, INTRO_ROLL_MS);
  }

  function selectDivisor(divisor) {
    if (app.mode !== "division" || ![2, 10, 16].includes(divisor) || app.divisionBusy) {
      return;
    }
    if (app.divisor === divisor) {
      return;
    }

    app.divisor = divisor;
    updateDivisorButtons();
    resetDivisionValue(false);
    showSplash("÷ " + divisor);
  }

  function divideOnce() {
    if (app.mode !== "division" || app.divisionBusy) {
      return;
    }
    if (app.value === 0) {
      resetDivisionValue(true);
      return;
    }

    app.divisionBusy = true;
    showSplash("÷ " + app.divisor);
    pulseFrame();
    app.divisionTimer = window.setTimeout(beginDivisionRoll, DIVISION_SPLASH_MS);
  }

  function beginDivisionRoll() {
    const oldValue = app.value;
    const quotient = Math.floor(oldValue / app.divisor);
    const remainder = oldValue % app.divisor;
    const shiftKind = getShiftKindForDivisor(app.divisor);
    const delayedKinds = Object.keys(BASE).filter((kind) => kind !== shiftKind);

    app.fastRollSteps = 9;
    document.documentElement.style.setProperty("--fast-roll-duration", DIVISION_ROLL_MS + "ms");
    document.documentElement.style.setProperty("--division-shift-duration", DIVISION_ROLL_MS + "ms");
    document.body.classList.add("is-dividing", "division-shift-" + shiftKind);

    renderAll(oldValue, quotient, true, getDivisionEffects(oldValue, shiftKind));
    updateUI(oldValue, oldValue, false);
    fitDigitRows();

    const sourceColumn = document.querySelector('.radix-column[data-kind="' + shiftKind + '"]');
    if (sourceColumn) {
      sourceColumn.classList.add("is-shift-source");
    }
    const shiftDigits = createRadixShiftAnimation(shiftKind);
    const flights = showRemaindersBesideNumbers(remainder, [shiftKind], shiftKind, {
      ejectDuration: DIVISION_ROLL_MS
    });

    window.requestAnimationFrame(() => {
      shiftDigits.forEach((digit) => digit.classList.add("is-shifting"));
    });
    pulseFrame();

    app.divisionTimer = window.setTimeout(() => {
      shiftDigits.forEach((digit) => digit.remove());
      app.fastRollSteps = 0;
      app.value = quotient;
      clearShiftState();
      renderAll(quotient, quotient, false);
      updateUI(oldValue, quotient, true);
      syncDivisionValueInput(quotient, true);
      stabilizeShiftedRemainder(flights);
      const delayedFlights = showRemaindersBesideNumbers(remainder, delayedKinds, null, {
        generated: true,
        ejectDuration: REMAINDER_ORIGIN_MS
      });
      flights.push(...delayedFlights);
      app.divisionTimer = window.setTimeout(() => {
        commitRemainder(remainder, flights);
      }, REMAINDER_ORIGIN_MS);
    }, DIVISION_ROLL_MS);
  }

  function showRemaindersBesideNumbers(remainder, kinds, shiftKind, options = {}) {
    const sources = [
      { kind: "decimal", row: dom.decimalDigits },
      { kind: "binary", row: dom.binaryDigits },
      { kind: "hex", row: dom.hexDigits }
    ].filter((source) => kinds.includes(source.kind));

    return sources.map((source) => {
      const cells = source.row.querySelectorAll(".digit-cell");
      const anchor = cells[cells.length - 1] || source.row;
      const slot = anchor.querySelector(".current-slot") || anchor;
      const anchorRect = slot.getBoundingClientRect();
      const columnRect = source.row.closest(".radix-column").getBoundingClientRect();
      const flight = document.createElement("div");
      const symbol = formatRemainder(remainder, source.kind);
      const isOverflowSource = source.kind === shiftKind;
      const box = getRemainderFlightBox(symbol, anchorRect, columnRect, isOverflowSource || options.generated, options.generated);

      flight.className = [
        "remainder-flight",
        "remainder-flight-" + source.kind,
        isOverflowSource ? "is-overflow-remainder" : "",
        options.generated ? "is-generated-remainder" : ""
      ].filter(Boolean).join(" ");
      flight.dataset.kind = source.kind;
      flight.innerHTML = "<strong>" + symbol + "</strong>";
      flight.style.left = box.left + "px";
      flight.style.top = box.top + "px";
      flight.style.width = box.width + "px";
      flight.style.minHeight = box.height + "px";
      flight.style.setProperty("--remainder-font-size", box.fontSize + "px");
      if (isOverflowSource || options.generated) {
        flight.style.setProperty("--eject-distance", box.ejectDistance + "px");
        flight.style.setProperty("--eject-duration", (options.ejectDuration || REMAINDER_ORIGIN_MS) + "ms");
      }
      dom.carryLayer.appendChild(flight);
      void flight.offsetWidth;
      flight.classList.add("is-visible");
      if (isOverflowSource || options.generated) {
        void flight.offsetWidth;
        flight.classList.add("is-ejected");
      }
      return flight;
    });
  }

  function getRemainderFlightBox(symbol, anchorRect, columnRect, shouldEject, startInGap) {
    const viewportWidth = Math.max(1, window.innerWidth);
    const viewportHeight = Math.max(1, window.innerHeight);
    const width = clamp(44 + symbol.length * 14, 52, Math.min(92, Math.max(52, columnRect.width * 0.34)));
    const height = clamp(width, 48, 70);
    const fontSize = clamp(Math.floor(width / Math.max(1.65, symbol.length * 0.72)), 18, 31);
    const margin = 10;
    const maxLeft = Math.max(margin, Math.min(viewportWidth - width - margin, columnRect.right - width - 8));
    const centeredStart = anchorRect.left + anchorRect.width / 2 - width / 2;
    const gapStart = anchorRect.right + 8;
    const startLeft = clamp(startInGap ? gapStart : centeredStart, margin, maxLeft);
    const top = clamp(anchorRect.top + anchorRect.height / 2 - height / 2, margin, viewportHeight - height - margin);

    if (!shouldEject) {
      return { left: startLeft, top, width, height, fontSize, ejectDistance: 0 };
    }

    const preferredTarget = startInGap ? startLeft + Math.max(24, width * 0.36) : anchorRect.right + 12;
    const columnTarget = columnRect.right - width - 8;
    const viewportTarget = maxLeft;
    const targetLeft = clamp(Math.min(Math.max(preferredTarget, startLeft + 34), columnTarget), margin, viewportTarget);
    const fallbackTarget = clamp(Math.min(startLeft + Math.max(24, width * 0.64), viewportTarget), margin, viewportTarget);
    const finalTarget = targetLeft > startLeft ? targetLeft : fallbackTarget;
    return {
      left: startLeft,
      top,
      width,
      height,
      fontSize,
      ejectDistance: Math.max(0, finalTarget - startLeft)
    };
  }

  function stabilizeShiftedRemainder(flights) {
    flights.forEach((flight) => {
      if (!flight.classList.contains("is-ejected")) {
        return;
      }
      const rect = flight.getBoundingClientRect();
      flight.classList.add("is-stabilized");
      flight.classList.remove("is-ejected");
      flight.style.left = rect.left + "px";
      flight.style.top = rect.top + "px";
      void flight.offsetWidth;
      flight.classList.remove("is-stabilized");
      void flight.offsetWidth;
    });
  }

  function commitRemainder(remainder, flights) {
    stabilizeShiftedRemainder(flights);
    app.remainders.push(remainder);
    app.newestRemainderIndex = app.remainders.length - 1;
    renderRemainders();
    fitRemainderRows();

    window.requestAnimationFrame(() => {
      flights.forEach((flight) => {
        const kind = flight.dataset.kind;
        const target = dom.remainderTrack.querySelector(
          '.remainder-chip[data-kind="' + kind + '"][data-index="' + app.newestRemainderIndex + '"]'
        );
        if (!target) {
          return;
        }
        const from = flight.getBoundingClientRect();
        const to = target.getBoundingClientRect();
        flight.style.setProperty("--flight-x", to.left + to.width / 2 - (from.left + from.width / 2) + "px");
        flight.style.setProperty("--flight-y", to.top + to.height / 2 - (from.top + from.height / 2) + "px");
        flight.classList.add("is-flying");
      });
    });

    app.divisionTimer = window.setTimeout(() => {
      flights.forEach((flight) => flight.remove());
      dom.remainderTrack.querySelectorAll(".remainder-chip.is-awaiting").forEach((chip) => {
        chip.classList.remove("is-awaiting");
        chip.classList.add("is-landed");
      });
      dom.remainderTrack.querySelectorAll(".nibble-character.is-awaiting").forEach((character) => {
        character.classList.remove("is-awaiting");
        character.classList.add("is-landed");
      });
      app.divisionBusy = false;
      app.divisionTimer = 0;
    }, REMAINDER_FLIGHT_MS + 40);
  }

  function resetDivisionValue(withSplash) {
    clearDivisionTimer();
    const oldValue = app.value;
    app.value = app.divisionInitialValue;
    app.remainders = [];
    app.newestRemainderIndex = -1;
    app.fastRollSteps = 0;
    app.divisionBusy = false;
    clearShiftState();
    renderAll(oldValue, app.value, false);
    renderRemainders();
    updateUI(oldValue, app.value, false);
    syncDivisionValueInput(app.value, true);
    pulseFrame();
    if (withSplash) {
      showSplash(formatNumber(app.value));
    }
  }

  function clearDivisionTimer() {
    window.clearTimeout(app.divisionTimer);
    app.divisionTimer = 0;
    app.divisionBusy = false;
    dom.carryLayer.querySelectorAll(".remainder-flight").forEach((flight) => flight.remove());
    dom.carryLayer.querySelectorAll(".shift-digit").forEach((digit) => digit.remove());
  }

  function updateDivisorButtons() {
    dom.divisorButtons.forEach((button) => {
      const active = Number(button.dataset.divisor) === app.divisor;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function handleDivisionValueSubmit(event) {
    event.preventDefault();
    if (app.mode !== "division" || app.divisionBusy) {
      return;
    }

    const next = parseInputValue(dom.divisionValueInput.value, app.value);
    setDivisionValue(next);
  }

  function setDivisionValue(value) {
    const next = clamp(Math.floor(Number(value) || 0), 0, MAX_VALUE);
    clearDivisionTimer();
    const oldValue = app.value;
    app.value = next;
    app.divisionInitialValue = next;
    app.remainders = [];
    app.newestRemainderIndex = -1;
    app.fastRollSteps = 0;
    clearShiftState();
    renderAll(oldValue, next, false);
    renderRemainders();
    updateUI(oldValue, next, false);
    syncDivisionValueInput(next, true);
    pulseFrame();
    showSplash(formatNumber(next));
  }

  function parseInputValue(rawValue, fallback) {
    const text = String(rawValue ?? "").trim();
    if (!text) {
      return fallback;
    }
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return clamp(Math.floor(parsed), 0, MAX_VALUE);
  }

  function syncDivisionValueInput(value, force) {
    if (!dom.divisionValueInput) {
      return;
    }
    if (!force && document.activeElement === dom.divisionValueInput) {
      return;
    }
    dom.divisionValueInput.value = String(clamp(Math.floor(Number(value) || 0), 0, MAX_VALUE));
  }

  function getShiftKindForDivisor(divisor) {
    if (divisor === 10) {
      return "decimal";
    }
    if (divisor === 16) {
      return "hex";
    }
    return "binary";
  }

  function clearShiftState() {
    document.body.classList.remove(
      "is-dividing",
      "division-transition",
      "division-shift-decimal",
      "division-shift-binary",
      "division-shift-hex"
    );
    document.querySelectorAll(".radix-column.is-shift-source").forEach((column) => {
      column.classList.remove("is-shift-source");
    });
  }

  function createRadixShiftAnimation(kind) {
    const row = dom[kind + "Digits"];
    if (!row) {
      return [];
    }

    const cells = Array.from(row.querySelectorAll(".digit-cell"));
    const slots = cells.map((cell) => cell.querySelector(".current-slot") || cell);
    const rects = slots.map((slot) => slot.getBoundingClientRect());

    return cells.slice(0, -1).map((cell, index) => {
      const symbol = cell.querySelector(".roll-symbol:last-child");
      const text = symbol ? symbol.textContent : "";
      const from = rects[index];
      const to = rects[index + 1];
      const fromCenter = from.left + from.width / 2;
      const toCenter = to.left + to.width / 2;
      const digit = document.createElement("div");
      const accent = cell.style.getPropertyValue("--accent") || "";
      const symbolStyle = symbol ? window.getComputedStyle(symbol) : null;

      digit.className = "shift-digit shift-digit-" + kind;
      digit.textContent = text;
      digit.style.left = from.left + "px";
      digit.style.top = from.top + "px";
      digit.style.width = from.width + "px";
      digit.style.height = from.height + "px";
      digit.style.setProperty("--shift-x", toCenter - fromCenter + "px");
      if (accent) {
        digit.style.setProperty("--accent", accent);
      }
      if (symbolStyle) {
        digit.style.fontSize = symbolStyle.fontSize;
        digit.style.lineHeight = symbolStyle.lineHeight;
        digit.style.fontFamily = symbolStyle.fontFamily;
        digit.style.fontWeight = symbolStyle.fontWeight;
        digit.style.color = symbolStyle.color;
        digit.style.textShadow = symbolStyle.textShadow;
      }
      dom.carryLayer.appendChild(digit);
      return digit;
    });
  }

  function getDivisionIntroEffects() {
    const effects = {};
    Object.keys(BASE).forEach((kind) => {
      effects[kind] = {
        suppressCarry: true
      };
    });
    return effects;
  }

  function getDivisionEffects(oldValue, shiftKind) {
    const effects = {};
    Object.keys(BASE).forEach((kind) => {
      effects[kind] = {
        suppressCarry: true
      };
    });

    if (shiftKind && effects[shiftKind]) {
      effects[shiftKind].suppressRoll = true;
      effects[shiftKind].spec = getDisplaySpec(shiftKind, oldValue);
      effects[shiftKind].oldString = valueToString(shiftKind, oldValue);
      effects[shiftKind].newString = valueToString(shiftKind, oldValue);
      effects[shiftKind].oldActiveBits = bitLength(oldValue);
    }

    return effects;
  }

  function renderRemainders() {
    const displayed = app.remainders.map((value, index) => ({ value, index })).reverse();
    const panels = [
      { kind: "decimal", label: "10進数の余り" },
      { kind: "binary", label: "2進数の余り" },
      { kind: "hex", label: "16進数の余り" }
    ];

    dom.remainderTrack.innerHTML = panels.map((panel) => {
      const hasNibbleSummary = panel.kind === "hex" && app.divisor === 2 && displayed.length > 0;
      return [
        '<section class="remainder-radix-panel remainder-', panel.kind, hasNibbleSummary ? " has-nibble-summary" : "", '">',
        '<div class="remainder-radix-label">', panel.label, "</div>",
        '<div class="remainder-values', isGroupedRemainderPanel(panel.kind) ? " has-bit-groups" : "", '">',
        displayed.length > 0
          ? renderRemainderValues(displayed, panel.kind)
          : "",
        "</div>",
        panel.kind === "hex" ? renderNibbleSummary(displayed) : "",
        "</section>"
      ].join("");
    }).join("");
    queueFitRemainders();
  }

  function isGroupedRemainderPanel(kind) {
    return app.divisor === 2 && (kind === "binary" || kind === "hex");
  }

  function renderRemainderValues(displayed, kind) {
    if (!isGroupedRemainderPanel(kind)) {
      return displayed.map((item) => remainderChipHtml(item, kind)).join("");
    }

    return getRemainderGroups(displayed).map((group) => [
      '<div class="remainder-bit-group">',
      group.map((item) => remainderChipHtml(item, kind)).join(""),
      "</div>"
    ].join("")).join("");
  }

  function getRemainderGroups(displayed) {
    if (displayed.length === 0) {
      return [];
    }
    const groups = [];
    const firstLength = displayed.length % 4 || 4;
    groups.push(displayed.slice(0, firstLength));
    for (let index = firstLength; index < displayed.length; index += 4) {
      groups.push(displayed.slice(index, index + 4));
    }
    return groups;
  }

  function remainderChipHtml(item, kind) {
    const isNewest = item.index === app.newestRemainderIndex;
    const symbol = formatRemainder(item.value, kind);
    const place = app.divisor + "<sup>" + item.index + "</sup>";
    return [
      '<div class="remainder-chip remainder-chip-', kind, isNewest ? " is-awaiting" : "", '" data-kind="', kind,
      '" data-index="', item.index, '" data-symbol-length="', symbol.length, '">',
      '<span class="remainder-place">', place, "</span>",
      '<strong>', symbol, "</strong>",
      "</div>"
    ].join("");
  }

  function formatRemainder(value, kind) {
    if (kind === "binary") {
      const width = app.divisor === 2 ? 1 : Math.ceil(Math.log2(app.divisor));
      return value.toString(2).padStart(Math.max(1, width), "0");
    }
    if (kind === "hex") {
      return value.toString(16).toUpperCase();
    }
    return String(value);
  }

  function renderNibbleSummary(displayed) {
    if (app.divisor !== 2 || displayed.length === 0) {
      return "";
    }

    const groups = getRemainderGroups(displayed);
    return [
      '<div class="remainder-nibble-row" aria-label="4bitに対応する16進数">',
      groups.map((items) => {
        const bits = items.map((item) => item.value).join("");
        const group = {
          bits,
          hex: parseInt(bits, 2).toString(16).toUpperCase(),
          isNew: items.some((item) => item.index === app.newestRemainderIndex)
        };
        return [
          '<div class="nibble-character-group" style="grid-template-columns:repeat(', items.length, ',var(--remainder-chip-width))">',
          '<strong class="nibble-character', group.isNew ? " is-awaiting" : "", '" title="',
          group.bits, " = ", group.hex, '">', group.hex, "</strong></div>"
        ].join("");
      }).join(""),
      "</div>"
    ].join("");
  }

  function resetValue() {
    if (app.mode === "division") {
      resetDivisionValue(true);
      return;
    }
    stopHoldRepeat();
    clearCarryPrelude();
    const oldValue = app.value;
    app.value = 0;
    renderAll(oldValue, 0, false);
    updateUI(oldValue, 0, false);
    showSplash("リセット");
    pulseFrame();
    showNotice("");
  }

  function renderAll(oldValue, newValue, animate, effects = {}) {
    const auxiliaryAnimate = animate && !effects.suppressAuxiliary;
    const models = {
      decimal: buildModel("decimal", oldValue, newValue, animate, effects.decimal),
      binary: buildModel("binary", oldValue, newValue, animate, effects.binary),
      hex: buildModel("hex", oldValue, newValue, animate, effects.hex)
    };

    renderDigits("decimal", models.decimal, dom.decimalDigits);
    renderDigits("binary", models.binary, dom.binaryDigits);
    renderDigits("hex", models.hex, dom.hexDigits);
    renderMetrics(oldValue, newValue, auxiliaryAnimate);
    queueFitDigits();

    if (auxiliaryAnimate) {
      window.requestAnimationFrame(() => emitCarryEffects());
    }
    if (hasUsedUpEffects(effects)) {
      window.requestAnimationFrame(() => emitUsedUpEffects());
    }
  }

  function buildModel(kind, oldValue, newValue, animate, effects = {}) {
    const base = BASE[kind];
    const symbols = SYMBOLS[kind];
    const usedUpPositions = effects.usedUpPositions || new Set();
    const spec = effects.spec || getDisplaySpec(kind, newValue);
    const rawOldString = effects.oldString || valueToString(kind, oldValue);
    const rawNewString = effects.newString || valueToString(kind, newValue);
    const oldString = rawOldString.padStart(spec.length, "0").slice(-spec.length);
    const newString = rawNewString.padStart(spec.length, "0").slice(-spec.length);
    const oldActiveBits = effects.oldActiveBits || bitLength(oldValue);

    const digits = [];
    for (let index = 0; index < spec.length; index += 1) {
      const position = spec.length - index - 1;
      const oldSymbol = animate ? oldString[index] : newString[index];
      const newSymbol = newString[index];
      const oldDigit = Math.max(0, symbols.indexOf(oldSymbol));
      const newDigit = Math.max(0, symbols.indexOf(newSymbol));
      const fastRolling = animate && !effects.suppressRoll && app.fastRollSteps > 0;
      const changed = animate && !effects.suppressRoll && (oldSymbol !== newSymbol || fastRolling);
      const isPadding = kind === "binary" && position >= spec.activeBits;
      const wasPadding = kind === "binary" && position >= oldActiveBits;
      const carryOut = !effects.suppressCarry && changed && oldDigit === base - 1 && newDigit === 0;
      const carryIn = !effects.suppressCarry && !effects.suppressCarryIn && changed && position > 0 && hasCarryIntoPosition(oldValue, base, position);
      const nibbleIndex = kind === "binary" ? Math.floor(position / 4) : kind === "hex" ? position : -1;
      const accent = nibbleIndex >= 0 ? GROUP_COLORS[nibbleIndex % GROUP_COLORS.length] : "";
      const used = isPadding ? new Set([0]) : getUsedSymbolsForDigit(newDigit);
      const usedUp = usedUpPositions.has(position);

      digits.push({
        kind,
        base,
        symbols,
        position,
        oldSymbol,
        newSymbol,
        oldDigit,
        newDigit,
        changed,
        fastRolling,
        carryOut,
        carryIn,
        isPadding,
        wasPadding,
        nibbleIndex,
        accent,
        used,
        usedUp
      });
    }

    return {
      kind,
      base,
      symbols,
      spec,
      digits
    };
  }

  function renderDigits(kind, model, container) {
    container.dataset.count = String(model.digits.length);
    if (kind === "binary") {
      container.innerHTML = renderBinaryGroups(model);
      return;
    }
    container.innerHTML = model.digits.map((digit) => digitHtml(digit)).join("");
  }

  function renderBinaryGroups(model) {
    const groups = [];
    let current = null;

    model.digits.forEach((digit) => {
      if (!current || current.nibbleIndex !== digit.nibbleIndex) {
        current = {
          nibbleIndex: digit.nibbleIndex,
          accent: digit.accent,
          digits: []
        };
        groups.push(current);
      }
      current.digits.push(digit);
    });

    return groups.map((group) => {
      return [
        '<div class="nibble-group" style="--accent:',
        group.accent,
        '">',
        group.digits.map((digit) => digitHtml(digit)).join(""),
        "</div>"
      ].join("");
    }).join("");
  }

  function digitHtml(digit) {
    const fastRolling = digit.fastRolling;
    const classes = [
      "digit-cell",
      digit.changed && !fastRolling ? "is-rolling" : "",
      fastRolling ? "is-fast-rolling" : "",
      digit.carryOut ? "is-carry-out" : "",
      digit.carryIn ? "is-carry-in" : "",
      digit.usedUp ? "is-used-up" : "",
      digit.isPadding ? "is-padding" : "",
      digit.wasPadding && !digit.isPadding ? "was-padding" : ""
    ].filter(Boolean).join(" ");
    const styleParts = [];
    const divisionReel = fastRolling && app.mode === "division" && !digit.isPadding;
    if (digit.accent) {
      styleParts.push("--accent:" + digit.accent);
    }
    const rollSymbols = [digit.oldSymbol];
    if (fastRolling) {
      for (let index = 1; index < app.fastRollSteps; index += 1) {
        rollSymbols.push(digit.symbols[(digit.oldDigit + index) % digit.base]);
      }
      rollSymbols.push(digit.newSymbol);
      styleParts.push("--roll-distance:calc(-" + (rollSymbols.length - 1) + " * var(--digit-size))");
    } else {
      rollSymbols.push(digit.newSymbol);
    }
    const prev = digit.isPadding ? "" : digit.symbols[(digit.newDigit + digit.base - 1) % digit.base];
    const next = digit.isPadding ? "" : digit.symbols[(digit.newDigit + 1) % digit.base];
    let divisionReelSymbols = [];

    if (divisionReel && app.divisor === 2) {
      const decrementSymbols = [digit.oldSymbol];
      for (let index = 1; index < app.fastRollSteps; index += 1) {
        decrementSymbols.push(digit.symbols[(digit.oldDigit - index + digit.base * 2) % digit.base]);
      }
      decrementSymbols.push(digit.newSymbol);
      divisionReelSymbols = [digit.symbols[(digit.newDigit + digit.base - 1) % digit.base]]
        .concat(decrementSymbols.slice().reverse(), [digit.symbols[(digit.oldDigit + 1) % digit.base]]);
      styleParts.push("--division-reel-start:calc(-" + (decrementSymbols.length - 0.34).toFixed(2) + " * var(--digit-size))");
      styleParts.push("--division-reel-end:calc(-0.66 * var(--digit-size))");
    } else if (divisionReel) {
      divisionReelSymbols = [digit.symbols[(digit.oldDigit + digit.base - 1) % digit.base]]
        .concat(rollSymbols, [digit.symbols[(digit.newDigit + 1) % digit.base]]);
      styleParts.push("--division-reel-start:calc(-0.66 * var(--digit-size))");
      styleParts.push("--division-reel-end:calc(-" + (rollSymbols.length - 0.34).toFixed(2) + " * var(--digit-size))");
    }

    const style = styleParts.length > 0 ? ' style="' + styleParts.join(";") + '"' : "";
    const divisionReelHtml = divisionReel
      ? [
        '<div class="division-reel-window"><div class="division-reel-track">',
        divisionReelSymbols.map((symbol) => '<span class="division-reel-symbol">' + symbol + "</span>").join(""),
        "</div></div>"
      ].join("")
      : "";

    return [
      '<div class="', classes, divisionReel ? " is-division-reel" : "", '" data-kind="', digit.kind, '" data-pos="', digit.position, '" data-base="', digit.base, '"', style, ">",
      '<div class="digit-window">',
      '<div class="digit-neighbor">', prev, "</div>",
      '<div class="current-slot"><div class="roll-track">',
      rollSymbols.map((symbol) => '<span class="roll-symbol">' + symbol + "</span>").join(""),
      "</div></div>",
      '<div class="digit-neighbor">', next, "</div>",
      divisionReelHtml,
      "</div>",
      usageHtml(digit),
      "</div>"
    ].join("");
  }

  function usageHtml(digit) {
    const cols = usageColumnCount(digit.base);
    const parts = ['<div class="usage-grid" style="--usage-cols:', cols, '">'];
    for (let i = 0; i < digit.symbols.length; i += 1) {
      const classes = [
        "usage-symbol",
        digit.used.has(i) ? "is-used" : "",
        !digit.isPadding && i === digit.newDigit ? "is-current" : ""
      ].filter(Boolean).join(" ");
      parts.push('<span class="', classes, '">', digit.symbols[i], "</span>");
    }
    parts.push("</div>");
    return parts.join("");
  }

  function renderMetrics(oldValue, newValue, animate) {
    const oldStats = getStats(oldValue);
    const newStats = getStats(newValue);
    dom.decimalMetrics.innerHTML = metricPill(newStats.decimalChars, "文字", animate && oldStats.decimalChars !== newStats.decimalChars);
    dom.binaryMetrics.innerHTML = [
      metricPill(newStats.bits, "bit", animate && oldStats.bits !== newStats.bits),
      metricPill(newStats.binaryBytes, "Byte", animate && oldStats.binaryBytes !== newStats.binaryBytes)
    ].join("");
    dom.hexMetrics.innerHTML = [
      metricPill(newStats.hexChars, "文字", animate && oldStats.hexChars !== newStats.hexChars),
      metricPill(newStats.hexBytes, "Byte", animate && oldStats.hexBytes !== newStats.hexBytes)
    ].join("");
  }

  function metricPill(value, label, bumped) {
    return [
      '<div class="metric-pill', bumped ? " is-bumped" : "", '">',
      "<strong>", formatMetricNumber(value), "</strong>",
      "<span>", label, "</span>",
      "</div>"
    ].join("");
  }

  function updateUI(oldValue, newValue, animate) {
    const stats = getStats(newValue);

    dom.stageTitle.textContent = app.started
      ? app.mode === "division"
        ? formatNumber(newValue) + " を ÷" + app.divisor
        : "数値 " + formatNumber(newValue)
      : "準備中";
    dom.valueBadge.textContent = "現在値 " + formatNumber(newValue);
    dom.bitBadge.textContent = stats.bits + " / " + MAX_BITS + " bit";
    dom.limitBadge.textContent = app.mode === "division"
      ? "選択中 ÷" + app.divisor
      : newValue >= MAX_VALUE ? "32bit 最大" : "最大 " + formatNumber(MAX_VALUE);
    dom.resetButton.textContent = app.mode === "division" ? "初期値に戻す" : "リセット";
    if (app.mode === "division") {
      syncDivisionValueInput(newValue, false);
    }

    if (animate && oldValue !== newValue) {
      dom.valueBadge.classList.remove("is-bumped");
      void dom.valueBadge.offsetWidth;
      dom.valueBadge.classList.add("is-bumped");
    }
  }

  function getDisplaySpec(kind, value) {
    if (kind === "decimal") {
      return {
        length: Math.max(1, value.toString(10).length),
        activeBits: bitLength(value)
      };
    }

    const bits = bitLength(value);
    if (kind === "binary") {
      return {
        length: Math.max(4, Math.ceil(bits / 4) * 4),
        activeBits: bits
      };
    }

    return {
      length: Math.max(1, Math.ceil(bits / 4)),
      activeBits: bits
    };
  }

  function valueToString(kind, value) {
    if (kind === "decimal") {
      return value.toString(10);
    }
    if (kind === "binary") {
      return value.toString(2);
    }
    return value.toString(16).toUpperCase();
  }

  function bitLength(value) {
    if (value <= 0) {
      return 1;
    }
    return Math.floor(Math.log2(value)) + 1;
  }

  function getStats(value) {
    const bits = bitLength(value);
    const hexChars = Math.max(1, Math.ceil(bits / 4));
    return {
      decimalChars: Math.max(1, value.toString(10).length),
      bits,
      binaryBytes: bits / 8,
      hexChars,
      hexBytes: hexChars / 2
    };
  }

  function hasAnyCarryOut(oldValue, newValue) {
    return Object.keys(BASE).some((kind) => getCarryOutPositions(kind, oldValue, newValue).size > 0);
  }

  function buildCarryPreludePlan(oldValue, newValue) {
    const positions = {};
    let stepCount = 0;

    Object.keys(BASE).forEach((kind) => {
      const carryPositions = Array.from(getCarryOutPositions(kind, oldValue, newValue)).sort((a, b) => a - b);
      positions[kind] = carryPositions;
      stepCount = Math.max(stepCount, carryPositions.length);
    });

    return {
      oldValue,
      newValue,
      positions,
      stepCount
    };
  }

  function getCarryPreludeStepEffects(plan, stepIndex, phase) {
    const effects = {};
    Object.keys(BASE).forEach((kind) => {
      const carryPositions = plan.positions[kind];
      const hasCurrentCarry = stepIndex < carryPositions.length;
      const fromResetCount = Math.min(stepIndex, carryPositions.length);
      const toResetCount = phase === "carry" && hasCurrentCarry
        ? fromResetCount + 1
        : fromResetCount;
      const usedUpPositions = phase === "used-up" && hasCurrentCarry
        ? new Set([carryPositions[stepIndex]])
        : new Set();

      if (carryPositions.length > 0) {
        effects[kind] = {
          spec: getDisplaySpec(kind, plan.oldValue),
          oldString: getCarryPreludeString(kind, plan.oldValue, carryPositions, fromResetCount, plan.oldValue),
          newString: getCarryPreludeString(kind, plan.oldValue, carryPositions, toResetCount, plan.oldValue),
          usedUpPositions,
          suppressCarryIn: true
        };
      }
    });
    return effects;
  }

  function getCarryPreludeFinalEffects(plan) {
    const effects = {};

    Object.keys(BASE).forEach((kind) => {
      const carryPositions = plan.positions[kind];
      if (carryPositions.length > 0) {
        effects[kind] = {
          spec: getDisplaySpec(kind, plan.newValue),
          oldString: getCarryPreludeString(kind, plan.oldValue, carryPositions, carryPositions.length, plan.newValue),
          newString: valueToString(kind, plan.newValue)
        };
      }
    });

    return effects;
  }

  function getCarryPreludeString(kind, value, carryPositions, resetCount, specValue) {
    const spec = getDisplaySpec(kind, specValue);
    const chars = valueToString(kind, value).padStart(spec.length, "0").slice(-spec.length).split("");
    const resets = Math.min(resetCount, carryPositions.length);

    for (let index = 0; index < resets; index += 1) {
      const position = carryPositions[index];
      const charIndex = chars.length - position - 1;
      if (charIndex >= 0 && charIndex < chars.length) {
        chars[charIndex] = "0";
      }
    }

    return chars.join("");
  }

  function getCarryOutPositions(kind, oldValue, newValue) {
    const base = BASE[kind];
    const spec = getDisplaySpec(kind, oldValue);
    const positions = new Set();

    for (let position = 0; position < spec.length; position += 1) {
      if (digitAt(oldValue, base, position) === base - 1 && digitAt(newValue, base, position) === 0) {
        positions.add(position);
      }
    }

    return positions;
  }

  function hasUsedUpEffects(effects) {
    return Object.values(effects).some((effect) => {
      return effect && effect.usedUpPositions && effect.usedUpPositions.size > 0;
    });
  }

  function getUsedSymbols(base, position, value) {
    return getUsedSymbolsForDigit(digitAt(value, base, position));
  }

  function getUsedSymbolsForDigit(currentDigit) {
    const result = new Set();
    for (let i = 0; i <= currentDigit; i += 1) {
      result.add(i);
    }
    return result;
  }

  function digitAt(value, base, position) {
    return Math.floor(value / (base ** position)) % base;
  }

  function hasCarryIntoPosition(oldValue, base, position) {
    const lower = base ** position;
    return oldValue % lower === lower - 1;
  }

  function usageColumnCount(base) {
    if (base === 2) {
      return 2;
    }
    if (base === 10) {
      return 5;
    }
    return 4;
  }

  function emitCarryEffects() {
    const now = performance.now();
    const carryCells = Array.from(document.querySelectorAll(".digit-cell.is-carry-out"));
    if (carryCells.length === 0) {
      return;
    }

    if (now - app.lastCarryFxAt < 42) {
      return;
    }
    app.lastCarryFxAt = now;

    const selected = carryCells.length > 18
      ? carryCells.filter((_, index) => index % Math.ceil(carryCells.length / 18) === 0)
      : carryCells;

    selected.forEach((cell, index) => {
      window.setTimeout(() => spawnCarryBurst(cell), index * 18);
    });
  }

  function emitUsedUpEffects() {
    const now = performance.now();
    const usedUpCells = Array.from(document.querySelectorAll(".digit-cell.is-used-up"));
    if (usedUpCells.length === 0) {
      return;
    }

    if (now - app.lastUsedUpFxAt < 42) {
      return;
    }
    app.lastUsedUpFxAt = now;

    const selected = usedUpCells.length > 18
      ? usedUpCells.filter((_, index) => index % Math.ceil(usedUpCells.length / 18) === 0)
      : usedUpCells;

    selected.forEach((cell, index) => {
      window.setTimeout(() => spawnUsedUpBurst(cell), index * 16);
    });
  }

  function spawnCarryBurst(cell) {
    const rect = cell.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }

    const accent = cell.style.getPropertyValue("--accent") || "#ffd166";
    const pop = document.createElement("div");
    pop.className = "carry-pop";
    pop.style.left = rect.left + rect.width / 2 + "px";
    pop.style.top = rect.top + rect.height / 2 + "px";
    pop.style.setProperty("--accent", accent);

    for (let i = 0; i < 14; i += 1) {
      const spark = document.createElement("span");
      const angle = (Math.PI * 2 * i) / 14 + seededNoise(i + rect.left) * 0.35;
      const distance = 28 + seededNoise(i * 13 + rect.top) * 58;
      spark.style.setProperty("--dx", Math.cos(angle) * distance + "px");
      spark.style.setProperty("--dy", Math.sin(angle) * distance + "px");
      pop.appendChild(spark);
    }

    dom.carryLayer.appendChild(pop);
    window.setTimeout(() => {
      pop.remove();
    }, 900);
  }

  function spawnUsedUpBurst(cell) {
    const rect = cell.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }

    const accent = cell.style.getPropertyValue("--accent") || "#ffd166";
    const pop = document.createElement("div");
    pop.className = "used-up-pop";
    pop.style.left = rect.left + rect.width / 2 + "px";
    pop.style.top = rect.top + rect.height / 2 + "px";
    pop.style.setProperty("--accent", accent);

    for (let i = 0; i < 10; i += 1) {
      const spark = document.createElement("span");
      const angle = (Math.PI * 2 * i) / 10 + seededNoise(i + rect.right) * 0.28;
      const distance = 18 + seededNoise(i * 17 + rect.bottom) * 42;
      spark.style.setProperty("--dx", Math.cos(angle) * distance + "px");
      spark.style.setProperty("--dy", Math.sin(angle) * distance + "px");
      pop.appendChild(spark);
    }

    dom.carryLayer.appendChild(pop);
    window.setTimeout(() => {
      pop.remove();
    }, 760);
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

  function queueFitDigits() {
    window.requestAnimationFrame(fitDigitRows);
  }

  function queueFitRemainders() {
    window.requestAnimationFrame(fitRemainderRows);
  }

  function fitRemainderRows() {
    dom.remainderTrack.querySelectorAll(".remainder-radix-panel").forEach((panel) => {
      const values = panel.querySelector(".remainder-values");
      const chips = Array.from(panel.querySelectorAll(".remainder-chip"));
      if (!values || chips.length === 0) {
        return;
      }

      const width = Math.max(1, values.getBoundingClientRect().width);
      const bitGroupCount = panel.querySelectorAll(".remainder-bit-group").length;
      let gap = bitGroupCount > 0 ? 2 : chips.length >= 9 ? 3 : 6;
      let groupGap = bitGroupCount > 0 ? 10 : 0;
      const getReservedGap = () => bitGroupCount > 0
        ? (chips.length - bitGroupCount) * gap + (bitGroupCount - 1) * groupGap
        : gap * (chips.length - 1);
      let chipWidth = Math.floor((width - getReservedGap()) / chips.length);
      if (chipWidth < 28) {
        gap = bitGroupCount > 0 ? 1 : 2;
        groupGap = bitGroupCount > 0 ? 6 : 0;
        chipWidth = Math.floor((width - getReservedGap()) / chips.length);
      }
      chipWidth = clamp(chipWidth, 14, 82);

      const maxSymbolLength = Math.max(...chips.map((chip) => Number(chip.dataset.symbolLength || 1)));
      const fontSize = clamp(
        Math.floor(Math.min(chipWidth * 0.5, chipWidth / Math.max(0.68, maxSymbolLength * 0.62))),
        9,
        34
      );
      panel.style.setProperty("--remainder-chip-width", chipWidth + "px");
      panel.style.setProperty("--remainder-chip-gap", gap + "px");
      panel.style.setProperty("--remainder-group-gap", groupGap + "px");
      panel.style.setProperty("--remainder-font-size", fontSize + "px");
      panel.style.setProperty("--remainder-place-size", clamp(Math.floor(chipWidth * 0.14), 7, 11) + "px");
      panel.classList.toggle("is-compact", chipWidth < 34);
    });
  }

  function fitDigitRows() {
    fitDigitRow(dom.decimalDigits, "decimal");
    fitDigitRow(dom.binaryDigits, "binary");
    fitDigitRow(dom.hexDigits, "hex");
  }

  function fitDigitRow(row, kind) {
    const rect = row.getBoundingClientRect();
    const count = Math.max(1, Number(row.dataset.count || row.querySelectorAll(".digit-cell").length || 1));
    const width = Math.max(1, rect.width);
    const groupCount = kind === "binary" ? Math.max(1, row.querySelectorAll(".nibble-group").length) : 0;
    const groupReserve = kind === "binary" ? groupCount * 9 : 0;
    const perCellReserve = kind === "binary" ? 2 : 5;
    const minCell = kind === "binary" ? 10 : 22;
    const maxCell = kind === "binary" ? 40 : 88;
    const minDigit = kind === "binary" ? 12 : 20;
    const maxDigit = kind === "binary" ? 44 : 78;
    const available = Math.max(1, width - groupReserve);
    const cellWidth = clamp(Math.floor(available / count - perCellReserve), minCell, maxCell);
    const digitSize = clamp(Math.floor(cellWidth * (kind === "binary" ? 1.12 : 0.95)), minDigit, maxDigit);
    const digitGap = Math.max(1, Math.round(cellWidth * (kind === "binary" ? 0.1 : 0.14)));
    const groupGap = Math.max(3, Math.round(cellWidth * 0.35));

    row.style.setProperty("--cell-width", cellWidth + "px");
    row.style.setProperty("--digit-size", digitSize + "px");
    row.style.setProperty("--digit-gap", digitGap + "px");
    row.style.setProperty("--group-gap", groupGap + "px");
  }

  function initParticles() {
    app.particles = Array.from({ length: 120 }, (_, index) => ({
      x: seededNoise(index * 19 + 3),
      y: seededNoise(index * 29 + 7),
      speed: 0.012 + seededNoise(index * 37 + 11) * 0.038,
      sway: 8 + seededNoise(index * 43 + 13) * 26,
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
    drawNumberMist(ctx, now);
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

  function drawNumberMist(ctx, now) {
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
      ctx.font = "900 " + particle.size + "px Consolas, 'Courier New', monospace";
      ctx.fillText(particle.symbol, x, y);
    });
    ctx.restore();
  }

  function formatNumber(value) {
    return Math.round(value).toLocaleString("ja-JP");
  }

  function formatMetricNumber(value) {
    return Number(value).toLocaleString("ja-JP", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 3
    });
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function seededNoise(seed) {
    const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  window.NumberDigital = {
    start: startExperience,
    increment: incrementValue,
    reset: resetValue,
    enterDivision: enterDivisionMode,
    divide: divideOnce,
    selectDivisor,
    setValue: (value) => {
      clearCarryPrelude();
      clearDivisionTimer();
      const next = clamp(Math.floor(Number(value) || 0), 0, MAX_VALUE);
      const old = app.value;
      app.value = next;
      if (app.mode === "division") {
        app.divisionInitialValue = next;
        app.remainders = [];
        app.newestRemainderIndex = -1;
        clearShiftState();
        renderRemainders();
        syncDivisionValueInput(next, true);
      }
      renderAll(old, next, false);
      updateUI(old, next, false);
    },
    state: () => ({
      started: app.started,
      mode: app.mode,
      value: app.value,
      divisionInitialValue: app.divisionInitialValue,
      divisor: app.divisor,
      remainders: app.remainders.slice(),
      divisionBusy: app.divisionBusy,
      speed: app.speed,
      bits: bitLength(app.value),
      max: MAX_VALUE
    })
  };
})();
