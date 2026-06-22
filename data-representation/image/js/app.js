(() => {
  "use strict";

  /* ======================================================
     画像のデジタル化教材
     - sound教材と同じトーン(暗背景+発光、HUD、下部凡例)で構成する。
     - 写真・標本化画像・チャンネル・ビット列・再構成画像を
       「持続アクター」として保持し、スライド間で同じオブジェクトが
       移動・変形してつながって見えるようにする。
     - 背景粒子、データの流れ、カードの揺れなど常時動く演出を持つ。
  ====================================================== */

  const SLIDE_MAX = 10;
  const DEFAULT_WIDTH = 20;
  const DEFAULT_HEIGHT = 15;
  const MAX_WIDTH = 800;
  const MAX_HEIGHT = 600;
  const LEVEL_VALUES = [2, 4, 8, 16, 32, 64, 128, 256];
  const ACTOR_TWEEN_MS = 820;
  // ●(代表画素)は標本化解像度そのもの(width×height)を1個ずつ描く。
  // 個別の円として1個ずつ動かすのはこの数まで。これを超える解像度では
  // 標本化画像/成分画像をニアレストネイバーで敷き詰めて「●の集まり」を表す
  // (●は極端に小さくなるが、設定した画素数そのものを見せる)。
  const DOT_DRAW_LIMIT = 4000;

  const SLIDES = [
    { title: "画像がデジタルデータになるまで", splash: "画像のデジタル化", stage: "image" },
    { title: "撮影", splash: "撮影", stage: "image" },
    { title: "標本化", splash: "標本化", stage: "sampling" },
    { title: "量子化", splash: "量子化", stage: "quantizing" },
    { title: "符号化", splash: "符号化", stage: "encoding" },
    { title: "ファイルサイズ", splash: "ファイルサイズ", stage: "encoding" },
    { title: "画質調整", splash: "画質調整", stage: "done" },
    { title: "もう一度、標本化", splash: "標本化", stage: "sampling" },
    { title: "もう一度、量子化", splash: "量子化", stage: "quantizing" },
    { title: "もう一度、符号化", splash: "符号化", stage: "encoding" },
    { title: "もう一度、ファイルサイズ", splash: "ファイルサイズ", stage: "encoding" }
  ];

  // スライド6〜10は調整ループ。10の次は6へ戻る。
  const LOOP_START = 6;

  const STAGE_ORDER = ["image", "sampling", "quantizing", "encoding"];

  const COLOR = {
    line: "#38dff0",
    sample: "#ffd166",
    quant: "#75f09a",
    code: "#c7a1ff",
    alert: "#ff5c78",
    text: "#f1fbff",
    muted: "#a8c0c7"
  };

  const CHANNEL_COLORS = ["#ff5c78", "#75f09a", "#38dff0"];

  const MODE_LABELS = {
    rgb: "RGB",
    gray: "グレースケール",
    bw: "白黒2階調"
  };

  const ACTOR_IDS = ["photo", "ch0", "ch1", "ch2", "recon"];

  const app = {
    canvas: null,
    ctx: null,
    dpr: 1,
    width: 1,
    height: 1,
    started: false,
    slide: 0,
    prevSlide: 0,
    slideStartedAt: 0,
    now: 0,
    cameraStream: null,
    cameraState: "idle",
    sourceCanvas: null,
    processCanvas: null,
    sourceReady: false,
    sourceName: "サンプル画像",
    sourceVersion: 0,
    noticeTimer: 0,
    splashTimer: 0,
    model: null,
    modelKey: "",
    actors: {},
    flights: [],
    bitCount: null,
    dataAnim: null,
    reDecodeAt: -99999,
    compareSnapshot: null,
    params: {
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
      mode: "rgb",
      levels: 256
    },
    baseline: {
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
      mode: "rgb",
      levels: 256
    }
  };

  const dom = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    app.canvas = document.getElementById("stage");
    app.ctx = app.canvas.getContext("2d", { alpha: false });
    app.sourceCanvas = document.createElement("canvas");
    app.processCanvas = document.createElement("canvas");

    ACTOR_IDS.forEach((id, index) => {
      app.actors[id] = {
        id,
        rect: null,
        alpha: 0,
        from: null,
        to: null,
        fromAlpha: 0,
        toAlpha: 0,
        start: 0,
        dur: ACTOR_TWEEN_MS,
        seed: index * 1.7 + 0.6
      };
    });

    Object.assign(dom, {
      startOverlay: document.getElementById("startOverlay"),
      startButton: document.getElementById("startButton"),
      slideTitle: document.getElementById("slideTitle"),
      slideBadge: document.getElementById("slideBadge"),
      sourceBadge: document.getElementById("sourceBadge"),
      resolutionBadge: document.getElementById("resolutionBadge"),
      dataBadge: document.getElementById("dataBadge"),
      infoPanel: document.getElementById("infoPanel"),
      infoStats: document.getElementById("infoStats"),
      cameraPanel: document.getElementById("cameraPanel"),
      captureButton: document.getElementById("captureButton"),
      sampleButton: document.getElementById("sampleButton"),
      uploadInput: document.getElementById("uploadInput"),
      adjustPanel: document.getElementById("adjustPanel"),
      widthRange: document.getElementById("widthRange"),
      heightRange: document.getElementById("heightRange"),
      widthOutput: document.getElementById("widthOutput"),
      heightOutput: document.getElementById("heightOutput"),
      modeButtons: Array.from(document.querySelectorAll(".mode-button")),
      levelRange: document.getElementById("levelRange"),
      levelOutput: document.getElementById("levelOutput"),
      levelControl: document.querySelector(".level-control"),
      legendItems: Array.from(document.querySelectorAll(".legend-item")),
      notice: document.getElementById("notice"),
      splash: document.getElementById("stepSplash"),
      flash: document.getElementById("flash"),
      frameFlash: document.getElementById("frameFlash"),
      video: document.getElementById("cameraVideo")
    });

    dom.startButton.addEventListener("click", startExperience);
    dom.captureButton.addEventListener("click", () => {
      captureCameraFrame(true);
      goToSlide(2);
    });
    dom.sampleButton.addEventListener("click", () => {
      useSampleImage(true);
      goToSlide(2);
    });
    dom.uploadInput.addEventListener("change", loadUploadedImage);
    dom.widthRange.addEventListener("input", () => setResolution(Number(dom.widthRange.value), app.params.height));
    dom.heightRange.addEventListener("input", () => setResolution(app.params.width, Number(dom.heightRange.value)));
    dom.levelRange.addEventListener("input", () => setLevels(LEVEL_VALUES[Number(dom.levelRange.value) - 1]));
    dom.modeButtons.forEach((button) => {
      button.addEventListener("click", () => setMode(button.dataset.mode));
    });
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", resizeCanvas);

    useSampleImage(false);
    resizeCanvas();
    updateUI();
    requestAnimationFrame(frame);
  }

  async function startExperience() {
    if (app.started) {
      return;
    }
    app.started = true;
    dom.startOverlay.classList.add("is-hidden");
    goToSlide(1, { startCamera: false });
    await startCamera();
    // Permission prompts can cancel fullscreen, so request it after the camera flow settles.
    const fullscreenStarted = await requestFullscreenSafely();
    if (!fullscreenStarted && app.cameraState === "ready") {
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

  async function startCamera() {
    if (app.cameraStream || app.cameraState === "starting") {
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      app.cameraState = "unavailable";
      showNotice("この環境ではWebカメラを起動できません。サンプル画像または画像アップロードで進めます。", 5200);
      updateUI();
      return;
    }

    app.cameraState = "starting";
    updateUI();

    try {
      app.cameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "environment"
        },
        audio: false
      });
      dom.video.srcObject = app.cameraStream;
      await dom.video.play();
      app.cameraState = "ready";
      showNotice("");
    } catch (error) {
      app.cameraState = "unavailable";
      showNotice("カメラ許可が使えないため、サンプル画像または画像アップロードで進めます。", 5600);
    }

    updateUI();
  }

  function stopCamera() {
    if (!app.cameraStream) {
      return;
    }
    app.cameraStream.getTracks().forEach((track) => track.stop());
    app.cameraStream = null;
    dom.video.srcObject = null;
    app.cameraState = "idle";
  }

  function captureCameraFrame(showFlash) {
    if (!dom.video.videoWidth || !dom.video.videoHeight) {
      useSampleImage(showFlash);
      showNotice("カメラ映像がまだ取得できないため、サンプル画像で開始します。", 3600);
      return;
    }

    const target = fitSourceSize(dom.video.videoWidth, dom.video.videoHeight);
    app.sourceCanvas.width = target.width;
    app.sourceCanvas.height = target.height;
    const ctx = app.sourceCanvas.getContext("2d");
    ctx.drawImage(dom.video, 0, 0, target.width, target.height);
    app.sourceReady = true;
    app.sourceName = "撮影画像";
    app.sourceVersion += 1;
    invalidateModel();
    app.compareSnapshot = null;
    if (showFlash) {
      pulseCameraFlash();
      showNotice("撮影完了", 1200);
    }
    updateUI();
  }

  function useSampleImage(showFlash) {
    const w = 960;
    const h = 720;
    app.sourceCanvas.width = w;
    app.sourceCanvas.height = h;
    const ctx = app.sourceCanvas.getContext("2d");

    const sky = ctx.createLinearGradient(0, 0, w, h);
    sky.addColorStop(0, "#2ed3f0");
    sky.addColorStop(0.38, "#f9d66c");
    sky.addColorStop(0.74, "#f56e8e");
    sky.addColorStop(1, "#2b2f68");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
    for (let i = 0; i < 70; i += 1) {
      const x = seededNoise(i * 17) * w;
      const y = seededNoise(i * 31) * h * 0.58;
      const r = 2 + seededNoise(i * 43) * 8;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "#102733";
    ctx.beginPath();
    ctx.moveTo(0, h * 0.72);
    for (let x = 0; x <= w; x += 40) {
      const y = h * (0.56 + 0.08 * Math.sin(x * 0.012));
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#75f09a";
    ctx.fillRect(0, h * 0.75, w, h * 0.25);

    for (let i = 0; i < 8; i += 1) {
      const x = 90 + i * 108;
      const y = 424 + Math.sin(i) * 20;
      ctx.fillStyle = i % 2 ? "#38dff0" : "#ffd166";
      roundedRect(ctx, x, y, 72, 86, 8);
      ctx.fill();
      ctx.fillStyle = "#0b1a21";
      ctx.beginPath();
      ctx.arc(x + 36, y - 10, 22, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "rgba(5, 16, 22, 0.36)";
    ctx.fillRect(0, h * 0.84, w, h * 0.16);
    ctx.fillStyle = "#f1fbff";
    ctx.font = "900 54px 'Yu Gothic', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("情報I", w / 2, h * 0.9);

    app.sourceReady = true;
    app.sourceName = "サンプル画像";
    app.sourceVersion += 1;
    invalidateModel();
    app.compareSnapshot = null;
    if (showFlash) {
      pulseCameraFlash();
      showNotice("サンプル画像で開始", 1600);
    }
    updateUI();
  }

  function loadUploadedImage(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const target = fitSourceSize(image.naturalWidth || image.width, image.naturalHeight || image.height);
        app.sourceCanvas.width = target.width;
        app.sourceCanvas.height = target.height;
        app.sourceCanvas.getContext("2d").drawImage(image, 0, 0, target.width, target.height);
        app.sourceReady = true;
        app.sourceName = "アップロード画像";
        app.sourceVersion += 1;
        invalidateModel();
        app.compareSnapshot = null;
        pulseCameraFlash();
        showNotice("画像を読み込みました", 1400);
        goToSlide(Math.max(2, app.slide));
        updateUI();
      };
      image.onerror = () => showNotice("画像ファイルを読み込めませんでした。", 3600);
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }

  function fitSourceSize(width, height) {
    const maxSide = 1200;
    const ratio = Math.min(1, maxSide / Math.max(width, height));
    return {
      width: Math.max(1, Math.round(width * ratio)),
      height: Math.max(1, Math.round(height * ratio))
    };
  }

  function handleKeyDown(event) {
    if (event.code === "Space" || event.code === "Enter" || event.code === "NumpadEnter" || event.code === "ArrowRight" || event.code === "PageDown") {
      event.preventDefault();
      if (!app.started) {
        startExperience();
      } else {
        advance();
      }
      return;
    }

    if (event.code === "ArrowLeft" || event.code === "PageUp") {
      event.preventDefault();
      goBack();
      return;
    }

    if (event.code === "Home") {
      event.preventDefault();
      goToSlide(0);
      return;
    }

    if (event.key === "r" || event.key === "R") {
      event.preventDefault();
      retake();
      return;
    }

    if (event.key === "f" || event.key === "F") {
      event.preventDefault();
      if (document.fullscreenElement) {
        document.exitFullscreen?.();
      } else {
        requestFullscreenSafely();
      }
    }
  }

  function advance() {
    if (!app.started) {
      startExperience();
      return;
    }

    if (app.slide === 1 && app.cameraState === "ready" && app.sourceName !== "撮影画像") {
      captureCameraFrame(false);
    }

    if (app.slide >= SLIDE_MAX) {
      // ファイルサイズ(10)の次は画質調整(6)へ戻り、設定を変えて再体験できる。
      goToSlide(LOOP_START);
      return;
    }

    goToSlide(app.slide + 1);
  }

  function goBack() {
    if (!app.started) {
      return;
    }
    goToSlide(Math.max(0, app.slide - 1));
  }

  function retake() {
    if (!app.started) {
      startExperience();
      return;
    }
    goToSlide(1);
    startCamera();
  }

  function goToSlide(slide, options = {}) {
    const next = clamp(Math.round(slide), 0, SLIDE_MAX);
    const looping = app.slide >= SLIDE_MAX && next === LOOP_START;
    const forward = next > app.slide || looping;

    if (next >= 2 && !app.sourceReady) {
      useSampleImage(false);
    }

    if (next === 6) {
      app.compareSnapshot = createComparisonSnapshot(ensureModel());
    }

    app.prevSlide = app.slide;
    app.slide = next;
    app.slideStartedAt = performance.now();

    if (next === 1 && options.startCamera !== false) {
      startCamera();
    }

    ensureModel();
    applyLayout(performance.now());
    launchSlideEffects(next, performance.now());

    pulseFrame();
    if (app.started && forward) {
      showSplash(SLIDES[next].splash);
    }
    updateUI();
  }

  function setResolution(width, height) {
    app.params.width = clamp(Math.round(width / 5) * 5, 10, MAX_WIDTH);
    app.params.height = clamp(Math.round(height / 5) * 5, 10, MAX_HEIGHT);
    dom.widthRange.value = String(app.params.width);
    dom.heightRange.value = String(app.params.height);
    onParamsChanged();
  }

  function setMode(mode) {
    if (!Object.prototype.hasOwnProperty.call(MODE_LABELS, mode)) {
      return;
    }
    app.params.mode = mode;
    if (mode === "bw") {
      app.params.levels = 2;
    } else if (app.params.levels < 2) {
      app.params.levels = 256;
    }
    onParamsChanged();
  }

  function setLevels(levels) {
    if (app.params.mode === "bw") {
      app.params.levels = 2;
      updateUI();
      return;
    }
    app.params.levels = LEVEL_VALUES.includes(levels) ? levels : 256;
    onParamsChanged();
  }

  function onParamsChanged() {
    const before = app.model ? app.model.stats.totalBits : 0;
    invalidateModel();
    ensureModel();
    const after = app.model ? app.model.stats.totalBits : 0;
    app.dataAnim = { from: before, to: after, start: performance.now(), dur: 700 };
    app.reDecodeAt = performance.now();
    applyLayout(performance.now());
    if (app.slide === 6) {
      launchReDecodeEffects(performance.now());
    }
    updateUI();
  }

  function invalidateModel() {
    app.model = null;
    app.modelKey = "";
    app.bitFields = null;
    app.bitWindowFields = null;
    app.quantValueFields = null;
  }

  /* ---------- モデル構築 ---------- */

  function ensureModel() {
    if (!app.sourceReady) {
      useSampleImage(false);
    }

    const key = [
      app.sourceVersion,
      app.params.width,
      app.params.height,
      app.params.mode,
      app.params.levels
    ].join(":");

    if (app.model && app.modelKey === key) {
      return app.model;
    }

    app.modelKey = key;
    app.model = buildModel();
    return app.model;
  }

  function buildModel() {
    const w = app.params.width;
    const h = app.params.height;
    const mode = app.params.mode;
    const levels = mode === "bw" ? 2 : app.params.levels;
    const sampleCanvas = app.processCanvas;
    sampleCanvas.width = w;
    sampleCanvas.height = h;
    const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });
    sampleCtx.clearRect(0, 0, w, h);
    sampleCtx.imageSmoothingEnabled = true;
    sampleCtx.drawImage(app.sourceCanvas, 0, 0, w, h);
    const originalImage = sampleCtx.getImageData(0, 0, w, h);
    const original = originalImage.data;
    const quantized = new Uint8ClampedArray(original.length);

    for (let i = 0; i < original.length; i += 4) {
      const raw = {
        r: original[i],
        g: original[i + 1],
        b: original[i + 2],
        a: original[i + 3]
      };
      const q = quantizePixel(raw, mode, levels);
      quantized[i] = q.r;
      quantized[i + 1] = q.g;
      quantized[i + 2] = q.b;
      quantized[i + 3] = 255;
    }

    const sampledCanvas = document.createElement("canvas");
    sampledCanvas.width = w;
    sampledCanvas.height = h;
    sampledCanvas.getContext("2d").putImageData(originalImage, 0, 0);

    const reconstructedCanvas = document.createElement("canvas");
    reconstructedCanvas.width = w;
    reconstructedCanvas.height = h;
    reconstructedCanvas.getContext("2d").putImageData(new ImageData(quantized, w, h), 0, 0);

    const stats = calculateStats(w, h, mode, levels);
    const baselineStats = calculateStats(app.baseline.width, app.baseline.height, app.baseline.mode, app.baseline.levels);
    const channels = buildChannelCanvases(original, quantized, w, h, mode);
    const dotField = buildDotField(w, h, mode, levels);

    return {
      width: w,
      height: h,
      mode,
      levels,
      original,
      quantized,
      channels,
      sampledCanvas,
      reconstructedCanvas,
      dots: dotField,
      stats,
      baselineStats
    };
  }

  function createComparisonSnapshot(model) {
    if (!model || !model.reconstructedCanvas) {
      return null;
    }
    const canvas = document.createElement("canvas");
    canvas.width = model.reconstructedCanvas.width;
    canvas.height = model.reconstructedCanvas.height;
    canvas.getContext("2d").drawImage(model.reconstructedCanvas, 0, 0);
    return {
      canvas,
      width: model.width,
      height: model.height,
      mode: model.mode,
      levels: model.levels,
      stats: Object.assign({}, model.stats)
    };
  }

  /*
    画像全体のビット列のうち、先頭からk番目のビット(0/1)をその場で求める。
    全ビットを配列化せずに済むので、高解像度でスライダーを動かしても重くならない。
    並び順は「画素ラスター順 → RGB(またはY/白黒)順 → 各成分はMSB先頭」。
  */
  function pixelBitAt(model, k) {
    const stats = model.stats;
    const totalBits = stats.totalBits;
    if (totalBits <= 0) {
      return 0;
    }
    const kk = ((k % totalBits) + totalBits) % totalBits;
    const pixelIndex = Math.floor(kk / stats.pixelBits);
    const within = kk % stats.pixelBits;
    const off = pixelIndex * 4;
    const r = model.original[off];
    const g = model.original[off + 1];
    const b = model.original[off + 2];
    if (model.mode === "bw") {
      return luminance(r, g, b) >= 128 ? 1 : 0;
    }
    const compBits = stats.componentBits;
    const compIndex = Math.floor(within / compBits);
    const bitInComp = within % compBits;
    let value;
    if (model.mode === "gray") {
      value = quantizeComponent(luminance(r, g, b), model.levels).index;
    } else {
      const comp = compIndex === 0 ? r : compIndex === 1 ? g : b;
      value = quantizeComponent(comp, model.levels).index;
    }
    return (value >> (compBits - 1 - bitInComp)) & 1;
  }

  /*
    標本化スライド以降で使う画素ドット(●)。
    ●の数 = 設定した画素数そのもの(width×height、間引きなし)。
    高解像度では1個ずつ円を描かず、標本化画像/成分画像を敷き詰めて
    「●の集まり」を表す(setup は軽いメタ情報だけ持つ)。
    1個1個の代表色・成分値・2進数は dotRaw / dotValue / dotBits で
    その場で求める(model.original から計算。配列化しないので軽い)。
  */
  function buildDotField(width, height, mode, levels) {
    const channels = mode === "rgb" ? 3 : 1;
    const bitsPerComp = mode === "bw" ? 1 : Math.round(Math.log2(levels));
    const count = width * height;
    return {
      cols: width,
      rows: height,
      count,
      exact: true,
      // DOT_DRAW_LIMIT 以下なら1個ずつ円で動かせる。
      drawDots: count <= DOT_DRAW_LIMIT,
      channels,
      bitsPerComp,
      glyphTotal: count * channels * bitsPerComp
    };
  }

  // ●(画素 k)の標本化された代表色。
  function dotRaw(model, k) {
    const o = k * 4;
    return { r: model.original[o], g: model.original[o + 1], b: model.original[o + 2] };
  }

  // ●(画素 k)の成分 ci(RGB の 0/1/2、グレー/白黒は 0)の量子化後の階調番号。
  // 256階調なら 0〜255、16階調(4bit/成分)なら 0〜15、白黒は 0/1。
  function dotValue(model, k, ci) {
    const o = k * 4;
    const r = model.original[o];
    const g = model.original[o + 1];
    const b = model.original[o + 2];
    if (model.mode === "bw") {
      return luminance(r, g, b) >= 128 ? 1 : 0;
    }
    if (model.mode === "gray") {
      return quantizeComponent(luminance(r, g, b), model.levels).index;
    }
    const comp = ci === 0 ? r : ci === 1 ? g : b;
    return quantizeComponent(comp, model.levels).index;
  }

  // ●(画素 k)の成分 ci を、画面上の濃淡として描くための0〜255値。
  function dotDisplayLevel(model, k, ci) {
    const o = k * 4;
    const r = model.original[o];
    const g = model.original[o + 1];
    const b = model.original[o + 2];
    if (model.mode === "bw") {
      return luminance(r, g, b) >= 128 ? 255 : 0;
    }
    if (model.mode === "gray") {
      return quantizeComponent(luminance(r, g, b), model.levels).value;
    }
    const comp = ci === 0 ? r : ci === 1 ? g : b;
    return quantizeComponent(comp, model.levels).value;
  }

  // ●(画素 k)の成分 ci の2進数文字列。
  function dotBits(model, k, ci) {
    const o = k * 4;
    const r = model.original[o];
    const g = model.original[o + 1];
    const b = model.original[o + 2];
    if (model.mode === "bw") {
      return luminance(r, g, b) >= 128 ? "1" : "0";
    }
    const bitCount = Math.round(Math.log2(model.levels));
    if (model.mode === "gray") {
      return toBinary(quantizeComponent(luminance(r, g, b), model.levels).index, bitCount);
    }
    const comp = ci === 0 ? r : ci === 1 ? g : b;
    return toBinary(quantizeComponent(comp, model.levels).index, bitCount);
  }

  // ●(画素 k)のグリッド上の中心位置(0〜1)。列優先のラスター順。
  function dotCenter(grid, k) {
    const col = k % grid.cols;
    const row = (k - col) / grid.cols;
    return {
      col,
      row,
      sx: (col + 0.5) / grid.cols,
      sy: (row + 0.5) / grid.rows
    };
  }

  /*
    量子化スライド用のチャンネル分解。
    RGB: R/G/Bの3枚、グレースケール: 明るさ1枚、白黒: 白黒1枚。
  */
  function buildChannelCanvases(original, quantized, width, height, mode) {
    const make = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      return canvas;
    };

    if (mode === "rgb") {
      const defs = [
        { key: "R", label: "R(赤)", color: CHANNEL_COLORS[0] },
        { key: "G", label: "G(緑)", color: CHANNEL_COLORS[1] },
        { key: "B", label: "B(青)", color: CHANNEL_COLORS[2] }
      ];
      return defs.map((def, channelIndex) => {
        const canvas = make();
        const data = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < original.length; i += 4) {
          const v = original[i + channelIndex];
          data[i] = channelIndex === 0 ? v : 0;
          data[i + 1] = channelIndex === 1 ? v : 0;
          data[i + 2] = channelIndex === 2 ? v : 0;
          data[i + 3] = 255;
        }
        canvas.getContext("2d").putImageData(new ImageData(data, width, height), 0, 0);
        return { key: def.key, label: def.label, color: def.color, canvas };
      });
    }

    const canvas = make();
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < original.length; i += 4) {
      const lum = luminance(original[i], original[i + 1], original[i + 2]);
      const v = mode === "gray" ? lum : (lum >= 128 ? 255 : 0);
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
    canvas.getContext("2d").putImageData(new ImageData(data, width, height), 0, 0);
    return [{
      key: mode === "gray" ? "Y" : "BW",
      label: mode === "gray" ? "明るさ" : "白黒",
      color: mode === "gray" ? "#cfd8dc" : "#f1fbff",
      canvas
    }];
  }

  function calculateStats(width, height, mode, levels) {
    const normalizedLevels = mode === "bw" ? 2 : levels;
    const componentBits = mode === "bw" ? 1 : Math.log2(normalizedLevels);
    const pixelBits = mode === "rgb" ? componentBits * 3 : componentBits;
    const totalPixels = width * height;
    const totalBits = totalPixels * pixelBits;
    const totalBytes = totalBits / 8;
    const kb = totalBytes / 1024;
    const mb = totalBytes / (1024 * 1024);
    return {
      width,
      height,
      totalPixels,
      mode,
      levels: normalizedLevels,
      componentBits,
      pixelBits,
      totalBits,
      totalBytes,
      kb,
      mb
    };
  }

  function quantizePixel(raw, mode, levels) {
    if (mode === "bw") {
      const lum = luminance(raw.r, raw.g, raw.b);
      const value = lum >= 128 ? 255 : 0;
      return { r: value, g: value, b: value };
    }

    if (mode === "gray") {
      const gray = quantizeComponent(luminance(raw.r, raw.g, raw.b), levels).value;
      return { r: gray, g: gray, b: gray };
    }

    return {
      r: quantizeComponent(raw.r, levels).value,
      g: quantizeComponent(raw.g, levels).value,
      b: quantizeComponent(raw.b, levels).value
    };
  }

  function quantizeComponent(value, levels) {
    const normalized = clamp(Math.round(value), 0, 255);
    const step = 255 / Math.max(1, levels - 1);
    const index = clamp(Math.round(normalized / step), 0, levels - 1);
    return {
      index,
      value: clamp(Math.round(index * step), 0, 255)
    };
  }

  function luminance(r, g, b) {
    return Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }

  function toBinary(value, length) {
    return Math.round(value).toString(2).padStart(length, "0");
  }

  /* ---------- レイアウトと持続アクター ---------- */

  function getContentRect() {
    const top = 112;
    let bottomInset = 26;
    if (app.slide === 1) {
      bottomInset = 96;
    } else if (app.slide === 6) {
      bottomInset = 124;
    }
    const legend = 84;
    return {
      x: 30,
      y: top,
      w: Math.max(120, app.width - 60),
      h: Math.max(120, app.height - top - legend - bottomInset)
    };
  }

  function getSourceAspect() {
    if (!app.sourceCanvas || !app.sourceCanvas.height) {
      return 4 / 3;
    }
    return app.sourceCanvas.width / app.sourceCanvas.height;
  }

  function fitAspect(region, aspect) {
    let w = region.w;
    let h = w / aspect;
    if (h > region.h) {
      h = region.h;
      w = h * aspect;
    }
    return {
      x: region.x + (region.w - w) / 2,
      y: region.y + (region.h - h) / 2,
      w,
      h
    };
  }

  function subRegion(rect, fx, fy, fw, fh) {
    return {
      x: rect.x + rect.w * fx,
      y: rect.y + rect.h * fy,
      w: rect.w * fw,
      h: rect.h * fh
    };
  }

  function scaleRect(rect, factor) {
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    return {
      x: cx - rect.w * factor / 2,
      y: cy - rect.h * factor / 2,
      w: rect.w * factor,
      h: rect.h * factor
    };
  }

  function lerpRect(a, b, t) {
    return {
      x: lerp(a.x, b.x, t),
      y: lerp(a.y, b.y, t),
      w: lerp(a.w, b.w, t),
      h: lerp(a.h, b.h, t)
    };
  }

  function channelCount() {
    return app.model ? app.model.channels.length : 3;
  }

  // ●グリッドの縦横比(= 標本化の列数/行数)。●が正方セルで並ぶように使う。
  function dotAspect() {
    const grid = app.model && app.model.dots;
    if (grid && grid.rows) {
      return grid.cols / grid.rows;
    }
    return getSourceAspect();
  }

  // 標本化スライドで●を並べる右側グリッド枠。slide3の分裂元にもなる。
  function samplingDotRegion() {
    const C = getContentRect();
    return fitAspect(subRegion(C, 0.52, 0.07, 0.46, 0.84), getSourceAspect());
  }

  // 量子化スライド(slide3)で、標本化の●が一度集まる中央上部の枠。
  // ここからR/G/Bの3エリアへ分離する。
  function gatherDotRegion() {
    const C = getContentRect();
    return fitAspect(subRegion(C, 0.36, 0.0, 0.28, 0.26), dotAspect());
  }

  // 量子化スライド(slide3)でR/G/B(またはグレー/白黒)の成分エリアを横に並べる枠。
  function quantizeChannelRegions() {
    const C = getContentRect();
    const n = channelCount();
    const region = n === 1 ? subRegion(C, 0.3, 0.24, 0.4, 0.64) : subRegion(C, 0.02, 0.24, 0.96, 0.64);
    const gapX = Math.max(14, region.w * 0.03);
    const cellW = (region.w - gapX * (n - 1)) / n;
    const rects = [];
    for (let i = 0; i < n; i += 1) {
      rects.push({ x: region.x + i * (cellW + gapX), y: region.y, w: cellW, h: region.h });
    }
    return rects;
  }

  // 量子化スライドの符号化(slide4)で●が置かれる左側チャンネル枠。
  function encodeChannelRegion() {
    const C = getContentRect();
    const n = channelCount();
    return n === 1 ? subRegion(C, 0.01, 0.32, 0.2, 0.36) : subRegion(C, 0.01, 0.07, 0.2, 0.86);
  }

  // 符号化スライドで0/1を敷き詰めるデータエリア。ビット列スライドでも同じ枠を使う。
  // 右側のデータ量パネル(ビット列スライドで表示)と重ならない幅にする。
  function codeAreaRect() {
    const C = getContentRect();
    if (app.slide === 5 || app.slide === 10) {
      return subRegion(C, 0.06, 0.05, 0.73, 0.82);
    }
    return subRegion(C, 0.26, 0.05, 0.53, 0.82);
  }

  // ビット列スライド(slide5)で、R/G/Bを重ねて元画像に戻す左側の枠。
  function mergedImageRect() {
    const C = getContentRect();
    return fitAspect(subRegion(C, 0.01, 0.16, 0.22, 0.62), getSourceAspect());
  }

  function layoutForSlide(slide) {
    const C = getContentRect();
    const aspect = getSourceAspect();
    const targets = {};
    const n = channelCount();

    const stackChannels = (region) => {
      const gapY = Math.max(10, region.h * 0.03);
      const cellH = (region.h - gapY * (n - 1)) / n;
      for (let i = 0; i < n; i += 1) {
        const cell = {
          x: region.x,
          y: region.y + i * (cellH + gapY),
          w: region.w,
          h: cellH
        };
        targets["ch" + i] = fitAspect(cell, aspect);
      }
    };

    if (slide === 1) {
      targets.photo = fitAspect(subRegion(C, 0.06, 0.03, 0.88, 0.94), aspect);
    } else if (slide === 2 || slide === 7) {
      // 左:元画像 / 右:標本化した●(オーバーレイ描画)。右側に元画像は出さない。
      targets.photo = fitAspect(subRegion(C, 0.02, 0.07, 0.44, 0.84), aspect);
    } else if (slide === 3 || slide === 8) {
      // 量子化の●(中央上部に集合→R/G/Bへ分離)・成分エリア・数値はすべてオーバーレイで描く。
      // 持続アクターは使わない(targets は空)。
    } else if (slide === 4 || slide === 9) {
      // 左:R/G/Bの成分エリア(●の供給元) / 右:0/1のデータエリア(オーバーレイ)。
      stackChannels(encodeChannelRegion());
    } else if (slide === 5 || slide === 10) {
      // ビット列だけを主役にする。左側に元画像は出さない。
    } else if (slide === 6) {
      // 左:元画像 / 右:この設定でのプレビュー(再構成画像)。
      targets.photo = fitAspect(subRegion(C, 0.02, 0.06, 0.45, 0.88), aspect);
      targets.recon = fitAspect(subRegion(C, 0.53, 0.06, 0.45, 0.88), aspect);
    }

    return targets;
  }

  function startTween(actor, fromRect, toRect, toAlpha, now) {
    actor.from = { x: fromRect.x, y: fromRect.y, w: fromRect.w, h: fromRect.h };
    actor.to = { x: toRect.x, y: toRect.y, w: toRect.w, h: toRect.h };
    actor.fromAlpha = actor.alpha;
    actor.toAlpha = toAlpha;
    actor.start = now;
    actor.dur = ACTOR_TWEEN_MS;
  }

  function currentRect(id) {
    const actor = app.actors[id];
    return actor && actor.rect && actor.alpha > 0.04 ? actor.rect : null;
  }

  function spawnRect(id, targets) {
    if (id === "photo") {
      return currentRect("recon") || scaleRect(targets.photo, 0.72);
    }
    if (id.startsWith("ch")) {
      // 符号化(slide4)では、量子化で●が並んでいた成分エリアから生まれる(slide3→4の連続性)。
      if (app.slide === 4 || app.slide === 9) {
        const qr = quantizeChannelRegions();
        const idx = Number(id.slice(2));
        if (qr[idx]) {
          return currentRect(id) || qr[idx];
        }
      }
      return currentRect(id) || samplingDotRegion();
    }
    if (id === "recon") {
      return currentRect("photo") || scaleRect(targets.recon, 0.62);
    }
    return scaleRect(targets[id] || getContentRect(), 0.7);
  }

  function exitRect(id, targets, actor) {
    const base = actor.rect || getContentRect();
    if (id === "photo") {
      return { x: base.x - base.w * 0.92, y: base.y, w: base.w * 0.86, h: base.h * 0.86 };
    }
    if (id.startsWith("ch")) {
      // データエリア(右)へ吸い込まれるように退場する。
      return scaleRect(codeAreaRect(), 0.5);
    }
    return scaleRect(base, 0.6);
  }

  function applyLayout(now) {
    const targets = layoutForSlide(app.slide);
    ACTOR_IDS.forEach((id) => {
      const actor = app.actors[id];
      const target = targets[id];
      if (target) {
        let fromRect = actor.rect;
        if (!fromRect || actor.alpha < 0.05) {
          fromRect = spawnRect(id, targets);
        }
        startTween(actor, fromRect, target, 1, now);
      } else if (actor.rect && (actor.alpha > 0.01 || actor.toAlpha > 0)) {
        startTween(actor, actor.rect, exitRect(id, targets, actor), 0, now);
      } else if (actor.toAlpha > 0) {
        // 出現トゥイーンが始まったがまだ tick される前にターゲットが消えた場合
        // (renderFrame や高速なスライド送り)。出現を取り消して非表示にする。
        actor.to = null;
        actor.alpha = 0;
        actor.toAlpha = 0;
      }
    });
  }

  function tickActors(now) {
    ACTOR_IDS.forEach((id) => {
      const actor = app.actors[id];
      if (!actor.to) {
        return;
      }
      const t = clamp((now - actor.start) / actor.dur, 0, 1);
      const e = easeInOutCubic(t);
      actor.rect = lerpRect(actor.from, actor.to, e);
      actor.alpha = lerp(actor.fromAlpha, actor.toAlpha, e);
    });
  }

  /* ---------- 飛行エフェクト(アクター間を移動する粒) ---------- */

  function launchFlights(fromId, toId, options) {
    const count = options.count || 30;
    const now = options.now;
    for (let i = 0; i < count; i += 1) {
      const seed = i * 13.7 + (options.seedBase || 0);
      app.flights.push({
        fromId,
        toId,
        fx0: 0.08 + seededNoise(seed) * 0.84,
        fy0: 0.08 + seededNoise(seed * 1.7) * 0.84,
        fx1: 0.06 + seededNoise(seed * 2.3) * 0.88,
        fy1: 0.06 + seededNoise(seed * 3.1) * 0.88,
        bend: (seededNoise(seed * 4.7) - 0.5) * 220,
        start: now + 240 + i * (options.stagger || 26),
        dur: options.dur || 680,
        size: options.size || (3 + seededNoise(seed * 5.3) * 6),
        color: options.colors ? options.colors[i % options.colors.length] : COLOR.line,
        glyph: options.glyphs ? options.glyphs[i % options.glyphs.length] : null
      });
    }
    if (app.flights.length > 420) {
      app.flights.splice(0, app.flights.length - 420);
    }
  }

  function samplePaletteFromModel(count, useQuantized) {
    const model = app.model;
    const colors = [];
    if (!model) {
      return [COLOR.line, COLOR.quant, COLOR.sample];
    }
    const data = useQuantized ? model.quantized : model.original;
    const totalPixels = model.width * model.height;
    for (let i = 0; i < count; i += 1) {
      const p = Math.floor(seededNoise(i * 7.9) * totalPixels) * 4;
      colors.push("rgb(" + data[p] + "," + data[p + 1] + "," + data[p + 2] + ")");
    }
    return colors;
  }

  function launchSlideEffects(slide, now) {
    // 標本化〜符号化の主役演出は各オーバーレイで slideElapsed ベースに描く。
    // ここでは状態カウンタの初期化と、写真→プレビューの粒だけを扱う。
    app.bitCount = null;

    if (slide === 5 || slide === 10) {
      app.bitCount = { start: now + 1100, dur: 1800 };
    } else if (slide === 6) {
      launchFlights("photo", "recon", {
        now,
        count: 46,
        stagger: 22,
        dur: 760,
        colors: samplePaletteFromModel(20, true),
        seedBase: 11
      });
    }
  }

  function launchReDecodeEffects(now) {
    launchFlights("photo", "recon", {
      now,
      count: 24,
      stagger: 16,
      dur: 620,
      colors: samplePaletteFromModel(12, true),
      seedBase: Math.floor(now % 9973)
    });
  }

  function resolveFlightPoint(id, fx, fy) {
    const rect = app.actors[id] && app.actors[id].rect;
    if (!rect) {
      return null;
    }
    return {
      x: rect.x + rect.w * fx,
      y: rect.y + rect.h * fy
    };
  }

  function drawFlights(now) {
    const ctx = app.ctx;
    if (!app.flights.length) {
      return;
    }
    const alive = [];
    for (const flight of app.flights) {
      const t = (now - flight.start) / flight.dur;
      if (t > 1.05) {
        continue;
      }
      alive.push(flight);
      if (t < 0) {
        continue;
      }
      const p0 = resolveFlightPoint(flight.fromId, flight.fx0, flight.fy0);
      const p1 = resolveFlightPoint(flight.toId, flight.fx1, flight.fy1);
      if (!p0 || !p1) {
        continue;
      }
      const e = easeInOutCubic(clamp(t, 0, 1));
      const mx = (p0.x + p1.x) / 2;
      const my = (p0.y + p1.y) / 2;
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const len = Math.max(1, Math.hypot(dx, dy));
      const cx = mx - (dy / len) * flight.bend;
      const cy = my + (dx / len) * flight.bend;
      const x = quadAt(p0.x, cx, p1.x, e);
      const y = quadAt(p0.y, cy, p1.y, e);
      const fade = t < 0.12 ? t / 0.12 : (t > 0.86 ? (1.05 - t) / 0.19 : 1);

      ctx.save();
      ctx.globalAlpha = clamp(fade, 0, 1) * 0.95;
      if (flight.glyph) {
        ctx.fillStyle = flight.color;
        ctx.shadowColor = flight.color;
        ctx.shadowBlur = 10;
        ctx.font = "900 " + Math.round(12 + flight.size) + "px Consolas, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(flight.glyph, x, y);
      } else {
        ctx.fillStyle = flight.color;
        ctx.shadowColor = flight.color;
        ctx.shadowBlur = 8;
        ctx.fillRect(x - flight.size / 2, y - flight.size / 2, flight.size, flight.size);
      }
      ctx.restore();
    }
    app.flights = alive;
  }

  function quadAt(a, c, b, t) {
    const u = 1 - t;
    return u * u * a + 2 * u * t * c + t * t * b;
  }

  /* ---------- 描画 ---------- */

  function resizeCanvas() {
    app.dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    app.width = Math.max(1, window.innerWidth);
    app.height = Math.max(1, window.innerHeight);
    app.canvas.width = Math.floor(app.width * app.dpr);
    app.canvas.height = Math.floor(app.height * app.dpr);
    app.canvas.style.width = app.width + "px";
    app.canvas.style.height = app.height + "px";
    app.ctx.setTransform(app.dpr, 0, 0, app.dpr, 0, 0);
    applyLayout(performance.now());
  }

  function frame(now) {
    app.now = now;
    tickActors(now);
    updateDataBadge(now);
    draw(now);
    requestAnimationFrame(frame);
  }

  function slideElapsed(now) {
    return Math.max(0, now - app.slideStartedAt);
  }

  function draw(now) {
    const ctx = app.ctx;
    ctx.clearRect(0, 0, app.width, app.height);
    drawBackground(now);

    if (!app.started) {
      drawTitleOverlay(now, true);
      return;
    }

    drawConnectors(now);
    drawActorCards(now);
    drawFlights(now);

    switch (app.slide) {
      case 0:
        drawTitleOverlay(now, false);
        break;
      case 1:
        drawCameraOverlay(now);
        break;
      case 2:
      case 7:
        drawSamplingOverlay(now);
        break;
      case 3:
      case 8:
        drawQuantizeOverlay(now);
        break;
      case 4:
      case 9:
        drawEncodeOverlay(now);
        break;
      case 5:
      case 10:
        drawBitsOverlay(now);
        break;
      case 6:
        drawReconOverlay(now);
        break;
      default:
        break;
    }
  }

  function drawBackground(now) {
    const ctx = app.ctx;
    const g = ctx.createLinearGradient(0, 0, app.width, app.height);
    g.addColorStop(0, "#061014");
    g.addColorStop(0.58, "#081b21");
    g.addColorStop(1, "#111425");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, app.width, app.height);

    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = "rgba(130, 226, 237, 0.35)";
    ctx.lineWidth = 1;
    const grid = 52;
    const shift = (now * 0.016) % grid;
    for (let x = -grid + shift; x < app.width + grid; x += grid) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, app.height);
      ctx.stroke();
    }
    for (let y = -grid + shift; y < app.height + grid; y += grid) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(app.width, y);
      ctx.stroke();
    }
    ctx.restore();

    const glowPulse = 0.5 + Math.sin(now * 0.0008) * 0.5;
    const corner = ctx.createRadialGradient(app.width * 0.12, app.height * 0.16, 10, app.width * 0.12, app.height * 0.16, app.width * 0.4);
    corner.addColorStop(0, "rgba(56, 223, 240, " + (0.05 + glowPulse * 0.05) + ")");
    corner.addColorStop(1, "rgba(56, 223, 240, 0)");
    ctx.fillStyle = corner;
    ctx.fillRect(0, 0, app.width, app.height);

    if (app.slide === 4 || app.slide === 5 || app.slide === 9 || app.slide === 10) {
      drawBinaryMist(now, 0.05);
    }

    drawAmbientPixels(now);
  }

  function drawAmbientPixels(now) {
    const ctx = app.ctx;
    const colors = [COLOR.line, COLOR.quant, COLOR.sample, COLOR.code, COLOR.alert];
    ctx.save();
    for (let i = 0; i < 70; i += 1) {
      const speed = 0.005 + seededNoise(i * 9) * 0.016;
      const x = (seededNoise(i * 41) * app.width + Math.sin(now * speed + i) * 30 + now * 0.012 * (0.4 + seededNoise(i * 3)) + app.width) % app.width;
      const y = (seededNoise(i * 83) * app.height + Math.cos(now * speed * 0.8 + i) * 20 + app.height) % app.height;
      const size = 1.2 + seededNoise(i * 17) * 2.6;
      const twinkle = 0.5 + Math.sin(now * 0.003 + i * 1.9) * 0.5;
      ctx.globalAlpha = (0.05 + seededNoise(i * 23) * 0.1) * (0.4 + twinkle * 0.6);
      ctx.fillStyle = colors[i % colors.length];
      ctx.fillRect(x, y, size, size);
    }
    ctx.restore();
  }

  function drawBinaryMist(now, alpha) {
    const ctx = app.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = COLOR.code;
    ctx.font = "700 15px Consolas, monospace";
    for (let i = 0; i < 60; i += 1) {
      const colX = (i * 73) % app.width;
      const speed = 0.03 + seededNoise(i * 7) * 0.05;
      const y = (seededNoise(i * 13) * app.height + now * speed) % (app.height + 40) - 20;
      ctx.fillText(seededNoise(i * 31 + Math.floor(y / 18)) > 0.5 ? "1" : "0", colX, y);
    }
    ctx.restore();
  }

  /* ---------- アクター間のデータの流れ ---------- */

  function connectorPairs() {
    // ●や0/1のフローは各オーバーレイで描く。汎用コネクタは
    // 元画像→プレビューを結ぶ再構成スライドだけで使う。
    if (app.slide === 6) {
      return [{ from: "photo", to: "recon", color: COLOR.sample }];
    }
    return [];
  }

  function drawConnectors(now) {
    const pairs = connectorPairs();
    if (!pairs.length) {
      return;
    }
    const ctx = app.ctx;
    pairs.forEach((pair, index) => {
      const a = currentRect(pair.from);
      const b = currentRect(pair.to);
      if (!a || !b) {
        return;
      }
      const x0 = a.x + a.w;
      const y0 = a.y + a.h / 2;
      const x1 = b.x;
      const y1 = b.y + b.h / 2;
      if (x1 - x0 < 8) {
        return;
      }
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2 + (index - (pairs.length - 1) / 2) * 8;

      ctx.save();
      ctx.strokeStyle = pair.color;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 9]);
      ctx.lineDashOffset = -(now * 0.13 + index * 7);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(cx, cy, x1, y1);
      ctx.stroke();
      ctx.setLineDash([]);

      for (let d = 0; d < 3; d += 1) {
        const t = ((now / 1300) + d / 3 + index * 0.17) % 1;
        const px = quadAt(x0, cx, x1, t);
        const py = quadAt(y0, cy, y1, t);
        ctx.globalAlpha = 0.75 * Math.sin(Math.PI * t);
        ctx.fillStyle = pair.color;
        ctx.shadowColor = pair.color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.shadowBlur = 0;
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = pair.color;
      const angle = Math.atan2(y1 - cy, x1 - cx);
      ctx.translate(x1, y1);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-11, -6);
      ctx.lineTo(-11, 6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    });
  }

  /* ---------- アクター描画 ---------- */

  function actorBob(actor, now) {
    return Math.sin(now * 0.0011 + actor.seed * 2.6) * 3;
  }

  function drawActorCards(now) {
    const model = app.model;
    // 新構成で使うアクターは元画像・R/G/B成分エリア・プレビューのみ。
    // 標本化(●)・符号化(0/1)・ビット列はオーバーレイで描く。
    drawPhotoActor(now);
    for (let i = 0; i < 3; i += 1) {
      drawChannelActor(now, model, i);
    }
    drawReconActor(now, model);
  }

  function cardBase(actor, now) {
    if (!actor.rect || actor.alpha <= 0.01) {
      return null;
    }
    const bob = actorBob(actor, now);
    return {
      x: actor.rect.x,
      y: actor.rect.y + bob,
      w: actor.rect.w,
      h: actor.rect.h,
      alpha: actor.alpha
    };
  }

  function drawCardFrame(rect, color, alpha, now, seed) {
    const ctx = app.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(6, 17, 23, 0.85)";
    roundedRect(ctx, rect.x - 6, rect.y - 6, rect.w + 12, rect.h + 12, 10);
    ctx.fill();
    const pulse = 0.55 + Math.sin(now * 0.0024 + seed * 3.1) * 0.25;
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha * pulse;
    ctx.lineWidth = 2;
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
    roundedRect(ctx, rect.x - 6, rect.y - 6, rect.w + 12, rect.h + 12, 10);
    ctx.stroke();
    ctx.restore();
  }

  function drawCardSheen(rect, alpha, now, seed) {
    const ctx = app.ctx;
    const cycle = ((now * 0.00016 + seed * 0.37) % 1);
    if (cycle > 0.35) {
      return;
    }
    const t = cycle / 0.35;
    const sx = rect.x - rect.w * 0.25 + (rect.w * 1.5) * t;
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();
    const g = ctx.createLinearGradient(sx - 40, 0, sx + 40, 0);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.5, "rgba(255,255,255," + 0.1 * alpha + ")");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.restore();
  }

  function drawCardLabel(rect, text, color, alpha) {
    const ctx = app.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = "900 15px 'Yu Gothic', sans-serif";
    const w = ctx.measureText(text).width + 18;
    const x = rect.x - 6;
    const y = rect.y - 30;
    ctx.fillStyle = "rgba(5, 14, 19, 0.92)";
    roundedRect(ctx, x, y, w, 24, 6);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha * 0.85;
    ctx.lineWidth = 1.4;
    roundedRect(ctx, x, y, w, 24, 6);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x + 9, y + 13);
    ctx.restore();
  }

  function drawPhotoActor(now) {
    const actor = app.actors.photo;
    const rect = cardBase(actor, now);
    if (!rect) {
      return;
    }
    const ctx = app.ctx;
    drawCardFrame(rect, COLOR.line, rect.alpha, now, actor.seed);
    ctx.save();
    ctx.globalAlpha = rect.alpha;
    const comparison = app.slide === 6 && app.compareSnapshot && app.compareSnapshot.canvas;
    ctx.imageSmoothingEnabled = comparison ? false : true;
    const liveCamera = app.slide === 1 && app.cameraState === "ready" && app.sourceName !== "撮影画像" && dom.video.videoWidth > 0;
    if (comparison) {
      ctx.drawImage(comparison, rect.x, rect.y, rect.w, rect.h);
    } else if (liveCamera) {
      drawCover(dom.video, dom.video.videoWidth, dom.video.videoHeight, rect);
    } else if (app.sourceReady) {
      drawCover(app.sourceCanvas, app.sourceCanvas.width, app.sourceCanvas.height, rect);
    }
    ctx.restore();
    drawCardSheen(rect, rect.alpha, now, actor.seed);
    // スライド6(調整)ではラベルを出さない。
    if (app.slide !== 6) {
      drawCardLabel(rect, app.slide === 1 && liveCamera ? "カメラ映像" : "元画像(" + app.sourceName + ")", COLOR.line, rect.alpha);
    }
  }

  function drawCover(media, mw, mh, rect) {
    const ctx = app.ctx;
    const scale = Math.max(rect.w / mw, rect.h / mh);
    const dw = mw * scale;
    const dh = mh * scale;
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();
    ctx.drawImage(media, rect.x + (rect.w - dw) / 2, rect.y + (rect.h - dh) / 2, dw, dh);
    ctx.restore();
  }

  function drawChannelActor(now, model, index) {
    const actor = app.actors["ch" + index];
    const rect = cardBase(actor, now);
    if (!rect || !model || !model.channels[index]) {
      return;
    }
    if (app.slide === 5 || app.slide === 10) {
      return;
    }
    const channel = model.channels[index];
    const ctx = app.ctx;

    drawCardFrame(rect, channel.color, rect.alpha, now, actor.seed);
    ctx.save();
    ctx.globalAlpha = rect.alpha;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(channel.canvas, rect.x, rect.y, rect.w, rect.h);
    ctx.restore();
    drawCardSheen(rect, rect.alpha, now, actor.seed);
    drawCardLabel(rect, channel.label, channel.color, rect.alpha);
  }

  function drawReconActor(now, model) {
    const actor = app.actors.recon;
    const rect = cardBase(actor, now);
    if (!rect || !model) {
      return;
    }
    const ctx = app.ctx;
    drawCardFrame(rect, COLOR.sample, rect.alpha, now, actor.seed);

    const entering = (app.slide === 6 || app.slide === 10) && slideElapsed(now) < 2000;
    const reveal = entering ? easeOutCubic(clamp((slideElapsed(now) - 420) / 1300, 0, 1)) : 1;

    ctx.save();
    ctx.globalAlpha = rect.alpha;
    ctx.imageSmoothingEnabled = false;
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h * reveal);
    ctx.clip();
    ctx.drawImage(model.reconstructedCanvas, rect.x, rect.y, rect.w, rect.h);
    ctx.restore();

    if (reveal < 1) {
      ctx.save();
      ctx.globalAlpha = rect.alpha;
      ctx.fillStyle = COLOR.sample;
      ctx.shadowColor = COLOR.sample;
      ctx.shadowBlur = 16;
      ctx.fillRect(rect.x, rect.y + rect.h * reveal - 2, rect.w, 4);
      ctx.restore();
    }

    const sinceDecode = now - app.reDecodeAt;
    if (sinceDecode >= 0 && sinceDecode < 620) {
      const t = sinceDecode / 620;
      const x = rect.x + rect.w * t;
      ctx.save();
      ctx.globalAlpha = rect.alpha * (1 - t) * 0.85;
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = COLOR.sample;
      ctx.shadowBlur = 18;
      ctx.fillRect(x - 3, rect.y, 6, rect.h);
      ctx.restore();
    }

    drawCardSheen(rect, rect.alpha, now, actor.seed);
    // スライド6(調整)ではラベルを出さない。
    if (app.slide !== 6) {
      drawCardLabel(rect, "再構成画像 " + model.width + "×" + model.height, COLOR.sample, rect.alpha);
    }
  }

  /* ---------- スライド別オーバーレイ ---------- */

  const LOGO_PATTERN = [
    "..11......",
    "1111111113",
    "1..2222..1",
    "1.222222.1",
    "1.222222.1",
    "1..2222..1",
    "1111111111"
  ];

  function drawTitleOverlay(now, coveredByOverlay) {
    const ctx = app.ctx;
    const C = getContentRect();
    const cx = C.x + C.w / 2;
    const cy = C.y + C.h / 2;

    const cell = Math.min(26, C.h * 0.045);
    const cols = LOGO_PATTERN[0].length;
    const rows = LOGO_PATTERN.length;
    const logoX = cx - (cols * cell) / 2;
    const logoY = cy - rows * cell - 64;
    const colorsByCode = { 1: COLOR.line, 2: COLOR.quant, 3: COLOR.sample };

    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const code = LOGO_PATTERN[r][c];
        if (code === ".") {
          continue;
        }
        const idx = r * cols + c;
        const appear = clamp((now % 100000) / 60 - idx * 0.8, 0, 14);
        const pop = appear >= 14 ? 1 : easeOutBack(clamp(appear / 14, 0, 1));
        const wob = Math.sin(now * 0.0021 + idx * 0.7) * 1.6;
        const size = cell * 0.86 * pop;
        const x = logoX + c * cell + (cell - size) / 2;
        const y = logoY + r * cell + (cell - size) / 2 + wob;
        ctx.save();
        ctx.globalAlpha = 0.92;
        ctx.fillStyle = colorsByCode[code] || COLOR.line;
        ctx.shadowColor = colorsByCode[code] || COLOR.line;
        ctx.shadowBlur = 9;
        roundedRect(ctx, x, y, size, size, 3);
        ctx.fill();
        ctx.restore();
      }
    }

    for (let i = 0; i < 7; i += 1) {
      const ang = now * 0.00075 + (i * Math.PI * 2) / 7;
      const rx = cols * cell * 0.72;
      const ry = rows * cell * 0.7;
      const px = cx + Math.cos(ang) * rx;
      const py = logoY + rows * cell * 0.5 + Math.sin(ang) * ry;
      ctx.save();
      ctx.globalAlpha = 0.35 + Math.sin(now * 0.004 + i) * 0.2;
      ctx.fillStyle = [COLOR.line, COLOR.quant, COLOR.sample, COLOR.code][i % 4];
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    drawText("画像がデジタルデータになるまで", cx, cy + 48, 50, COLOR.text, 1000, "center");
    drawText(coveredByOverlay ? "標本化 → 量子化 → 符号化 → ビット列" : "Space / Enter: 撮影へ進む", cx, cy + 100, 22, "rgba(168, 192, 199, 0.92)", 900, "center");

    const labels = ["標本化", "量子化", "符号化", "ビット列"];
    const chipColors = [COLOR.sample, COLOR.quant, COLOR.code, COLOR.line];
    const chipW = 150;
    const startX = cx - ((labels.length - 1) * 186) / 2;
    labels.forEach((label, i) => {
      const bob = Math.sin(now * 0.0016 + i * 1.3) * 5;
      drawChip(startX + i * 186, cy + 158 + bob, label, chipColors[i], chipW);
    });
  }

  function drawCameraOverlay(now) {
    const rect = currentRect("photo");
    if (!rect) {
      return;
    }
    const ctx = app.ctx;
    const m = 14;

    ctx.save();
    ctx.strokeStyle = "rgba(241, 251, 255, 0.26)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 3; i += 1) {
      ctx.beginPath();
      ctx.moveTo(rect.x + (rect.w * i) / 3, rect.y + 8);
      ctx.lineTo(rect.x + (rect.w * i) / 3, rect.y + rect.h - 8);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(rect.x + 8, rect.y + (rect.h * i) / 3);
      ctx.lineTo(rect.x + rect.w - 8, rect.y + (rect.h * i) / 3);
      ctx.stroke();
    }

    ctx.strokeStyle = COLOR.line;
    ctx.lineWidth = 3;
    ctx.shadowColor = COLOR.line;
    ctx.shadowBlur = 10;
    const len = Math.min(46, rect.w * 0.1);
    const corners = [
      [rect.x + m, rect.y + m, 1, 1],
      [rect.x + rect.w - m, rect.y + m, -1, 1],
      [rect.x + m, rect.y + rect.h - m, 1, -1],
      [rect.x + rect.w - m, rect.y + rect.h - m, -1, -1]
    ];
    corners.forEach(([x, y, sx, sy]) => {
      ctx.beginPath();
      ctx.moveTo(x + len * sx, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + len * sy);
      ctx.stroke();
    });
    ctx.restore();

    const scanX = rect.x + ((now * 0.12) % rect.w);
    ctx.save();
    ctx.globalAlpha = 0.3;
    const g = ctx.createLinearGradient(scanX - 36, 0, scanX, 0);
    g.addColorStop(0, "rgba(56, 223, 240, 0)");
    g.addColorStop(1, "rgba(56, 223, 240, 0.7)");
    ctx.fillStyle = g;
    ctx.fillRect(scanX - 36, rect.y + 4, 36, rect.h - 8);
    ctx.restore();

    const live = app.cameraState === "ready" && app.sourceName !== "撮影画像";
    if (live && Math.sin(now * 0.006) > -0.2) {
      ctx.save();
      ctx.fillStyle = COLOR.alert;
      ctx.shadowColor = COLOR.alert;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(rect.x + rect.w - 46, rect.y + 30, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      drawText("REC", rect.x + rect.w - 22, rect.y + 30, 16, COLOR.alert, 1000, "right");
    }

    drawChip(rect.x + rect.w / 2, rect.y + rect.h + 34, cameraStatusText(), COLOR.line, 0);
  }

  function cameraStatusText() {
    if (app.cameraState === "starting") {
      return "カメラ起動中...";
    }
    if (app.cameraState === "ready") {
      return app.sourceName === "撮影画像" ? "撮影済み / Space・Enterで標本化へ" : "Space・Enter または「パシャッと撮影」";
    }
    if (app.cameraState === "unavailable") {
      return "カメラなし: サンプル画像かアップロードを選択";
    }
    return "準備中...";
  }

  /* ---------- ●(代表画素ドット)描画ヘルパー ---------- */

  // チャンネル成分の●の色(RGB数値)。R/G/Bは純色の濃淡、グレーは灰、白黒は黒白。
  function channelDotRGB(mode, channelIndex, value) {
    if (mode === "rgb") {
      if (channelIndex === 0) return { r: value, g: 26, b: 38 };
      if (channelIndex === 1) return { r: 26, g: value, b: 44 };
      return { r: 34, g: 40, b: value };
    }
    if (mode === "gray") {
      return { r: value, g: value, b: value };
    }
    return value >= 1 ? { r: 241, g: 251, b: 255 } : { r: 10, g: 17, b: 22 };
  }

  function drawDotValue(x, y, text, r, alpha, maxW, maxH) {
    const ctx = app.ctx;
    let fs = clamp(r * 1.0, 9, 18);
    if (maxW || maxH) {
      const textFit = maxW ? maxW / Math.max(1.15, String(text).length * 0.62) : fs;
      const heightFit = maxH ? maxH * 0.78 : fs;
      fs = clamp(Math.min(fs, textFit, heightFit), 5, 18);
    }
    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.font = "900 " + fs + "px 'Yu Gothic', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(1.2, fs * 0.3);
    ctx.strokeStyle = "rgba(4, 12, 16, 0.92)";
    ctx.strokeText(text, x, y);
    ctx.fillStyle = "#f6fdff";
    ctx.fillText(text, x, y, maxW);
    ctx.restore();
  }

  function drawPixelDotWithValue(x, y, r, rgb, strokeColor, value, alpha) {
    const ctx = app.ctx;
    const a = clamp(alpha == null ? 1 : alpha, 0, 1);
    if (a <= 0 || r <= 0) {
      return;
    }
    ctx.save();
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = "rgb(" + rgb.r + "," + rgb.g + "," + rgb.b + ")";
    ctx.shadowColor = strokeColor;
    ctx.shadowBlur = 14;
    ctx.fill();
    ctx.lineWidth = Math.max(1.4, r * 0.08);
    ctx.strokeStyle = strokeColor;
    ctx.stroke();
    ctx.restore();
    drawDotValue(x, y, String(value), r * 0.74, a, r * 1.55, r * 1.25);
  }

  function drawArrow(x0, y0, x1, y1, color, now) {
    const ctx = app.ctx;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 3;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.setLineDash([11, 8]);
    ctx.lineDashOffset = -(now * 0.14);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.setLineDash([]);
    const ang = Math.atan2(y1 - y0, x1 - x0);
    ctx.translate(x1, y1);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-15, -9);
    ctx.lineTo(-15, 9);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /* ---------- スライド2/7: 標本化 ---------- */

  function drawSamplingOverlay(now) {
    const photo = currentRect("photo");
    const model = app.model;
    if (!photo || !model || !model.dots) {
      return;
    }
    const ctx = app.ctx;
    const elapsed = slideElapsed(now);
    const grid = model.dots;
    const region = samplingDotRegion();
    const cellW = region.w / grid.cols;
    const cellH = region.h / grid.rows;
    const rad = Math.min(cellW, cellH) * 0.46;
    const TAU = Math.PI * 2;

    // 右側のドット枠(うっすら)
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = "rgba(117, 240, 154, 0.5)";
    ctx.lineWidth = 1.5;
    roundedRect(ctx, region.x - 8, region.y - 8, region.w + 16, region.h + 16, 10);
    ctx.stroke();
    ctx.restore();

    // 写真→ドット枠の流れ
    drawArrow(photo.x + photo.w + 14, photo.y + photo.h * 0.5, region.x - 16, region.y + region.h * 0.5, COLOR.sample, now);

    const colStagger = Math.max(8, Math.min(48, 1100 / grid.cols));
    let introEnd;
    if (grid.drawDots) {
      // ●が写真上の対応位置から右のグリッドへ「左→右の列順」で流れて整列する。
      introEnd = 300 + grid.cols * colStagger + 650;
      ctx.save();
      for (let k = 0; k < grid.count; k += 1) {
        const cen = dotCenter(grid, k);
        const tx = region.x + (cen.col + 0.5) * cellW;
        const ty = region.y + (cen.row + 0.5) * cellH;
        const delay = 300 + cen.col * colStagger + cen.row * 4;
        const p = easeInOutCubic(clamp((elapsed - delay) / 520, 0, 1));
        if (p <= 0) {
          continue;
        }
        const raw = dotRaw(model, k);
        const sx = photo.x + cen.sx * photo.w;
        const sy = photo.y + cen.sy * photo.h;
        const x = lerp(sx, tx, p);
        const y = lerp(sy, ty, p);
        const r = Math.max(0.6, rad * (0.5 + 0.5 * p));
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fillStyle = "rgb(" + raw.r + "," + raw.g + "," + raw.b + ")";
        ctx.fill();
      }
      ctx.restore();
    } else {
      // ●が極端に多いときは標本化画像を画素単位で敷き詰め、左→右に列ワイプで出す
      // (●の集まり=設定した画素数そのもの)。
      introEnd = 1500;
      const wipe = easeInOutCubic(clamp(elapsed / 1400, 0, 1));
      ctx.save();
      ctx.beginPath();
      ctx.rect(region.x, region.y, region.w * wipe, region.h);
      ctx.clip();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(model.sampledCanvas, region.x, region.y, region.w, region.h);
      ctx.restore();
      if (wipe < 1) {
        const fx = region.x + region.w * wipe;
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = COLOR.sample;
        ctx.shadowColor = COLOR.sample;
        ctx.shadowBlur = 14;
        ctx.fillRect(fx - 2, region.y, 4, region.h);
        ctx.restore();
      }
    }

    // 入場後は左右の対応を示すスイープを常時流す
    if (elapsed > introEnd && grid.cols > 0) {
      const cycle = 2800;
      const sweep = (now % cycle) / cycle;
      const activeCol = Math.floor(sweep * grid.cols) % grid.cols;
      const bandX = photo.x + (activeCol + 0.5) * (photo.w / grid.cols);
      const dotX = region.x + (activeCol + 0.5) * cellW;
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = COLOR.sample;
      ctx.shadowColor = COLOR.sample;
      ctx.shadowBlur = 12;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(bandX, photo.y);
      ctx.lineTo(bandX, photo.y + photo.h);
      ctx.stroke();
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 7]);
      ctx.lineDashOffset = -(now * 0.12);
      ctx.beginPath();
      ctx.moveTo(bandX, photo.y + photo.h * 0.5);
      ctx.lineTo(dotX, region.y + region.h * 0.5);
      ctx.stroke();
      ctx.setLineDash([]);
      // 対応する列の●の帯を光らせる
      ctx.globalAlpha = 0.75;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      roundedRect(ctx, dotX - cellW / 2, region.y, cellW, region.h, 4);
      ctx.stroke();
      ctx.restore();
    }

    drawChip(photo.x + photo.w / 2, photo.y - 24, "元画像", COLOR.line, 0);
    drawChip(region.x + region.w / 2, region.y - 24, "標本化した画素(●)", COLOR.quant, 0);
    const countP = clamp((elapsed - 900) / 1200, 0, 1);
    const total = Math.round(model.stats.totalPixels * easeOutCubic(countP));
    drawChip(region.x + region.w / 2, region.y + region.h + 34, "横" + model.width + " × 縦" + model.height + " = " + formatNumber(total) + " 画素", COLOR.sample, 0);
  }

  /* ---------- スライド3/8: 量子化(R/G/Bの3エリアに分裂) ---------- */

  function drawQuantizeOverlay(now) {
    const model = app.model;
    if (!model || !model.dots) {
      return;
    }
    const ctx = app.ctx;
    const grid = model.dots;
    const cols = grid.cols;
    const rows = grid.rows;
    const elapsed = slideElapsed(now);
    const C = getContentRect();
    const origin = samplingDotRegion();
    const gather = gatherDotRegion();
    const areas = quantizeChannelRegions();
    const n = areas.length;
    const TAU = Math.PI * 2;

    // タイムライン: origin(標本化の右枠)→ gather(中央上部)→ 各成分エリア。
    const gatherDur = 700;
    const splitDur = 880;
    const splitEnd = gatherDur + splitDur;
    const pGather = easeInOutCubic(clamp(elapsed / gatherDur, 0, 1));
    const pSplit = easeInOutCubic(clamp((elapsed - gatherDur) / splitDur, 0, 1));

    // 集合中の枠(中央上部)。分離が進むと消える。
    if (elapsed < splitEnd) {
      const gr = lerpRect(origin, gather, pGather);
      ctx.save();
      ctx.globalAlpha = 0.45 * (1 - pSplit);
      ctx.strokeStyle = "rgba(117, 240, 154, 0.7)";
      ctx.lineWidth = 1.5;
      roundedRect(ctx, gr.x - 6, gr.y - 6, gr.w + 12, gr.h + 12, 8);
      ctx.stroke();
      ctx.restore();
    }

    // 各成分エリアの枠(分離が進むほどはっきり)
    for (let ci = 0; ci < n; ci += 1) {
      const area = areas[ci];
      ctx.save();
      ctx.globalAlpha = 0.3 + 0.5 * pSplit;
      ctx.strokeStyle = model.channels[ci].color;
      ctx.lineWidth = 1.6;
      ctx.shadowColor = model.channels[ci].color;
      ctx.shadowBlur = 10 * pSplit;
      roundedRect(ctx, area.x - 6, area.y - 6, area.w + 12, area.h + 12, 8);
      ctx.stroke();
      ctx.restore();
    }

    if (grid.drawDots) {
      // ●を1個ずつ origin→gather→各成分エリア と動かす。色は raw→成分色へ。
      const ocw = origin.w / cols;
      const och = origin.h / rows;
      const gcw = gather.w / cols;
      const gch = gather.h / rows;
      for (let ci = 0; ci < n; ci += 1) {
        const area = areas[ci];
        const cellW = area.w / cols;
        const cellH = area.h / rows;
        const rad = Math.max(0.6, Math.min(cellW, cellH) * 0.44);
        ctx.save();
        for (let k = 0; k < grid.count; k += 1) {
          const cen = dotCenter(grid, k);
          const ox = origin.x + (cen.col + 0.5) * ocw;
          const oy = origin.y + (cen.row + 0.5) * och;
          const gx = gather.x + (cen.col + 0.5) * gcw;
          const gy = gather.y + (cen.row + 0.5) * gch;
          const bx = lerp(ox, gx, pGather);
          const by = lerp(oy, gy, pGather);
          const tx = area.x + (cen.col + 0.5) * cellW;
          const ty = area.y + (cen.row + 0.5) * cellH;
          const x = lerp(bx, tx, pSplit);
          const y = lerp(by, ty, pSplit);
          const raw = dotRaw(model, k);
          const comp = channelDotRGB(model.mode, ci, dotDisplayLevel(model, k, ci));
          const rr = Math.round(lerp(raw.r, comp.r, pSplit));
          const gg = Math.round(lerp(raw.g, comp.g, pSplit));
          const bb = Math.round(lerp(raw.b, comp.b, pSplit));
          ctx.beginPath();
          ctx.arc(x, y, rad, 0, TAU);
          ctx.fillStyle = "rgb(" + rr + "," + gg + "," + bb + ")";
          ctx.fill();
        }
        ctx.restore();
      }
    } else {
      // ●が多いときは成分画像を敷き詰める。集合中は加算合成で重なり、元の色に見える。
      const baseRect = lerpRect(origin, gather, pGather);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.imageSmoothingEnabled = false;
      for (let ci = 0; ci < n; ci += 1) {
        const r = lerpRect(baseRect, areas[ci], pSplit);
        ctx.drawImage(model.channels[ci].canvas, r.x, r.y, r.w, r.h);
      }
      ctx.restore();
    }

    const valueAlpha = easeOutCubic(clamp((elapsed - splitEnd + 80) / 560, 0, 1));
    if (valueAlpha > 0 && grid.drawDots) {
      for (let ci = 0; ci < n; ci += 1) {
        drawQuantizedValues(areas[ci], ci, model, grid, valueAlpha);
      }
    }

    // 数値の波: 左→右に少しの間だけ数値を出し、量子化(数値化)を見せる。繰り返す。
    if (elapsed > splitEnd - 200) {
      for (let ci = 0; ci < n; ci += 1) {
        drawNumberWave(areas[ci], ci, model, grid, elapsed, splitEnd, now);
      }
    }

    for (let ci = 0; ci < n; ci += 1) {
      const area = areas[ci];
      drawChip(area.x + area.w / 2, area.y + area.h + 22, "成分 " + (model.channels[ci].key || model.channels[ci].label), model.channels[ci].color, 0);
    }

    drawChip(C.x + C.w / 2, C.y - 4, "各画素を " + (model.mode === "rgb" ? "R・G・B" : channelLabelFor(model)) + " の数値に分ける(量子化:" + model.levels + "段階)", COLOR.quant, 0);
  }

  function drawQuantizedValues(area, ci, model, grid, alpha) {
    const field = getQuantValueField(area, ci, model, grid);
    if (!field) {
      return;
    }
    const ctx = app.ctx;
    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.drawImage(field.canvas, area.x, area.y, area.w, area.h);
    ctx.restore();
  }

  function getQuantValueField(area, ci, model, grid) {
    if (!grid.drawDots) {
      return null;
    }
    const aw = Math.max(20, Math.round(area.w));
    const ah = Math.max(20, Math.round(area.h));
    const cols = grid.cols;
    const rows = grid.rows;
    const cellW = aw / cols;
    const cellH = ah / rows;
    if (cellW < 5.2 || cellH < 6.2) {
      return null;
    }
    const maxDigits = model.mode === "bw" ? 1 : String(model.levels - 1).length;
    const fs = clamp(Math.min(cellH * 0.58, cellW / Math.max(1.15, maxDigits * 0.62)), 5, 15);
    const key = app.modelKey + ":qv:" + ci + ":" + aw + "x" + ah + ":" + Math.round(fs * 10);
    if (!app.quantValueFields) {
      app.quantValueFields = {};
    }
    if (app.quantValueFields[key]) {
      return app.quantValueFields[key];
    }

    const canvas = document.createElement("canvas");
    canvas.width = aw;
    canvas.height = ah;
    const cctx = canvas.getContext("2d");
    cctx.font = "900 " + fs + "px 'Yu Gothic', sans-serif";
    cctx.textAlign = "center";
    cctx.textBaseline = "middle";
    cctx.lineJoin = "round";
    cctx.lineWidth = Math.max(1, fs * 0.28);
    cctx.strokeStyle = "rgba(4, 12, 16, 0.94)";
    cctx.fillStyle = "#f6fdff";
    for (let k = 0; k < grid.count; k += 1) {
      const cen = dotCenter(grid, k);
      const x = (cen.col + 0.5) * cellW;
      const y = (cen.row + 0.5) * cellH;
      const text = String(dotValue(model, k, ci));
      cctx.strokeText(text, x, y);
      cctx.fillText(text, x, y);
    }

    app.quantValueFields[key] = { key, canvas };
    return app.quantValueFields[key];
  }

  // 量子化スライドの数値ウェーブ。成分エリアを左→右に帯がスキャンし、
  // 常時重ねた数値のうち、通過する列を明るく強調する(繰り返す)。
  function drawNumberWave(area, ci, model, grid, elapsed, settleAt, now) {
    const ctx = app.ctx;
    const cols = grid.cols;
    const rows = grid.rows;
    const cellW = area.w / cols;
    const cellH = area.h / rows;
    const t = Math.max(0, elapsed - settleAt);
    const cycle = clamp(cols * 70, 1700, 5200);
    const headCol = ((t % cycle) / cycle) * (cols + 2) - 1;
    const bandCols = Math.max(1.2, cols * 0.06);

    // 光る帯(スキャンしていることが分かるよう常時表示)
    const x0 = area.x + clamp(headCol - bandCols, 0, cols) * cellW;
    const x1 = area.x + clamp(headCol, 0, cols) * cellW;
    if (x1 > x0 + 0.5) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const g = ctx.createLinearGradient(x0, 0, x1, 0);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(1, model.channels[ci].color);
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = g;
      ctx.fillRect(x0, area.y, x1 - x0, area.h);
      ctx.restore();
    }
    drawNumberWaveMagnifier(area, ci, model, grid, headCol, cellW, cellH, now);

    // 数値(極端に小さいセルでは帯のみ)
    if (cellW < 5.2 || cellH < 6.2) {
      return;
    }
    const rowStep = 1;
    const c0 = Math.floor(headCol - bandCols);
    const c1 = Math.ceil(headCol);
    for (let c = c0; c <= c1; c += 1) {
      if (c < 0 || c >= cols) {
        continue;
      }
      const d = headCol - (c + 0.5);
      if (d < 0 || d > bandCols) {
        continue;
      }
      const a = 1 - d / bandCols;
      for (let r = 0; r < rows; r += rowStep) {
        const k = r * cols + c;
        const x = area.x + (c + 0.5) * cellW;
        const y = area.y + (r + 0.5) * cellH;
        drawDotValue(x, y, String(dotValue(model, k, ci)), Math.min(cellW, cellH) * 0.62, a, cellW * 0.9, cellH * 0.82);
      }
    }
  }

  function drawNumberWaveMagnifier(area, ci, model, grid, headCol, cellW, cellH, now) {
    const ctx = app.ctx;
    const cols = grid.cols;
    const rows = grid.rows;
    if (headCol < -0.2 || headCol > cols + 0.2) {
      return;
    }

    const activeCol = clamp(Math.floor(headCol), 0, cols - 1);
    const lineX = area.x + (activeCol + 0.5) * cellW;
    const color = model.channels[ci].color;

    ctx.save();
    ctx.globalAlpha = 0.82;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(lineX, area.y);
    ctx.lineTo(lineX, area.y + area.h);
    ctx.stroke();
    ctx.restore();

    const needLarge = cellW < 12 || cellH < 12 || grid.count > 1200;
    if (!needLarge) {
      return;
    }

    const fs = clamp(Math.max(18, Math.min(30, Math.max(cellW, cellH) * 2.15)), 18, 30);
    const rowStep = Math.max(1, Math.ceil((fs + 10) / Math.max(1, cellH)));
    const frac = headCol - Math.floor(headCol);
    const pulse = 0.76 + 0.24 * Math.sin(now * 0.012);
    const alpha = clamp((0.72 + (1 - Math.abs(frac - 0.5)) * 0.35) * pulse, 0.45, 1);

    ctx.save();
    ctx.font = "900 " + fs + "px 'Yu Gothic', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(2, fs * 0.18);
    ctx.strokeStyle = "rgba(4, 12, 16, 0.92)";
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    for (let r = 0; r < rows; r += rowStep) {
      const k = r * cols + activeCol;
      const text = String(dotValue(model, k, ci));
      const tw = Math.max(fs * 1.35, ctx.measureText(text).width + 14);
      const th = fs + 10;
      const x = clamp(lineX, area.x + tw / 2 + 3, area.x + area.w - tw / 2 - 3);
      const y = clamp(area.y + (r + 0.5) * cellH, area.y + th / 2 + 3, area.y + area.h - th / 2 - 3);
      ctx.globalAlpha = alpha * 0.86;
      ctx.fillStyle = "rgba(5, 14, 19, 0.84)";
      roundedRect(ctx, x - tw / 2, y - th / 2, tw, th, 7);
      ctx.fill();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#f6fdff";
      ctx.strokeText(text, x, y + 1);
      ctx.fillText(text, x, y + 1);
    }
    ctx.restore();
  }

  function channelLabelFor(model) {
    return model.channels.length ? (model.channels[0].label || model.channels[0].key) : "明るさ";
  }

  /* ---------- スライド4/9・5/10: 0/1のデータエリア(ビットフィールド) ---------- */

  // データエリアに敷く0/1のセルサイズの段階。大→小。
  // 置いたビットが増えるほど小さいセルを選び、左上基準でフォントだけ小さくしていく。
  const BIT_CELLS = [46, 36, 28, 22, 17, 13, 10, 8, 6];

  function bitCellLadder(area) {
    return BIT_CELLS.map((cell) => {
      const cols = Math.max(1, Math.floor(area.w / cell));
      const rows = Math.max(1, Math.floor(area.h / cell));
      return { cell, cols, rows, capacity: cols * rows };
    });
  }

  // 置いたビット数 count が収まる最大セル(=いちばん大きい文字)を選ぶ。
  function pickBitStep(ladder, count) {
    for (let i = 0; i < ladder.length; i += 1) {
      if (ladder[i].capacity >= Math.max(1, count)) {
        return ladder[i];
      }
    }
    return ladder[ladder.length - 1];
  }

  // データエリアに 0/1 を左上から行方向(左→右→折り返し)に詰めた1枚Canvas。
  // 実ビット(pixelBitAt)を使い、(modelKey, areaサイズ, cell, variant)でキャッシュする。
  // variant "norm": 1=緑 / 0=灰、"lit": 数え終えた色(1=金 / 0=水色)。
  function getBitField(area, cell, variant) {
    const model = app.model;
    if (!model) {
      return null;
    }
    const aw = Math.max(20, Math.round(area.w));
    const ah = Math.max(20, Math.round(area.h));
    const c = Math.max(4, Math.round(cell));
    const key = app.modelKey + ":bf:" + aw + "x" + ah + ":" + c + ":" + variant;
    if (!app.bitFields) {
      app.bitFields = {};
    }
    if (app.bitFields[key]) {
      return app.bitFields[key];
    }
    const cols = Math.max(1, Math.floor(aw / c));
    const rows = Math.max(1, Math.floor(ah / c));
    const capacity = cols * rows;
    const count = Math.min(capacity, model.stats.totalBits);
    const canvas = document.createElement("canvas");
    canvas.width = aw;
    canvas.height = ah;
    const cctx = canvas.getContext("2d");
    cctx.font = "800 " + Math.max(5, Math.round(c * 0.74)) + "px Consolas, monospace";
    cctx.textAlign = "center";
    cctx.textBaseline = "middle";
    const lit = variant === "lit";
    for (let i = 0; i < count; i += 1) {
      const col = i % cols;
      const row = (i - col) / cols;
      const one = pixelBitAt(model, i) === 1;
      if (lit) {
        cctx.fillStyle = one ? "#ffe08a" : "#7fe0ff";
      } else {
        cctx.fillStyle = one ? "#9af0b4" : "rgba(150, 172, 186, 0.7)";
      }
      cctx.fillText(one ? "1" : "0", (col + 0.5) * c, (row + 0.5) * c);
    }
    app.bitFields[key] = { key, canvas, cols, rows, cell: c, capacity, count };
    return app.bitFields[key];
  }

  function getBitWindowField(area, cell, startBit, variant) {
    const model = app.model;
    if (!model) {
      return null;
    }
    const aw = Math.max(20, Math.round(area.w));
    const ah = Math.max(20, Math.round(area.h));
    const c = Math.max(4, Math.round(cell));
    const cols = Math.max(1, Math.floor(aw / c));
    const rows = Math.max(1, Math.floor(ah / c) + 1);
    const start = clamp(Math.floor(startBit || 0), 0, Math.max(0, model.stats.totalBits));
    const capacity = cols * rows;
    const count = Math.min(capacity, Math.max(0, model.stats.totalBits - start));
    const key = app.modelKey + ":bw:" + aw + "x" + ah + ":" + c + ":" + variant;
    if (!app.bitWindowFields) {
      app.bitWindowFields = {};
    }
    let field = app.bitWindowFields[key];
    if (!field) {
      const canvas = document.createElement("canvas");
      canvas.width = aw;
      canvas.height = rows * c;
      field = { key, canvas, cols, rows, cell: c, capacity, count: 0, startBit: start };
      app.bitWindowFields = { [key]: field };
    } else if (field.cols !== cols || field.rows !== rows || field.cell !== c || field.canvas.width !== aw || field.canvas.height !== rows * c) {
      const canvas = document.createElement("canvas");
      canvas.width = aw;
      canvas.height = rows * c;
      field = { key, canvas, cols, rows, cell: c, capacity, count: 0, startBit: start };
      app.bitWindowFields = { [key]: field };
    }

    const cctx = field.canvas.getContext("2d");
    cctx.font = "800 " + Math.max(5, Math.round(c * 0.74)) + "px Consolas, monospace";
    cctx.textAlign = "center";
    cctx.textBaseline = "middle";
    const lit = variant === "lit";

    const drawRows = (firstRow, lastRow) => {
      for (let row = firstRow; row < lastRow; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const local = row * cols + col;
          if (local >= count) {
            return;
          }
          const one = pixelBitAt(model, start + local) === 1;
          if (lit) {
            cctx.fillStyle = one ? "#ffe08a" : "#7fe0ff";
          } else {
            cctx.fillStyle = one ? "#9af0b4" : "rgba(150, 172, 186, 0.7)";
          }
          cctx.fillText(one ? "1" : "0", (col + 0.5) * c, (row + 0.5) * c);
        }
      }
    };

    if (field.startBit === start && field.count === count) {
      return field;
    }

    const deltaBits = start - field.startBit;
    const rowDelta = deltaBits / cols;
    if (deltaBits > 0 && Number.isInteger(rowDelta) && rowDelta > 0 && rowDelta < rows && field.count > 0) {
      cctx.drawImage(field.canvas, 0, rowDelta * c, aw, (rows - rowDelta) * c, 0, 0, aw, (rows - rowDelta) * c);
      cctx.clearRect(0, (rows - rowDelta) * c, aw, rowDelta * c);
      field.startBit = start;
      field.count = count;
      drawRows(rows - rowDelta, rows);
      return field;
    }

    cctx.clearRect(0, 0, aw, rows * c);
    field.startBit = start;
    field.count = count;
    drawRows(0, rows);
    return field;
  }

  // field の先頭 count ビットだけを area 左上から見せる(行方向にクリップ)。
  function revealBitField(field, area, count, alpha) {
    const ctx = app.ctx;
    const cols = field.cols;
    const cell = field.cell;
    const shown = clamp(count, 0, field.count);
    if (shown <= 0) {
      return;
    }
    const fullRows = Math.floor(shown / cols);
    const partial = shown % cols;
    ctx.save();
    ctx.beginPath();
    ctx.rect(area.x, area.y, cols * cell, fullRows * cell + 0.6);
    if (partial > 0) {
      ctx.rect(area.x, area.y + fullRows * cell, partial * cell, cell + 0.6);
    }
    ctx.clip();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.drawImage(field.canvas, area.x, area.y);
    ctx.restore();
  }

  function revealBitWindow(field, area, count, scrollY, alpha) {
    const ctx = app.ctx;
    const cols = field.cols;
    const cell = field.cell;
    const shown = clamp(count, 0, field.count);
    if (shown <= 0) {
      return;
    }
    const offsetY = scrollY || 0;
    const fullRows = Math.floor(shown / cols);
    const partial = shown % cols;
    const canvasY = area.y - offsetY;
    ctx.save();
    ctx.beginPath();
    ctx.rect(area.x, area.y, area.w, area.h);
    ctx.clip();
    ctx.beginPath();
    ctx.rect(area.x, canvasY, cols * cell, fullRows * cell + 0.6);
    if (partial > 0) {
      ctx.rect(area.x, canvasY + fullRows * cell, partial * cell, cell + 0.6);
    }
    ctx.clip();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.drawImage(field.canvas, area.x, canvasY);
    ctx.restore();
  }

  // データエリアの枠(符号化・ビット列で共通)。
  function drawDataAreaFrame(area, color) {
    const ctx = app.ctx;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "rgba(6, 17, 23, 0.6)";
    roundedRect(ctx, area.x - 8, area.y - 8, area.w + 16, area.h + 16, 10);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    roundedRect(ctx, area.x - 8, area.y - 8, area.w + 16, area.h + 16, 10);
    ctx.stroke();
    ctx.restore();
  }

  // 符号化スライドで●の供給元になる左側チャンネル枠(stack)。slide4の各成分エリア。
  function encodeChannelRect(index) {
    const region = encodeChannelRegion();
    const n = channelCount();
    const gapY = Math.max(10, region.h * 0.03);
    const cellH = (region.h - gapY * (n - 1)) / n;
    const cell = {
      x: region.x,
      y: region.y + index * (cellH + gapY),
      w: region.w,
      h: cellH
    };
    return fitAspect(cell, getSourceAspect());
  }

  function bitCellCenter(field, area, bitIndex, scrollY) {
    if (!field || bitIndex < 0) {
      return null;
    }
    const start = field.startBit || 0;
    const local = bitIndex - start;
    if (local < 0 || local >= field.count) {
      return null;
    }
    const col = local % field.cols;
    const row = (local - col) / field.cols;
    const x = area.x + (col + 0.5) * field.cell;
    const y = area.y + (row + 0.5) * field.cell - (scrollY || 0);
    if (x < area.x || x > area.x + area.w || y < area.y || y > area.y + area.h) {
      return null;
    }
    return { x, y };
  }

  function drawBitConversion(bits, bitStart, origin, field, area, color, frac, scrollY) {
    const ctx = app.ctx;
    const text = String(bits);
    const fontSize = clamp(field.cell * 0.86, 10, 26);
    ctx.save();
    ctx.font = "900 " + fontSize + "px Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(2, fontSize * 0.18);
    ctx.strokeStyle = "rgba(4, 12, 16, 0.9)";

    for (let i = 0; i < text.length; i += 1) {
      const p = clamp((frac * (text.length + 0.65) - i) / 0.9, 0, 1);
      if (p <= 0) {
        continue;
      }
      const dst = bitCellCenter(field, area, bitStart + i, scrollY);
      if (!dst) {
        continue;
      }
      const e = easeOutCubic(p);
      const x = lerp(origin.x, dst.x, e);
      const y = lerp(origin.y, dst.y, e);
      const bit = text[i];
      ctx.globalAlpha = Math.min(1, 0.25 + p * 0.9);
      ctx.fillStyle = bit === "1" ? "#ffe08a" : "#7fe0ff";
      ctx.shadowColor = color;
      ctx.shadowBlur = 9 * (1 - e) + 4;
      ctx.strokeText(bit, x, y);
      ctx.fillText(bit, x, y);
    }
    ctx.restore();
  }

  function processedPixelsForChannel(erasedComps, channelIndex, channels, totalPixels) {
    if (erasedComps <= channelIndex) {
      return 0;
    }
    return clamp(Math.floor((erasedComps - 1 - channelIndex) / channels) + 1, 0, totalPixels);
  }

  function drawSourceRemovalMask(model, grid, erasedComps, channels, now) {
    if (erasedComps <= 0) {
      return;
    }
    const ctx = app.ctx;
    const maxComps = grid.count * channels;
    const countComps = clamp(erasedComps, 0, maxComps);
    for (let chIdx = 0; chIdx < channels; chIdx += 1) {
      const chArea = currentRect("ch" + chIdx) || encodeChannelRect(chIdx);
      if (!chArea) {
        continue;
      }
      const removed = processedPixelsForChannel(countComps, chIdx, channels, grid.count);
      if (removed <= 0) {
        continue;
      }
      const cellW = chArea.w / grid.cols;
      const cellH = chArea.h / grid.rows;
      const fullRows = Math.floor(removed / grid.cols);
      const partial = removed % grid.cols;

      ctx.save();
      ctx.beginPath();
      ctx.rect(chArea.x, chArea.y, chArea.w, chArea.h);
      ctx.clip();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(4, 12, 16, 0.98)";
      if (fullRows > 0) {
        ctx.fillRect(chArea.x, chArea.y, chArea.w, Math.min(chArea.h, fullRows * cellH));
      }
      if (partial > 0 && fullRows < grid.rows) {
        ctx.fillRect(chArea.x, chArea.y + fullRows * cellH, partial * cellW, cellH);
      }

      const frontierCol = partial > 0 ? partial - 1 : grid.cols - 1;
      const frontierRow = partial > 0 ? fullRows : fullRows - 1;
      if (frontierRow >= 0 && frontierRow < grid.rows) {
        const fx = chArea.x + (frontierCol + 0.5) * cellW;
        const fy = chArea.y + (frontierRow + 0.5) * cellH;
        const color = model.channels[chIdx] ? model.channels[chIdx].color : COLOR.code;
        ctx.globalAlpha = 0.45 + 0.25 * Math.sin(now * 0.014);
        ctx.strokeStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(fx, fy, Math.max(4, Math.min(cellW, cellH) * 0.42), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawEncodeSourceValues(model, grid, channels, alpha) {
    for (let chIdx = 0; chIdx < channels; chIdx += 1) {
      const chArea = currentRect("ch" + chIdx) || encodeChannelRect(chIdx);
      if (!chArea || !model.channels[chIdx]) {
        continue;
      }
      drawQuantizedValues(chArea, chIdx, model, grid, alpha);
    }
  }

  function drawAcceleratedPixelFlights(model, grid, channels, bitsPerComp, area, field, detailComps, shownTotal, erasedComps, scrollY) {
    const shownComps = Math.min(grid.count * channels, Math.ceil(shownTotal / bitsPerComp));
    const restComps = shownComps - detailComps;
    if (restComps <= 0) {
      return;
    }
    const restT = clamp((erasedComps - detailComps) / restComps, 0, 1);
    if (restT <= 0 || restT >= 1) {
      return;
    }

    const ctx = app.ctx;
    const windowSize = clamp(12 / restComps, 0.035, 0.12);
    const first = Math.max(detailComps, Math.floor(detailComps + Math.max(0, restT - windowSize) * restComps));
    const last = Math.min(shownComps - 1, Math.ceil(detailComps + Math.min(1, restT + 0.01) * restComps));
    const span = Math.max(1, last - first + 1);
    const stride = Math.max(1, Math.ceil(span / 18));

    for (let comp = first; comp <= last; comp += stride) {
      const startT = (comp - detailComps) / restComps;
      const p = clamp((restT - startT) / windowSize, 0, 1);
      if (p <= 0 || p >= 1) {
        continue;
      }
      const pixelIndex = Math.floor(comp / channels);
      if (pixelIndex >= grid.count) {
        continue;
      }
      const chIdx = comp % channels;
      const bitStart = comp * bitsPerComp;
      const target = bitCellCenter(field, area, bitStart, scrollY);
      if (!target) {
        continue;
      }
      const chArea = currentRect("ch" + chIdx) || encodeChannelRect(chIdx);
      const cen = dotCenter(grid, pixelIndex);
      const src = { x: chArea.x + cen.sx * chArea.w, y: chArea.y + cen.sy * chArea.h };
      const compColor = model.channels[chIdx] ? model.channels[chIdx].color : COLOR.code;
      const compRGB = channelDotRGB(model.mode, chIdx, dotDisplayLevel(model, pixelIndex, chIdx));
      const e = easeInOutCubic(p);
      const lift = Math.min(80, Math.max(24, Math.abs(target.x - src.x) * 0.09));
      const midX = (src.x + target.x) / 2;
      const midY = Math.min(src.y, target.y) - lift;
      const x = quadAt(src.x, midX, target.x, e);
      const y = quadAt(src.y, midY, target.y, e);
      const r = lerp(Math.max(3, Math.min(chArea.w / grid.cols, chArea.h / grid.rows) * 0.45), Math.max(7, Math.min(18, field.cell * 0.72)), Math.sin(Math.PI * p));
      const alpha = 0.25 + 0.75 * Math.sin(Math.PI * p);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = "rgb(" + compRGB.r + "," + compRGB.g + "," + compRGB.b + ")";
      ctx.shadowColor = compColor;
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = compColor;
      ctx.stroke();
      ctx.restore();
    }
  }

  /* ---------- スライド4/9: 符号化(0/1を読み順に並べる) ---------- */

  function drawEncodeOverlay(now) {
    const model = app.model;
    if (!model || !model.dots) {
      return;
    }
    const ctx = app.ctx;
    const elapsed = slideElapsed(now);
    const grid = model.dots;
    const cols = grid.cols;
    const channels = grid.channels;
    const bitsPerComp = grid.bitsPerComp;
    const area = codeAreaRect();
    const ladder = bitCellLadder(area);
    const maxVisible = ladder[ladder.length - 1].capacity;
    const realTotal = model.stats.totalBits;
    const shownTotal = realTotal;

    drawDataAreaFrame(area, COLOR.code);

    // --- 配置スケジュール ---
    // 最初の5画素は1成分ずつ丁寧に(●が対応ビット列の先頭へ移動 → 1/0へ展開)。
    // 6画素目以降は加速して一気に埋める。
    const detailPixels = Math.min(5, grid.count);
    const detailComps = detailPixels * channels;
    const moveMs = 380;
    const encMs = Math.max(340, bitsPerComp * 62);
    const compMs = moveMs + encMs;
    const detailDur = detailComps * compMs;
    const restDur = 7000;

    let placedBits;
    let active = null;
    if (elapsed < detailDur) {
      const comp = Math.floor(elapsed / compMs);
      const within = elapsed - comp * compMs;
      if (within < moveMs) {
        placedBits = comp * bitsPerComp;
        active = { comp, phase: "move", frac: within / moveMs, shownBits: 0 };
      } else {
        const u = clamp((within - moveMs) / encMs, 0, 1);
        const shownBits = Math.min(bitsPerComp, Math.round(u * bitsPerComp));
        placedBits = comp * bitsPerComp + shownBits;
        active = { comp, phase: "enc", frac: u, shownBits };
      }
    } else {
      const tb = clamp((elapsed - detailDur) / restDur, 0, 1);
      placedBits = Math.round(lerp(detailComps * bitsPerComp, shownTotal, tb * tb));
    }
    placedBits = clamp(placedBits, 0, shownTotal);

    // --- セルサイズ(置いた分が増えるほど縮む。左上基準) ---
    const step = pickBitStep(ladder, Math.min(placedBits, maxVisible));
    const visibleCapacity = step.capacity;
    const overflow = Math.max(0, placedBits - visibleCapacity);
    const scrollRows = Math.floor(overflow / step.cols);
    const scrollBits = scrollRows * step.cols;
    const scrollY = ((overflow - scrollBits) / step.cols) * step.cell;
    const windowPlaced = placedBits - scrollBits;
    const field = getBitWindowField(area, step.cell, scrollBits, "norm");
    if (!field) {
      return;
    }
    const cell = field.cell;
    const fcols = field.cols;

    // 置いた分だけ読み順に見せる
    ctx.save();
    ctx.beginPath();
    ctx.rect(area.x, area.y, area.w, area.h);
    ctx.clip();
    revealBitWindow(field, area, windowPlaced, scrollY, 0.98);
    ctx.restore();

    // 進行中フロンティアのセルを光らせる
    if (placedBits > 0 && placedBits < shownTotal) {
      const frontierLocal = clamp(placedBits - scrollBits, 0, field.count - 1);
      const fc = frontierLocal % fcols;
      const fr = Math.floor(frontierLocal / fcols);
      const fx = area.x + fc * cell;
      const fy = area.y + fr * cell - scrollY;
      if (fy + cell <= area.y + area.h) {
        ctx.save();
        ctx.globalAlpha = 0.5 + 0.35 * Math.sin(now * 0.012);
        ctx.strokeStyle = COLOR.code;
        ctx.shadowColor = COLOR.code;
        ctx.shadowBlur = 10;
        ctx.lineWidth = 2;
        roundedRect(ctx, fx + 1, fy + 1, cell - 2, cell - 2, 3);
        ctx.stroke();
        ctx.restore();
      }
    }

    const erasedComps = active ? active.comp + 1 : Math.ceil(placedBits / bitsPerComp);
    drawEncodeSourceValues(model, grid, channels, 0.9);
    drawSourceRemovalMask(model, grid, erasedComps, channels, now);
    if (!active && elapsed >= detailDur && placedBits < shownTotal) {
      drawAcceleratedPixelFlights(model, grid, channels, bitsPerComp, area, field, detailComps, shownTotal, erasedComps, scrollY);
    }

    // --- 詳細フェーズ: 最初の5画素をRGB順で丁寧に見せる ---
    let telopColor = COLOR.code;
    let telopText = "RGB順・ラスター順で どんどん 0/1 に";
    if (active && elapsed < detailDur) {
      const comp = active.comp;
      const pixelIndex = Math.floor(comp / channels);
      const chIdx = comp % channels;
      const compColor = model.channels[chIdx] ? model.channels[chIdx].color : COLOR.code;
      const cen = dotCenter(grid, pixelIndex);
      const value = dotValue(model, pixelIndex, chIdx);
      const fullBits = dotBits(model, pixelIndex, chIdx);
      const bitStart = comp * bitsPerComp;
      const target = bitCellCenter(field, area, bitStart, scrollY) || {
        x: area.x + 0.5 * cell,
        y: area.y + 0.5 * cell
      };
      const chArea = currentRect("ch" + chIdx) || encodeChannelRect(chIdx);
      const src = { x: chArea.x + cen.sx * chArea.w, y: chArea.y + cen.sy * chArea.h };
      const dotR = Math.min(chArea.w / cols, chArea.h / grid.rows) * 0.5;
      const compRGB = channelDotRGB(model.mode, chIdx, dotDisplayLevel(model, pixelIndex, chIdx));
      const sourceR = Math.max(7, dotR);
      const travelR = Math.max(22, Math.min(31, cell * 0.72));

      // 出発点の画素を強調
      ctx.save();
      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = "#ffffff";
      ctx.shadowColor = compColor;
      ctx.shadowBlur = 12;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(src.x, src.y, Math.max(7, dotR), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = active.phase === "move" ? 0.42 : 0.22;
      ctx.strokeStyle = compColor;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([7, 6]);
      ctx.lineDashOffset = -(now * 0.12);
      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(target.x, target.y);
      ctx.stroke();
      ctx.restore();

      if (active.phase === "move") {
        // 画素の●そのものが、対応するビット列の先頭位置へ飛ぶ。
        const e = easeInOutCubic(active.frac);
        const lift = Math.min(90, Math.max(32, Math.abs(target.x - src.x) * 0.12));
        const midX = (src.x + target.x) / 2;
        const midY = Math.min(src.y, target.y) - lift;
        const x = quadAt(src.x, midX, target.x, e);
        const y = quadAt(src.y, midY, target.y, e);
        const r = lerp(sourceR, travelR, clamp(e * 1.4, 0, 1));
        drawPixelDotWithValue(x, y, r, compRGB, compColor, value, 1);
      } else {
        // 到着した●が、その先頭位置から1/0の並びにほどける。
        const dotFade = 1 - clamp(active.frac / 0.72, 0, 1);
        const dotRNow = lerp(travelR, Math.max(5, cell * 0.35), clamp(active.frac / 0.72, 0, 1));
        drawPixelDotWithValue(target.x, target.y, dotRNow, compRGB, compColor, value, dotFade);
        drawBitConversion(fullBits, bitStart, target, field, area, compColor, active.frac, scrollY);
      }

      const label = channels > 1 ? (["R", "G", "B"][chIdx] || ("成分" + chIdx)) : (model.mode === "gray" ? "明るさ" : "白黒");
      const shownStr = active.phase === "enc" ? fullBits.slice(0, active.shownBits) : "";
      const caret = (Math.floor(now / 280) % 2 === 0) ? "▍" : " ";
      telopColor = compColor;
      telopText = "画素" + (pixelIndex + 1) + " の " + label + " = " + value + "  →  " + shownStr + (shownStr.length < fullBits.length ? caret : "");
    }

    drawText(telopText, area.x, area.y - 22, 19, telopColor, 900, "left", "Consolas, monospace");
    const pct = shownTotal ? Math.min(100, Math.round((placedBits / shownTotal) * 100)) : 100;
    drawText("符号化 " + pct + "%", area.x + area.w, area.y - 22, 17, "rgba(199,161,255,0.85)", 900, "right");
    drawChip(area.x + area.w / 2, area.y + area.h + 28, "1画素 = " + model.stats.pixelBits + " bit ／ 全 " + formatNumber(realTotal) + " bit", COLOR.code, 0);
  }

  /* ---------- スライド5/10: ビット列(0/1を広く表示し、bitを数える) ---------- */

  function drawBitsOverlay(now) {
    const model = app.model;
    if (!model || !model.dots) {
      return;
    }
    const ctx = app.ctx;
    const C = getContentRect();
    const elapsed = slideElapsed(now);

    // データエリアは符号化(slide4)と同じ枠・同じ見せ方。
    const area = codeAreaRect();
    const ladder = bitCellLadder(area);
    const maxVisible = ladder[ladder.length - 1].capacity;
    const realTotal = model.stats.totalBits;
    const shownTotal = Math.min(maxVisible, realTotal);
    const step = pickBitStep(ladder, shownTotal);
    const dim = getBitField(area, step.cell, "norm");
    const lit = getBitField(area, step.cell, "lit");

    drawDataAreaFrame(area, COLOR.quant);

    if (dim) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(area.x, area.y, area.w, area.h);
      ctx.clip();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(dim.canvas, area.x, area.y);
      ctx.restore();

      // bitを数える演出: 数え終えた分だけ色が変わる(1=金 / 0=水色)。
      if (app.bitCount && lit) {
        const t = clamp((now - app.bitCount.start) / app.bitCount.dur, 0, 1);
        if (t > 0) {
          const frac = easeOutCubic(t);
          const counted = Math.floor(frac * shownTotal);
          ctx.save();
          ctx.beginPath();
          ctx.rect(area.x, area.y, area.w, area.h);
          ctx.clip();
          revealBitField(lit, area, counted, 1);
          ctx.restore();
          // 数えているフロンティアの光る線
          if (t < 1 && counted > 0) {
            const fr = Math.floor(counted / dim.cols);
            const fy = area.y + (fr + 1) * dim.cell;
            ctx.save();
            ctx.globalAlpha = 0.85;
            ctx.fillStyle = "#ffe08a";
            ctx.shadowColor = "#ffe08a";
            ctx.shadowBlur = 14;
            ctx.fillRect(area.x, clamp(fy - 1.5, area.y, area.y + area.h - 3), area.w, 3);
            ctx.restore();
          }
        }
      }
    }
    drawChip(area.x + area.w / 2, area.y - 24, "ビット列(0と1のデータ)", COLOR.code, 0);

    // 「全部で◯◯bit」を読みやすいカードで下部中央に出す
    if (app.bitCount) {
      const t = clamp((now - app.bitCount.start) / app.bitCount.dur, 0, 1);
      if (t > 0) {
        const value = Math.round(realTotal * easeOutCubic(t));
        const cardW = Math.min(560, C.w * 0.6);
        const cardH = 96;
        const cardX = C.x + C.w / 2 - cardW / 2;
        const cardY = C.y + C.h - cardH - 6;
        ctx.save();
        ctx.globalAlpha = 0.92;
        ctx.fillStyle = "rgba(5, 14, 19, 0.9)";
        roundedRect(ctx, cardX, cardY, cardW, cardH, 12);
        ctx.fill();
        ctx.strokeStyle = COLOR.quant;
        ctx.lineWidth = 1.6;
        ctx.shadowColor = COLOR.quant;
        ctx.shadowBlur = 14;
        roundedRect(ctx, cardX, cardY, cardW, cardH, 12);
        ctx.stroke();
        ctx.restore();

        const cx = C.x + C.w / 2;
        drawText(t < 1 ? "bitを数えています…" : "この画像はぜんぶで", cx, cardY + 26, 20, COLOR.muted, 900, "center");
        drawText(formatNumber(value) + " bit", cx, cardY + 60, 40, COLOR.quant, 1000, "center");
        if (t >= 1) {
          const sinceDone = now - (app.bitCount.start + app.bitCount.dur);
          const p1 = easeOutBack(clamp(sinceDone / 420, 0, 1));
          const p2 = easeOutBack(clamp((sinceDone - 260) / 420, 0, 1));
          if (p1 > 0) {
            drawChip(cardX + cardW * 0.28, cardY + cardH + 24, "= " + formatNumber(Math.round(model.stats.totalBytes)) + " byte", COLOR.sample, 200 * Math.min(1, p1));
          }
          if (p2 > 0) {
            drawChip(cardX + cardW * 0.72, cardY + cardH + 24, "= " + formatKB(model.stats), COLOR.line, 200 * Math.min(1, p2));
          }
        }
      }
    }
  }

  function drawReconOverlay(now) {
    const model = app.model;
    if (!model) {
      return;
    }
    const left = cardBase(app.actors.photo, now);
    const right = cardBase(app.actors.recon, now);
    const snapshot = app.compareSnapshot;
    if (left) {
      drawQualityFooter(left, "前回の設定", snapshot ? snapshot.stats : model.stats, COLOR.line);
    }
    if (right) {
      drawQualityFooter(right, "現在のプレビュー", model.stats, COLOR.sample);
    }
  }

  function drawQualityFooter(rect, title, stats, color) {
    if (!stats) {
      return;
    }
    const ctx = app.ctx;
    const h = clamp(rect.h * 0.24, 58, 82);
    const y = rect.y + rect.h - h;
    const pad = 12;
    const maxW = Math.max(20, rect.w - pad * 2);
    const setting = stats.width + "×" + stats.height + " / " + (MODE_LABELS[stats.mode] || stats.mode) + " / " + stats.levels + "階調";
    const size = formatNumber(stats.totalBits) + " bit / " + formatNumber(Math.round(stats.totalBytes)) + " byte / " + formatKB(stats);

    ctx.save();
    ctx.globalAlpha = clamp(rect.alpha, 0, 1) * 0.96;
    ctx.fillStyle = "rgba(4, 12, 16, 0.86)";
    roundedRect(ctx, rect.x, y, rect.w, h, 6);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.globalAlpha = clamp(rect.alpha, 0, 1) * 0.72;
    ctx.lineWidth = 1.2;
    roundedRect(ctx, rect.x, y, rect.w, h, 6);
    ctx.stroke();
    ctx.restore();

    drawFittedText(title, rect.x + pad, y + 15, maxW, 13, color, 900, "left");
    drawFittedText(setting, rect.x + pad, y + h * 0.53, maxW, 15, "#f1fbff", 900, "left");
    drawFittedText(size, rect.x + pad, y + h - 15, maxW, 13, "rgba(168, 192, 199, 0.96)", 800, "left");
  }

  function drawFittedText(text, x, y, maxW, size, color, weight, align, family) {
    const ctx = app.ctx;
    let fs = size;
    const fontFamily = family || "'Yu Gothic', sans-serif";
    ctx.save();
    ctx.fillStyle = color;
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    while (fs > 9) {
      ctx.font = (weight || 900) + " " + fs + "px " + fontFamily;
      if (ctx.measureText(text).width <= maxW) {
        break;
      }
      fs -= 1;
    }
    ctx.fillText(text, x, y, maxW);
    ctx.restore();
  }

  /* ---------- DOM UI ---------- */

  function updateUI() {
    const slideInfo = SLIDES[app.slide];
    dom.slideTitle.textContent = app.started ? slideInfo.title : "準備中";
    dom.slideBadge.textContent = "SLIDE " + app.slide + " / " + SLIDE_MAX;

    let sourceText = "入力: 待機";
    if (app.cameraState === "starting") {
      sourceText = "入力: カメラ起動中";
    } else if (app.sourceReady) {
      sourceText = "入力: " + app.sourceName;
    }
    dom.sourceBadge.textContent = sourceText;
    dom.resolutionBadge.textContent = app.params.width + " × " + app.params.height;

    const model = app.model;
    // データ量はビット列スライドで見せる。調整スライド(6)では出さない。
    const dataVisible = app.slide >= 5 && app.slide !== 6 && !!model;
    dom.dataBadge.hidden = !dataVisible;
    if (dataVisible && !app.dataAnim) {
      dom.dataBadge.textContent = formatNumber(model.stats.totalBits) + " bit";
    }

    dom.cameraPanel.hidden = !(app.started && app.slide === 1);
    dom.adjustPanel.hidden = !(app.started && app.slide === 6);
    dom.infoPanel.hidden = !(app.started && (app.slide === 5 || app.slide === 10) && model);

    dom.widthRange.value = String(app.params.width);
    dom.heightRange.value = String(app.params.height);
    dom.widthOutput.textContent = String(app.params.width);
    dom.heightOutput.textContent = String(app.params.height);
    const levelIndex = LEVEL_VALUES.indexOf(app.params.mode === "bw" ? 2 : app.params.levels);
    dom.levelRange.value = String(levelIndex >= 0 ? levelIndex + 1 : LEVEL_VALUES.length);
    dom.levelRange.disabled = app.params.mode === "bw";
    dom.levelOutput.textContent = String(app.params.mode === "bw" ? 2 : app.params.levels);
    dom.modeButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.mode === app.params.mode);
    });

    if (!dom.infoPanel.hidden && model) {
      updateInfoStats(model);
    }
    updateLegend();
  }

  function updateDataBadge(now) {
    if (!app.dataAnim || dom.dataBadge.hidden) {
      return;
    }
    const t = clamp((now - app.dataAnim.start) / app.dataAnim.dur, 0, 1);
    const value = Math.round(lerp(app.dataAnim.from, app.dataAnim.to, easeOutCubic(t)));
    dom.dataBadge.textContent = formatNumber(value) + " bit";
    if (t >= 1) {
      app.dataAnim = null;
    }
  }

  function updateInfoStats(model) {
    const stats = model.stats;
    const rows = [
      ["画素数", model.width + " × " + model.height],
      ["合計画素", formatNumber(stats.totalPixels)],
      ["モード", MODE_LABELS[model.mode]],
      ["階調", String(stats.levels)],
      ["1画素", stats.pixelBits + " bit"],
      ["合計", formatNumber(stats.totalBits) + " bit"],
      ["byte", formatNumber(Math.round(stats.totalBytes)) + " byte"],
      ["kB", stats.kb >= 100 ? formatNumber(Math.round(stats.kb)) + " kB" : stats.kb.toFixed(1) + " kB"]
    ];
    if (stats.mb >= 1) {
      rows.push(["MB", stats.mb.toFixed(2) + " MB"]);
    }
    dom.infoStats.innerHTML = rows
      .map(([k, v]) => "<dt>" + k + "</dt><dd>" + v + "</dd>")
      .join("");
  }

  function updateLegend() {
    const stage = SLIDES[app.slide].stage;
    const activeIndex = stage === "done" ? STAGE_ORDER.length : STAGE_ORDER.indexOf(stage);
    dom.legendItems.forEach((item) => {
      const itemIndex = STAGE_ORDER.indexOf(item.dataset.stage);
      item.classList.toggle("is-active", app.started && item.dataset.stage === stage);
      item.classList.toggle("is-complete", app.started && itemIndex >= 0 && itemIndex < activeIndex);
    });
  }

  function showNotice(message, duration) {
    clearTimeout(app.noticeTimer);
    if (!message) {
      dom.notice.hidden = true;
      return;
    }
    dom.notice.textContent = message;
    dom.notice.hidden = false;
    app.noticeTimer = setTimeout(() => {
      dom.notice.hidden = true;
    }, duration || 3200);
  }

  function showSplash(text) {
    clearTimeout(app.splashTimer);
    dom.splash.textContent = text;
    dom.splash.hidden = false;
    dom.splash.classList.remove("is-visible");
    void dom.splash.offsetWidth;
    dom.splash.classList.add("is-visible");
    app.splashTimer = setTimeout(() => {
      dom.splash.hidden = true;
      dom.splash.classList.remove("is-visible");
    }, 900);
  }

  function pulseCameraFlash() {
    dom.flash.classList.remove("is-active");
    void dom.flash.offsetWidth;
    dom.flash.classList.add("is-active");
  }

  function pulseFrame() {
    dom.frameFlash.classList.remove("is-active");
    void dom.frameFlash.offsetWidth;
    dom.frameFlash.classList.add("is-active");
  }

  /* ---------- 汎用描画ヘルパー ---------- */

  function drawText(text, x, y, size, color, weight, align, family) {
    const ctx = app.ctx;
    ctx.save();
    ctx.fillStyle = color;
    ctx.font = (weight || 900) + " " + size + "px " + (family || "'Yu Gothic', sans-serif");
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function drawChip(cx, cy, text, color, minW) {
    const ctx = app.ctx;
    ctx.save();
    ctx.font = "900 16px 'Yu Gothic', sans-serif";
    const w = Math.max(minW || 0, ctx.measureText(text).width + 26);
    const h = 30;
    ctx.globalAlpha = 0.94;
    ctx.fillStyle = "rgba(5, 14, 19, 0.9)";
    roundedRect(ctx, cx - w / 2, cy - h / 2, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = color;
    ctx.shadowBlur = 9;
    roundedRect(ctx, cx - w / 2, cy - h / 2, w, h, 8);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, cx, cy + 1);
    ctx.restore();
  }

  function formatNumber(value) {
    return Math.round(value).toLocaleString("ja-JP");
  }

  function formatKB(stats) {
    if (stats.mb >= 1) {
      return stats.mb.toFixed(2) + " MB";
    }
    return (stats.kb >= 100 ? Math.round(stats.kb).toLocaleString("ja-JP") : stats.kb.toFixed(1)) + " kB";
  }

  function roundedRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function easeOutBack(t) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  function seededNoise(seed) {
    const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  /* 動作検証・授業前チェック用の簡易フック */
  window.ImageAd = {
    goToSlide,
    start: startExperience,
    state: () => ({ slide: app.slide, started: app.started, source: app.sourceName }),
    // 指定スライドを「経過 elapsedMs 時点」で1フレームだけ即描画する。
    // rAFに依存しないため、授業前の表示チェックやスクリーンショットに使える。
    renderFrame: (slide, elapsedMs) => {
      if (!app.started) {
        startExperience();
      }
      goToSlide(slide);
      const t = performance.now();
      const e = Math.max(0, elapsedMs || 0);
      const shift = app.slideStartedAt - (t - e);
      app.slideStartedAt = t - e;
      // スライド入場時刻に紐づくタイマー(bitカウント)も同じだけずらして、
      // 経過ms時点の演出を正しく描く。
      if (app.bitCount) {
        app.bitCount.start -= shift;
      }
      ACTOR_IDS.forEach((id) => {
        const actor = app.actors[id];
        if (actor.to) {
          actor.start = t - e - ACTOR_TWEEN_MS;
        }
      });
      tickActors(t);
      draw(t);
    }
  };
})();
