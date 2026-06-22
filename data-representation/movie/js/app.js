(() => {
  "use strict";

  const RAW_FPS = 30;
  const DURATION_SECONDS = 2;
  const RAW_FRAME_COUNT = RAW_FPS * DURATION_SECONDS;
  const RAW_INTERVAL_MS = 1000 / RAW_FPS;
  const DEFAULT_FPS = 5;
  const DEFAULT_WIDTH = 20;
  const DEFAULT_HEIGHT = 15;
  const DEFAULT_LEVELS = 256;
  const MAX_SOURCE_SIDE = 720;
  const LEVEL_VALUES = [2, 4, 8, 16, 32, 64, 128, 256];
  const BIT_CELLS = [24, 20, 16, 13, 11, 9, 8, 7, 6, 5];
  const DIFF_THRESHOLD = 30;

  const STEPS = [
    { title: "Webカメラ起動", splash: "カメラ起動", stage: "camera" },
    { title: "動画はフレームの連続", splash: "フレーム", stage: "frames" },
    { title: "1フレームの標本化", splash: "標本化", stage: "encoding" },
    { title: "1フレームの量子化", splash: "量子化", stage: "encoding" },
    { title: "1フレームの符号化", splash: "符号化", stage: "encoding" },
    { title: "1フレームのファイルサイズ", splash: "ファイルサイズ", stage: "encoding" },
    { title: "1フレームが0と1になる", splash: "0と1", stage: "encoding" },
    { title: "残りのフレームが0と1になる", splash: "残りのフレーム", stage: "encoding" },
    { title: "動画全体のファイルサイズ", splash: "合計サイズ", stage: "encoding" },
    { title: "フレームレート・解像度・階調", splash: "調整", stage: "frames" },
    { title: "差分フレームを作る", splash: "差分", stage: "compression" },
    { title: "差分から次のフレームを作る", splash: "差分反映", stage: "compression" },
    { title: "差分フレームの量子化", splash: "量子化", stage: "compression" },
    { title: "差分フレームの符号化", splash: "符号化", stage: "compression" },
    { title: "差分フレームのファイルサイズ", splash: "ファイルサイズ", stage: "compression" },
    { title: "差分フレームが0と1になる", splash: "0と1", stage: "compression" },
    { title: "圧縮した全フレームが0と1になる", splash: "圧縮", stage: "compression" },
    { title: "圧縮後の合計サイズ", splash: "合計サイズ", stage: "compression" },
    { title: "もう一度調整", splash: "調整", stage: "compression" }
  ];

  const STAGE_ORDER = ["camera", "frames", "encoding", "compression"];

  const COLOR = {
    line: "#38dff0",
    sample: "#ffd166",
    quant: "#75f09a",
    code: "#c7a1ff",
    alert: "#ff5c78",
    text: "#f1fbff",
    muted: "#a8c0c7",
    panel: "rgba(5, 14, 19, 0.88)"
  };

  const app = {
    canvas: null,
    ctx: null,
    dpr: 1,
    width: 1,
    height: 1,
    started: false,
    step: 0,
    prevStep: 0,
    stepStartedAt: 0,
    now: 0,
    cameraStream: null,
    cameraState: "idle",
    sourceMode: "waiting",
    rawFrames: [],
    sourceVersion: 0,
    model: null,
    modelKey: "",
    capturing: false,
    captureStartedAt: 0,
    captureIndex: 0,
    captureNotice: "",
    previewCanvas: null,
    tempCanvas: null,
    noticeTimer: 0,
    splashTimer: 0,
    lastRoute: "normal",
    focusFrameIndex: 0,
    focusDiffIndex: 0,
    adjustBaseline: null,
    previousAdjustBaseline: null,
    adjustBaselineCompressed: false,
    previousAdjustBaselineCompressed: false,
    compressEnabled: false,
    params: {
      fps: DEFAULT_FPS,
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
      levels: DEFAULT_LEVELS
    }
  };

  const dom = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    app.canvas = document.getElementById("stage");
    app.ctx = app.canvas.getContext("2d", { alpha: false });
    app.previewCanvas = document.createElement("canvas");
    app.tempCanvas = document.createElement("canvas");

    Object.assign(dom, {
      startOverlay: document.getElementById("startOverlay"),
      startButton: document.getElementById("startButton"),
      slideTitle: document.getElementById("slideTitle"),
      slideBadge: document.getElementById("slideBadge"),
      sourceBadge: document.getElementById("sourceBadge"),
      fpsBadge: document.getElementById("fpsBadge"),
      resolutionBadge: document.getElementById("resolutionBadge"),
      dataBadge: document.getElementById("dataBadge"),
      infoPanel: document.getElementById("infoPanel"),
      infoStats: document.getElementById("infoStats"),
      cameraPanel: document.getElementById("cameraPanel"),
      captureButton: document.getElementById("captureButton"),
      adjustPanel: document.getElementById("adjustPanel"),
      fpsRange: document.getElementById("fpsRange"),
      fpsOutput: document.getElementById("fpsOutput"),
      widthRange: document.getElementById("widthRange"),
      widthOutput: document.getElementById("widthOutput"),
      heightRange: document.getElementById("heightRange"),
      heightOutput: document.getElementById("heightOutput"),
      levelRange: document.getElementById("levelRange"),
      levelOutput: document.getElementById("levelOutput"),
      compressButton: document.getElementById("compressButton"),
      notice: document.getElementById("notice"),
      splash: document.getElementById("stepSplash"),
      flash: document.getElementById("flash"),
      frameFlash: document.getElementById("frameFlash"),
      legendItems: Array.from(document.querySelectorAll(".legend-item")),
      video: document.getElementById("cameraVideo")
    });

    dom.startButton.addEventListener("click", startExperience);
    dom.captureButton.addEventListener("click", startCapture);
    dom.compressButton.addEventListener("click", () => {
      app.compressEnabled = !app.compressEnabled;
      updateUI();
    });
    dom.fpsRange.addEventListener("input", () => setFps(Number(dom.fpsRange.value)));
    dom.widthRange.addEventListener("input", () => setResolution(Number(dom.widthRange.value), app.params.height));
    dom.heightRange.addEventListener("input", () => setResolution(app.params.width, Number(dom.heightRange.value)));
    dom.levelRange.addEventListener("input", () => setLevels(LEVEL_VALUES[Number(dom.levelRange.value) - 1]));
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", resizeCanvas);

    resizeCanvas();
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
    dom.startOverlay.classList.add("is-hidden");
    updateUI();

    await startCamera();
    await requestFullscreenSafely();
    pulseFrame();
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
      app.sourceMode = "sample";
      showNotice("");
      updateUI();
      return;
    }

    app.cameraState = "starting";
    app.sourceMode = "waiting";
    updateUI();

    try {
      app.cameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: RAW_FPS }
        },
        audio: false
      });
      dom.video.srcObject = app.cameraStream;
      await dom.video.play();
      app.cameraState = "ready";
      app.sourceMode = "camera";
      showNotice("");
    } catch (error) {
      app.cameraState = "unavailable";
      app.sourceMode = "sample";
      showNotice("");
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
      resetToCamera();
      return;
    }

    if (event.key === "r" || event.key === "R") {
      event.preventDefault();
      resetToCamera();
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
    if (app.capturing) {
      return;
    }

    if (app.step === 0) {
      startCapture();
      return;
    }

    if (app.step === 1) {
      const model = ensureModel();
      app.focusFrameIndex = getFrameSequenceActiveIndex(model, performance.now());
      enterStep(2);
      return;
    }

    if (app.step === 8) {
      app.lastRoute = "normal";
      enterStep(9);
      return;
    }

    if (app.step === 9) {
      if (app.compressEnabled) {
        app.lastRoute = "compressed";
        enterStep(10);
      } else {
        app.lastRoute = "normal";
        enterStep(1);
      }
      return;
    }

    if (app.step === 11) {
      const model = ensureModel();
      app.focusDiffIndex = getDiffReconstructionActiveIndex(model, performance.now());
      enterStep(12);
      return;
    }

    if (app.step === 17) {
      app.lastRoute = "compressed";
      enterStep(18);
      return;
    }

    if (app.step === 18) {
      if (app.compressEnabled) {
        enterStep(10);
      } else {
        enterStep(1);
      }
      return;
    }

    enterStep(Math.min(STEPS.length - 1, app.step + 1));
  }

  function goBack() {
    if (!app.started || app.capturing) {
      return;
    }
    if (app.step <= 0) {
      resetToCamera();
      return;
    }
    enterStep(app.step - 1);
  }

  function resetToCamera() {
    if (!app.started) {
      startExperience();
      return;
    }
    app.capturing = false;
    app.step = 0;
    app.prevStep = 0;
    app.stepStartedAt = performance.now();
    app.lastRoute = "normal";
    app.focusFrameIndex = 0;
    app.focusDiffIndex = 0;
    app.adjustBaseline = null;
    app.previousAdjustBaseline = null;
    app.adjustBaselineCompressed = false;
    app.previousAdjustBaselineCompressed = false;
    app.compressEnabled = false;
    startCamera();
    showSplash("撮り直し");
    pulseFrame();
    updateUI();
  }

  function enterStep(step, options = {}) {
    const next = clamp(Math.round(step), 0, STEPS.length - 1);
    if (next >= 1) {
      ensureModel();
    }
    if (next === 9 || next === 18) {
      app.previousAdjustBaseline = app.adjustBaseline;
      app.previousAdjustBaselineCompressed = app.adjustBaselineCompressed;
      app.adjustBaseline = app.model || ensureModel();
      app.adjustBaselineCompressed = (app.step >= 10 && app.step <= 17) || next === 18;
    }
    app.prevStep = app.step;
    app.step = next;
    app.stepStartedAt = performance.now();
    const skipSplash = next === 6 || next === 7;
    if (!options.noSplash && app.started && !skipSplash) {
      showSplash(STEPS[next].splash);
    }
    pulseFrame();
    updateUI();
  }

  function startCapture() {
    if (app.capturing) {
      return;
    }
    app.rawFrames = [];
    app.model = null;
    app.modelKey = "";
    app.adjustBaseline = null;
    app.previousAdjustBaseline = null;
    app.adjustBaselineCompressed = false;
    app.previousAdjustBaselineCompressed = false;
    app.compressEnabled = false;
    app.focusFrameIndex = 0;
    app.focusDiffIndex = 0;
    app.capturing = true;
    app.captureStartedAt = performance.now();
    app.captureIndex = 0;
    app.captureNotice = app.cameraState === "ready" ? "Webカメラから撮影中" : "サンプル動画を撮影中";
    app.sourceMode = app.cameraState === "ready" ? "camera" : "sample";
    showNotice("");
    updateUI();
  }

  function updateCapture(now) {
    if (!app.capturing) {
      return;
    }

    const elapsed = now - app.captureStartedAt;
    const targetIndex = Math.min(RAW_FRAME_COUNT - 1, Math.floor(elapsed / RAW_INTERVAL_MS));
    while (app.captureIndex <= targetIndex && app.captureIndex < RAW_FRAME_COUNT) {
      app.rawFrames.push(captureSourceFrame(app.captureIndex));
      app.captureIndex += 1;
    }

    if (elapsed >= DURATION_SECONDS * 1000 || app.captureIndex >= RAW_FRAME_COUNT) {
      while (app.captureIndex < RAW_FRAME_COUNT) {
        app.rawFrames.push(captureSourceFrame(app.captureIndex));
        app.captureIndex += 1;
      }
      app.capturing = false;
      app.sourceVersion += 1;
      invalidateModel();
      ensureModel();
      pulseCameraFlash();
      enterStep(1);
    }
  }

  function captureSourceFrame(index) {
    const canvas = document.createElement("canvas");
    const video = dom.video;
    if (app.cameraState === "ready" && video.videoWidth && video.videoHeight) {
      const size = fitSourceSize(video.videoWidth, video.videoHeight);
      canvas.width = size.width;
      canvas.height = size.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      stampCaptureFrame(ctx, canvas.width, canvas.height, index);
      return canvas;
    }

    canvas.width = 640;
    canvas.height = 360;
    drawSampleScene(canvas.getContext("2d"), canvas.width, canvas.height, index / RAW_FPS);
    return canvas;
  }

  function stampCaptureFrame(ctx, w, h, index) {
    ctx.save();
    ctx.globalAlpha = 0.42;
    ctx.fillStyle = "rgba(5, 16, 22, 0.45)";
    ctx.fillRect(0, h - 34, 130, 34);
    ctx.fillStyle = "#f1fbff";
    ctx.font = "900 18px Consolas, monospace";
    ctx.textAlign = "left";
    ctx.fillText("F" + String(index + 1).padStart(2, "0"), 12, h - 12);
    ctx.restore();
  }

  function generateSampleVideo() {
    app.rawFrames = [];
    for (let i = 0; i < RAW_FRAME_COUNT; i += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 360;
      drawSampleScene(canvas.getContext("2d"), canvas.width, canvas.height, i / RAW_FPS);
      app.rawFrames.push(canvas);
    }
    app.sourceMode = "sample";
    app.sourceVersion += 1;
    invalidateModel();
    ensureModel();
    showNotice("");
    updateUI();
  }

  function fitSourceSize(width, height) {
    const ratio = Math.min(1, MAX_SOURCE_SIDE / Math.max(width, height));
    return {
      width: Math.max(1, Math.round(width * ratio)),
      height: Math.max(1, Math.round(height * ratio))
    };
  }

  function invalidateModel() {
    app.model = null;
    app.modelKey = "";
  }

  function ensureRawFrames() {
    if (app.rawFrames.length === 0) {
      generateSampleVideo();
    }
  }

  function ensureModel() {
    ensureRawFrames();
    const key = [
      app.sourceVersion,
      app.params.fps,
      app.params.width,
      app.params.height,
      app.params.levels,
      app.rawFrames.length
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
    const levels = app.params.levels;
    const bitsPerComp = Math.round(Math.log2(levels));
    const pixelBits = bitsPerComp * 3;
    const frameBits = w * h * pixelBits;
    const frameBytes = Math.ceil(frameBits / 8);
    const displayCount = clamp(Math.round(app.params.fps * DURATION_SECONDS), 1, RAW_FRAME_COUNT);
    const frames = [];

    for (let i = 0; i < displayCount; i += 1) {
      const rawIndex = displayCount === 1
        ? 0
        : Math.round((i / Math.max(1, displayCount - 1)) * (app.rawFrames.length - 1));
      frames.push(buildFrame(app.rawFrames[rawIndex], rawIndex, i, w, h, levels));
    }

    const diffFrames = [];
    for (let i = 1; i < frames.length; i += 1) {
      diffFrames.push(buildDiffFrame(frames[i - 1], frames[i], i - 1, pixelBits));
    }

    const totalBytes = frameBytes * frames.length;
    const compressedBytes = frameBytes + diffFrames.reduce((sum, diff) => sum + diff.bytes, 0);
    const totalBits = frameBits * frames.length;
    const compressedBits = frameBits + diffFrames.reduce((sum, diff) => sum + diff.bits, 0);

    return {
      width: w,
      height: h,
      levels,
      bitsPerComp,
      pixelBits,
      frameBits,
      frameBytes,
      totalBits,
      totalBytes,
      compressedBits,
      compressedBytes,
      frames,
      diffFrames,
      fps: app.params.fps,
      rawFrameCount: app.rawFrames.length,
      seconds: DURATION_SECONDS,
      savedBytes: Math.max(0, totalBytes - compressedBytes),
      compressionRatio: totalBytes > 0 ? compressedBytes / totalBytes : 1
    };
  }

  function buildFrame(sourceCanvas, rawIndex, displayIndex, w, h, levels) {
    const sampleCanvas = document.createElement("canvas");
    sampleCanvas.width = w;
    sampleCanvas.height = h;
    const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });
    sampleCtx.imageSmoothingEnabled = true;
    sampleCtx.drawImage(sourceCanvas, 0, 0, w, h);
    const originalImage = sampleCtx.getImageData(0, 0, w, h);
    const original = originalImage.data;
    const quantized = new Uint8ClampedArray(original.length);
    const levelIndices = new Uint16Array(w * h * 3);

    for (let p = 0; p < w * h; p += 1) {
      const si = p * 4;
      const li = p * 3;
      const qr = quantizeChannel(original[si], levels);
      const qg = quantizeChannel(original[si + 1], levels);
      const qb = quantizeChannel(original[si + 2], levels);
      quantized[si] = qr.value;
      quantized[si + 1] = qg.value;
      quantized[si + 2] = qb.value;
      quantized[si + 3] = 255;
      levelIndices[li] = qr.index;
      levelIndices[li + 1] = qg.index;
      levelIndices[li + 2] = qb.index;
    }

    const quantCanvas = document.createElement("canvas");
    quantCanvas.width = w;
    quantCanvas.height = h;
    quantCanvas.getContext("2d").putImageData(new ImageData(quantized, w, h), 0, 0);

    return {
      sourceCanvas,
      rawIndex,
      displayIndex,
      sampleCanvas,
      quantCanvas,
      original,
      quantized,
      levelIndices,
      width: w,
      height: h
    };
  }

  function buildDiffFrame(prev, current, index, pixelBits) {
    const w = current.width;
    const h = current.height;
    const mask = new Uint8Array(w * h);
    const changedIndices = [];
    const data = new Uint8ClampedArray(w * h * 4);
    const levelIndices = new Uint16Array(w * h * 3);

    for (let p = 0; p < w * h; p += 1) {
      const si = p * 4;
      const li = p * 3;
      const dr = Math.abs(current.quantized[si] - prev.quantized[si]);
      const dg = Math.abs(current.quantized[si + 1] - prev.quantized[si + 1]);
      const db = Math.abs(current.quantized[si + 2] - prev.quantized[si + 2]);
      const changed = dr + dg + db > DIFF_THRESHOLD;
      if (changed) {
        mask[p] = 1;
        changedIndices.push(p);
        data[si] = current.quantized[si];
        data[si + 1] = current.quantized[si + 1];
        data[si + 2] = current.quantized[si + 2];
        data[si + 3] = 255;
        levelIndices[li] = current.levelIndices[li];
        levelIndices[li + 1] = current.levelIndices[li + 1];
        levelIndices[li + 2] = current.levelIndices[li + 2];
      } else {
        data[si] = 0;
        data[si + 1] = 0;
        data[si + 2] = 0;
        data[si + 3] = 0;
      }
    }

    const diffCanvas = document.createElement("canvas");
    diffCanvas.width = w;
    diffCanvas.height = h;
    diffCanvas.getContext("2d").putImageData(new ImageData(data, w, h), 0, 0);

    const bits = changedIndices.length * pixelBits;
    return {
      index,
      from: prev,
      to: current,
      width: w,
      height: h,
      mask,
      changedIndices,
      changedCount: changedIndices.length,
      data,
      levelIndices,
      diffCanvas,
      bits,
      bytes: Math.ceil(bits / 8)
    };
  }

  function quantizeChannel(value, levels) {
    const maxIndex = levels - 1;
    const index = clamp(Math.round((value / 255) * maxIndex), 0, maxIndex);
    return {
      index,
      value: maxIndex <= 0 ? 0 : Math.round((index / maxIndex) * 255)
    };
  }

  function setFps(value) {
    app.params.fps = clamp(Math.round(value), 1, RAW_FPS);
    dom.fpsRange.value = String(app.params.fps);
    invalidateModel();
    ensureModel();
    updateUI();
  }

  function setResolution(width, height) {
    app.params.width = clamp(Math.round(width / 5) * 5, 10, 160);
    app.params.height = clamp(Math.round(height / 5) * 5, 10, 120);
    dom.widthRange.value = String(app.params.width);
    dom.heightRange.value = String(app.params.height);
    invalidateModel();
    ensureModel();
    updateUI();
  }

  function setLevels(levels) {
    app.params.levels = LEVEL_VALUES.includes(levels) ? levels : DEFAULT_LEVELS;
    invalidateModel();
    ensureModel();
    updateUI();
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
    app.now = now;
    updateCapture(now);
    draw(now);
    requestAnimationFrame(frame);
  }

  function draw(now) {
    const ctx = app.ctx;
    ctx.clearRect(0, 0, app.width, app.height);
    drawBackground(now);

    if (!app.started) {
      drawStartPreview(now);
      return;
    }

    if (app.capturing) {
      drawCaptureProgress(now);
      return;
    }

    switch (app.step) {
      case 0:
        drawLiveCamera(now);
        break;
      case 1:
        drawFrameExtraction(now);
        break;
      case 2:
        drawImageProcess(now, "sample", false);
        break;
      case 3:
        drawImageProcess(now, "quant", false);
        break;
      case 4:
        drawImageProcess(now, "encode", false);
        break;
      case 5:
        drawImageProcess(now, "size", false);
        break;
      case 6:
        drawShatterSingle(now, false);
        break;
      case 7:
        drawShatterAll(now, false);
        break;
      case 8:
        drawTotalGather(now, false);
        break;
      case 9:
        drawAdjustScreen(now, false);
        break;
      case 10:
        drawDiffPairs(now);
        break;
      case 11:
        drawDiffReconstruction(now);
        break;
      case 12:
        drawImageProcess(now, "quant", true);
        break;
      case 13:
        drawImageProcess(now, "encode", true);
        break;
      case 14:
        drawImageProcess(now, "size", true);
        break;
      case 15:
        drawShatterSingle(now, true);
        break;
      case 16:
        drawShatterAll(now, true);
        break;
      case 17:
        drawTotalGather(now, true);
        break;
      case 18:
        drawAdjustScreen(now, true);
        break;
      default:
        drawLiveCamera(now);
        break;
    }
  }

  function drawBackground(now) {
    const ctx = app.ctx;
    const g = ctx.createLinearGradient(0, 0, app.width, app.height);
    g.addColorStop(0, "#061014");
    g.addColorStop(0.55, "#091922");
    g.addColorStop(1, "#080916");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, app.width, app.height);

    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = "#38dff0";
    ctx.lineWidth = 1;
    const grid = 42;
    const ox = (now * 0.012) % grid;
    const oy = (now * 0.008) % grid;
    for (let x = -grid + ox; x < app.width + grid; x += grid) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, app.height);
      ctx.stroke();
    }
    for (let y = -grid + oy; y < app.height + grid; y += grid) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(app.width, y);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    for (let i = 0; i < 70; i += 1) {
      const x = (seededNoise(i * 19) * app.width + Math.sin(now * 0.0004 + i) * 22 + app.width) % app.width;
      const y = (seededNoise(i * 47) * app.height + Math.cos(now * 0.0003 + i * 0.7) * 18 + app.height) % app.height;
      const r = 1.2 + seededNoise(i * 13) * 2.2;
      ctx.globalAlpha = 0.12 + 0.25 * seededNoise(i * 29);
      ctx.fillStyle = i % 3 === 0 ? COLOR.line : i % 3 === 1 ? COLOR.sample : COLOR.code;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawStartPreview(now) {
    const C = getContentRect();
    const rect = fitRect(640, 360, C.x + C.w * 0.16, C.y + C.h * 0.18, C.w * 0.68, C.h * 0.58);
    drawSampleToPreview(now);
    drawFrameCard(rect, app.previewCanvas, "サンプルプレビュー", COLOR.line, 0.68);
    drawBinaryMist(now, 0.16);
  }

  function drawLiveCamera(now) {
    const C = getContentRect();
    const rect = fitRect(16, 9, C.x + C.w * 0.1, C.y + 18, C.w * 0.8, C.h - 50);
    const ctx = app.ctx;

    if (app.cameraState === "ready" && dom.video.videoWidth) {
      drawVideoElementInRect(dom.video, rect);
    } else {
      drawSampleToPreview(now);
      drawCanvasInRect(app.previewCanvas, rect, { smoothing: true });
    }
    drawViewfinder(rect, now);

    ctx.save();
    ctx.globalAlpha = 0.88;
    ctx.fillStyle = "rgba(255, 92, 120, 0.9)";
    ctx.shadowColor = COLOR.alert;
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(rect.x + 28, rect.y + 28, 7 + Math.sin(now * 0.008) * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawCaptureProgress(now) {
    const C = getContentRect();
    const rect = fitRect(16, 9, C.x + C.w * 0.09, C.y + 16, C.w * 0.82, C.h - 42);
    const progress = clamp((now - app.captureStartedAt) / (DURATION_SECONDS * 1000), 0, 1);
    if (app.cameraState === "ready" && dom.video.videoWidth) {
      drawVideoElementInRect(dom.video, rect);
    } else {
      drawSampleToPreview(now);
      drawCanvasInRect(app.previewCanvas, rect, { smoothing: true });
    }
    drawViewfinder(rect, now);

    const ctx = app.ctx;
    const barW = rect.w * 0.74;
    const barH = 18;
    const x = rect.x + rect.w / 2 - barW / 2;
    const y = rect.y + rect.h + 26;
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    roundedRect(ctx, x, y, barW, barH, 6);
    ctx.fill();
    const grad = ctx.createLinearGradient(x, 0, x + barW, 0);
    grad.addColorStop(0, COLOR.line);
    grad.addColorStop(0.55, COLOR.quant);
    grad.addColorStop(1, COLOR.sample);
    ctx.fillStyle = grad;
    roundedRect(ctx, x, y, barW * progress, barH, 6);
    ctx.fill();
    ctx.restore();
  }

  function drawFrameExtraction(now) {
    const model = ensureModel();
    const C = getContentRect();
    const state = getFrameSequenceState(model, now);
    const active = state.active;
    const strip = getFrameStripArea(C, model.frames.length);
    const adjusted = !!app.adjustBaseline;
    const rects = getPerspectiveCardRects(model.frames.length, strip.x, strip.y, strip.w, strip.h);
    const target = fitRect(model.width, model.height, C.x + C.w * 0.23, C.y + 2, C.w * 0.54, C.h * 0.6);
    const p = easeOutCubic(clamp(state.phase / 0.58, 0, 1));
    const start = rects[active] || target;
    const moving = interpolateRect(start, target, p);
    moving.angle = (start.angle || 0) * (1 - p);
    const canvas = adjusted ? model.frames[active].quantCanvas : model.frames[active].sourceCanvas;
    drawFilmStrip(model.frames, active, strip.x, strip.y, strip.w, strip.h, false, {
      hideActive: true,
      quantized: adjusted
    });
    if (state.hasPrevious) {
      const previous = model.frames[state.previous];
      const prevCanvas = adjusted ? previous.quantCanvas : previous.sourceCanvas;
      const prevAlpha = 1 - easeOutCubic(clamp((state.phase - 0.82) / 0.18, 0, 1));
      drawFrameCard(target, prevCanvas, "F" + (state.previous + 1), COLOR.line, prevAlpha);
    }
    drawFrameCard(moving, canvas, "F" + (active + 1), COLOR.sample, 1);
  }

  function drawImageProcess(now, mode, isDiff) {
    const model = ensureModel();
    const C = getContentRect();
    const elapsed = slideElapsed(now);
    const source = getProcessSource(model, isDiff);
    const mask = isDiff ? source.mask : null;
    const left = movieSamplingPhotoRect(C, model);
    const right = movieSamplingDotRect(C, model);
    const channelAreas = movieQuantChannelAreas(C, model);
    const sizeOnly = mode === "size";
    const bitsArea = movieCodeArea(C, sizeOnly);

    if (mode === "sample") {
      const settleMs = !isDiff && app.prevStep === 1 ? 980 : 0;
      const sampleElapsed = Math.max(0, elapsed - settleMs);
      const progress = sampleElapsed <= 0 ? 0 : onceProgress(sampleElapsed, 1900);
      const scanProgress = sampleElapsed < 1900
        ? clamp(sampleElapsed / 1900, 0, 1)
        : repeatingProgress(sampleElapsed - 1900, 2600);
      if (!isDiff && app.prevStep === 1 && elapsed < 980) {
        const strip = getFrameStripArea(C, model.frames.length);
        const rects = getPerspectiveCardRects(model.frames.length, strip.x, strip.y, strip.w, strip.h, app.focusFrameIndex);
        const start = rects[clamp(app.focusFrameIndex, 0, rects.length - 1)] || left;
        const moving = interpolateRect(start, left, easeInOutCubic(clamp(elapsed / 980, 0, 1)));
        drawFrameCard(moving, source.sourceCanvas, "F" + (app.focusFrameIndex + 1), COLOR.line, 1);
      } else {
        drawProcessOriginal(left, source, isDiff);
      }
      drawPixelGrid(right, source, {
        mask,
        reveal: easeOutCubic(progress),
        scan: scanProgress,
        numbers: false,
        quantized: false,
        color: isDiff ? COLOR.alert : COLOR.sample
      });
      drawSamplingFlights(left, right, source, mask, progress, isDiff ? COLOR.alert : COLOR.sample);
      drawSamplingScan(left, right, source, mask, scanProgress, now, isDiff ? COLOR.alert : COLOR.sample);
      return;
    }

    if (mode === "quant") {
      const progress = onceProgress(elapsed, 2100);
      drawQuantizationFromSample(source, right, movieGatherDotRect(C, model), channelAreas, mask, progress, isDiff, elapsed);
      return;
    }

    if (mode === "encode") {
      const quantAreas = movieQuantChannelAreas(C, model);
      const targetAreas = movieEncodeChannelAreas(C, model);
      const shouldMoveFromQuant = isDiff ? app.prevStep === 12 : app.prevStep === 3;
      const moveP = shouldMoveFromQuant ? easeInOutCubic(clamp(elapsed / 850, 0, 1)) : 1;
      const encodeAreas = targetAreas.map((target, index) => interpolateRect(quantAreas[index], target, moveP));
      drawChannelQuantization(source, encodeAreas, mask, 1, isDiff, true);
      drawDataAreaFrame(bitsArea, COLOR.code);
      const encodeElapsed = Math.max(0, elapsed - (shouldMoveFromQuant ? 650 : 0));
      drawEncodingSequence(source, encodeAreas, bitsArea, mask, encodeElapsed, isDiff);
      return;
    }

    if (mode === "size") {
      const progress = onceProgress(elapsed, 2800);
      const totalBits = isDiff ? source.bits : model.frameBits;
      const bytes = isDiff ? source.bytes : model.frameBytes;
      drawDataAreaFrame(bitsArea, COLOR.code);
      drawBitCountGrid(bitsArea, totalBits, (bit) => isDiff ? diffBitAt(source, bit, model.bitsPerComp) : frameBitAt(source, bit, model.bitsPerComp), progress, COLOR.code);
      drawCountingSizeCard(C, isDiff ? "差分フレーム" : "1フレーム", totalBits, bytes, isDiff ? COLOR.alert : COLOR.sample, progress);
    }
  }

  function drawProcessOriginal(rect, source, isDiff) {
    if (isDiff) {
      drawDiffCanvasCard(rect, source, "差分フレーム", COLOR.alert, 1);
    } else {
      drawFrameCard(rect, source.sourceCanvas, "元フレーム", COLOR.line, 1);
    }
  }

  function getProcessSource(model, isDiff) {
    if (isDiff) {
      if (model.diffFrames.length === 0) {
        return buildDiffFrame(model.frames[0], model.frames[0], 0, model.pixelBits);
      }
      return model.diffFrames[clamp(app.focusDiffIndex, 0, model.diffFrames.length - 1)];
    }
    return model.frames[clamp(app.focusFrameIndex, 0, model.frames.length - 1)];
  }

  function drawDiffPairs(now) {
    const model = ensureModel();
    const C = getContentRect();
    if (model.diffFrames.length === 0) {
      return;
    }

    const state = getDiffPairState(model, now);
    const active = state.active;
    const phase = state.phase;
    const diff = model.diffFrames[active];
    const strip = getFrameStripArea(C, model.frames.length);
    const stripRects = getPerspectiveCardRects(model.frames.length, strip.x, strip.y, strip.w, strip.h);
    const slots = getDiffSlotRects(model, C);
    const hiddenFrameIndices = getExtractedFrameIndices(model, state);

    const centerA = fitRect(model.width, model.height, C.x + C.w * 0.25, C.y + C.h * 0.36, C.w * 0.24, C.h * 0.24);
    const centerB = fitRect(model.width, model.height, C.x + C.w * 0.51, C.y + C.h * 0.36, C.w * 0.24, C.h * 0.24);
    const overlap = fitRect(model.width, model.height, C.x + C.w * 0.38, C.y + C.h * 0.34, C.w * 0.24, C.h * 0.26);
    const leftSlideP = easeInOutCubic(clamp(phase / 0.26, 0, 1));
    const rightMoveP = easeInOutCubic(clamp((phase - 0.08) / 0.34, 0, 1));
    const overlapP = easeInOutCubic(clamp((phase - 0.4) / 0.2, 0, 1));
    const outP = easeInOutCubic(clamp((phase - 0.72) / 0.22, 0, 1));
    const a0 = active === 0 ? centerA : overlap;
    const b0 = stripRects[active + 1] || centerB;
    const aStage = interpolateRect(a0, centerA, leftSlideP);
    const bStage = interpolateRect(b0, centerB, rightMoveP);
    const aRect = interpolateRect(aStage, overlap, overlapP);
    const bRect = interpolateRect(bStage, overlap, overlapP);
    const pairAngle = -0.035;
    const bAngle = lerp(b0.angle || 0, pairAngle, rightMoveP);

    drawFilmStrip(model.frames, active + 1, strip.x, strip.y, strip.w, strip.h, false, {
      hideActive: true,
      hiddenIndices: hiddenFrameIndices,
      quantized: true
    });
    drawDiffSlots(model, slots, active, phase);
    drawTiltedFrameCard(aRect, diff.from.quantCanvas, "F" + (active + 1), COLOR.line, 0.92, pairAngle);
    drawTiltedFrameCard(bRect, diff.to.quantCanvas, "F" + (active + 2), COLOR.sample, 0.88, bAngle);

    if (phase > 0.5) {
      drawSubtractionEffect(overlap, diff, phase, now);
    }

    if (phase > 0.68) {
      const slot = slots[active] || overlap;
      const dRect = interpolateRect(overlap, slot, outP);
      drawDiffCanvasCard(dRect, diff, "D" + (active + 1), COLOR.alert, clamp((phase - 0.66) / 0.22, 0, 1));
    }
  }

  function drawDiffReconstruction(now) {
    const model = ensureModel();
    const C = getContentRect();
    if (model.diffFrames.length === 0) {
      return;
    }

    const elapsed = slideElapsed(now);
    const state = getDiffReconstructionState(model, now);
    const introMs = state.introMs;
    const active = state.active;
    const diff = model.diffFrames[active];
    const slots = getDiffSlotRects(model, C);
    const strip = getFrameStripArea(C, model.frames.length);
    const stripRects = drawCompressedStrip(model, active, strip.x, strip.y, strip.w, strip.h, {
      hideDiffs: elapsed < introMs,
      hideActive: elapsed >= introMs
    });

    if (elapsed < introMs) {
      const p = easeInOutCubic(clamp(elapsed / introMs, 0, 1));
      model.diffFrames.forEach((slotDiff, i) => {
        const to = stripRects[i + 1] || slots[i];
        const moving = interpolateRect(slots[i], to, p);
        moving.angle = (to.angle || 0) * p;
        drawDiffCanvasCard(moving, slotDiff, "D" + (i + 1), COLOR.alert, 1, true);
      });
      return;
    }

    const current = fitRect(model.width, model.height, C.x + C.w * 0.12, C.y + C.h * 0.29, C.w * 0.28, C.h * 0.34);
    const target = fitRect(model.width, model.height, C.x + C.w * 0.6, C.y + C.h * 0.29, C.w * 0.28, C.h * 0.34);
    const overlay = fitRect(model.width, model.height, C.x + C.w * 0.36, C.y + C.h * 0.25, C.w * 0.26, C.h * 0.34);
    const phase = state.phase;
    const prevStart = active === 0 ? current : target;
    const leftP = easeInOutCubic(clamp(phase / 0.24, 0, 1));
    const diffP = easeInOutCubic(clamp((phase - 0.12) / 0.32, 0, 1));
    const mergeP = easeInOutCubic(clamp((phase - 0.44) / 0.16, 0, 1));
    const resultP = easeOutCubic(clamp((phase - 0.74) / 0.2, 0, 1));
    const prevRect = interpolateRect(prevStart, current, leftP);
    const diffStart = stripRects[active + 1] || overlay;
    const diffMove = interpolateRect(diffStart, overlay, diffP);
    diffMove.angle = (diffStart.angle || 0) * (1 - diffP);
    const frameMerge = interpolateRect(prevRect, overlay, mergeP);
    const diffMerge = interpolateRect(diffMove, overlay, mergeP);
    const resultRect = interpolateRect(overlay, target, resultP);

    if (active > 0) {
      const retainedAlpha = clamp((1 - resultP) * 0.78, 0, 0.78);
      drawFrameCard(target, diff.from.quantCanvas, "F" + (active + 1), COLOR.quant, retainedAlpha);
    }
    drawFrameCard(frameMerge, diff.from.quantCanvas, "F" + (active + 1), COLOR.line, 1 - resultP * 0.42);
    drawDiffCanvasCard(diffMerge, diff, "D" + (active + 1), COLOR.alert, 0.92 - resultP * 0.42);
    if (phase > 0.56 && phase < 0.86) {
      drawDiffApplyEffect(overlay, diff, phase, now);
    }
    drawFrameCard(resultRect, diff.to.quantCanvas, "F" + (active + 2), COLOR.quant, resultP);
  }

  function drawSubtractionEffect(rect, diff, phase, now) {
    const ctx = app.ctx;
    const p = clamp((phase - 0.5) / 0.22, 0, 1);
    const pulse = 0.72 + 0.28 * Math.sin(now * 0.018);
    const inner = insetRect(aspectRect(rect, getSourceFrameAspect()), 8);
    ctx.save();
    ctx.globalAlpha = clamp(p * pulse, 0, 1);
    ctx.strokeStyle = COLOR.alert;
    ctx.fillStyle = "rgba(255, 92, 120, 0.18)";
    ctx.shadowColor = COLOR.alert;
    ctx.shadowBlur = 18;
    ctx.lineWidth = 2;
    const cellW = inner.w / diff.width;
    const cellH = inner.h / diff.height;
    const step = Math.max(1, Math.floor(diff.changedIndices.length / 80));
    for (let i = 0; i < diff.changedIndices.length; i += step) {
      const pixel = diff.changedIndices[i];
      const x = pixel % diff.width;
      const y = Math.floor(pixel / diff.width);
      ctx.strokeRect(inner.x + x * cellW, inner.y + y * cellH, cellW, cellH);
      if (p > 0.45) {
        ctx.fillRect(inner.x + x * cellW, inner.y + y * cellH, cellW, cellH);
      }
    }
    ctx.restore();

    const cx = rect.x + rect.w / 2;
    const y = rect.y - 34;
    drawText("F" + (diff.index + 2) + " - F" + (diff.index + 1) + " = D" + (diff.index + 1), cx, y, 26, COLOR.alert, 1000, "center", "Consolas, monospace");
  }

  function drawDiffApplyEffect(rect, diff, phase, now) {
    const ctx = app.ctx;
    const hold = clamp((phase - 0.56) / 0.18, 0, 1) * (1 - clamp((phase - 0.8) / 0.06, 0, 1));
    const card = aspectRect(rect, getSourceFrameAspect());
    const inner = insetRect(card, 8);
    const cellW = inner.w / diff.width;
    const cellH = inner.h / diff.height;
    ctx.save();
    ctx.globalAlpha = 0.22 + 0.48 * hold;
    ctx.strokeStyle = COLOR.quant;
    ctx.fillStyle = "rgba(117, 240, 154, 0.16)";
    ctx.shadowColor = COLOR.quant;
    ctx.shadowBlur = 18;
    ctx.lineWidth = 2;
    const step = Math.max(1, Math.floor(diff.changedIndices.length / 90));
    for (let i = 0; i < diff.changedIndices.length; i += step) {
      const pixel = diff.changedIndices[i];
      const x = pixel % diff.width;
      const y = Math.floor(pixel / diff.width);
      const wobble = Math.sin(now * 0.014 + i) * 0.5 + 0.5;
      ctx.globalAlpha = (0.16 + 0.5 * wobble) * hold;
      roundedRect(ctx, inner.x + x * cellW, inner.y + y * cellH, cellW, cellH, 3);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();

    const cx = card.x + card.w / 2;
    drawText("F" + (diff.index + 1) + " + D" + (diff.index + 1) + " -> F" + (diff.index + 2), cx, card.y - 34, 25, COLOR.quant, 1000, "center", "Consolas, monospace");
  }

  function drawShatterSingle(now, isDiff) {
    const model = ensureModel();
    const C = getContentRect();
    const elapsed = slideElapsed(now);
    const p = clamp(elapsed / 1800, 0, 1);
    const source = getProcessSource(model, isDiff);
    const bytes = isDiff ? source.bytes : model.frameBytes;
    const bits = isDiff ? source.bits : model.frameBits;
    const rect = fitRect(model.width, model.height, C.x + C.w * 0.26, C.y + C.h * 0.08, C.w * 0.48, C.h * 0.58);

    if (isDiff) {
      drawDiffCanvasCard(rect, source, "差分フレーム", COLOR.alert, 1 - easeOutCubic(p) * 0.72);
    } else {
      drawFrameCard(rect, source.quantCanvas || source.sampleCanvas || source.sourceCanvas, "1フレーム", COLOR.line, 1 - easeOutCubic(p) * 0.72);
    }
    drawBitBurst(rect, scaledParticleCount(bytes, isDiff ? 85 : 160), p, isDiff ? COLOR.alert : COLOR.code, now, isDiff ? 0.72 : 1);
    drawSizeOverlay(rect.x + rect.w / 2, rect.y + rect.h / 2, bytes, bits, isDiff ? COLOR.alert : COLOR.sample, p);
  }

  function drawShatterAll(now, compressed) {
    const model = ensureModel();
    const C = getContentRect();
    const elapsed = slideElapsed(now);
    const tiles = compressed ? makeCompressedTiles(model) : makeNormalShatterTiles(model);
    const rects = compressed ? layoutTiles(tiles.length, C) : getNormalShatterRects(model, C);
    const stripCount = compressed ? tiles.length : model.frames.length;
    const strip = getFrameStripArea(C, stripCount);
    const stripRects = getPerspectiveCardRects(stripCount, strip.x, strip.y, strip.w, strip.h);
    const introMs = 980;

    tiles.forEach((tile, i) => {
      const start = i * (compressed ? 145 : 120);
      const shatterElapsed = Math.max(0, elapsed - introMs);
      const p = clamp((shatterElapsed - start) / 850, 0, 1);
      const flyP = easeInOutCubic(clamp((elapsed - i * 45) / introMs, 0, 1));
      const from = compressed
        ? (stripRects[i] || rects[i])
        : tile.type !== "diff"
          ? (stripRects[tile.index] || rects[i])
          : rects[i];
      const rect = interpolateRect(from, rects[i], flyP);
      rect.angle = from && typeof from.angle === "number" ? from.angle * (1 - flyP) : 0;
      const alpha = 1 - easeOutCubic(p) * 0.84;
      if (tile.type === "diff") {
        if (flyP < 0.98) {
          drawTiltedDiffCard(rect, tile.diff, "D" + tile.index, COLOR.alert, alpha, rect.angle);
        } else {
          drawDiffCanvasCard(rect, tile.diff, "D" + tile.index, COLOR.alert, alpha, true);
        }
      } else {
        const canvas = tile.frame.quantCanvas || tile.frame.sampleCanvas || tile.frame.sourceCanvas;
        const label = tile.type === "base" ? "F1" : "F" + (tile.index + 1);
        if (flyP < 0.98) {
          drawTiltedFrameCard(rect, canvas, label, COLOR.line, alpha, rect.angle);
        } else {
          drawFrameCard(rect, canvas, label, COLOR.line, alpha, true);
        }
      }
      const particleMax = tile.type === "diff" ? 58 : 96;
      drawBitBurst(rect, scaledParticleCount(tile.bytes, particleMax), p, tile.type === "diff" ? COLOR.alert : COLOR.code, now + i * 17, tile.type === "diff" ? 0.58 : 0.86);
      if (p > 0.3) {
        drawTinySize(rect, tile.bytes, tile.type === "diff" ? COLOR.alert : COLOR.sample, p);
      }
    });

  }

  function drawTotalGather(now, compressed) {
    const model = ensureModel();
    const C = getContentRect();
    const elapsed = slideElapsed(now);
    const p = clamp(elapsed / 2200, 0, 1);
    const bytes = compressed ? model.compressedBytes : model.totalBytes;
    const bits = compressed ? model.compressedBits : model.totalBits;
    const color = compressed ? COLOR.alert : COLOR.sample;
    const ctx = app.ctx;
    const tiles = compressed ? makeCompressedTiles(model) : makeNormalShatterTiles(model);
    const starts = compressed ? layoutTiles(Math.max(1, tiles.length), C) : getNormalShatterRects(model, C);

    ctx.save();
    ctx.font = "900 " + Math.round(lerp(19, 30, easeOutCubic(p))) + "px Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const cx = C.x + C.w / 2;
    const cy = C.y + C.h * 0.42;
    const count = 210;
    for (let i = 0; i < count; i += 1) {
      const start = starts[i % starts.length];
      const sx = start.x + seededNoise(i * 31) * start.w;
      const sy = start.y + seededNoise(i * 47) * start.h;
      const orbit = lerp(140 + seededNoise(i * 11) * 100, 92 + seededNoise(i * 11) * 84, easeOutCubic(p));
      const angle = seededNoise(i * 23) * Math.PI * 2 + now * 0.0008;
      const ex = cx + Math.cos(angle) * orbit;
      const ey = cy + 126 + Math.sin(angle * 1.17) * (44 + seededNoise(i * 13) * 42);
      const wobble = Math.sin(app.now * 0.002 + i) * 8;
      const x = lerp(sx, ex, easeInOutCubic(p)) + wobble * p;
      const y = lerp(sy, ey, easeInOutCubic(p)) - wobble * 0.35 * p;
      ctx.globalAlpha = 0.34 + 0.58 * clamp(p + 0.1, 0, 1);
      ctx.fillStyle = i % 2 ? COLOR.code : color;
      ctx.fillText(i % 2 ? "1" : "0", x, y);
    }
    ctx.restore();

    const shownBytes = Math.round(bytes * easeOutCubic(p));
    drawSizeCard(cx, cy + 128, compressed ? "圧縮後の合計" : "通常保存の合計", Math.round(bits * easeOutCubic(p)), shownBytes, color);
    if (p > 0.86) {
      drawLargeFloatingBits(cx, cy + 128, color, now, p);
    }
  }

  function drawAdjustScreen(now, compressed) {
    const model = ensureModel();
    const current = app.adjustBaseline || model;
    const previous = app.previousAdjustBaseline;
    const C = getContentRect();
    const gap = Math.max(18, C.w * 0.018);
    const colW = (C.w - gap * 2) / 3;
    const y = C.y + C.h * 0.03;
    const h = C.h * 0.86;
    const rects = [0, 1, 2].map((i) => ({
      x: C.x + i * (colW + gap),
      y,
      w: colW,
      h
    }));
    const items = [
      { title: "前回の設定", model: previous, color: COLOR.line, compressed: app.previousAdjustBaselineCompressed },
      { title: "今回の設定", model: current, color: COLOR.sample, compressed: app.adjustBaselineCompressed },
      { title: "変更後プレビュー", model, color: app.compressEnabled ? COLOR.alert : COLOR.quant, compressed: app.compressEnabled }
    ];

    items.forEach((item, index) => {
      const slot = rects[index];
      if (!item.model || !item.model.frames.length) {
        drawEmptyPreview(slot, item.title, item.color);
        return;
      }
      const frameIndex = previewFrameIndex(item.model, now);
      const frame = item.model.frames[frameIndex];
      const imageRect = getAdjustPreviewImageRect(slot);
      drawFrameCard(imageRect, frame.quantCanvas, item.title, item.color, 1);
      drawPreviewFooter(slot, item.title, item.model, item.color, item.compressed);
    });
  }

  function previewFrameIndex(model, now) {
    if (!model || !model.frames.length) {
      return 0;
    }
    const elapsed = Math.max(0, now - app.stepStartedAt);
    const fps = Math.max(1, Math.min(model.fps || app.params.fps, 12));
    return Math.floor((elapsed / 1000) * fps) % model.frames.length;
  }

  function drawEmptyPreview(slot, title, color) {
    const ctx = app.ctx;
    const rect = getAdjustPreviewImageRect(slot);
    drawPanel(rect, "rgba(165, 238, 255, 0.22)", 0.42);
    ctx.save();
    ctx.globalAlpha = 0.38;
    ctx.strokeStyle = color;
    ctx.setLineDash([10, 8]);
    ctx.lineWidth = 2;
    roundedRect(ctx, rect.x + 8, rect.y + 8, rect.w - 16, rect.h - 16, 8);
    ctx.stroke();
    ctx.restore();
    drawText(title, rect.x + rect.w / 2, rect.y - 16, 16, color, 900, "center");
    drawText("未設定", rect.x + rect.w / 2, rect.y + rect.h / 2, 24, COLOR.muted, 900, "center");
    drawPreviewFooter(slot, title, null, color, false);
  }

  function getAdjustPreviewImageRect(slot) {
    const footerH = 62;
    const gap = 8;
    return fitRect(getSourceFrameAspect(), 1, slot.x, slot.y, slot.w, Math.max(90, slot.h - footerH - gap));
  }

  function drawPreviewFooter(slot, title, model, color, compressed) {
    const ctx = app.ctx;
    const h = 66;
    const y = slot.y + slot.h - h;
    ctx.save();
    ctx.globalAlpha = 0.94;
    ctx.fillStyle = "rgba(4, 12, 16, 0.88)";
    roundedRect(ctx, slot.x, y, slot.w, h, 8);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.globalAlpha = 0.7;
    roundedRect(ctx, slot.x, y, slot.w, h, 8);
    ctx.stroke();
    ctx.restore();

    const size = model
      ? formatBytes(compressed ? model.compressedBytes : model.totalBytes)
      : "-";
    const params = model
      ? model.fps + "fps / " + model.width + "×" + model.height + " / " + model.levels + "階調 / " + formatCompressionParam(compressed)
      : "";
    drawFittedText(size, slot.x + 12, y + 24, slot.w - 24, 23, color, 1000, "left", "Consolas, monospace");
    drawFittedText(params, slot.x + 12, y + 50, slot.w - 24, 13, COLOR.muted, 900, "left");
  }

  function drawPixelGrid(rect, source, options) {
    const ctx = app.ctx;
    const w = source.width;
    const h = source.height;
    const mask = options.mask || null;
    const reveal = typeof options.reveal === "number" ? options.reveal : 1;
    const cellW = rect.w / w;
    const cellH = rect.h / h;
    const r = Math.max(0.6, Math.min(cellW, cellH) * 0.42);
    const total = w * h;
    const revealIndex = Math.floor(total * reveal);
    const scanCol = typeof options.scan === "number" ? Math.floor(options.scan * w) : -1;
    const data = options.quantized
      ? (source.quantized || source.data || source.original)
      : (source.original || source.data || source.quantized);
    const levelIndices = source.levelIndices;

    drawPanel(rect, options.color || COLOR.sample, 0.82);
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const p = y * w + x;
        if (p > revealIndex) {
          continue;
        }
        if (mask && !mask[p]) {
          continue;
        }
        const si = p * 4;
        const cx = rect.x + (x + 0.5) * cellW;
        const cy = rect.y + (y + 0.5) * cellH;
        const alpha = scanCol === x ? 1 : 0.76;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "rgb(" + data[si] + "," + data[si + 1] + "," + data[si + 2] + ")";
        if (Math.min(cellW, cellH) < 3.2) {
          ctx.fillRect(rect.x + x * cellW, rect.y + y * cellH, Math.ceil(cellW), Math.ceil(cellH));
        } else {
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fill();
        }

        if (options.numbers && Math.min(cellW, cellH) >= 13) {
          const li = p * 3;
          const value = Math.round((levelIndices[li] + levelIndices[li + 1] + levelIndices[li + 2]) / 3);
          ctx.fillStyle = value > app.params.levels * 0.5 ? "#061014" : "#f1fbff";
          ctx.font = "900 " + Math.floor(Math.min(cellW, cellH) * 0.45) + "px Consolas, monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(value), cx, cy + 0.5);
        }
      }
    }
    if (scanCol >= 0) {
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = options.color || COLOR.quant;
      ctx.shadowColor = options.color || COLOR.quant;
      ctx.shadowBlur = 18;
      ctx.fillRect(rect.x + scanCol * cellW, rect.y, Math.max(2, cellW), rect.h);
    }
    ctx.restore();

    const title = options.numbers ? "量子化後の値" : "標本化した画素";
    drawText(title, rect.x + rect.w / 2, rect.y - 18, 17, options.color || COLOR.sample, 900, "center");
  }

  function getChannelAreas(C, model) {
    const areaX = C.x + C.w * 0.38;
    const areaY = C.y + 18;
    const areaW = C.w * 0.27;
    const areaH = C.h * 0.6;
    const gap = 12;
    const h = (areaH - gap * 2) / 3;
    return [0, 1, 2].map((index) => fitRect(model.width, model.height, areaX, areaY + index * (h + gap), areaW, h));
  }

  function getEncodeChannelAreas(C, model) {
    const areaX = C.x + C.w * 0.06;
    const areaY = C.y + 18;
    const areaW = C.w * 0.3;
    const areaH = C.h * 0.59;
    const gap = 12;
    const h = (areaH - gap * 2) / 3;
    return [0, 1, 2].map((index) => fitRect(model.width, model.height, areaX, areaY + index * (h + gap), areaW, h));
  }

  function drawSamplingFlights(fromRect, toRect, source, mask, progress, color) {
    const ctx = app.ctx;
    const w = source.width;
    const h = source.height;
    const p = easeOutCubic(clamp(progress / 0.85, 0, 1));
    const maxDots = Math.min(120, w * h);
    const stride = Math.max(1, Math.floor((w * h) / maxDots));
    const data = source.original || source.data || source.quantized;
    ctx.save();
    for (let pixel = 0; pixel < w * h; pixel += stride) {
      if (mask && !mask[pixel]) {
        continue;
      }
      const x = pixel % w;
      const y = Math.floor(pixel / w);
      const delay = (x / Math.max(1, w - 1)) * 0.34;
      const local = clamp((progress - delay) / 0.5, 0, 1);
      if (local <= 0 || local >= 1) {
        continue;
      }
      const si = pixel * 4;
      const sx = fromRect.x + (x + 0.5) / w * fromRect.w;
      const sy = fromRect.y + (y + 0.5) / h * fromRect.h;
      const tx = toRect.x + (x + 0.5) / w * toRect.w;
      const ty = toRect.y + (y + 0.5) / h * toRect.h;
      const e = easeInOutCubic(local);
      const cx = lerp(sx, tx, e);
      const cy = lerp(sy, ty, e) - Math.sin(e * Math.PI) * 44;
      const r = Math.max(3, Math.min(toRect.w / w, toRect.h / h) * 0.48);
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = "rgb(" + data[si] + "," + data[si + 1] + "," + data[si + 2] + ")";
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawSamplingScan(fromRect, toRect, source, mask, progress, now, color) {
    const ctx = app.ctx;
    const w = Math.max(1, source.width);
    const h = Math.max(1, source.height);
    const col = clamp(Math.floor(clamp(progress, 0, 0.9999) * w), 0, w - 1);
    const srcCellW = fromRect.w / w;
    const dstCellW = toRect.w / w;
    const bandX = fromRect.x + (col + 0.5) * srcCellW;
    const dotX = toRect.x + (col + 0.5) * dstCellW;
    const cellH = toRect.h / h;

    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 13;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(bandX, fromRect.y);
    ctx.lineTo(bandX, fromRect.y + fromRect.h);
    ctx.stroke();

    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 7]);
    ctx.lineDashOffset = -(now * 0.12);
    ctx.beginPath();
    ctx.moveTo(bandX, fromRect.y + fromRect.h * 0.5);
    ctx.lineTo(dotX, toRect.y + toRect.h * 0.5);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.globalAlpha = 0.82;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    roundedRect(ctx, dotX - dstCellW / 2, toRect.y, dstCellW, toRect.h, 4);
    ctx.stroke();

    if (Math.min(dstCellW, cellH) >= 5) {
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = color;
      for (let row = 0; row < h; row += 1) {
        const pixel = row * w + col;
        if (mask && !mask[pixel]) {
          continue;
        }
        roundedRect(ctx, dotX - dstCellW / 2, toRect.y + row * cellH, dstCellW, cellH, 3);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawChannelQuantization(source, areas, mask, progress, isDiff, compact, scanProgress) {
    const ctx = app.ctx;
    const w = source.width;
    const h = source.height;
    const data = source.quantized || source.data;
    const channels = [
      { label: "R", color: COLOR.alert },
      { label: "G", color: COLOR.quant },
      { label: "B", color: COLOR.line }
    ];
    const scan = Math.min(w - 1, Math.floor(clamp(typeof scanProgress === "number" ? scanProgress : progress, 0, 0.9999) * w));
    areas.forEach((area, ch) => {
      drawPanel(area, channels[ch].color, compact ? 0.72 : 0.9);
      if (compact) {
        drawText(channels[ch].label, area.x - 16, area.y + area.h / 2, 16, channels[ch].color, 1000, "center", "Consolas, monospace");
      }
      const cellW = area.w / w;
      const cellH = area.h / h;
      const r = Math.max(0.6, Math.min(cellW, cellH) * 0.42);
      ctx.save();
      ctx.beginPath();
      ctx.rect(area.x, area.y, area.w, area.h);
      ctx.clip();
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const pixel = y * w + x;
          if (mask && !mask[pixel]) {
            continue;
          }
          const reveal = clamp((progress - (x / Math.max(1, w - 1)) * 0.26) / 0.4, 0, 1);
          if (!compact && reveal <= 0) {
            continue;
          }
          const si = pixel * 4;
          const value = data[si + ch];
          const cx = area.x + (x + 0.5) * cellW;
          const cy = area.y + (y + 0.5) * cellH;
          const dotColor = ch === 0
            ? "rgb(" + value + ",32,54)"
            : ch === 1
              ? "rgb(32," + value + ",72)"
              : "rgb(32,92," + value + ")";
          ctx.globalAlpha = compact ? 0.62 : (0.34 + 0.66 * reveal);
          ctx.fillStyle = dotColor;
          if (Math.min(cellW, cellH) < 3) {
            ctx.fillRect(area.x + x * cellW, area.y + y * cellH, Math.ceil(cellW), Math.ceil(cellH));
          } else {
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fill();
          }
          if (!compact && Math.min(cellW, cellH) >= 9) {
            const li = pixel * 3 + ch;
            const n = source.levelIndices[li] || 0;
            ctx.globalAlpha = x === scan ? 1 : 0.82;
            const fs = clamp(Math.min(cellH * 0.58, cellW / Math.max(1.25, String(app.params.levels - 1).length * 0.62)), 6, 16);
            ctx.font = "1000 " + fs + "px Consolas, monospace";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.lineWidth = Math.max(1.3, fs * 0.24);
            ctx.strokeStyle = "rgba(4, 12, 16, 0.94)";
            ctx.fillStyle = "#f6fdff";
            ctx.strokeText(String(n), cx, cy + 0.5);
            ctx.fillText(String(n), cx, cy + 0.5);
          }
        }
      }
      if (!compact) {
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = channels[ch].color;
        ctx.shadowColor = channels[ch].color;
        ctx.shadowBlur = 16;
        ctx.fillRect(area.x + scan * cellW, area.y, Math.max(2, cellW), area.h);
      }
      ctx.restore();
      if (!compact) {
        drawChannelValueMagnifier(area, source, ch, scan, channels[ch].color);
        drawText("成分 " + channels[ch].label, area.x + area.w / 2, area.y + area.h + 22, 17, channels[ch].color, 1000, "center", "Consolas, monospace");
      }
    });
  }

  function drawChannelValueMagnifier(area, source, ch, col, color) {
    const ctx = app.ctx;
    const w = source.width;
    const h = source.height;
    const cellW = area.w / w;
    const cellH = area.h / h;
    if (cellW >= 14 && cellH >= 14) {
      return;
    }
    const xLine = area.x + (col + 0.5) * cellW;
    const fs = clamp(Math.max(18, Math.min(30, Math.max(cellW, cellH) * 2.1)), 18, 30);
    const rowStep = Math.max(1, Math.ceil((fs + 10) / Math.max(1, cellH)));
    ctx.save();
    ctx.font = "1000 " + fs + "px Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(2, fs * 0.18);
    ctx.strokeStyle = "rgba(4, 12, 16, 0.94)";
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    for (let row = 0; row < h; row += rowStep) {
      const pixel = row * w + col;
      if (source.mask && !source.mask[pixel]) {
        continue;
      }
      const value = source.levelIndices[pixel * 3 + ch] || 0;
      const text = String(value);
      const tw = Math.max(fs * 1.35, ctx.measureText(text).width + 14);
      const th = fs + 10;
      const x = clamp(xLine, area.x + tw / 2 + 3, area.x + area.w - tw / 2 - 3);
      const y = clamp(area.y + (row + 0.5) * cellH, area.y + th / 2 + 3, area.y + area.h - th / 2 - 3);
      ctx.globalAlpha = 0.82;
      ctx.fillStyle = "rgba(5, 14, 19, 0.84)";
      roundedRect(ctx, x - tw / 2, y - th / 2, tw, th, 7);
      ctx.fill();
      ctx.globalAlpha = 0.96;
      ctx.fillStyle = "#f6fdff";
      ctx.strokeText(text, x, y + 1);
      ctx.fillText(text, x, y + 1);
    }
    ctx.restore();
  }

  function drawQuantizationFromSample(source, origin, gather, areas, mask, progress, isDiff, elapsed) {
    const ctx = app.ctx;
    const w = source.width;
    const h = source.height;
    const pGather = easeInOutCubic(clamp(progress / 0.28, 0, 1));
    const pSplit = easeInOutCubic(clamp((progress - 0.24) / 0.38, 0, 1));
    const movingRect = interpolateRect(origin, gather, pGather);

    if (pSplit < 0.98) {
      drawPixelGrid(movingRect, source, {
        mask,
        reveal: 1,
        numbers: false,
        quantized: false,
        color: isDiff ? COLOR.alert : COLOR.sample
      });
    }

    const maxDots = Math.min(180, w * h);
    const stride = Math.max(1, Math.floor((w * h) / maxDots));
    const data = source.quantized || source.data;
    ctx.save();
    for (let ch = 0; ch < 3; ch += 1) {
      const area = areas[ch];
      const cellW = area.w / w;
      const cellH = area.h / h;
      const r = Math.max(1, Math.min(cellW, cellH) * 0.42);
      drawPanel(area, [COLOR.alert, COLOR.quant, COLOR.line][ch], 0.28 + 0.54 * pSplit);
      if (pSplit < 0.82) {
        drawText(["R", "G", "B"][ch], area.x + area.w / 2, area.y - 18, 17, [COLOR.alert, COLOR.quant, COLOR.line][ch], 1000, "center", "Consolas, monospace");
      }
      for (let pixel = 0; pixel < w * h; pixel += stride) {
        if (mask && !mask[pixel]) {
          continue;
        }
        const x = pixel % w;
        const y = Math.floor(pixel / w);
        const si = pixel * 4;
        const sx = movingRect.x + (x + 0.5) / w * movingRect.w;
        const sy = movingRect.y + (y + 0.5) / h * movingRect.h;
        const tx = area.x + (x + 0.5) * cellW;
        const ty = area.y + (y + 0.5) * cellH;
        const cx = lerp(sx, tx, pSplit);
        const cy = lerp(sy, ty, pSplit);
        const value = data[si + ch];
        const dotColor = ch === 0
          ? "rgb(" + value + ",32,54)"
          : ch === 1
            ? "rgb(32," + value + ",72)"
            : "rgb(32,92," + value + ")";
        ctx.globalAlpha = 0.3 + 0.7 * pSplit;
        ctx.fillStyle = dotColor;
        ctx.shadowColor = [COLOR.alert, COLOR.quant, COLOR.line][ch];
        ctx.shadowBlur = 5 * pSplit;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    if (pSplit > 0.82) {
      const scanProgress = repeatingProgress(Math.max(0, elapsed - 1320), clamp(w * 70, 1700, 5200));
      drawChannelQuantization(source, areas, mask, 1, isDiff, false, scanProgress);
    }
  }

  function drawEncodeFlights(source, areas, bitsArea, mask, progress, isDiff) {
    const ctx = app.ctx;
    const w = source.width;
    const h = source.height;
    const bitsPerComp = app.model.bitsPerComp;
    const visibleComps = 15;
    const compIndex = Math.floor(progress * visibleComps);
    const local = (progress * visibleComps) % 1;
    const pixel = Math.floor(compIndex / 3);
    const comp = compIndex % 3;
    const actualPixel = isDiff && source.changedIndices.length
      ? source.changedIndices[clamp(pixel, 0, source.changedIndices.length - 1)]
      : pixel;
    if (actualPixel >= w * h || (mask && !mask[actualPixel])) {
      return;
    }
    const x = actualPixel % w;
    const y = Math.floor(actualPixel / w);
    const area = areas[comp];
    const sx = area.x + (x + 0.5) / w * area.w;
    const sy = area.y + (y + 0.5) / h * area.h;
    const cell = pickBitCell(bitsArea, isDiff ? source.bits : app.model.frameBits);
    const cols = Math.max(1, Math.floor(bitsArea.w / cell));
    const bitStart = compIndex * bitsPerComp;
    const bx = bitsArea.x + (bitStart % cols) * cell + cell / 2;
    const by = bitsArea.y + Math.floor(bitStart / cols) * cell + cell / 2;
    const e = easeInOutCubic(local);
    const cx = lerp(sx, bx, e);
    const cy = lerp(sy, by, e) - Math.sin(e * Math.PI) * 36;
    const colors = [COLOR.alert, COLOR.quant, COLOR.line];
    const value = source.levelIndices[actualPixel * 3 + comp] || 0;
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = colors[comp];
    ctx.shadowColor = colors[comp];
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(cx, cy, 16 - e * 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#061014";
    ctx.font = "900 13px Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(value), cx, cy + 0.5);
    ctx.restore();
  }

  function drawEncodingSequence(source, areas, bitsArea, mask, elapsed, isDiff) {
    const model = app.model;
    const bitsPerComp = model.bitsPerComp;
    const channels = 3;
    const pixelIndices = isDiff
      ? source.changedIndices
      : Array.from({ length: source.width * source.height }, (_, index) => index);
    const compTotal = pixelIndices.length * channels;
    const totalBits = isDiff ? source.bits : model.frameBits;
    const detailPixels = Math.min(isDiff ? 2 : 2, pixelIndices.length);
    const detailComps = detailPixels * channels;
    const moveMs = 360;
    const encMs = Math.max(340, bitsPerComp * 62);
    const compMs = moveMs + encMs;
    const detailDur = detailComps * compMs;
    const restDur = 4300;

    let shownBits = 0;
    let processedComps = 0;
    let active = null;
    if (elapsed < detailDur && detailComps > 0) {
      const comp = clamp(Math.floor(elapsed / compMs), 0, detailComps - 1);
      const within = elapsed - comp * compMs;
      if (within < moveMs) {
        shownBits = comp * bitsPerComp;
        processedComps = comp;
        active = { comp, phase: "move", frac: within / moveMs };
      } else {
        const frac = clamp((within - moveMs) / encMs, 0, 1);
        const activeBits = Math.min(bitsPerComp, Math.round(frac * bitsPerComp));
        shownBits = comp * bitsPerComp + activeBits;
        processedComps = comp + (activeBits >= bitsPerComp ? 1 : 0);
        active = { comp, phase: "encode", frac };
      }
    } else {
      const restP = easeInOutCubic(clamp((elapsed - detailDur) / restDur, 0, 1));
      shownBits = Math.round(lerp(detailComps * bitsPerComp, totalBits, restP * restP));
      processedComps = Math.ceil(shownBits / Math.max(1, bitsPerComp));
    }
    shownBits = clamp(shownBits, 0, totalBits);
    processedComps = clamp(processedComps, 0, compTotal);

    const bitGetter = (bit) => isDiff ? diffBitAt(source, bit, bitsPerComp) : frameBitAt(source, bit, bitsPerComp);
    const bitView = getEncodingBitView(bitsArea, totalBits, shownBits);
    drawEncodingBitGrid(bitsArea, bitView, bitGetter, COLOR.code);
    drawEncodedSourceFade(source, areas, mask, processedComps, isDiff);
    drawChip(bitsArea.x + bitsArea.w / 2, bitsArea.y + bitsArea.h + 28, "1成分 = " + bitsPerComp + " bit / 1画素 = " + model.pixelBits + " bit", COLOR.code, 0);

    if (!active || compTotal === 0 || shownBits >= totalBits) {
      if (shownBits < totalBits) {
        drawAcceleratedEncodingFlights(source, areas, bitsArea, mask, shownBits, totalBits, isDiff, bitView);
      }
      return;
    }

    const pixel = pixelIndices[Math.floor(active.comp / channels)] || 0;
    const comp = active.comp % channels;
    const bitsStart = active.comp * bitsPerComp;
    drawActiveEncodingComponent(source, areas, bitsArea, pixel, comp, bitsStart, bitsPerComp, active.frac, totalBits, active.phase, bitView);
  }

  function drawEncodedSourceFade(source, areas, mask, processedComps, isDiff) {
    const ctx = app.ctx;
    const w = source.width;
    const h = source.height;
    const channels = 3;
    const maxPixels = isDiff && source.changedIndices ? source.changedIndices.length : w * h;
    const processedPixelsByChannel = [0, 0, 0].map((_, ch) => {
      if (processedComps <= ch) {
        return 0;
      }
      return clamp(Math.floor((processedComps - 1 - ch) / channels) + 1, 0, maxPixels);
    });

    areas.forEach((area, ch) => {
      const count = processedPixelsByChannel[ch];
      if (count <= 0) {
        return;
      }
      const cellW = area.w / w;
      const cellH = area.h / h;
      ctx.save();
      ctx.beginPath();
      ctx.rect(area.x, area.y, area.w, area.h);
      ctx.clip();
      ctx.fillStyle = "rgba(4, 12, 16, 0.86)";
      if (isDiff && source.changedIndices) {
        for (let i = 0; i < count; i += 1) {
          const p = source.changedIndices[i];
          const x = p % w;
          const y = Math.floor(p / w);
          ctx.fillRect(area.x + x * cellW, area.y + y * cellH, cellW, cellH);
        }
      } else {
        const fullRows = Math.floor(count / w);
        const partial = count % w;
        if (fullRows > 0) {
          ctx.fillRect(area.x, area.y, area.w, Math.min(area.h, fullRows * cellH));
        }
        if (partial > 0 && fullRows < h) {
          ctx.fillRect(area.x, area.y + fullRows * cellH, partial * cellW, cellH);
        }
      }
      ctx.restore();
    });
  }

  function drawAcceleratedEncodingFlights(source, areas, bitsArea, mask, shownBits, totalBits, isDiff, bitView) {
    const ctx = app.ctx;
    const bitsPerComp = app.model.bitsPerComp;
    const compTotal = Math.ceil(totalBits / Math.max(1, bitsPerComp));
    const startComp = Math.floor(shownBits / Math.max(1, bitsPerComp));
    const count = Math.min(18, Math.max(0, compTotal - startComp));
    if (count <= 0) {
      return;
    }
    const colors = [COLOR.alert, COLOR.quant, COLOR.line];
    ctx.save();
    for (let i = 0; i < count; i += 1) {
      const compIndex = startComp + i;
      const pixel = isDiff && source.changedIndices.length
        ? source.changedIndices[Math.floor(compIndex / 3) % source.changedIndices.length]
        : Math.floor(compIndex / 3);
      if (pixel >= source.width * source.height || (mask && !mask[pixel])) {
        continue;
      }
      const ch = compIndex % 3;
      const x = pixel % source.width;
      const y = Math.floor(pixel / source.width);
      const area = areas[ch];
      const srcX = area.x + (x + 0.5) / source.width * area.w;
      const srcY = area.y + (y + 0.5) / source.height * area.h;
      const dst = bitCellCenterFromView(bitView, compIndex * bitsPerComp);
      if (!dst) {
        continue;
      }
      const phase = (seededNoise(compIndex * 17) + app.now * 0.0016) % 1;
      const e = easeInOutCubic(phase);
      const cx = lerp(srcX, dst.x, e);
      const cy = lerp(srcY, dst.y, e) - Math.sin(e * Math.PI) * 28;
      ctx.globalAlpha = 0.12 + 0.5 * Math.sin(e * Math.PI);
      ctx.fillStyle = colors[ch];
      ctx.shadowColor = colors[ch];
      ctx.shadowBlur = 9;
      ctx.beginPath();
      ctx.arc(cx, cy, 4 + 4 * (1 - e), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawActiveEncodingComponent(source, areas, bitsArea, pixel, comp, bitStart, bitsPerComp, local, totalBits, phase, bitView) {
    const ctx = app.ctx;
    const w = source.width;
    const h = source.height;
    const area = areas[comp];
    const x = pixel % w;
    const y = Math.floor(pixel / w);
    const sx = area.x + (x + 0.5) / w * area.w;
    const sy = area.y + (y + 0.5) / h * area.h;
    const target = bitCellCenterFromView(bitView, bitStart);
    if (!target) {
      return;
    }
    const e = phase === "move" ? easeInOutCubic(clamp(local, 0, 1)) : 1;
    const cx = lerp(sx, target.x, e);
    const cy = lerp(sy, target.y, e) - Math.sin(e * Math.PI) * 36;
    const colors = [COLOR.alert, COLOR.quant, COLOR.line];
    const value = source.levelIndices[pixel * 3 + comp] || 0;

    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = colors[comp];
    ctx.shadowColor = colors[comp];
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(cx, cy, 18 - e * 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#061014";
    ctx.font = "900 13px Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(value), cx, cy + 0.5);

    if (phase === "move") {
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = colors[comp];
      ctx.setLineDash([7, 6]);
      ctx.lineDashOffset = -(app.now * 0.12);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(target.x, target.y);
      ctx.stroke();
      ctx.restore();
      return;
    }

    const bits = value.toString(2).padStart(bitsPerComp, "0");
    ctx.font = "900 15px Consolas, monospace";
    for (let i = 0; i < bits.length; i += 1) {
      const p = clamp((local * (bits.length + 0.7) - i) / 0.9, 0, 1);
      if (p <= 0) {
        continue;
      }
      const dst = bitCellCenterFromView(bitView, bitStart + i);
      if (!dst) {
        continue;
      }
      const be = easeOutCubic(p);
      const bx = lerp(cx, dst.x, be);
      const by = lerp(cy, dst.y, be);
      ctx.globalAlpha = 0.28 + p * 0.72;
      ctx.fillStyle = bits[i] === "1" ? COLOR.sample : COLOR.code;
      ctx.fillText(bits[i], bx, by);
    }
    ctx.restore();
  }

  function getEncodingBitView(area, totalBits, shownBits) {
    const safeBits = Math.max(0, Math.floor(totalBits));
    const placed = clamp(Math.floor(shownBits), 0, safeBits);
    const layout = pickBitLayout(area, Math.max(1, placed), true);
    const overflow = Math.max(0, placed - layout.visibleCapacity);
    const scrollRows = Math.floor(overflow / layout.cols);
    const startBit = scrollRows * layout.cols;
    const scrollY = ((overflow - startBit) / layout.cols) * layout.cell;
    return {
      area,
      totalBits: safeBits,
      shownBits: placed,
      cell: layout.cell,
      cols: layout.cols,
      rows: layout.rows,
      visibleRows: layout.visibleRows,
      capacity: layout.capacity,
      visibleCapacity: layout.visibleCapacity,
      startBit,
      scrollY
    };
  }

  function drawEncodingBitGrid(area, view, bitGetter, color) {
    const ctx = app.ctx;
    if (!view || view.totalBits === 0) {
      drawText("差分なし: 保存するビットは0", area.x + area.w / 2, area.y + area.h / 2, 24, COLOR.alert, 1000, "center");
      return;
    }

    const shown = clamp(view.shownBits, 0, view.totalBits);
    const count = Math.min(view.capacity, Math.max(0, shown - view.startBit));
    if (count <= 0) {
      return;
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(area.x, area.y, area.w, area.h);
    ctx.clip();
    ctx.font = "900 " + Math.max(8, view.cell * 0.68) + "px Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < count; i += 1) {
      const bitIndex = view.startBit + i;
      if (bitIndex >= view.totalBits) {
        break;
      }
      const col = i % view.cols;
      const row = Math.floor(i / view.cols);
      const x = area.x + col * view.cell + view.cell / 2;
      const y = area.y + row * view.cell + view.cell / 2 - view.scrollY;
      if (y < area.y - view.cell || y > area.y + area.h + view.cell) {
        continue;
      }
      const bit = bitGetter(bitIndex);
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = bit ? COLOR.sample : color;
      ctx.fillText(bit ? "1" : "0", x, y);
    }
    ctx.restore();
  }

  function bitCellCenterFromView(view, bitIndex) {
    if (!view || bitIndex < view.startBit || bitIndex >= view.startBit + view.capacity) {
      return null;
    }
    const local = bitIndex - view.startBit;
    const col = local % view.cols;
    const row = Math.floor(local / view.cols);
    const x = view.area.x + col * view.cell + view.cell / 2;
    const y = view.area.y + row * view.cell + view.cell / 2 - view.scrollY;
    if (x < view.area.x || x > view.area.x + view.area.w || y < view.area.y || y > view.area.y + view.area.h) {
      return null;
    }
    return { x, y };
  }

  function drawBitCountGrid(area, totalBits, bitGetter, progress, color) {
    const countProgress = clamp(progress, 0, 1);
    drawBitGridLimited(area, totalBits, bitGetter, totalBits, color, Math.floor(totalBits * easeOutCubic(countProgress)));
  }

  function drawBitGrid(area, totalBits, bitGetter, progress, color) {
    drawBitGridLimited(area, totalBits, bitGetter, Math.floor(totalBits * clamp(progress, 0, 1)), color);
  }

  function drawBitGridLimited(area, totalBits, bitGetter, shownBits, color, countedBits) {
    const ctx = app.ctx;
    const safeBits = Math.max(0, totalBits);
    if (safeBits === 0) {
      drawText("差分なし: 保存するビットは0", area.x + area.w / 2, area.y + area.h / 2, 24, COLOR.alert, 1000, "center");
      return;
    }
    const layout = getBitLayout(area, safeBits);
    const cell = layout.cell;
    const cols = layout.cols;
    const capacity = layout.capacity;
    const visible = Math.min(capacity, safeBits);
    const shown = Math.floor(visible * clamp(shownBits / Math.max(1, safeBits), 0, 1));
    const counted = typeof countedBits === "number"
      ? Math.floor(visible * clamp(countedBits / Math.max(1, safeBits), 0, 1))
      : -1;

    ctx.save();
    ctx.beginPath();
    ctx.rect(area.x, area.y, area.w, area.h);
    ctx.clip();
    ctx.font = "900 " + Math.max(10, cell * 0.68) + "px Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < visible; i += 1) {
      if (i >= shown) {
        break;
      }
      const bitIndex = visible === safeBits ? i : Math.floor((i / Math.max(1, visible - 1)) * (safeBits - 1));
      const bit = bitGetter(bitIndex);
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = area.x + col * cell + cell / 2;
      const y = area.y + row * cell + cell / 2;
      ctx.globalAlpha = 0.32 + 0.66 * (i < shown ? 1 : 0);
      ctx.fillStyle = counted >= 0 && i <= counted ? (bit ? COLOR.sample : COLOR.line) : (bit ? COLOR.sample : color);
      ctx.fillText(bit ? "1" : "0", x, y);
    }
    if (counted >= 0 && counted < shown) {
      const row = Math.floor(counted / cols);
      const y = area.y + (row + 1) * cell;
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = COLOR.sample;
      ctx.shadowColor = COLOR.sample;
      ctx.shadowBlur = 12;
      ctx.fillRect(area.x, clamp(y - 1.5, area.y, area.y + area.h - 3), area.w, 3);
    }
    ctx.restore();
  }

  function getBitLayout(area, totalBits) {
    return pickBitLayout(area, totalBits, false);
  }

  function bitCellCenterFromLayout(area, layout, bitIndex) {
    const visibleIndex = clamp(bitIndex, 0, Math.max(0, layout.capacity - 1));
    const col = visibleIndex % layout.cols;
    const row = Math.floor(visibleIndex / layout.cols);
    return {
      x: area.x + col * layout.cell + layout.cell / 2,
      y: area.y + row * layout.cell + layout.cell / 2
    };
  }

  function frameBitAt(frame, bitIndex, bitsPerComp) {
    const bitsPerPixel = bitsPerComp * 3;
    const pixel = Math.floor(bitIndex / bitsPerPixel);
    const within = bitIndex % bitsPerPixel;
    const comp = Math.floor(within / bitsPerComp);
    const bit = within % bitsPerComp;
    const value = frame.levelIndices[pixel * 3 + comp] || 0;
    return (value >> (bitsPerComp - bit - 1)) & 1;
  }

  function diffBitAt(diff, bitIndex, bitsPerComp) {
    if (diff.changedIndices.length === 0) {
      return 0;
    }
    const bitsPerPixel = bitsPerComp * 3;
    const localPixel = Math.floor(bitIndex / bitsPerPixel);
    const pixel = diff.changedIndices[clamp(localPixel, 0, diff.changedIndices.length - 1)];
    const within = bitIndex % bitsPerPixel;
    const comp = Math.floor(within / bitsPerComp);
    const bit = within % bitsPerComp;
    const value = diff.levelIndices[pixel * 3 + comp] || 0;
    return (value >> (bitsPerComp - bit - 1)) & 1;
  }

  function pickBitCell(area, bits) {
    return pickBitLayout(area, bits, false).cell;
  }

  function pickBitLayout(area, bits, extraRow) {
    const need = Math.max(1, Math.floor(bits));
    for (let i = 0; i < BIT_CELLS.length; i += 1) {
      const layout = makeBitLayout(area, BIT_CELLS[i], extraRow);
      if (layout.visibleCapacity >= need) {
        return layout;
      }
    }
    return makeBitLayout(area, BIT_CELLS[BIT_CELLS.length - 1], extraRow);
  }

  function makeBitLayout(area, cell, extraRow) {
    const safeCell = Math.max(4, Math.floor(cell));
    const cols = Math.max(1, Math.floor(area.w / safeCell));
    const visibleRows = Math.max(1, Math.floor(area.h / safeCell));
    const rows = visibleRows + (extraRow ? 1 : 0);
    return {
      cell: safeCell,
      cols,
      rows,
      visibleRows,
      capacity: cols * rows,
      visibleCapacity: cols * visibleRows
    };
  }

  function drawBitBurst(rect, count, progress, color, now, intensity) {
    const ctx = app.ctx;
    const p = clamp(progress, 0, 1);
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    ctx.save();
    ctx.font = "900 18px Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    for (let i = 0; i < count; i += 1) {
      const sx = rect.x + seededNoise(i * 17) * rect.w;
      const sy = rect.y + seededNoise(i * 31) * rect.h;
      const angle = seededNoise(i * 43) * Math.PI * 2;
      const dist = (30 + seededNoise(i * 59) * 130) * p * (intensity || 1);
      const float = Math.sin(now * 0.003 + i) * 12 * p;
      const x = lerp(sx, cx + Math.cos(angle) * dist, easeOutCubic(p)) + float;
      const y = lerp(sy, cy + Math.sin(angle) * dist, easeOutCubic(p)) - float * 0.35;
      ctx.globalAlpha = clamp(p * 1.4, 0, 1) * (0.4 + seededNoise(i * 71) * 0.55);
      ctx.fillStyle = i % 2 ? COLOR.code : color;
      ctx.fillText(i % 2 ? "1" : "0", x, y);
    }
    ctx.restore();
  }

  function drawSizeOverlay(cx, cy, bytes, bits, color, progress) {
    const p = easeOutBack(clamp((progress - 0.24) / 0.76, 0, 1));
    if (p <= 0) {
      return;
    }
    const ctx = app.ctx;
    const w = 260 * p;
    const h = 104 * p;
    ctx.save();
    ctx.globalAlpha = clamp(p, 0, 1) * 0.94;
    ctx.fillStyle = COLOR.panel;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.shadowColor = color;
    ctx.shadowBlur = 20;
    roundedRect(ctx, cx - w / 2, cy - h / 2, w, h, 10);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    drawText(formatBytes(bytes), cx, cy - 8, 42 * p, color, 1000, "center", "Consolas, monospace");
    drawText(formatNumber(bits) + " bit", cx, cy + 30 * p, 18 * p, COLOR.text, 900, "center");
  }

  function drawTinySize(rect, bytes, color, progress) {
    const ctx = app.ctx;
    const p = clamp((progress - 0.3) / 0.7, 0, 1);
    const text = formatBytes(bytes);
    ctx.save();
    ctx.globalAlpha = p * 0.95;
    ctx.font = "900 13px Consolas, monospace";
    const w = ctx.measureText(text).width + 14;
    const h = 22;
    const x = rect.x + rect.w / 2 - w / 2;
    const y = rect.y + rect.h / 2 - h / 2;
    ctx.fillStyle = "rgba(5, 14, 19, 0.9)";
    ctx.strokeStyle = color;
    roundedRect(ctx, x, y, w, h, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, rect.x + rect.w / 2, rect.y + rect.h / 2 + 1);
    ctx.restore();
  }

  function drawSizeCard(cx, cy, title, bits, bytes, color) {
    const ctx = app.ctx;
    const w = 360;
    const h = 126;
    ctx.save();
    ctx.fillStyle = COLOR.panel;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    roundedRect(ctx, cx - w / 2, cy - h / 2, w, h, 10);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    drawText(title, cx, cy - 38, 18, COLOR.muted, 900, "center");
    drawText(formatBytes(bytes), cx, cy + 2, 42, color, 1000, "center", "Consolas, monospace");
    drawText(formatNumber(bits) + " bit", cx, cy + 42, 18, COLOR.text, 900, "center");
  }

  function drawCountingSizeCard(C, title, totalBits, totalBytes, color, progress) {
    const ctx = app.ctx;
    const p = easeOutCubic(clamp(progress, 0, 1));
    const bits = Math.round(totalBits * p);
    const bytes = Math.round(totalBytes * p);
    const w = Math.min(560, C.w * 0.6);
    const h = 112;
    const x = C.x + C.w * 0.5 - w / 2;
    const y = C.y + C.h - h - 8;
    ctx.save();
    ctx.globalAlpha = 0.94;
    ctx.fillStyle = COLOR.panel;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    roundedRect(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    drawText(progress < 1 ? "bitを数えています..." : title + " のデータ量", x + w / 2, y + 28, 19, COLOR.muted, 900, "center");
    drawText(formatNumber(bits) + " bit", x + w * 0.36, y + 68, 35, color, 1000, "center", "Consolas, monospace");
    drawText("= " + formatBytes(bytes), x + w * 0.72, y + 68, 31, COLOR.sample, 1000, "center", "Consolas, monospace");
  }

  function drawMeterCard(cx, cy, title, bytes, maxBytes, color) {
    const ctx = app.ctx;
    const w = Math.min(360, app.width * 0.36);
    const h = 100;
    const ratio = maxBytes > 0 ? clamp(bytes / maxBytes, 0, 1) : 0;
    ctx.save();
    ctx.fillStyle = COLOR.panel;
    ctx.strokeStyle = "rgba(165, 238, 255, 0.24)";
    roundedRect(ctx, cx - w / 2, cy - h / 2, w, h, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    roundedRect(ctx, cx - w / 2 + 22, cy + 18, w - 44, 14, 6);
    ctx.fill();
    ctx.fillStyle = color;
    roundedRect(ctx, cx - w / 2 + 22, cy + 18, (w - 44) * ratio, 14, 6);
    ctx.fill();
    ctx.restore();
    drawText(title, cx, cy - 27, 18, COLOR.muted, 900, "center");
    drawText(formatBytes(bytes), cx, cy + 1, 28, color, 1000, "center", "Consolas, monospace");
  }

  function drawFrameCard(rect, canvas, label, color, alpha, compact) {
    const ctx = app.ctx;
    const card = aspectRect(rect, getSourceFrameAspect());
    const visibleAlpha = typeof alpha === "number" ? alpha : 1;
    drawPanel(card, color, alpha);
    const inner = insetRect(card, compact ? 4 : 7);
    ctx.save();
    ctx.globalAlpha = visibleAlpha;
    ctx.imageSmoothingEnabled = false;
    if (canvas) {
      ctx.drawImage(canvas, inner.x, inner.y, inner.w, inner.h);
    }
    ctx.restore();
    if (visibleAlpha <= 0.04) {
      return;
    }
    if (!compact) {
      drawText(label, card.x + card.w / 2, card.y - 16, 16, color, 900, "center");
    } else {
      drawText(label, card.x + card.w / 2, card.y + card.h + 11, 11, color, 900, "center");
    }
  }

  function drawTiltedFrameCard(rect, canvas, label, color, alpha, angle) {
    const ctx = app.ctx;
    const card = aspectRect(rect, getSourceFrameAspect());
    const visibleAlpha = typeof alpha === "number" ? alpha : 1;
    ctx.save();
    ctx.translate(card.x + card.w / 2, card.y + card.h / 2);
    ctx.rotate(angle || 0);
    ctx.transform(1, 0.06, -0.18, 1, 0, 0);
    const local = { x: -card.w / 2, y: -card.h / 2, w: card.w, h: card.h };
    drawLocalCard(ctx, local, color, alpha);
    const inner = { x: local.x + 6, y: local.y + 6, w: local.w - 12, h: local.h - 12 };
    drawCanvasLocal(ctx, canvas, inner, false, alpha);
    ctx.restore();
    if (visibleAlpha > 0.04) {
      drawText(label, card.x + card.w / 2, card.y + card.h + 14, 12, color, 900, "center");
    }
  }

  function drawTiltedDiffCard(rect, diff, label, color, alpha, angle) {
    const ctx = app.ctx;
    const card = aspectRect(rect, getSourceFrameAspect());
    const visibleAlpha = typeof alpha === "number" ? alpha : 1;
    ctx.save();
    ctx.translate(card.x + card.w / 2, card.y + card.h / 2);
    ctx.rotate(angle || 0);
    ctx.transform(1, 0.06, -0.18, 1, 0, 0);
    const local = { x: -card.w / 2, y: -card.h / 2, w: card.w, h: card.h };
    drawLocalCard(ctx, local, color, alpha);
    const inner = { x: local.x + 6, y: local.y + 6, w: local.w - 12, h: local.h - 12 };
    ctx.save();
    ctx.globalAlpha = (alpha || 1) * 0.95;
    ctx.fillStyle = "rgba(0,0,0,0.42)";
    ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
    drawCanvasLocal(ctx, diff.diffCanvas, inner, false, alpha);
    ctx.restore();
    ctx.restore();
    if (visibleAlpha > 0.04) {
      drawText(label, card.x + card.w / 2, card.y + card.h + 14, 12, color, 900, "center");
    }
  }

  function drawLocalCard(ctx, rect, color, alpha) {
    ctx.save();
    ctx.globalAlpha = typeof alpha === "number" ? alpha : 1;
    ctx.fillStyle = "rgba(5, 14, 19, 0.86)";
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = color;
    ctx.shadowBlur = 13;
    roundedRect(ctx, rect.x, rect.y, rect.w, rect.h, 8);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawCanvasLocal(ctx, canvas, rect, smoothing, alpha) {
    if (!canvas) {
      return;
    }
    ctx.save();
    ctx.globalAlpha = typeof alpha === "number" ? alpha : 1;
    ctx.imageSmoothingEnabled = !!smoothing;
    ctx.drawImage(canvas, rect.x, rect.y, rect.w, rect.h);
    ctx.restore();
  }

  function drawDiffCanvasCard(rect, diff, label, color, alpha, compact) {
    const ctx = app.ctx;
    const card = aspectRect(rect, getSourceFrameAspect());
    const visibleAlpha = typeof alpha === "number" ? alpha : 1;
    drawPanel(card, color, alpha);
    const inner = insetRect(card, compact ? 4 : 7);
    ctx.save();
    ctx.globalAlpha = visibleAlpha;
    ctx.fillStyle = "rgba(0,0,0,0.42)";
    ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(diff.diffCanvas, inner.x, inner.y, inner.w, inner.h);
    drawDifferenceMaskOverlay(inner, diff, alpha);
    ctx.restore();
    if (visibleAlpha <= 0.04) {
      return;
    }
    if (!compact) {
      drawText(label, card.x + card.w / 2, card.y - 16, 16, color, 900, "center");
    } else {
      drawText(label, card.x + card.w / 2, card.y + card.h + 11, 11, color, 900, "center");
    }
  }

  function drawDifferenceMaskOverlay(rect, diff, alpha) {
    const ctx = app.ctx;
    const w = diff.width;
    const h = diff.height;
    const cellW = rect.w / w;
    const cellH = rect.h / h;
    if (Math.min(cellW, cellH) < 6) {
      return;
    }
    ctx.save();
    ctx.globalAlpha = (alpha || 1) * 0.35;
    ctx.strokeStyle = COLOR.alert;
    ctx.lineWidth = 1;
    for (let i = 0; i < diff.changedIndices.length; i += Math.max(1, Math.floor(diff.changedIndices.length / 240))) {
      const p = diff.changedIndices[i];
      const x = p % w;
      const y = Math.floor(p / w);
      ctx.strokeRect(rect.x + x * cellW, rect.y + y * cellH, cellW, cellH);
    }
    ctx.restore();
  }

  function drawPanel(rect, color, alpha) {
    const ctx = app.ctx;
    ctx.save();
    ctx.globalAlpha = typeof alpha === "number" ? alpha : 1;
    ctx.fillStyle = "rgba(5, 14, 19, 0.82)";
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    roundedRect(ctx, rect.x, rect.y, rect.w, rect.h, 8);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawDataAreaFrame(area, color) {
    const ctx = app.ctx;
    ctx.save();
    ctx.fillStyle = "rgba(8, 8, 24, 0.78)";
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
    roundedRect(ctx, area.x, area.y, area.w, area.h, 10);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    drawText("0/1 ビット列", area.x + area.w / 2, area.y - 18, 17, color, 900, "center");
  }

  function drawFilmStrip(frames, active, x, y, w, h, compressed, options = {}) {
    const n = frames.length;
    const rects = getPerspectiveCardRects(n, x, y, w, h);
    const ctx = app.ctx;
    const hiddenIndices = options.hiddenIndices || null;

    ctx.save();
    ctx.fillStyle = "rgba(5, 14, 19, 0.68)";
    roundedRect(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.restore();

    frames.forEach((frame, i) => {
      if (hiddenIndices && hiddenIndices.has(i)) {
        return;
      }
      if (options.hideActive && i === active && !options.activeRect) {
        return;
      }
      const baseRect = rects[i];
      const rect = i === active && options.activeRect ? options.activeRect : baseRect;
      rect.angle = typeof rect.angle === "number" ? rect.angle : (baseRect.angle || 0);
      const isActive = i === active;
      const color = isActive ? COLOR.sample : "rgba(165, 238, 255, 0.3)";
      const canvas = i === active && options.activeCanvas
        ? options.activeCanvas
        : options.quantized
          ? (frame.quantCanvas || frame.sampleCanvas || frame.sourceCanvas)
          : (frame.sourceCanvas || frame.quantCanvas);
      drawTiltedFrameCard(rect, canvas, compressed ? "D" + i : "F" + (i + 1), color, isActive ? 1 : 0.62, rect.angle);
    });
    return rects;
  }

  function drawCompressedStrip(model, activeDiff, x, y, w, h, options = {}) {
    const tiles = makeCompressedTiles(model);
    const ctx = app.ctx;
    const n = tiles.length;
    const active = clamp(activeDiff + 1, 0, n - 1);
    const rects = getPerspectiveCardRects(n, x, y, w, h);
    ctx.save();
    ctx.fillStyle = "rgba(5, 14, 19, 0.68)";
    roundedRect(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.restore();

    rects.forEach((rect, i) => {
      const tile = tiles[i];
      if (options.hideActive && i === active) {
        return;
      }
      if (options.hideDiffs && tile.type === "diff") {
        drawPanel(rect, "rgba(255, 92, 120, 0.16)", 0.26);
        return;
      }
      if (tile.type === "base") {
        drawTiltedFrameCard(rect, tile.frame.quantCanvas || tile.frame.sourceCanvas, "F1", COLOR.line, i === active ? 1 : 0.68, rect.angle);
      } else {
        drawTiltedDiffCard(rect, tile.diff, "D" + tile.index, i === active ? COLOR.alert : "rgba(255, 92, 120, 0.46)", i === active ? 1 : 0.62, rect.angle);
      }
    });
    return rects;
  }

  function getDiffSlotRects(model, C) {
    const count = Math.max(1, model.diffFrames.length);
    const rows = getDiffSlotRows(count, C.w);
    const cols = Math.ceil(count / rows);
    const aspect = getSourceFrameAspect();
    const gapX = rows === 1 ? 8 : 7;
    const gapY = rows === 1 ? 0 : 16;
    const maxW = C.w * 0.94;
    const maxH = Math.max(56, C.h * (rows === 1 ? 0.18 : 0.28));
    const maxCardWByWidth = (maxW - gapX * Math.max(0, cols - 1)) / cols;
    const maxCardWByHeight = ((maxH - gapY * Math.max(0, rows - 1)) / rows) * aspect;
    const maxCardW = rows === 1 ? 118 : 92;
    const cardW = Math.max(24, Math.min(maxCardW, maxCardWByWidth, maxCardWByHeight));
    const cardH = cardW / aspect;
    const totalH = rows * cardH + Math.max(0, rows - 1) * gapY;
    const y = C.y + 8 + Math.max(0, (maxH - totalH) / 2);
    return model.diffFrames.map((diff, i) => ({
      x: getRowStartX(C, i, count, cols, cardW, gapX) + (i % cols) * (cardW + gapX),
      y: y + Math.floor(i / cols) * (cardH + gapY),
      w: cardW,
      h: cardH
    }));
  }

  function getRowStartX(C, index, count, cols, cardW, gap) {
    const row = Math.floor(index / cols);
    const rowCount = Math.min(cols, count - row * cols);
    const totalW = rowCount * cardW + Math.max(0, rowCount - 1) * gap;
    return C.x + C.w / 2 - totalW / 2;
  }

  function getDiffSlotRows(count, width) {
    const safeCount = Math.max(1, count);
    const maxW = Math.max(1, width * 0.94);
    const minReadableW = app.width < 760 ? 42 : 54;
    const gap = 7;
    const oneRowCapacity = Math.max(1, Math.floor((maxW + gap) / (minReadableW + gap)));
    if (safeCount <= oneRowCapacity) {
      return 1;
    }
    if (safeCount <= oneRowCapacity * 2) {
      return 2;
    }
    return 3;
  }

  function getExtractedFrameIndices(model, state) {
    const hidden = new Set();
    const extractedCount = Math.min(model.frames.length - 1, state.ordinal + 1);
    for (let i = 1; i <= extractedCount; i += 1) {
      hidden.add(i);
    }
    return hidden;
  }

  function drawDiffSlots(model, slots, active, phase) {
    slots.forEach((rect, i) => {
      if (i > active) {
        drawPanel(rect, "rgba(255, 92, 120, 0.18)", 0.24);
        return;
      }
      const alpha = i === active ? clamp((phase - 0.54) / 0.22, 0.35, 1) : 0.72;
      drawDiffCanvasCard(rect, model.diffFrames[i], "D" + (i + 1), i === active ? COLOR.alert : "rgba(255, 92, 120, 0.5)", alpha, true);
    });
  }

  function makeCompressedTiles(model) {
    const tiles = [{ type: "base", frame: model.frames[0], index: 1, bytes: model.frameBytes, bits: model.frameBits }];
    model.diffFrames.forEach((diff, i) => {
      tiles.push({ type: "diff", diff, index: i + 1, bytes: diff.bytes, bits: diff.bits });
    });
    return tiles;
  }

  function makeNormalShatterTiles(model) {
    const focus = clamp(app.focusFrameIndex, 0, model.frames.length - 1);
    return model.frames
      .map((frame, index) => ({ type: "full", frame, index, bytes: model.frameBytes, bits: model.frameBits }))
      .filter((tile) => tile.index !== focus);
  }

  function getSingleShatterRect(model, C) {
    return fitRect(model.width, model.height, C.x + C.w * 0.26, C.y + C.h * 0.08, C.w * 0.48, C.h * 0.58);
  }

  function getFocusedShatterRect(model, C) {
    const from = getSingleShatterRect(model, C);
    return {
      x: C.x + 20,
      y: C.y + 18,
      w: from.w * 0.42,
      h: from.h * 0.42
    };
  }

  function getNormalShatterRects(model, C) {
    const tiles = makeNormalShatterTiles(model);
    const base = layoutTiles(tiles.length, C);
    return base;
  }

  function drawLargeFloatingBits(cx, cy, color, now, progress) {
    const ctx = app.ctx;
    const alpha = clamp((progress - 0.86) / 0.14, 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = "1000 38px Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    for (let i = 0; i < 28; i += 1) {
      const a = seededNoise(i * 41) * Math.PI * 2 + now * (0.0007 + seededNoise(i) * 0.00045);
      const r = 188 + Math.sin(now * 0.0013 + i) * 22 + seededNoise(i * 17) * 44;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a * 1.12) * (r * 0.48);
      ctx.fillStyle = i % 2 ? COLOR.code : color;
      ctx.fillText(i % 2 ? "1" : "0", x, y);
    }
    ctx.restore();
  }

  function layoutTiles(count, C) {
    const cols = Math.ceil(Math.sqrt(count * (C.w / Math.max(1, C.h))));
    const rows = Math.ceil(count / cols);
    const gap = 10;
    const tileW = (C.w - gap * (cols - 1)) / cols;
    const tileH = Math.min((C.h * 0.72 - gap * (rows - 1)) / rows, tileW * 0.68);
    const totalH = rows * tileH + (rows - 1) * gap;
    const startY = C.y + C.h * 0.06 + Math.max(0, (C.h * 0.72 - totalH) / 2);
    const rects = [];
    for (let i = 0; i < count; i += 1) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      rects.push({
        x: C.x + col * (tileW + gap),
        y: startY + row * (tileH + gap),
        w: tileW,
        h: tileH
      });
    }
    return rects;
  }

  function drawViewfinder(rect, now) {
    const ctx = app.ctx;
    ctx.save();
    ctx.strokeStyle = "rgba(56, 223, 240, 0.9)";
    ctx.lineWidth = 2;
    ctx.shadowColor = COLOR.line;
    ctx.shadowBlur = 12;
    const l = 42;
    const points = [
      [rect.x, rect.y, 1, 1],
      [rect.x + rect.w, rect.y, -1, 1],
      [rect.x, rect.y + rect.h, 1, -1],
      [rect.x + rect.w, rect.y + rect.h, -1, -1]
    ];
    points.forEach(([x, y, sx, sy]) => {
      ctx.beginPath();
      ctx.moveTo(x, y + sy * l);
      ctx.lineTo(x, y);
      ctx.lineTo(x + sx * l, y);
      ctx.stroke();
    });
    ctx.globalAlpha = 0.35;
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.moveTo(rect.x + rect.w / 3, rect.y);
    ctx.lineTo(rect.x + rect.w / 3, rect.y + rect.h);
    ctx.moveTo(rect.x + rect.w * 2 / 3, rect.y);
    ctx.lineTo(rect.x + rect.w * 2 / 3, rect.y + rect.h);
    ctx.moveTo(rect.x, rect.y + rect.h / 3);
    ctx.lineTo(rect.x + rect.w, rect.y + rect.h / 3);
    ctx.moveTo(rect.x, rect.y + rect.h * 2 / 3);
    ctx.lineTo(rect.x + rect.w, rect.y + rect.h * 2 / 3);
    ctx.stroke();
    const scanY = rect.y + ((now * 0.08) % rect.h);
    ctx.globalAlpha = 0.58;
    ctx.strokeStyle = COLOR.sample;
    ctx.beginPath();
    ctx.moveTo(rect.x, scanY);
    ctx.lineTo(rect.x + rect.w, scanY);
    ctx.stroke();
    ctx.restore();
  }

  function drawVideoElementInRect(video, rect) {
    const ctx = app.ctx;
    drawPanel(rect, COLOR.line, 0.92);
    const inner = insetRect(rect, 7);
    const fit = containRect(video.videoWidth || 16, video.videoHeight || 9, inner);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(video, fit.x, fit.y, fit.w, fit.h);
    ctx.restore();
  }

  function drawCanvasInRect(canvas, rect, options = {}) {
    if (!canvas) {
      return;
    }
    const ctx = app.ctx;
    const fit = containRect(canvas.width || 16, canvas.height || 9, rect);
    ctx.save();
    ctx.imageSmoothingEnabled = !!options.smoothing;
    ctx.drawImage(canvas, fit.x, fit.y, fit.w, fit.h);
    ctx.restore();
  }

  function drawSampleToPreview(now) {
    app.previewCanvas.width = 640;
    app.previewCanvas.height = 360;
    drawSampleScene(app.previewCanvas.getContext("2d"), 640, 360, now * 0.001);
  }

  function drawSampleScene(ctx, w, h, t) {
    const sky = ctx.createLinearGradient(0, 0, w, h);
    sky.addColorStop(0, "#1fcbe0");
    sky.addColorStop(0.38, "#f7d46c");
    sky.addColorStop(0.76, "#f06e8d");
    sky.addColorStop(1, "#26285e");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < 28; i += 1) {
      const x = seededNoise(i * 17) * w;
      const y = seededNoise(i * 23) * h * 0.55;
      ctx.beginPath();
      ctx.arc(x, y, 2 + seededNoise(i * 41) * 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.fillStyle = "#102733";
    ctx.beginPath();
    ctx.moveTo(0, h * 0.72);
    for (let x = 0; x <= w; x += 40) {
      ctx.lineTo(x, h * (0.58 + 0.08 * Math.sin(x * 0.013 + t * 0.9)));
    }
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#75f09a";
    ctx.fillRect(0, h * 0.77, w, h * 0.23);

    for (let i = 0; i < 6; i += 1) {
      const x = 70 + i * 100;
      const y = h * 0.62 + Math.sin(i + t * 1.1) * 8;
      ctx.fillStyle = i % 2 ? "#38dff0" : "#ffd166";
      roundedRect(ctx, x, y, 58, 74, 7);
      ctx.fill();
      ctx.fillStyle = "#0b1a21";
      ctx.beginPath();
      ctx.arc(x + 29, y - 8, 17, 0, Math.PI * 2);
      ctx.fill();
    }

    const ballX = (w * 0.12 + (t / DURATION_SECONDS % 1) * w * 0.74);
    const ballY = h * (0.47 + 0.13 * Math.sin(t * Math.PI * 2));
    const r = 34;
    const ball = ctx.createRadialGradient(ballX - r * 0.3, ballY - r * 0.3, r * 0.1, ballX, ballY, r);
    ball.addColorStop(0, "#ffffff");
    ball.addColorStop(0.28, "#ffd166");
    ball.addColorStop(1, "#ff5c78");
    ctx.fillStyle = ball;
    ctx.shadowColor = "#ff5c78";
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(ballX, ballY, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    const frameNo = Math.floor((t * RAW_FPS) % RAW_FRAME_COUNT) + 1;
    ctx.fillStyle = "rgba(5, 16, 22, 0.42)";
    ctx.fillRect(0, h - 36, 146, 36);
    ctx.fillStyle = "#f1fbff";
    ctx.font = "900 18px Consolas, monospace";
    ctx.textAlign = "left";
    ctx.fillText("F" + String(frameNo).padStart(2, "0"), 12, h - 13);
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
      ctx.fillStyle = i % 2 ? COLOR.code : COLOR.quant;
      ctx.fillText(i % 2 ? "1" : "0", x, y);
    }
    ctx.restore();
  }

  function activeFrameIndex(model, now, fps) {
    const elapsed = Math.max(0, now - app.stepStartedAt);
    return Math.floor((elapsed / 1000) * fps) % Math.max(1, model.frames.length);
  }

  function getFrameSequenceActiveIndex(model, now) {
    return getFrameSequenceState(model, now).active;
  }

  function getFrameSequenceState(model, now) {
    const count = Math.max(1, model.frames.length);
    const elapsed = Math.max(0, now - app.stepStartedAt);
    const slowCycle = 980;
    const fastCycle = 300;
    const slowWindow = 5200;
    let cycle = slowCycle;
    let ordinal;
    let within;
    if (elapsed < slowWindow) {
      ordinal = Math.floor(elapsed / slowCycle);
      within = elapsed - ordinal * slowCycle;
    } else {
      const slowOrdinal = Math.floor(slowWindow / slowCycle);
      const fastElapsed = elapsed - slowWindow;
      cycle = fastCycle;
      ordinal = slowOrdinal + Math.floor(fastElapsed / fastCycle);
      within = fastElapsed % fastCycle;
    }
    const active = ordinal % count;
    return {
      active,
      previous: (active - 1 + count) % count,
      phase: clamp(within / cycle, 0, 1),
      cycle,
      hasPrevious: ordinal > 0
    };
  }

  function getDiffReconstructionActiveIndex(model, now) {
    if (!model.diffFrames.length) {
      return 0;
    }
    return getDiffReconstructionState(model, now).active;
  }

  function getDiffPairState(model, now) {
    const count = Math.max(1, model.diffFrames.length);
    const elapsed = Math.max(0, now - app.stepStartedAt);
    const slowCycle = 2600;
    const fastCycle = 1600;
    const slowCycles = Math.min(2, count);
    const slowWindow = slowCycle * slowCycles;
    const totalDuration = slowWindow + Math.max(0, count - slowCycles) * fastCycle;
    if (elapsed >= totalDuration) {
      return { active: count - 1, ordinal: count - 1, phase: 1, cycle: fastCycle, done: true };
    }
    let ordinal;
    let within;
    let cycle;
    if (elapsed < slowWindow) {
      cycle = slowCycle;
      ordinal = Math.floor(elapsed / slowCycle);
      within = elapsed - ordinal * slowCycle;
    } else {
      cycle = fastCycle;
      const fastElapsed = elapsed - slowWindow;
      ordinal = slowCycles + Math.floor(fastElapsed / fastCycle);
      within = fastElapsed % fastCycle;
    }
    return { active: clamp(ordinal, 0, count - 1), ordinal, phase: clamp(within / cycle, 0, 1), cycle, done: false };
  }

  function getDiffReconstructionState(model, now) {
    const count = Math.max(1, model.diffFrames.length);
    const introMs = 1300;
    const elapsed = Math.max(0, now - app.stepStartedAt - introMs);
    const slowCycle = 2400;
    const fastCycle = 1500;
    const slowCycles = Math.min(2, count);
    const slowWindow = slowCycle * slowCycles;
    let ordinal;
    let within;
    let cycle;
    if (elapsed < slowWindow) {
      cycle = slowCycle;
      ordinal = Math.floor(elapsed / slowCycle);
      within = elapsed - ordinal * slowCycle;
    } else {
      cycle = fastCycle;
      const fastElapsed = elapsed - slowWindow;
      ordinal = slowCycles + Math.floor(fastElapsed / fastCycle);
      within = fastElapsed % fastCycle;
    }
    return { active: ordinal % count, phase: clamp(within / cycle, 0, 1), cycle, introMs };
  }

  function slideElapsed(now) {
    return Math.max(0, now - app.stepStartedAt);
  }

  function repeatingProgress(elapsed, duration) {
    return (elapsed % duration) / duration;
  }

  function onceProgress(elapsed, duration) {
    return clamp(elapsed / Math.max(1, duration), 0, 1);
  }

  function getContentRect() {
    const top = app.width < 760 ? 150 : 104;
    const bottom = (app.step === 9 || app.step === 18) ? 246 : 122;
    return {
      x: 34,
      y: top,
      w: Math.max(220, app.width - 68),
      h: Math.max(180, app.height - top - bottom)
    };
  }

  function getSourceFrameAspect() {
    const model = app.model;
    const frame = model && model.frames && model.frames[0];
    const canvas = frame && frame.sourceCanvas;
    if (canvas && canvas.width && canvas.height) {
      return canvas.width / canvas.height;
    }
    if (app.rawFrames[0] && app.rawFrames[0].width && app.rawFrames[0].height) {
      return app.rawFrames[0].width / app.rawFrames[0].height;
    }
    return 16 / 9;
  }

  function aspectRect(rect, aspect) {
    let w = rect.w;
    let h = w / aspect;
    if (h > rect.h) {
      h = rect.h;
      w = h * aspect;
    }
    return {
      x: rect.x + (rect.w - w) / 2,
      y: rect.y + (rect.h - h) / 2,
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

  function movieSamplingPhotoRect(C, model) {
    return fitRect(getSourceFrameAspect(), 1, C.x + C.w * 0.02, C.y + C.h * 0.07, C.w * 0.44, C.h * 0.84);
  }

  function movieSamplingDotRect(C, model) {
    return fitRect(getSourceFrameAspect(), 1, C.x + C.w * 0.52, C.y + C.h * 0.07, C.w * 0.46, C.h * 0.84);
  }

  function movieGatherDotRect(C, model) {
    return fitRect(getSourceFrameAspect(), 1, C.x + C.w * 0.36, C.y, C.w * 0.28, C.h * 0.26);
  }

  function movieQuantChannelAreas(C, model) {
    const region = subRegion(C, 0.02, 0.24, 0.96, 0.64);
    const gapX = Math.max(14, region.w * 0.03);
    const cellW = (region.w - gapX * 2) / 3;
    return [0, 1, 2].map((index) => ({
      x: region.x + index * (cellW + gapX),
      y: region.y,
      w: cellW,
      h: region.h
    }));
  }

  function movieEncodeChannelAreas(C, model) {
    const region = subRegion(C, 0.01, 0.07, 0.2, 0.86);
    const gapY = Math.max(10, region.h * 0.03);
    const cellH = (region.h - gapY * 2) / 3;
    return [0, 1, 2].map((index) => fitRect(getSourceFrameAspect(), 1, region.x, region.y + index * (cellH + gapY), region.w, cellH));
  }

  function movieCodeArea(C, sizeOnly) {
    return sizeOnly ? subRegion(C, 0.06, 0.05, 0.73, 0.82) : subRegion(C, 0.26, 0.05, 0.53, 0.82);
  }

  function getFrameStripArea(C, count) {
    const rows = getFrameStripRows(count, C.w);
    const desiredH = rows === 1 ? 126 : rows === 2 ? 172 : 222;
    const maxH = Math.max(126, C.h * 0.48);
    const h = Math.min(desiredH, maxH);
    return {
      x: C.x,
      y: C.y + C.h - h,
      w: C.w,
      h
    };
  }

  function getPerspectiveCardRects(count, x, y, w, h) {
    const safeCount = Math.max(1, count);
    const aspect = getSourceFrameAspect();
    const rows = getFrameStripRows(safeCount, w);
    const cols = Math.ceil(safeCount / rows);
    const spacingRatio = 0.63;
    const rowSlotH = Math.max(24, (h - 22) / rows);
    const labelSpace = rows === 1 ? 20 : 17;
    const maxWByWidth = w / (1 + Math.max(0, cols - 1) * spacingRatio);
    const maxWByHeight = Math.max(14, (rowSlotH - labelSpace) * aspect);
    const maxCardW = rows === 1 ? 165 : 132;
    const cardW = Math.max(18, Math.min(maxWByWidth, maxWByHeight, maxCardW));
    const cardH = Math.max(12, Math.min(rowSlotH - labelSpace, cardW / aspect));
    const rects = [];
    for (let i = 0; i < safeCount; i += 1) {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const rowCount = Math.min(cols, safeCount - row * cols);
      const rowSpacing = cardW * spacingRatio;
      const totalW = cardW + Math.max(0, rowCount - 1) * rowSpacing;
      const startX = x + w / 2 - totalW / 2;
      const mid = (rowCount - 1) / 2;
      const rowFan = col - mid;
      const lift = Math.abs(rowFan) * (rows === 1 ? 2 : 0.55);
      const scale = Math.max(rows === 1 ? 0.92 : 0.96, 1 - Math.abs(rowFan) * (rows === 1 ? 0.012 : 0.004));
      const rw = cardW * scale;
      const rh = cardH * scale;
      rects.push({
        x: startX + col * rowSpacing + (cardW - rw) / 2,
        y: y + 11 + row * rowSlotH + Math.max(0, (rowSlotH - labelSpace - rh) / 2) + lift,
        w: rw,
        h: rh,
        angle: rowFan * (rows === 1 ? 0.035 : 0.014)
      });
    }
    return rects;
  }

  function getFrameStripRows(count, width) {
    const safeCount = Math.max(1, count);
    const minReadableW = app.width < 760 ? 52 : 78;
    const spacingRatio = 0.63;
    const oneRowCapacity = Math.max(1, Math.floor((Math.max(1, width) / minReadableW - 1) / spacingRatio + 1));
    if (safeCount <= oneRowCapacity) {
      return 1;
    }
    if (safeCount <= oneRowCapacity * 2) {
      return 2;
    }
    return 3;
  }

  function interpolateRect(a, b, t) {
    return {
      x: lerp(a.x, b.x, t),
      y: lerp(a.y, b.y, t),
      w: lerp(a.w, b.w, t),
      h: lerp(a.h, b.h, t)
    };
  }

  function fitRect(srcW, srcH, x, y, w, h) {
    return containRect(srcW, srcH, { x, y, w, h });
  }

  function containRect(srcW, srcH, rect) {
    const ratio = Math.min(rect.w / Math.max(1, srcW), rect.h / Math.max(1, srcH));
    const w = srcW * ratio;
    const h = srcH * ratio;
    return {
      x: rect.x + (rect.w - w) / 2,
      y: rect.y + (rect.h - h) / 2,
      w,
      h
    };
  }

  function insetRect(rect, pad) {
    return {
      x: rect.x + pad,
      y: rect.y + pad,
      w: Math.max(1, rect.w - pad * 2),
      h: Math.max(1, rect.h - pad * 2)
    };
  }

  function drawArrow(x1, y1, x2, y2, color, alpha) {
    const ctx = app.ctx;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - Math.cos(angle - 0.55) * 16, y2 - Math.sin(angle - 0.55) * 16);
    ctx.lineTo(x2 - Math.cos(angle + 0.55) * 16, y2 - Math.sin(angle + 0.55) * 16);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawText(text, x, y, size, color, weight, align, family) {
    const ctx = app.ctx;
    ctx.save();
    ctx.fillStyle = color;
    ctx.font = (weight || 900) + " " + Math.max(1, size) + "px " + (family || "'Yu Gothic', sans-serif");
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function drawFittedText(text, x, y, maxW, size, color, weight, align, family) {
    const ctx = app.ctx;
    let fs = size;
    ctx.save();
    ctx.font = (weight || 900) + " " + fs + "px " + (family || "'Yu Gothic', sans-serif");
    while (fs > 9 && ctx.measureText(text).width > maxW) {
      fs -= 1;
      ctx.font = (weight || 900) + " " + fs + "px " + (family || "'Yu Gothic', sans-serif");
    }
    ctx.fillStyle = color;
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

  function scaledParticleCount(bytes, maxCount) {
    const model = app.model || ensureModel();
    const ratio = model.frameBytes > 0 ? bytes / model.frameBytes : 1;
    return clamp(Math.round(24 + maxCount * Math.sqrt(Math.max(0.02, ratio))), 16, maxCount);
  }

  function updateUI() {
    const stepInfo = STEPS[app.step] || STEPS[0];
    dom.slideTitle.textContent = app.started ? (app.capturing ? "動画撮影中" : stepInfo.title) : "準備中";
    dom.slideBadge.textContent = "SLIDE " + (app.step + 1) + " / " + STEPS.length;
    dom.fpsBadge.textContent = app.params.fps + " fps";
    dom.resolutionBadge.textContent = app.params.width + " × " + app.params.height;

    let sourceText = "入力: 待機";
    if (app.capturing) {
      sourceText = "入力: 撮影中";
    } else if (app.cameraState === "starting") {
      sourceText = "入力: カメラ起動中";
    } else if (app.sourceMode === "camera") {
      sourceText = "入力: Webカメラ";
    } else if (app.sourceMode === "sample") {
      sourceText = "入力: サンプル動画";
    }
    dom.sourceBadge.textContent = sourceText;

    const hasModel = !!app.model;
    const dataVisible = hasModel && app.step >= 5 && app.step !== 9 && app.step !== 18;
    dom.dataBadge.hidden = !dataVisible;
    if (dataVisible) {
      const value = app.step >= 10 ? app.model.compressedBytes : app.model.totalBytes;
      dom.dataBadge.textContent = formatBytes(value);
    }

    dom.cameraPanel.hidden = !(app.started && app.step === 0 && !app.capturing);
    dom.adjustPanel.hidden = !(app.started && (app.step === 9 || app.step === 18) && !app.capturing);

    dom.fpsRange.value = String(app.params.fps);
    dom.fpsOutput.textContent = app.params.fps + "fps";
    dom.widthRange.value = String(app.params.width);
    dom.widthOutput.textContent = String(app.params.width);
    dom.heightRange.value = String(app.params.height);
    dom.heightOutput.textContent = String(app.params.height);
    const levelIndex = LEVEL_VALUES.indexOf(app.params.levels);
    dom.levelRange.value = String(levelIndex >= 0 ? levelIndex + 1 : LEVEL_VALUES.length);
    dom.levelOutput.textContent = String(app.params.levels);
    dom.compressButton.classList.toggle("is-on", app.compressEnabled);
    dom.compressButton.setAttribute("aria-checked", app.compressEnabled ? "true" : "false");
    const switchLabel = dom.compressButton.querySelector(".switch-label");
    if (switchLabel) {
      switchLabel.textContent = app.compressEnabled ? "圧縮 ON" : "圧縮 OFF";
    }

    const infoVisible = false;
    dom.infoPanel.hidden = !infoVisible;
    if (infoVisible) {
      updateInfoStats(app.model);
    }
    updateLegend();
  }

  function updateInfoStats(model) {
    const compressed = app.step >= 10;
    const rows = [
      ["表示フレーム", model.frames.length + "枚"],
      ["撮影素材", RAW_FPS + "fps × " + DURATION_SECONDS + "秒"],
      ["解像度", model.width + " × " + model.height],
      ["階調", model.levels + "階調"],
      ["1画素", model.pixelBits + " bit"],
      ["1フレーム", formatBytes(model.frameBytes)]
    ];

    if (compressed) {
      rows.push(["差分フレーム", model.diffFrames.length + "枚"]);
      rows.push(["圧縮後", formatBytes(model.compressedBytes)]);
      rows.push(["通常保存", formatBytes(model.totalBytes)]);
      rows.push(["削減", formatBytes(Math.max(0, model.totalBytes - model.compressedBytes))]);
    } else {
      rows.push(["合計", formatBytes(model.totalBytes)]);
      rows.push(["合計bit", formatNumber(model.totalBits) + " bit"]);
    }

    dom.infoStats.innerHTML = rows
      .map(([k, v]) => "<dt>" + k + "</dt><dd>" + v + "</dd>")
      .join("");
  }

  function updateLegend() {
    const stage = app.capturing ? "camera" : (STEPS[app.step] || STEPS[0]).stage;
    const activeIndex = STAGE_ORDER.indexOf(stage);
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

  function formatBytes(bytes) {
    const value = Math.max(0, Math.round(bytes));
    if (value >= 1024 * 1024) {
      return (value / (1024 * 1024)).toFixed(2) + " MB";
    }
    if (value >= 1024) {
      return (value / 1024).toFixed(value >= 100 * 1024 ? 0 : 1) + " KB";
    }
    return formatNumber(value) + " B";
  }

  function formatCompressionParam(compressed) {
    return compressed ? "圧縮ON" : "圧縮OFF";
  }

  function formatNumber(value) {
    return Math.round(value).toLocaleString("ja-JP");
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
    const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  window.MovieDigital = {
    start: startExperience,
    goToStep: enterStep,
    state: () => ({
      step: app.step,
      started: app.started,
      frames: app.model ? app.model.frames.length : 0,
      fps: app.params.fps,
      size: app.model ? app.model.totalBytes : 0,
      compressedSize: app.model ? app.model.compressedBytes : 0
    }),
    renderStep: (step, elapsedMs) => {
      if (!app.started) {
        app.started = true;
        dom.startOverlay.classList.add("is-hidden");
      }
      ensureModel();
      enterStep(step, { noSplash: true });
      app.stepStartedAt = performance.now() - Math.max(0, elapsedMs || 0);
      draw(performance.now());
      updateUI();
    }
  };
})();
