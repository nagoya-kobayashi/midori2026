(() => {
  "use strict";

  const DISPLAY_SECONDS = 0.25;
  const WAVE_RESOLUTION = 900;
  const DEFAULT_SAMPLE_RATE = 64;
  const DEFAULT_BITS = 4;
  const MIN_SAMPLE_RATE = 16;
  const MAX_SAMPLE_RATE = 512;
  const MIN_BITS = 2;
  const MAX_BITS = 6;

  const SLIDE_INFO = [
    {
      title: "リアルタイム・オシロスコープ",
      text: "音の波形をリアルタイム表示中",
      hint: "Space / Enter: 波形を停止"
    },
    {
      title: "波形停止",
      text: "その瞬間の音を、連続した波形として固定しました",
      hint: "Space / Enter: 標本化へ"
    },
    {
      title: "標本化",
      text: "一定間隔で音の高さを取り出す → 標本化",
      hint: "Space / Enter: 量子化へ"
    },
    {
      title: "量子化",
      text: "取り出した値を、決められた段階の値に近づける → 量子化",
      hint: "Space / Enter: 符号化へ"
    },
    {
      title: "符号化",
      text: "段階の番号を0と1の組み合わせで表す → 符号化",
      hint: "Space / Enter: デジタルデータの状態へ"
    },
    {
      title: "デジタルデータの状態",
      text: "音そのものではなく、0と1のデータとして保存される",
      hint: "Space / Enter: ファイルサイズを確認"
    },
    {
      title: "ファイルサイズ",
      text: "保存された0と1を1bitずつ数え、ファイルサイズを確認する",
      hint: "Space / Enter: D/A変換へ"
    },
    {
      title: "D/A変換：グリッド再表示",
      text: "0と1のデータから、音の波形を復元する",
      hint: "Space / Enter: 1点ずつ復元"
    },
    {
      title: "D/A変換：1点ずつ復元",
      text: "コードを選び、元の位置へ戻して点にします",
      hint: "Space / Enter: 1データ復元"
    },
    {
      title: "D/A変換：近似曲線表示",
      text: "0と1のデータから、元の音に近い波形を作り直す",
      hint: "Space / Enter: 元の波形と比較"
    },
    {
      title: "元の連続波形表示",
      text: "標本化周波数や量子化ビット数が高いほど、元の波形に近づく",
      hint: "Space / Enter: パラメータ調整へ"
    },
    {
      title: "2周目以降：パラメータ調整",
      text: "標本化周波数と量子化ビット数を変えると、データ量と音の再現度が変わる",
      hint: "Space / Enter: 標本化へ戻る"
    }
  ];

  const STAGE_ORDER = ["continuous", "sampling", "quantizing", "encoding"];

  const app = {
    canvas: null,
    ctx: null,
    dpr: 1,
    width: 0,
    height: 0,
    started: false,
    step: 0,
    stepStartedAt: 0,
    lastFrameAt: 0,
    currentWave: new Array(WAVE_RESOLUTION).fill(0),
    frozenWave: null,
    model: null,
    morphFrom: null,
    morphStartedAt: 0,
    audioContext: null,
    analyser: null,
    audioBuffer: null,
    mediaStream: null,
    inputMode: "waiting",
    inputNotice: "",
    audioLevel: 0,
    params: {
      sampleRate: DEFAULT_SAMPLE_RATE,
      bits: DEFAULT_BITS
    },
    lineAnimAt: 0,
    restoreIndex: 0,
    restoreFlights: [],
    splashTimer: 0,
    rebuildCodeLayoutKey: "",
    codeLayout: null,
    resizeQueued: false
  };

  const dom = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    app.canvas = document.getElementById("stage");
    app.ctx = app.canvas.getContext("2d");

    Object.assign(dom, {
      startOverlay: document.getElementById("startOverlay"),
      startButton: document.getElementById("startButton"),
      startNote: document.getElementById("startNote"),
      stageTitle: document.getElementById("stageTitle"),
      slideBadge: document.getElementById("slideBadge"),
      sourceBadge: document.getElementById("sourceBadge"),
      dataBadge: document.getElementById("dataBadge"),
      paramPanel: document.getElementById("paramPanel"),
      sampleRateRange: document.getElementById("sampleRateRange"),
      sampleRateInput: document.getElementById("sampleRateInput"),
      quantBitsRange: document.getElementById("quantBitsRange"),
      quantBitsInput: document.getElementById("quantBitsInput"),
      paramStats: document.getElementById("paramStats"),
      notice: document.getElementById("notice"),
      splash: document.getElementById("stepSplash"),
      spaceFlash: document.getElementById("spaceFlash"),
      legendItems: Array.from(document.querySelectorAll(".legend-item"))
    });

    dom.startButton.addEventListener("click", startExperience);
    window.addEventListener("resize", resizeCanvas);
    document.addEventListener("keydown", handleKeyDown);

    dom.sampleRateRange.addEventListener("input", () => setSampleRate(Number(dom.sampleRateRange.value)));
    dom.sampleRateInput.addEventListener("change", () => setSampleRate(Number(dom.sampleRateInput.value)));
    dom.quantBitsRange.addEventListener("input", () => setBits(Number(dom.quantBitsRange.value)));
    dom.quantBitsInput.addEventListener("change", () => setBits(Number(dom.quantBitsInput.value)));

    resizeCanvas();
    app.model = buildModel();
    updateUI();
    requestAnimationFrame(frame);
  }

  async function startExperience() {
    if (app.started) {
      return;
    }

    app.started = true;
    app.step = 0;
    app.stepStartedAt = performance.now();
    app.frozenWave = null;
    app.model = buildModel();
    updateUI();

    const audioMessage = await startAudio();
    const fullscreenMessage = await requestFullscreen();
    const messages = [fullscreenMessage, audioMessage].filter(Boolean);

    if (messages.length > 0) {
      setNotice(messages.join(" / "));
    }

    dom.startOverlay.classList.add("is-hidden");
    pulseFrame();
  }

  async function requestFullscreen() {
    if (!document.documentElement.requestFullscreen || document.fullscreenElement) {
      return "";
    }

    try {
      await document.documentElement.requestFullscreen();
      return "";
    } catch (error) {
      return "全画面表示はブラウザに拒否されました。Fキーで再試行できます。";
    }
  }

  async function startAudio() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      useSampleWave("マイク入力の代わりにサンプル波形を表示中");
      return app.inputNotice;
    }

    try {
      app.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        },
        video: false
      });
      app.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      await app.audioContext.resume();
      app.analyser = app.audioContext.createAnalyser();
      app.analyser.fftSize = 2048;
      app.analyser.smoothingTimeConstant = 0.7;
      const source = app.audioContext.createMediaStreamSource(app.mediaStream);
      source.connect(app.analyser);
      app.audioBuffer = new Uint8Array(app.analyser.fftSize);
      app.inputMode = "mic";
      app.inputNotice = "";
      setNotice("");
      updateUI();
      return "";
    } catch (error) {
      useSampleWave("マイク入力の代わりにサンプル波形を表示中");
      updateUI();
      return app.inputNotice;
    }
  }

  function useSampleWave(message) {
    app.inputMode = "sample";
    app.inputNotice = message;
    setNotice(message);
  }

  function handleKeyDown(event) {
    if (event.code === "Space" || event.code === "Enter" || event.code === "NumpadEnter") {
      if (app.started) {
        event.preventDefault();
        advance();
      }
      return;
    }

    if (event.code === "ArrowLeft") {
      if (app.started) {
        event.preventDefault();
        goBack();
      }
      return;
    }

    if (event.code === "Home") {
      if (app.started) {
        event.preventDefault();
        resetToStart();
      }
      return;
    }

    if (event.key === "r" || event.key === "R") {
      if (app.started) {
        event.preventDefault();
        resetToStart();
      }
      return;
    }

    if (event.key === "f" || event.key === "F") {
      if (app.started) {
        event.preventDefault();
        requestFullscreen().then((message) => {
          if (message) {
            setNotice(message);
          }
        });
      }
    }
  }

  function advance() {
    pulseFrame();
    const now = performance.now();

    if (app.step === 0) {
      freezeWave(now);
      enterStep(1);
      return;
    }

    if (app.step === 8) {
      const model = ensureModel();
      cleanupRestoreFlights(now);
      if (app.restoreIndex < model.samples.length) {
        app.restoreFlights.push({
          index: app.restoreIndex,
          startedAt: now,
          duration: 820
        });
        app.restoreIndex += 1;
        updateUI();
        return;
      }
      if (app.restoreFlights.length === 0) {
        enterStep(9);
      } else {
        updateUI();
      }
      return;
    }

    if (app.step >= 0 && app.step < 11) {
      enterStep(app.step + 1);
      return;
    }

    if (app.step === 11) {
      enterStep(2);
    }
  }

  function goBack() {
    pulseFrame();
    if (app.step <= 0) {
      resetToStart();
      return;
    }
    enterStep(app.step - 1);
  }

  function enterStep(step) {
    app.step = step;
    app.stepStartedAt = performance.now();
    app.restoreFlights = [];

    if (step >= 2) {
      app.model = buildModel();
    }

    if (step === 8) {
      app.restoreIndex = 0;
    }

    if (step === 11) {
      app.morphFrom = app.model;
      app.morphStartedAt = performance.now();
      app.lineAnimAt = app.stepStartedAt;
    }

    if (step >= 4 && step <= 8) {
      app.rebuildCodeLayoutKey = "";
    }

    if (step < 5) {
      showSplash(SLIDE_INFO[step].title);
    } else if (step === 8) {
      showSplash("D/A変換");
    } else {
      hideSplash();
    }
    updateUI();
  }

  function resetToStart() {
    app.step = 0;
    app.stepStartedAt = performance.now();
    app.frozenWave = null;
    app.model = buildModel();
    app.restoreIndex = 0;
    app.restoreFlights = [];
    app.morphFrom = null;
    showSplash("リセット");
    updateUI();
  }

  function freezeWave(now) {
    updateRealtimeWave(now);
    app.frozenWave = resampleWave(app.currentWave, WAVE_RESOLUTION);
    app.model = buildModel();
  }

  function setSampleRate(value) {
    const normalized = clamp(Math.round(value / 4) * 4, MIN_SAMPLE_RATE, MAX_SAMPLE_RATE);
    app.params.sampleRate = normalized;
    dom.sampleRateRange.value = String(normalized);
    dom.sampleRateInput.value = String(normalized);
    startMorphToNewModel();
    updateUI();
  }

  function setBits(value) {
    const normalized = clamp(Math.round(value), MIN_BITS, MAX_BITS);
    app.params.bits = normalized;
    dom.quantBitsRange.value = String(normalized);
    dom.quantBitsInput.value = String(normalized);
    startMorphToNewModel();
    updateUI();
  }

  function startMorphToNewModel() {
    app.morphFrom = app.model || buildModel();
    app.model = buildModel();
    app.morphStartedAt = performance.now();
    app.lineAnimAt = app.morphStartedAt;
    app.rebuildCodeLayoutKey = "";
  }

  function updateUI() {
    const info = SLIDE_INFO[app.step] || SLIDE_INFO[0];
    const model = ensureModel();
    const completedCount = getCompletedRestoreCount(model);
    const stepText = app.step === 8
      ? `D/A変換：1点ずつ復元 (${completedCount}/${model.samples.length})`
      : info.title;

    dom.stageTitle.textContent = stepText;
    dom.slideBadge.textContent = `Slide ${app.step + 1}`;
    dom.sourceBadge.textContent = app.inputMode === "mic"
      ? "入力: マイク"
      : app.inputMode === "sample"
        ? "入力: サンプル波形"
        : "入力: 待機";
    dom.dataBadge.textContent = `データ量: ${model.totalBits}bit`;
    dom.paramPanel.hidden = app.step !== 11;

    updateStats(model);
    updateLegend();
  }

  function getCompletedRestoreCount(model) {
    if (app.step !== 8) {
      return 0;
    }
    return clamp(app.restoreIndex - app.restoreFlights.length, 0, model.samples.length);
  }

  function cleanupRestoreFlights(now) {
    if (!app.restoreFlights.length) {
      return false;
    }
    const remaining = app.restoreFlights.filter((flight) => now - flight.startedAt < flight.duration);
    const changed = remaining.length !== app.restoreFlights.length;
    app.restoreFlights = remaining;
    return changed;
  }

  function updateStats(model) {
    dom.paramStats.textContent = `標本数: ${model.samples.length} / 段階数: ${model.levelCount} / データ量: ${model.totalBits}bit`;
  }

  function updateLegend() {
    const active = getActiveStage();
    const completedCount = getCompletedStageCount();

    dom.legendItems.forEach((item, index) => {
      const key = item.dataset.stage;
      item.classList.toggle("is-active", key === active);
      item.classList.toggle("is-complete", index < completedCount);
    });
  }

  function getActiveStage() {
    if (app.step <= 1 || app.step === 10 || app.step === 11) {
      return "continuous";
    }
    if (app.step === 2) {
      return "sampling";
    }
    if (app.step === 3) {
      return "quantizing";
    }
    return "encoding";
  }

  function getCompletedStageCount() {
    if (app.step <= 1) {
      return 0;
    }
    if (app.step === 2) {
      return 1;
    }
    if (app.step === 3) {
      return 2;
    }
    if (app.step >= 4) {
      return 4;
    }
    return 0;
  }

  function setNotice(message) {
    dom.notice.textContent = message;
    dom.notice.hidden = !message;
  }

  function showSplash(text) {
    dom.splash.textContent = text;
    dom.splash.hidden = false;
    dom.splash.classList.remove("is-visible");
    void dom.splash.offsetWidth;
    dom.splash.classList.add("is-visible");
    clearTimeout(app.splashTimer);
    app.splashTimer = window.setTimeout(() => {
      dom.splash.hidden = true;
      dom.splash.classList.remove("is-visible");
    }, 920);
  }

  function hideSplash() {
    clearTimeout(app.splashTimer);
    dom.splash.hidden = true;
    dom.splash.classList.remove("is-visible");
  }

  function pulseFrame() {
    dom.spaceFlash.classList.remove("is-active");
    void dom.spaceFlash.offsetWidth;
    dom.spaceFlash.classList.add("is-active");
  }

  function resizeCanvas() {
    app.dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    app.width = Math.max(1, window.innerWidth);
    app.height = Math.max(1, window.innerHeight);
    app.canvas.width = Math.floor(app.width * app.dpr);
    app.canvas.height = Math.floor(app.height * app.dpr);
    app.canvas.style.width = `${app.width}px`;
    app.canvas.style.height = `${app.height}px`;
    app.ctx.setTransform(app.dpr, 0, 0, app.dpr, 0, 0);
    app.rebuildCodeLayoutKey = "";
  }

  function frame(now) {
    requestAnimationFrame(frame);
    app.lastFrameAt = now;

    if (app.started && app.step === 0) {
      updateRealtimeWave(now);
    } else if (!app.started) {
      app.currentWave = generateSampleWave(now);
    }

    draw(now);
  }

  function updateRealtimeWave(now) {
    if (app.inputMode === "mic" && app.analyser && app.audioBuffer) {
      app.analyser.getByteTimeDomainData(app.audioBuffer);
      const next = new Array(WAVE_RESOLUTION);
      let sum = 0;
      for (let i = 0; i < WAVE_RESOLUTION; i += 1) {
        const sourceIndex = Math.floor((i / Math.max(1, WAVE_RESOLUTION - 1)) * (app.audioBuffer.length - 1));
        const value = (app.audioBuffer[sourceIndex] - 128) / 128;
        next[i] = clamp(value * 1.8, -1, 1);
        sum += next[i] * next[i];
      }
      app.audioLevel = Math.sqrt(sum / WAVE_RESOLUTION);
      app.currentWave = blendWaves(app.currentWave, next, 0.62);
      return;
    }

    app.currentWave = generateSampleWave(now);
    app.audioLevel = 0.4 + 0.2 * Math.sin(now * 0.002);
  }

  function generateSampleWave(now) {
    const seconds = now * 0.001;
    const wave = new Array(WAVE_RESOLUTION);
    for (let i = 0; i < WAVE_RESOLUTION; i += 1) {
      const t = i / (WAVE_RESOLUTION - 1);
      const sweep = 0.2 * Math.sin(Math.PI * 2 * (t * 1.2 - seconds * 0.24));
      const carrier =
        0.46 * Math.sin(Math.PI * 2 * (t * 4.1 - seconds * 0.95)) +
        0.28 * Math.sin(Math.PI * 2 * (t * 8.7 + seconds * 0.42)) +
        0.13 * Math.sin(Math.PI * 2 * (t * 17.5 - seconds * 0.18));
      const envelope = 0.72 + 0.22 * Math.sin(Math.PI * 2 * (t * 1.6 + seconds * 0.12));
      wave[i] = clamp((carrier + sweep) * envelope, -0.96, 0.96);
    }
    return wave;
  }

  function blendWaves(previous, next, amount) {
    const wave = new Array(WAVE_RESOLUTION);
    for (let i = 0; i < WAVE_RESOLUTION; i += 1) {
      wave[i] = lerp(previous[i] || 0, next[i] || 0, amount);
    }
    return wave;
  }

  function resampleWave(wave, count) {
    const output = new Array(count);
    for (let i = 0; i < count; i += 1) {
      output[i] = sampleWaveAt(wave, i / Math.max(1, count - 1));
    }
    return output;
  }

  function sampleWaveAt(wave, t) {
    const source = wave && wave.length ? wave : app.currentWave;
    if (!source || source.length === 0) {
      return 0;
    }
    const x = clamp(t, 0, 1) * (source.length - 1);
    const i0 = Math.floor(x);
    const i1 = Math.min(source.length - 1, i0 + 1);
    const local = x - i0;
    return lerp(source[i0], source[i1], local);
  }

  function ensureModel() {
    if (!app.model) {
      app.model = buildModel();
    }
    return app.model;
  }

  function buildModel() {
    const wave = app.frozenWave || app.currentWave || generateSampleWave(performance.now());
    const sampleCount = clamp(Math.round(app.params.sampleRate * DISPLAY_SECONDS), 4, 128);
    const bitCount = clamp(app.params.bits, MIN_BITS, MAX_BITS);
    const levelCount = 2 ** bitCount;
    const samples = [];

    for (let i = 0; i < sampleCount; i += 1) {
      const t = sampleCount === 1 ? 0 : i / (sampleCount - 1);
      const value = sampleWaveAt(wave, t);
      const levelIndex = clamp(Math.round(((value + 1) / 2) * (levelCount - 1)), 0, levelCount - 1);
      const quantValue = levelIndexToValue(levelIndex, levelCount);
      samples.push({
        index: i,
        t,
        value,
        quantValue,
        levelIndex,
        code: levelIndex.toString(2).padStart(bitCount, "0")
      });
    }

    return {
      wave,
      samples,
      sampleCount,
      bitCount,
      levelCount,
      totalBits: sampleCount * bitCount
    };
  }

  function levelIndexToValue(levelIndex, levelCount) {
    if (levelCount <= 1) {
      return 0;
    }
    return -1 + (levelIndex / (levelCount - 1)) * 2;
  }

  function draw(now) {
    const ctx = app.ctx;
    ctx.clearRect(0, 0, app.width, app.height);
    drawBackground(now);

    const layout = getLayout();
    if (!app.started) {
      drawIdlePreview(now, layout);
      return;
    }

    switch (app.step) {
      case 0:
        drawOscilloscope(now, layout);
        break;
      case 1:
        drawFrozenWave(now, layout);
        break;
      case 2:
        drawSampling(now, layout);
        break;
      case 3:
        drawQuantization(now, layout);
        break;
      case 4:
        drawEncoding(now, layout);
        break;
      case 5:
        drawDigitalData(now, layout);
        break;
      case 6:
        drawFileSizeData(now, layout);
        break;
      case 7:
        drawDAGrid(now, layout);
        break;
      case 8:
        drawRestore(now, layout);
        break;
      case 9:
        drawApproximation(now, layout);
        break;
      case 10:
        drawComparison(now, layout);
        break;
      case 11:
        drawAdjustment(now, layout);
        break;
      default:
        drawOscilloscope(now, layout);
    }
  }

  function drawBackground(now) {
    const ctx = app.ctx;
    const gradient = ctx.createLinearGradient(0, 0, app.width, app.height);
    gradient.addColorStop(0, "#051016");
    gradient.addColorStop(0.45, "#082028");
    gradient.addColorStop(1, "#140d22");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, app.width, app.height);

    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = "rgba(116, 230, 220, 0.18)";
    ctx.lineWidth = 1;
    const gap = 34;
    const offset = (now * 0.018) % gap;
    for (let x = -gap + offset; x < app.width + gap; x += gap) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 26, app.height);
      ctx.stroke();
    }
    ctx.restore();

    const scanY = (now * 0.06) % Math.max(1, app.height);
    const scan = ctx.createLinearGradient(0, scanY - 24, 0, scanY + 24);
    scan.addColorStop(0, "rgba(66, 232, 244, 0)");
    scan.addColorStop(0.5, "rgba(66, 232, 244, 0.08)");
    scan.addColorStop(1, "rgba(66, 232, 244, 0)");
    ctx.fillStyle = scan;
    ctx.fillRect(0, scanY - 24, app.width, 48);
  }

  function drawIdlePreview(now, layout) {
    drawMinorGrid(layout, 0.75, 0.45);
    drawAxes(layout, 1, 0.35);
    drawWavePath(layout, app.currentWave, {
      color: "#42e8f4",
      alpha: 0.42,
      width: 4,
      progress: 1,
      glow: 18
    });
    drawBinaryMist(now, 0.14);
  }

  function drawOscilloscope(now, layout) {
    const elapsed = now - app.stepStartedAt;
    const p = easeOutCubic(clamp(elapsed / 900, 0, 1));
    drawMinorGrid(layout, p, 0.72);
    drawAxes(layout, p, 0.85);
    drawWavePath(layout, app.currentWave, {
      color: "#42e8f4",
      alpha: 0.96,
      width: 3.2 + app.audioLevel * 5,
      progress: 1,
      glow: 24 + app.audioLevel * 24
    });

    const sweepX = layout.x + ((now * 0.00042) % 1) * layout.w;
    const beam = app.ctx.createLinearGradient(sweepX - 60, 0, sweepX + 22, 0);
    beam.addColorStop(0, "rgba(66, 232, 244, 0)");
    beam.addColorStop(1, "rgba(66, 232, 244, 0.28)");
    app.ctx.fillStyle = beam;
    app.ctx.fillRect(sweepX - 60, layout.y, 82, layout.h);

    drawPlotLabel(layout, `表示範囲: ${DISPLAY_SECONDS}秒`, "時間", "振幅", 0.88);
  }

  function drawFrozenWave(now, layout) {
    const elapsed = now - app.stepStartedAt;
    const gridP = easeOutCubic(clamp(elapsed / 980, 0, 1));
    const waveP = easeInOutCubic(clamp((elapsed - 250) / 1250, 0, 1));
    drawMinorGrid(layout, gridP, 0.78);
    drawAxes(layout, gridP, 0.95);
    drawWavePath(layout, app.frozenWave || app.currentWave, {
      color: "#42e8f4",
      alpha: 0.98,
      width: 4,
      progress: waveP,
      glow: 26
    });

    const flash = clamp(1 - elapsed / 680, 0, 1);
    if (flash > 0) {
      app.ctx.fillStyle = `rgba(255, 255, 255, ${flash * 0.18})`;
      app.ctx.fillRect(layout.x, layout.y, layout.w, layout.h);
    }
    drawPlotLabel(layout, `表示範囲: ${DISPLAY_SECONDS}秒`, "時間", "振幅", 1);
  }

  function drawSampling(now, layout) {
    const elapsed = now - app.stepStartedAt;
    const model = ensureModel();
    drawMinorGrid(layout, 1, 0.54);
    drawAxes(layout, 1, 0.76);
    const waveAlpha = elapsed < 2300 ? 0.98 : 0.32;
    drawWavePath(layout, model.wave, {
      color: elapsed < 2300 ? "#42e8f4" : "#9aaab0",
      alpha: waveAlpha,
      width: 3.6,
      progress: 1,
      glow: elapsed < 2300 ? 20 : 0
    });

    const lineProgress = clamp(elapsed / 1850, 0, 1);
    drawSampleLines(layout, model, lineProgress, {
      color: "#ffd166",
      alpha: 0.9,
      width: 1.4
    });
    drawSamplePoints(layout, model, elapsed);
    drawPlotLabel(layout, "一定間隔で値を取り出す", "時間", "振幅", 0.9);
  }

  function drawSamplePoints(layout, model, elapsed) {
    const ctx = app.ctx;
    model.samples.forEach((sample, i) => {
      const appear = clamp((elapsed - i * 58 - 260) / 360, 0, 1);
      if (appear <= 0) {
        return;
      }
      const point = samplePointToCanvas(layout, sample, false);
      const bounce = Math.sin(appear * Math.PI) * 5;
      const completePulse = elapsed > 2050 && elapsed < 2850
        ? 1 + 0.4 * Math.sin((elapsed - 2050) * 0.028 + i * 0.8)
        : 1;
      drawRipple(point.x, point.y, appear, "#ffd166", 0.34);
      drawDot(point.x, point.y, (6 + bounce) * completePulse, "#ffd166", 0.96, 18);
    });
  }

  function drawQuantization(now, layout) {
    const elapsed = now - app.stepStartedAt;
    const model = ensureModel();
    drawMinorGrid(layout, 1, 0.36);
    drawAxes(layout, 1, 0.58);
    drawWavePath(layout, model.wave, {
      color: "#8e9aa0",
      alpha: 0.25,
      width: 3,
      progress: 1,
      glow: 0
    });
    drawSampleLines(layout, model, 1, {
      color: "#7d858a",
      alpha: 0.34,
      width: 1
    });
    drawStaticPoints(layout, model, "value", "#9aa4aa", 0.38, 4.5);

    const quantProgress = clamp(elapsed / 1150, 0, 1);
    drawQuantLines(layout, model, quantProgress, {
      color: "#7cff9b",
      alpha: 0.75,
      width: 1.2
    });
    drawQuantAxisNumbers(layout, model, quantProgress, 0.92);

    const moveStart = 920 + Math.min(700, model.levelCount * 34);
    const pointSpacing = layout.w / Math.max(1, model.samples.length - 1);
    const valueFontSize = clamp(pointSpacing * 0.46, 8, 14);
    model.samples.forEach((sample, i) => {
      const move = clamp((elapsed - moveStart - i * 44) / 620, 0, 1);
      if (move <= 0) {
        return;
      }
      const eased = easeOutBack(move);
      const from = samplePointToCanvas(layout, sample, false);
      const to = samplePointToCanvas(layout, sample, true);
      const y = lerp(from.y, to.y, eased);
      const ctx = app.ctx;
      ctx.save();
      ctx.globalAlpha = 0.72 * move;
      ctx.strokeStyle = "rgba(124, 255, 155, 0.62)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, y);
      ctx.stroke();
      ctx.restore();
      if (move > 0.82) {
        drawRipple(to.x, to.y, clamp((move - 0.82) / 0.18, 0, 1), "#7cff9b", 0.34);
      }
      const valueRadius = Math.max(6.5, valueFontSize * (sample.levelIndex >= 10 ? 0.78 : 0.68));
      drawDot(to.x, y, valueRadius + Math.sin(move * Math.PI) * 2.2, "#7cff9b", 0.98, 18);
      if (move > 0.55) {
        drawQuantizedInteger(
          to.x,
          y,
          sample.levelIndex,
          clamp((move - 0.55) / 0.3, 0, 1),
          valueFontSize
        );
      }
    });

    drawPlotLabel(layout, `${model.levelCount}段階に丸める`, "時間", "量子化値", 0.88);
  }

  function drawEncoding(now, layout) {
    const elapsed = now - app.stepStartedAt;
    const model = ensureModel();
    drawMinorGrid(layout, 1, 0.22);
    drawAxes(layout, 1, 0.42);
    drawQuantLines(layout, model, 1, {
      color: "#7cff9b",
      alpha: 0.22,
      width: 1
    });

    model.samples.forEach((sample, i) => {
      const start = samplePointToCanvas(layout, sample, true);
      const shatter = clamp((elapsed - i * 32) / 420, 0, 1);
      const pointAlpha = clamp(1 - shatter, 0, 1);
      if (pointAlpha > 0) {
        drawDot(start.x, start.y, 6.5, "#7cff9b", pointAlpha, 16);
      }
      drawBitParticles(start.x, start.y, i, shatter, "#b48cff");
    });

    const codeLayout = getCodeLayout(layout, model);
    // 移動前から宛先にコードが見えないよう、空のパネル枠だけを表示する
    drawCodePanelBox(codeLayout, 0.38);

    model.samples.forEach((sample, i) => {
      const start = samplePointToCanvas(layout, sample, true);
      const target = codeLayout.positions[i];
      const move = clamp((elapsed - 520 - i * 42) / 900, 0, 1);
      const appear = clamp((elapsed - i * 32) / 340, 0, 1);
      const eased = easeInOutCubic(move);
      const x = lerp(start.x, target.x, eased);
      const y = lerp(start.y, target.y, eased);
      const scale = 0.78 + 0.22 * appear;
      const alpha = appear > 0 ? 0.96 : 0;
      drawCodePacket(x, y, sample.code, alpha, scale, move > 0.96);
      if (move > 0.04 && move < 0.96) {
        drawTrail(start.x, start.y, x, y, "#b48cff", 0.36);
      }
    });

    if (elapsed > 1650 + model.samples.length * 42) {
      drawCodePanel(codeLayout, 0.9 + 0.1 * Math.sin(elapsed * 0.012));
    }
    drawPlotLabel(layout, `${model.bitCount}bitの固定長コード`, "時間", "振幅", 0.7);
  }

  function drawDigitalData(now, layout) {
    const elapsed = now - app.stepStartedAt;
    const model = ensureModel();
    const fade = easeInOutCubic(clamp(elapsed / 900, 0, 1));
    app.ctx.fillStyle = `rgba(0, 0, 0, ${0.36 + fade * 0.34})`;
    app.ctx.fillRect(0, 0, app.width, app.height);
    drawWavePath(layout, model.wave, {
      color: "#42e8f4",
      alpha: 0.12,
      width: 3,
      progress: 1,
      glow: 0
    });
    drawBinaryMist(now, 0.34);
    const cd = getCdPlacement(app.step, elapsed, layout);
    drawCD(now, cd.cx, cd.cy, cd.r);
    drawCDLabel(cd.cx, cd.cy, cd.r, "音楽CD");

    const codeLayout = getCodeLayout(layout, model);
    drawCodePanel(codeLayout, 0.84);
    drawBitStreamsToDisc(now, codeLayout, cd.cx, cd.cy);
  }

  function drawFileSizeData(now, layout) {
    const elapsed = now - app.stepStartedAt;
    const model = ensureModel();
    const codeLayout = getCodeLayout(layout, model);
    const gridLayout = getFileSizeGridLayout(model);
    const animation = getFileSizeAnimation(model, elapsed);

    app.ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    app.ctx.fillRect(0, 0, app.width, app.height);
    drawFileSizeSlots(gridLayout, animation.countedBits);
    drawFileSizePackets(now, model, codeLayout, gridLayout, animation);
    drawFileSizeBits(now, gridLayout, animation, elapsed);

    const cd = getCdPlacement(app.step, elapsed, layout);
    app.ctx.save();
    app.ctx.globalAlpha = 0.72;
    drawCD(now, cd.cx, cd.cy, cd.r);
    app.ctx.restore();

    drawFileSizeStats(model, animation.countedBits);
  }

  function drawDAGrid(now, layout) {
    const elapsed = now - app.stepStartedAt;
    const model = ensureModel();
    const p = easeOutCubic(clamp(elapsed / 1300, 0, 1));
    drawMinorGrid(layout, p, 0.52);
    drawAxes(layout, p, 0.72);
    drawSampleLines(layout, model, p, {
      color: "#ffd166",
      alpha: 0.42,
      width: 1.2
    });
    drawQuantLines(layout, model, p, {
      color: "#7cff9b",
      alpha: 0.48,
      width: 1.1
    });
    const codeLayout = getCodeLayout(layout, model);
    const cd = getCdPlacement(app.step, elapsed, layout);
    drawCD(now, cd.cx, cd.cy, cd.r);
    drawCodePanel(codeLayout, 0.84);
    drawReturnArrows(now, codeLayout, layout, p);
    // ディスクからコードへ0/1が流れ、読み出している様子を表す
    drawBitStreamsFromDisc(now, codeLayout, cd.cx, cd.cy);
    drawPlotLabel(layout, "コードを波形エリアへ戻す準備", "時間", "振幅", 0.8);
  }

  function drawRestore(now, layout) {
    const model = ensureModel();
    drawMinorGrid(layout, 1, 0.42);
    drawAxes(layout, 1, 0.62);
    drawSampleLines(layout, model, 1, {
      color: "#ffd166",
      alpha: 0.26,
      width: 1
    });
    drawQuantLines(layout, model, 1, {
      color: "#7cff9b",
      alpha: 0.33,
      width: 1
    });

    const codeLayout = getCodeLayout(layout, model);
    // 右下で再生中のディスクを表示し、コードへ0/1を読み出す様子を残す
    const cd = getCdPlacement(app.step, now - app.stepStartedAt, layout);
    drawCD(now, cd.cx, cd.cy, cd.r);
    drawBitStreamsFromDisc(now, codeLayout, cd.cx, cd.cy, 0.5);
    const changed = cleanupRestoreFlights(now);
    if (changed) {
      updateUI();
    }
    const activeFlights = app.restoreFlights;
    const activeIndexes = new Set(activeFlights.map((flight) => flight.index));
    const visibleCount = getCompletedRestoreCount(model);

    for (let i = 0; i < app.restoreIndex; i += 1) {
      if (activeIndexes.has(i)) {
        continue;
      }
      const sample = model.samples[i];
      const point = samplePointToCanvas(layout, sample, true);
      drawDot(point.x, point.y, 6.4, "#ff4f64", 0.98, 18);
    }

    drawCodePanel(codeLayout, 0.72, (index) => {
      if (index < app.restoreIndex && !activeIndexes.has(index)) {
        return 0.08;
      }
      if (activeIndexes.has(index)) {
        return 0.18;
      }
      if (index === app.restoreIndex) {
        return 1;
      }
      return 0.66;
    });

    activeFlights.forEach((flight) => {
      const sample = model.samples[flight.index];
      const start = codeLayout.positions[flight.index];
      const end = samplePointToCanvas(layout, sample, true);
      const rawMove = clamp((now - flight.startedAt) / flight.duration, 0, 1);
      const move = easeInOutCubic(rawMove);
      const x = lerp(start.x, end.x, move);
      const y = lerp(start.y, end.y, move);
      drawTrail(start.x, start.y, x, y, "#ff4f64", 0.46);
      drawCodePacket(x, y, sample.code, 1, 0.9, true);
      if (move > 0.78) {
        drawRipple(end.x, end.y, clamp((move - 0.78) / 0.22, 0, 1), "#ff4f64", 0.42);
        drawDot(end.x, end.y, 6 + Math.sin(move * Math.PI) * 2, "#ff4f64", 0.96, 20);
      }
    });

    const movingLabel = activeFlights.length > 0 ? ` / 移動中 ${activeFlights.length}` : "";
    drawPlotLabel(layout, `復元済み ${visibleCount}/${model.samples.length}${movingLabel}`, "時間", "振幅", 0.88);
  }

  function drawApproximation(now, layout) {
    const elapsed = now - app.stepStartedAt;
    const model = ensureModel();
    drawMinorGrid(layout, 1, 0.38);
    drawAxes(layout, 1, 0.58);
    drawQuantLines(layout, model, 1, {
      color: "#7cff9b",
      alpha: 0.24,
      width: 1
    });
    drawStaticPoints(layout, model, "quantValue", "#ff4f64", 0.95, 6);
    drawReconstruction(layout, model, easeInOutCubic(clamp(elapsed / 1700, 0, 1)), "#ff4f64", 0.96, 4.2);
    drawPlotLabel(layout, "復元点をなぞって近い波形を作る", "時間", "振幅", 0.86);
  }

  function drawComparison(now, layout) {
    const elapsed = now - app.stepStartedAt;
    const model = ensureModel();
    const p = easeInOutCubic(clamp(elapsed / 1400, 0, 1));
    drawMinorGrid(layout, 1, 0.34);
    drawAxes(layout, 1, 0.56);
    drawReconstruction(layout, model, 1, "#ff4f64", 0.98, 4);
    drawStaticPoints(layout, model, "quantValue", "#ff4f64", 0.86, 5);
    drawWavePath(layout, model.wave, {
      color: "#42e8f4",
      alpha: 0.1 + p * 0.48,
      width: 3.2,
      progress: p,
      glow: 12
    });
    drawDifferenceLines(layout, model, p);
    drawPlotLabel(layout, "元の波形と復元波形を比較", "時間", "振幅", 0.86);
  }

  function drawAdjustment(now, layout) {
    const elapsed = now - app.stepStartedAt;
    const reveal = easeOutCubic(clamp(elapsed / 850, 0, 1));
    const model = getAnimatedAdjustmentModel(now);
    // 入場時・パラメータ変更時に縦線/横線をアニメーションで引き直す
    const lineP = easeOutCubic(clamp((now - app.lineAnimAt) / 950, 0, 1));
    drawMinorGrid(layout, reveal, 0.44);
    drawAxes(layout, reveal, 0.64);
    drawWavePath(layout, model.wave, {
      color: "#42e8f4",
      alpha: 0.48 + 0.18 * reveal,
      width: 3,
      progress: 1,
      glow: 10
    });
    drawSampleLines(layout, model, lineP, {
      color: "#ffd166",
      alpha: 0.48,
      width: 1
    });
    drawQuantLines(layout, model, lineP, {
      color: "#7cff9b",
      alpha: 0.42,
      width: 1
    });
    // 調整値は次の標本化Slideから反映し、ここでは線の密度を比較する
    drawDataMeter(layout, model);
    drawPlotLabel(layout, `${model.samples.length}標本 / ${model.levelCount}段階 / ${model.totalBits}bit`, "時間", "振幅", 0.82);
  }

  function getFileSizeGridLayout(model) {
    const bits = model.samples.map((sample) => sample.code).join("");
    const bitCount = Math.max(1, bits.length);
    const marginX = 42;
    const top = app.height < 640 ? 178 : 206;
    const bottom = app.height < 640 ? 188 : 206;
    const availableW = Math.max(240, app.width - marginX * 2);
    const availableH = Math.max(160, app.height - top - bottom);
    const aspect = availableW / availableH;
    const cols = Math.max(1, Math.ceil(Math.sqrt(bitCount * aspect)));
    const rows = Math.max(1, Math.ceil(bitCount / cols));
    const cellW = availableW / cols;
    const cellH = availableH / rows;
    const fontSize = clamp(Math.min(cellW * 0.52, cellH * 0.68), 12, 48);
    const gridHeight = rows * cellH;
    const gridTop = top + (availableH - gridHeight) / 2;
    const positions = [];

    for (let i = 0; i < bitCount; i += 1) {
      const row = Math.floor(i / cols);
      const col = i % cols;
      positions.push({
        x: marginX + col * cellW + cellW * 0.5,
        y: gridTop + row * cellH + cellH * 0.5,
        row,
        col
      });
    }

    return {
      bits,
      bitCount,
      cols,
      rows,
      cellW,
      cellH,
      fontSize,
      positions
    };
  }

  function getFileSizeAnimation(model, elapsed) {
    const sampleCount = Math.max(1, model.samples.length);
    const bitsPerPacket = Math.max(1, model.bitCount);
    const startDelay = 360;
    const packetDuration = clamp(4600 / sampleCount, 42, 360);
    const moveDuration = packetDuration * 0.48;
    const bitDuration = (packetDuration * 0.52) / bitsPerPacket;
    const totalBits = Math.max(1, model.totalBits);
    let countedBits = 0;
    let activeIndex = -1;

    model.samples.forEach((sample, sampleIndex) => {
      const phase = elapsed - startDelay - sampleIndex * packetDuration;
      if (phase <= moveDuration) {
        return;
      }
      const localCount = clamp(
        Math.floor((phase - moveDuration) / Math.max(1, bitDuration)) + 1,
        0,
        bitsPerPacket
      );
      countedBits += localCount;
      if (localCount > 0 && localCount < bitsPerPacket) {
        activeIndex = sampleIndex * bitsPerPacket + localCount - 1;
      }
    });

    countedBits = clamp(countedBits, 0, totalBits);
    if (countedBits === totalBits) {
      activeIndex = totalBits - 1;
    } else if (activeIndex < 0 && countedBits > 0) {
      activeIndex = countedBits - 1;
    }

    return {
      countedBits,
      activeIndex,
      startDelay,
      packetDuration,
      moveDuration,
      bitDuration
    };
  }

  function drawFileSizeSlots(gridLayout, countedBits) {
    const ctx = app.ctx;
    const alpha = countedBits <= 0 ? 0.22 : 0.12;
    ctx.save();
    ctx.fillStyle = `rgba(238, 251, 255, ${alpha})`;
    gridLayout.positions.forEach((position, i) => {
      if (i < countedBits) {
        return;
      }
      ctx.beginPath();
      ctx.arc(position.x, position.y, Math.max(1.2, gridLayout.fontSize * 0.08), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  function drawFileSizePackets(now, model, codeLayout, gridLayout, animation) {
    drawCodePanelBox(codeLayout, 0.22);

    model.samples.forEach((sample, sampleIndex) => {
      const bitStart = sampleIndex * model.bitCount;
      const source = codeLayout.positions[sampleIndex];
      const target = getFilePacketTarget(gridLayout, bitStart, model.bitCount);
      const phase = (now - app.stepStartedAt) - animation.startDelay - sampleIndex * animation.packetDuration;

      if (phase < 0) {
        drawCodePacket(source.x, source.y, sample.code, 0.54, 0.74, false);
        return;
      }

      if (phase < animation.moveDuration) {
        const move = easeInOutCubic(clamp(phase / animation.moveDuration, 0, 1));
        const x = lerp(source.x, target.x, move);
        const y = lerp(source.y, target.y, move);
        drawTrail(source.x, source.y, x, y, "#b48cff", 0.34);
        drawFilePacketTargetPulse(gridLayout, bitStart, now, 0.72);
        drawCodePacket(x, y, sample.code, 0.96, 0.82, true);
        return;
      }

      const transform = clamp(
        (phase - animation.moveDuration) / Math.max(1, animation.bitDuration * model.bitCount),
        0,
        1
      );
      if (transform < 1) {
        drawFilePacketTargetPulse(gridLayout, bitStart, now, 0.5 * (1 - transform));
        drawCodePacket(target.x, target.y, sample.code, 0.78 * (1 - transform), 0.82 - transform * 0.18, true);
      }
    });
  }

  function getFilePacketTarget(gridLayout, bitStart, bitCount) {
    const first = gridLayout.positions[bitStart] || gridLayout.positions[0];
    const lastIndex = Math.min(gridLayout.positions.length - 1, bitStart + bitCount - 1);
    const last = gridLayout.positions[lastIndex] || first;
    if (first && last && first.row === last.row) {
      return {
        x: (first.x + last.x) / 2,
        y: first.y
      };
    }
    return first || { x: app.width / 2, y: app.height / 2 };
  }

  function drawFilePacketTargetPulse(gridLayout, bitStart, now, alpha) {
    const position = gridLayout.positions[bitStart];
    if (!position || alpha <= 0) {
      return;
    }
    const ctx = app.ctx;
    const radius = gridLayout.fontSize * (0.46 + 0.12 * Math.sin(now * 0.018));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "#ffd166";
    ctx.lineWidth = 2;
    ctx.shadowColor = "#ffd166";
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(position.x, position.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawFileSizeBits(now, gridLayout, animation, elapsed) {
    const bits = gridLayout.bits;
    const activeIndex = animation.activeIndex;

    app.ctx.save();
    app.ctx.font = `900 ${gridLayout.fontSize}px Consolas, "Courier New", monospace`;
    app.ctx.textAlign = "center";
    app.ctx.textBaseline = "middle";
    for (let i = 0; i < animation.countedBits; i += 1) {
      const position = gridLayout.positions[i];
      if (!position) {
        continue;
      }
      const char = bits[i];
      const isActive = i === activeIndex;
      if (isActive) {
        const hue = (elapsed * 0.24) % 360;
        const pulse = 1 + Math.sin(elapsed * 0.026) * 0.16;
        app.ctx.save();
        app.ctx.fillStyle = `hsl(${hue} 100% 72%)`;
        app.ctx.shadowColor = `hsl(${hue} 100% 62%)`;
        app.ctx.shadowBlur = 28;
        app.ctx.font = `1000 ${gridLayout.fontSize * pulse}px Consolas, "Courier New", monospace`;
        app.ctx.fillText(char, position.x, position.y);
        app.ctx.restore();
      } else {
        const shimmer = 0.54 + 0.24 * seededNoise(i * 13 + Math.floor(elapsed / 180));
        app.ctx.fillStyle = char === "1"
          ? `rgba(124, 255, 155, ${shimmer})`
          : `rgba(180, 140, 255, ${shimmer})`;
        app.ctx.fillText(char, position.x, position.y);
      }
    }
    app.ctx.restore();
  }

  function drawFileSizeStats(model, countedBits) {
    const ctx = app.ctx;
    const w = Math.min(760, app.width - 48);
    const x = app.width / 2 - w / 2;
    const y = app.height < 640 ? 78 : 92;
    const h = 112;
    const ratio = clamp(countedBits / Math.max(1, model.totalBits), 0, 1);
    const barX = x + 24;
    const barY = y + h - 20;
    const barW = w - 48;
    ctx.save();
    ctx.fillStyle = "rgba(4, 13, 18, 0.86)";
    ctx.strokeStyle = "rgba(255, 209, 102, 0.42)";
    ctx.lineWidth = 1;
    roundedRect(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffd166";
    ctx.font = "900 18px 'Yu Gothic', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("ファイルサイズ", app.width / 2, y + 22);
    ctx.fillStyle = "#eefbff";
    ctx.font = `1000 ${clamp(app.width * 0.022, 18, 28)}px Consolas, "Yu Gothic", sans-serif`;
    ctx.fillText(formatFileSize(countedBits), app.width / 2, y + 57);
    ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
    roundedRect(ctx, barX, barY, barW, 8, 4);
    ctx.fill();
    const gradient = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    gradient.addColorStop(0, "#42e8f4");
    gradient.addColorStop(0.5, "#7cff9b");
    gradient.addColorStop(1, "#ffd166");
    ctx.fillStyle = gradient;
    roundedRect(ctx, barX, barY, barW * ratio, 8, 4);
    ctx.fill();
    ctx.restore();
  }

  function formatFileSize(bitCount) {
    const bytes = bitCount / 8;
    const useMByte = bytes >= 1024 * 1024;
    const largerUnit = useMByte ? "MByte" : "kByte";
    const largerValue = bytes / (useMByte ? 1024 * 1024 : 1024);
    return `${formatNumber(bitCount, 0)} bit = ${formatNumber(bytes, 3)} Byte = ${formatNumber(largerValue, 4)} ${largerUnit}`;
  }

  function formatNumber(value, maximumFractionDigits) {
    return value.toLocaleString("ja-JP", {
      minimumFractionDigits: 0,
      maximumFractionDigits
    });
  }

  function getAnimatedAdjustmentModel(now) {
    if (!app.morphFrom) {
      return ensureModel();
    }

    const p = easeInOutCubic(clamp((now - app.morphStartedAt) / 640, 0, 1));
    if (p >= 1) {
      app.morphFrom = null;
      return ensureModel();
    }

    const target = ensureModel();
    const samples = target.samples.map((sample) => {
      const previous = sampleModelAt(app.morphFrom, sample.t);
      return {
        ...sample,
        value: lerp(previous.value, sample.value, p),
        quantValue: lerp(previous.quantValue, sample.quantValue, p)
      };
    });

    return {
      ...target,
      samples
    };
  }

  function sampleModelAt(model, t) {
    if (!model || !model.samples || model.samples.length === 0) {
      return { value: 0, quantValue: 0 };
    }
    const samples = model.samples;
    if (t <= 0) {
      return samples[0];
    }
    if (t >= 1) {
      return samples[samples.length - 1];
    }
    const x = t * (samples.length - 1);
    const i0 = Math.floor(x);
    const i1 = Math.min(samples.length - 1, i0 + 1);
    const local = x - i0;
    return {
      value: lerp(samples[i0].value, samples[i1].value, local),
      quantValue: lerp(samples[i0].quantValue, samples[i1].quantValue, local)
    };
  }

  function getLayout() {
    const side = clamp(app.width * 0.065, 58, 92);
    const top = app.height < 640 ? 96 : 118;
    const bottom = app.height < 640 ? 176 : 208;
    const h = Math.max(220, app.height - top - bottom);
    return {
      x: side,
      y: top,
      w: Math.max(320, app.width - side * 2),
      h,
      midY: top + h / 2,
      amp: h * 0.43
    };
  }

  function drawMinorGrid(layout, progress, alpha) {
    const ctx = app.ctx;
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = `rgba(106, 216, 220, ${0.14 * alpha})`;

    const verticals = 10;
    for (let i = 0; i <= verticals; i += 1) {
      const reveal = clamp((progress - i / verticals * 0.45) / 0.55, 0, 1);
      if (reveal <= 0) {
        continue;
      }
      const x = layout.x + (layout.w * i) / verticals;
      ctx.globalAlpha = alpha * reveal;
      ctx.beginPath();
      ctx.moveTo(x, layout.midY - (layout.h / 2) * reveal);
      ctx.lineTo(x, layout.midY + (layout.h / 2) * reveal);
      ctx.stroke();
    }

    const horizontals = 8;
    for (let i = 0; i <= horizontals; i += 1) {
      const reveal = clamp((progress - i / horizontals * 0.45) / 0.55, 0, 1);
      if (reveal <= 0) {
        continue;
      }
      const y = layout.y + layout.h - (layout.h * i) / horizontals;
      ctx.globalAlpha = alpha * reveal;
      ctx.beginPath();
      ctx.moveTo(layout.x + (layout.w / 2) * (1 - reveal), y);
      ctx.lineTo(layout.x + layout.w - (layout.w / 2) * (1 - reveal), y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawAxes(layout, progress, alpha) {
    const ctx = app.ctx;
    const p = clamp(progress, 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(238, 251, 255, 0.68)";
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(layout.x, layout.midY);
    ctx.lineTo(layout.x + layout.w * p, layout.midY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(layout.x, layout.midY);
    ctx.lineTo(layout.x, layout.midY - layout.amp * p);
    ctx.moveTo(layout.x, layout.midY);
    ctx.lineTo(layout.x, layout.midY + layout.amp * p);
    ctx.stroke();

    ctx.restore();
    drawTimeTickLabels(layout, p, alpha);
  }

  function drawTimeTickLabels(layout, progress, alpha) {
    const ctx = app.ctx;
    const ticks = [0, 0.25, 0.5, 0.75, 1];
    const p = clamp(progress, 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha * easeOutCubic(p);
    ctx.fillStyle = "rgba(238, 251, 255, 0.72)";
    ctx.strokeStyle = "rgba(238, 251, 255, 0.38)";
    ctx.lineWidth = 1;
    ctx.font = "800 13px 'Yu Gothic', sans-serif";
    ctx.textBaseline = "top";
    ticks.forEach((tick) => {
      if (tick > p) {
        return;
      }
      const x = layout.x + layout.w * tick;
      ctx.beginPath();
      ctx.moveTo(x, layout.midY - 5);
      ctx.lineTo(x, layout.midY + 5);
      ctx.stroke();
      // 右端ラベルは枠外へはみ出さないよう右寄せにする
      ctx.textAlign = tick >= 1 ? "right" : "center";
      const label = formatSeconds(DISPLAY_SECONDS * tick);
      ctx.fillText(label, x, layout.midY + 10);
    });
    ctx.restore();
  }

  function formatSeconds(value) {
    if (value === 0) {
      return "0秒";
    }
    return `${value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")}秒`;
  }

  function drawPlotLabel(layout, rangeLabel, xLabel, yLabel, alpha) {
    const ctx = app.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(238, 251, 255, 0.82)";
    ctx.font = "800 15px 'Yu Gothic', sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(rangeLabel, layout.x + layout.w, layout.y - 10);
    ctx.fillStyle = "rgba(255, 209, 102, 0.92)";
    // 右端の秒数ラベルと重ならないよう、軸の右側の余白へ寄せる
    ctx.textAlign = "left";
    ctx.fillText(xLabel, layout.x + layout.w + 12, layout.midY + 6);
    ctx.save();
    ctx.translate(layout.x - 40, layout.y + 16);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "right";
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();
    ctx.restore();
  }

  function drawWavePath(layout, wave, options) {
    const {
      color,
      alpha,
      width,
      progress,
      glow
    } = options;
    const ctx = app.ctx;
    const count = Math.max(2, Math.floor((wave.length - 1) * clamp(progress, 0, 1)));

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.shadowColor = color;
    ctx.shadowBlur = glow;
    ctx.beginPath();
    for (let i = 0; i <= count; i += 1) {
      const t = i / (wave.length - 1);
      const x = layout.x + t * layout.w;
      const y = valueToY(layout, wave[i]);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawSampleLines(layout, model, progress, options) {
    const ctx = app.ctx;
    const {
      color,
      alpha,
      width
    } = options;
    const samples = model.samples;
    const n = Math.max(1, samples.length);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    for (let i = 0; i < samples.length; i += 1) {
      const reveal = clamp((progress - (i / n) * 0.72) / 0.28, 0, 1);
      if (reveal <= 0) {
        continue;
      }
      const x = layout.x + samples[i].t * layout.w;
      ctx.globalAlpha = alpha * reveal;
      ctx.beginPath();
      ctx.moveTo(x, layout.y + (layout.h / 2) * (1 - reveal));
      ctx.lineTo(x, layout.y + layout.h - (layout.h / 2) * (1 - reveal));
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawQuantLines(layout, model, progress, options) {
    const ctx = app.ctx;
    const {
      color,
      alpha,
      width
    } = options;
    const levels = model.levelCount;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    for (let i = 0; i < levels; i += 1) {
      const reveal = clamp((progress - (i / Math.max(1, levels - 1)) * 0.7) / 0.3, 0, 1);
      if (reveal <= 0) {
        continue;
      }
      const value = levelIndexToValue(i, levels);
      const y = valueToY(layout, value);
      ctx.globalAlpha = alpha * reveal;
      ctx.beginPath();
      ctx.moveTo(layout.x, y);
      ctx.lineTo(layout.x + layout.w * reveal, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawQuantAxisNumbers(layout, model, progress, alpha) {
    const ctx = app.ctx;
    const levels = model.levelCount;
    const maxLabels = Math.max(2, Math.floor(layout.h / 22));
    const stride = Math.max(1, Math.ceil((levels - 1) / Math.max(1, maxLabels - 1)));
    ctx.save();
    ctx.font = "900 13px Consolas, 'Courier New', monospace";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(3, 9, 12, 0.92)";
    ctx.fillStyle = "#b8ffca";
    for (let i = 0; i < levels; i += 1) {
      if (i !== 0 && i !== levels - 1 && i % stride !== 0) {
        continue;
      }
      const reveal = clamp((progress - (i / Math.max(1, levels - 1)) * 0.7) / 0.3, 0, 1);
      if (reveal <= 0) {
        continue;
      }
      const y = valueToY(layout, levelIndexToValue(i, levels));
      ctx.globalAlpha = alpha * reveal;
      ctx.strokeText(String(i), layout.x - 8, y);
      ctx.fillText(String(i), layout.x - 8, y);
    }
    ctx.restore();
  }

  function drawStaticPoints(layout, model, valueKey, color, alpha, radius) {
    model.samples.forEach((sample) => {
      const point = samplePointToCanvas(layout, sample, valueKey === "quantValue");
      drawDot(point.x, point.y, radius, color, alpha, 14);
    });
  }

  function drawDot(x, y, radius, color, alpha, glow) {
    const ctx = app.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = glow;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0, radius), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawQuantizedInteger(x, y, value, alpha, fontSize) {
    const ctx = app.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#051016";
    ctx.font = `1000 ${fontSize}px Consolas, "Courier New", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(value), x, y + 0.5);
    ctx.restore();
  }

  function drawRipple(x, y, progress, color, alpha) {
    const ctx = app.ctx;
    const p = clamp(progress, 0, 1);
    ctx.save();
    ctx.globalAlpha = (1 - p) * alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 5 + p * 24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawBitParticles(x, y, seed, progress, color) {
    const p = clamp(progress, 0, 1);
    if (p <= 0 || p >= 1) {
      return;
    }
    const ctx = app.ctx;
    ctx.save();
    ctx.font = "900 14px Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.globalAlpha = (1 - p) * 0.9;
    for (let j = 0; j < 8; j += 1) {
      const a = seededNoise(seed * 31 + j * 17) * Math.PI * 2;
      const d = 6 + p * (18 + seededNoise(seed * 71 + j) * 22);
      ctx.fillText(j % 2 ? "1" : "0", x + Math.cos(a) * d, y + Math.sin(a) * d);
    }
    ctx.restore();
  }

  function drawTrail(x1, y1, x2, y2, color, alpha) {
    const ctx = app.ctx;
    const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
    gradient.addColorStop(0, "rgba(255,255,255,0)");
    gradient.addColorStop(1, color);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  }

  function getCodeLayout(layout, model) {
    const key = `${app.width}x${app.height}:${model.sampleCount}:${model.bitCount}:${app.step}`;
    if (app.rebuildCodeLayoutKey === key && app.codeLayout) {
      return app.codeLayout;
    }

    const panelW = Math.min(layout.w, app.width * 0.84);
    const codeW = clamp(model.bitCount * 16 + 34, 62, 116);
    const gap = 8;
    const cols = Math.max(1, Math.floor((panelW - 16) / (codeW + gap)));
    const rows = Math.ceil(model.samples.length / cols);
    const rowH = 30;
    const panelH = rows * rowH + 18;
    const panelX = app.width / 2 - panelW / 2;
    const panelY = Math.min(app.height - 92 - panelH, layout.y + layout.h + 16);
    const positions = model.samples.map((sample, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      return {
        x: panelX + 12 + col * (codeW + gap) + codeW / 2,
        y: panelY + 10 + row * rowH + rowH / 2,
        w: codeW,
        h: 24
      };
    });

    app.codeLayout = {
      x: panelX,
      y: panelY,
      w: panelW,
      h: panelH,
      positions,
      codeW,
      rowH
    };
    app.rebuildCodeLayoutKey = key;
    return app.codeLayout;
  }

  function drawCodePanelBox(codeLayout, alpha) {
    const ctx = app.ctx;
    ctx.save();
    ctx.globalAlpha = alpha * 0.66;
    ctx.fillStyle = "rgba(7, 12, 22, 0.78)";
    ctx.strokeStyle = "rgba(180, 140, 255, 0.34)";
    ctx.lineWidth = 1;
    roundedRect(ctx, codeLayout.x, codeLayout.y, codeLayout.w, codeLayout.h, 8);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawCodePanel(codeLayout, alpha, alphaForIndex) {
    drawCodePanelBox(codeLayout, alpha);

    const model = ensureModel();
    model.samples.forEach((sample, i) => {
      const localAlpha = typeof alphaForIndex === "function" ? alphaForIndex(i) : alpha;
      if (localAlpha > 0) {
        drawCodePacket(codeLayout.positions[i].x, codeLayout.positions[i].y, sample.code, localAlpha, 0.84, localAlpha > 0.95);
      }
    });
  }

  function drawCodePacket(x, y, code, alpha, scale, highlight) {
    const ctx = app.ctx;
    const fontSize = Math.max(13, 18 * scale);
    const w = Math.max(52, code.length * fontSize * 0.68 + 18);
    const h = 25 * scale;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = highlight ? "rgba(180, 140, 255, 0.32)" : "rgba(10, 8, 24, 0.82)";
    ctx.strokeStyle = highlight ? "rgba(255, 255, 255, 0.78)" : "rgba(180, 140, 255, 0.54)";
    ctx.lineWidth = highlight ? 1.5 : 1;
    ctx.shadowColor = "#b48cff";
    ctx.shadowBlur = highlight ? 18 : 8;
    roundedRect(ctx, x - w / 2, y - h / 2, w, h, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#efe8ff";
    ctx.font = `900 ${fontSize}px Consolas, "Courier New", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(code, x, y + 0.5);
    ctx.restore();
  }

  function drawBinaryMist(now, alpha) {
    const ctx = app.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = "900 18px Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < 90; i += 1) {
      const x = (seededNoise(i * 19) * app.width + Math.sin(now * 0.0004 + i) * 18 + app.width) % app.width;
      const y = (seededNoise(i * 47) * app.height + now * (0.015 + seededNoise(i) * 0.03)) % app.height;
      const bit = seededNoise(i * 71 + Math.floor(now / 480)) > 0.5 ? "1" : "0";
      ctx.fillStyle = bit === "1" ? "rgba(124,255,155,0.8)" : "rgba(180,140,255,0.74)";
      ctx.fillText(bit, x, y);
    }
    ctx.restore();
  }

  function getCdHome(layout) {
    const r = clamp(Math.min(app.width, app.height) * 0.13, 70, 136);
    return {
      r,
      cx: Math.min(app.width - r - 48, layout.x + layout.w * 0.78),
      cy: layout.y + layout.h * 0.45
    };
  }

  function getCdCorner() {
    const r = clamp(Math.min(app.width, app.height) * 0.09, 54, 100);
    return {
      r,
      cx: app.width - r - 32,
      cy: app.height - r - 96
    };
  }

  // Slide 6は中央、Slide 7で右下へ移動し、D/A変換中は右下に固定する
  function getCdPlacement(step, elapsed, layout) {
    const home = getCdHome(layout);
    if (step <= 5) {
      return home;
    }
    const corner = getCdCorner();
    if (step === 6) {
      const p = easeInOutCubic(clamp(elapsed / 900, 0, 1));
      return {
        r: lerp(home.r, corner.r, p),
        cx: lerp(home.cx, corner.cx, p),
        cy: lerp(home.cy, corner.cy, p)
      };
    }
    return corner;
  }

  function drawCD(now, cx, cy, r) {
    const ctx = app.ctx;
    const rotation = now * 0.0012;
    ctx.save();
    const disc = ctx.createRadialGradient(cx, cy, r * 0.12, cx, cy, r);
    disc.addColorStop(0, "#071014");
    disc.addColorStop(0.26, "#e7f8ff");
    disc.addColorStop(0.48, "#9bf1ff");
    disc.addColorStop(0.7, "#b48cff");
    disc.addColorStop(1, "#14212a");
    ctx.fillStyle = disc;
    ctx.shadowColor = "#42e8f4";
    ctx.shadowBlur = 26;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "screen";
    for (let i = 0; i < 4; i += 1) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotation + i * Math.PI * 0.5);
      ctx.fillStyle = "rgba(255, 255, 255, 0.22)";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r * 0.92, -0.08, 0.08);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#071014";
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.32, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawCDLabel(cx, cy, r, text) {
    const ctx = app.ctx;
    const fontSize = clamp(r * 0.22, 20, 30);
    ctx.save();
    ctx.font = `1000 ${fontSize}px 'Yu Gothic', sans-serif`;
    const w = ctx.measureText(text).width + 28;
    const h = fontSize + 16;
    const x = cx - w / 2;
    const y = cy - r - h - 12;
    ctx.fillStyle = "rgba(4, 13, 18, 0.88)";
    ctx.strokeStyle = "rgba(66, 232, 244, 0.58)";
    ctx.lineWidth = 1.5;
    roundedRect(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#eefbff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "#42e8f4";
    ctx.shadowBlur = 12;
    ctx.fillText(text, cx, y + h / 2 + 1);
    ctx.restore();
  }

  function drawBitStreamsToDisc(now, codeLayout, discX, discY) {
    const ctx = app.ctx;
    ctx.save();
    ctx.font = "900 16px Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < 34; i += 1) {
      const p = (now * 0.00035 + seededNoise(i * 11)) % 1;
      const startX = codeLayout.x + seededNoise(i * 29) * codeLayout.w;
      const startY = codeLayout.y + seededNoise(i * 37) * codeLayout.h;
      const x = lerp(startX, discX, easeInOutCubic(p));
      const y = lerp(startY, discY, easeInOutCubic(p));
      ctx.globalAlpha = Math.sin(p * Math.PI) * 0.68;
      ctx.fillStyle = i % 2 ? "#7cff9b" : "#b48cff";
      ctx.fillText(i % 2 ? "1" : "0", x, y);
    }
    ctx.restore();
  }

  // ディスクからコードへ向けて0/1が流れる演出（保存時の逆向き＝読み出し）
  function drawBitStreamsFromDisc(now, codeLayout, discX, discY, alpha) {
    const ctx = app.ctx;
    ctx.save();
    ctx.font = "900 16px Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const peak = typeof alpha === "number" ? alpha : 0.68;
    for (let i = 0; i < 34; i += 1) {
      const p = (now * 0.00035 + seededNoise(i * 11)) % 1;
      const endX = codeLayout.x + seededNoise(i * 29) * codeLayout.w;
      const endY = codeLayout.y + seededNoise(i * 37) * codeLayout.h;
      const x = lerp(discX, endX, easeInOutCubic(p));
      const y = lerp(discY, endY, easeInOutCubic(p));
      ctx.globalAlpha = Math.sin(p * Math.PI) * peak;
      ctx.fillStyle = i % 2 ? "#7cff9b" : "#b48cff";
      ctx.fillText(i % 2 ? "1" : "0", x, y);
    }
    ctx.restore();
  }

  function drawReturnArrows(now, codeLayout, layout, progress) {
    const ctx = app.ctx;
    ctx.save();
    ctx.globalAlpha = 0.28 * progress;
    ctx.strokeStyle = "#b48cff";
    ctx.lineWidth = 2;
    ctx.setLineDash([12, 10]);
    ctx.lineDashOffset = -now * 0.04;
    ctx.beginPath();
    ctx.moveTo(codeLayout.x + codeLayout.w * 0.28, codeLayout.y);
    ctx.quadraticCurveTo(layout.x + layout.w * 0.28, layout.y + layout.h * 0.88, layout.x + layout.w * 0.18, layout.midY);
    ctx.moveTo(codeLayout.x + codeLayout.w * 0.72, codeLayout.y);
    ctx.quadraticCurveTo(layout.x + layout.w * 0.72, layout.y + layout.h * 0.88, layout.x + layout.w * 0.82, layout.midY);
    ctx.stroke();
    ctx.restore();
  }

  function drawReconstruction(layout, model, progress, color, alpha, width) {
    const path = getReconstructionPath(layout, model);
    const count = Math.max(2, Math.floor((path.length - 1) * clamp(progress, 0, 1)));
    const ctx = app.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    for (let i = 0; i <= count; i += 1) {
      if (i === 0) {
        ctx.moveTo(path[i].x, path[i].y);
      } else {
        ctx.lineTo(path[i].x, path[i].y);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  function getReconstructionPath(layout, model) {
    const points = model.samples.map((sample) => samplePointToCanvas(layout, sample, true));
    const output = [];
    if (points.length < 2) {
      return points;
    }
    for (let i = 0; i < points.length - 1; i += 1) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];
      const steps = Math.max(6, Math.floor(460 / points.length));
      for (let s = 0; s < steps; s += 1) {
        const t = s / steps;
        output.push(catmullRomPoint(p0, p1, p2, p3, t));
      }
    }
    output.push(points[points.length - 1]);
    return output;
  }

  function catmullRomPoint(p0, p1, p2, p3, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    return {
      x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
      y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
    };
  }

  function drawDifferenceLines(layout, model, alpha) {
    const ctx = app.ctx;
    ctx.save();
    ctx.globalAlpha = 0.22 * alpha;
    ctx.strokeStyle = "#ffd166";
    ctx.lineWidth = 1.5;
    model.samples.forEach((sample) => {
      const original = samplePointToCanvas(layout, sample, false);
      const quant = samplePointToCanvas(layout, sample, true);
      ctx.beginPath();
      ctx.moveTo(original.x, original.y);
      ctx.lineTo(quant.x, quant.y);
      ctx.stroke();
    });
    ctx.restore();
  }

  function drawDataMeter(layout, model) {
    const ctx = app.ctx;
    const maxBits = MAX_SAMPLE_RATE * DISPLAY_SECONDS * MAX_BITS;
    const ratio = clamp(model.totalBits / maxBits, 0, 1);
    const x = layout.x + layout.w - 260;
    const y = layout.y + 18;
    const w = 230;
    const h = 18;
    ctx.save();
    ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
    roundedRect(ctx, x, y, w, h, 6);
    ctx.fill();
    const gradient = ctx.createLinearGradient(x, 0, x + w, 0);
    gradient.addColorStop(0, "#42e8f4");
    gradient.addColorStop(0.58, "#ffd166");
    gradient.addColorStop(1, "#ff4f64");
    ctx.fillStyle = gradient;
    roundedRect(ctx, x, y, w * ratio, h, 6);
    ctx.fill();
    ctx.fillStyle = "#eefbff";
    ctx.font = "800 13px 'Yu Gothic', sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("データ量", x - 10, y + h - 3);
    ctx.restore();
  }

  function samplePointToCanvas(layout, sample, quantized) {
    return {
      x: layout.x + sample.t * layout.w,
      y: valueToY(layout, quantized ? sample.quantValue : sample.value)
    };
  }

  function valueToY(layout, value) {
    return layout.midY - clamp(value, -1, 1) * layout.amp;
  }

  function roundedRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  }

  function easeInOutCubic(t) {
    const p = clamp(t, 0, 1);
    return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
  }

  function easeOutBack(t) {
    const p = clamp(t, 0, 1);
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
  }

  function seededNoise(seed) {
    const x = Math.sin(seed * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  }
})();
