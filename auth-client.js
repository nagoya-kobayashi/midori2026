(function (window, document) {
  "use strict";

  var DEFAULT_CONFIG = {
    GAS_ENDPOINT: "",
    PUBLIC_BASE_URL: "",
    AUTH_BASE_PATH: "/midori2026/auth/",
    STORAGE_PREFIX: "midori.auth.",
    PASSWORD_HASH_ITERATIONS: 100000,
    ONE_TIME_TICKET_PARAM: "ticket",
    RETURN_TO_PARAM: "returnTo",
    DEFAULT_DEVICE_NAME: "browser",
  };

  var DEFAULT_OPTIONS = {
    appId: "unknown",
    appName: "学習アプリ",
    authRequired: false,
    showLoginButton: false,
    mount: null,
  };

  var state = {
    config: merge(DEFAULT_CONFIG, window.MIDORI_AUTH_CONFIG || {}),
    options: merge(DEFAULT_OPTIONS, {}),
    lastResult: null,
    styleInjected: false,
  };

  function merge(target) {
    var result = {};
    var i;
    var key;
    for (i = 0; i < arguments.length; i += 1) {
      var source = arguments[i] || {};
      for (key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
          result[key] = source[key];
        }
      }
    }
    return result;
  }

  function storageKey(name) {
    return String(state.config.STORAGE_PREFIX || "midori.auth.") + name;
  }

  function safeLocalStorageGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function safeLocalStorageSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (error) {
      return false;
    }
  }

  function safeLocalStorageRemove(key) {
    try {
      window.localStorage.removeItem(key);
      return true;
    } catch (error) {
      return false;
    }
  }

  function init(options) {
    state.config = merge(DEFAULT_CONFIG, window.MIDORI_AUTH_CONFIG || {}, options && options.config);
    state.options = merge(DEFAULT_OPTIONS, options || {});
    getDeviceId();
    getDeviceName();
    return MidoriAuth;
  }

  async function start(options) {
    init(options || {});
    var ticketResult = await consumeOneTimeTicketIfPresent();
    if (ticketResult.ok && ticketResult.mode === "user") {
      state.lastResult = ticketResult;
      renderAuthWidget(ticketResult, state.options);
      dispatchAuthEvent("midori-auth-state", ticketResult);
      return ticketResult;
    }

    var session = getStoredSession();
    if (session.userId && session.loginToken) {
      try {
        var verified = await verifyToken();
        if (verified.ok && verified.mode === "user") {
          state.lastResult = verified;
          renderAuthWidget(verified, state.options);
          dispatchAuthEvent("midori-auth-state", verified);
          return verified;
        }
        clearStoredSession();
      } catch (error) {
        if (state.options.authRequired !== true) {
          var networkGuest = guestResult(error.reason || "network_error");
          state.lastResult = networkGuest;
          renderAuthWidget(networkGuest, state.options);
          dispatchAuthEvent("midori-auth-state", networkGuest);
          return networkGuest;
        }
      }
    }

    if (state.options.authRequired === true) {
      try {
        var loginResult = await showLoginDialog({
          appName: state.options.appName,
          required: true,
        });
        state.lastResult = loginResult;
        renderAuthWidget(loginResult, state.options);
        dispatchAuthEvent("midori-auth-state", loginResult);
        return loginResult;
      } catch (error) {
        var requiredFailed = {
          ok: false,
          mode: "required",
          authenticated: false,
          user: null,
          deviceId: getDeviceId(),
          reason: error.reason || "auth_failed",
        };
        state.lastResult = requiredFailed;
        renderAuthWidget(requiredFailed, state.options);
        dispatchAuthEvent("midori-auth-state", requiredFailed);
        return requiredFailed;
      }
    }

    var reason = session.userId || session.loginToken ? "token_invalid" : "not_logged_in";
    if (ticketResult && ticketResult.reason && ticketResult.reason !== "no_ticket") {
      reason = ticketResult.reason;
    }
    var guest = guestResult(reason);
    state.lastResult = guest;
    renderAuthWidget(guest, state.options);
    dispatchAuthEvent("midori-auth-state", guest);
    return guest;
  }

  function requireLogin(options) {
    return start(merge(options || {}, { authRequired: true }));
  }

  async function verifyToken() {
    var session = getStoredSession();
    if (!session.userId || !session.loginToken) {
      var notLogged = guestResult("not_logged_in");
      state.lastResult = notLogged;
      return notLogged;
    }

    try {
      var response = await post("verifyToken", {
        userId: session.userId,
        loginToken: session.loginToken,
        deviceId: getDeviceId(),
      });

      if (!response.ok) {
        clearStoredSession();
        var failed = guestResult(response.error === "token_invalid" ? "token_invalid" : "auth_failed");
        state.lastResult = failed;
        return failed;
      }

      var result = userResult(response.user, session.loginToken);
      safeLocalStorageSet(storageKey("lastUser"), JSON.stringify(normalizeUser(response.user)));
      state.lastResult = result;
      return result;
    } catch (error) {
      error.reason = error.reason || "network_error";
      throw error;
    }
  }

  async function login(userId, password, options) {
    var loginOptions = options || {};
    var normalizedUserId = String(userId || "").trim();
    if (!normalizedUserId || !password) {
      throw authError("auth_failed", "ユーザIDとパスワードを入力してください。");
    }

    var saltResponse = await post("getSalt", { userId: normalizedUserId });
    if (!saltResponse.ok || !saltResponse.salt) {
      throw authError(saltResponse.error || "auth_failed", "ユーザIDまたはパスワードを確認してください。");
    }

    var passwordHash = await hashPassword(password, saltResponse.salt);

    // 旧タイピングシステムから移行したユーザは、LegacySalt/LegacyPasswordHash で認証する。
    // 新形式と旧形式 (sha256(password+salt) の hex) を両方送り、サーバ側でいずれかが
    // 一致すれば認証成功。一致した時点でサーバが新ハッシュを保存して旧フィールドをクリアする。
    var loginParams = {
      userId: normalizedUserId,
      passwordHash: passwordHash,
      deviceId: getDeviceId(),
      deviceName: loginOptions.deviceName || getDeviceName(),
    };
    if (saltResponse.legacyMode && saltResponse.legacySalt) {
      loginParams.legacyPasswordHash = legacyHashHex(password, saltResponse.legacySalt);
    }

    var response = await post("login", loginParams);

    if (!response.ok || !response.loginToken) {
      clearStoredSession();
      throw authError(response.error || "auth_failed", "ログインできませんでした。");
    }

    saveSession(normalizedUserId, response.loginToken, response.user);
    return userResult(response.user, response.loginToken);
  }

  // 認証済みのときのみ、GAS 経由で生徒名簿 (Students シート) を取得する。
  // 戻り値: { ok: true, students: [{id, year, class, no, name, kana, sex}, ...], headers, count }
  // 未ログインや token 不一致のときは { ok: false, reason: "auth_required" } 等を返す。
  // ネットワーク/サーバ障害は throw する。
  async function fetchStudentRoster() {
    var session = getStoredSession();
    if (!session.userId || !session.loginToken) {
      return { ok: false, reason: "not_logged_in" };
    }

    var response;
    try {
      response = await post("getStudentRoster", {
        userId: session.userId,
        loginToken: session.loginToken,
        deviceId: getDeviceId(),
      });
    } catch (error) {
      throw error;
    }

    if (!response || !response.ok) {
      var reason = response && response.error ? response.error : "auth_required";
      return { ok: false, reason: reason };
    }

    return {
      ok: true,
      students: Array.isArray(response.students) ? response.students : [],
      headers: Array.isArray(response.headers) ? response.headers : [],
      count: Number(response.count) || (Array.isArray(response.students) ? response.students.length : 0),
    };
  }

  async function logout() {
    var session = getStoredSession();
    var deviceId = getDeviceId();
    clearStoredSession();

    if (!session.userId || !session.loginToken) {
      var alreadyGuest = guestResult("not_logged_in");
      state.lastResult = alreadyGuest;
      renderAuthWidget(alreadyGuest, state.options);
      dispatchAuthEvent("midori-auth-logout", alreadyGuest);
      return { ok: true };
    }

    try {
      await post("logout", {
        userId: session.userId,
        loginToken: session.loginToken,
        deviceId: deviceId,
      });
    } catch (error) {
      /* Local logout is still complete even if the server cannot be reached. */
    }

    var result = guestResult("not_logged_in");
    state.lastResult = result;
    renderAuthWidget(result, state.options);
    dispatchAuthEvent("midori-auth-logout", result);
    return { ok: true };
  }

  function showLoginDialog(options) {
    var dialogOptions = options || {};
    ensureWidgetStyle();

    return new Promise(function (resolve, reject) {
      var overlay = document.createElement("div");
      overlay.className = "midori-auth-dialog-overlay";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");

      var panel = document.createElement("div");
      panel.className = "midori-auth-dialog";

      var title = document.createElement("h2");
      title.textContent = (dialogOptions.appName || state.options.appName || "学習アプリ") + " にログイン";

      var message = document.createElement("p");
      message.className = "midori-auth-dialog-message";
      message.textContent = "ユーザIDとパスワードを入力してください。";

      var form = document.createElement("form");
      form.className = "midori-auth-login-form";

      var userLabel = labelWithInput("ユーザID", "text", "username");
      userLabel.input.value =
        (safeLocalStorageGet(storageKey("userId")) || readLastUserId() || "").trim();
      userLabel.input.autocomplete = "username";

      var passwordLabel = labelWithInput("パスワード", "password", "current-password");
      passwordLabel.input.autocomplete = "current-password";

      var deviceLabel = labelWithInput("端末名", "text", "off");
      deviceLabel.input.value = getDeviceName();

      var errorBox = document.createElement("div");
      errorBox.className = "midori-auth-dialog-error";
      errorBox.setAttribute("aria-live", "polite");

      var actions = document.createElement("div");
      actions.className = "midori-auth-dialog-actions";

      var loginButton = document.createElement("button");
      loginButton.type = "submit";
      loginButton.className = "midori-auth-primary";
      loginButton.textContent = "ログイン";

      var cancelButton = document.createElement("button");
      cancelButton.type = "button";
      cancelButton.textContent = dialogOptions.required ? "閉じる" : "キャンセル";

      actions.appendChild(loginButton);
      actions.appendChild(cancelButton);
      form.appendChild(userLabel.label);
      form.appendChild(passwordLabel.label);
      form.appendChild(deviceLabel.label);
      form.appendChild(errorBox);
      form.appendChild(actions);

      panel.appendChild(title);
      panel.appendChild(message);
      panel.appendChild(form);
      overlay.appendChild(panel);
      document.body.appendChild(overlay);

      function close() {
        if (overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
      }

      cancelButton.addEventListener("click", function () {
        close();
        reject(authError("login_cancelled", "ログインをキャンセルしました。"));
      });

      form.addEventListener("submit", async function (event) {
        event.preventDefault();
        errorBox.textContent = "";
        loginButton.disabled = true;
        loginButton.textContent = "確認中...";

        try {
          safeLocalStorageSet(storageKey("deviceName"), deviceLabel.input.value || getDeviceName());
          var result = await login(userLabel.input.value, passwordLabel.input.value, {
            deviceName: deviceLabel.input.value || getDeviceName(),
          });
          passwordLabel.input.value = "";
          close();
          state.lastResult = result;
          renderAuthWidget(result, state.options);
          dispatchAuthEvent("midori-auth-login", result);
          resolve(result);
        } catch (error) {
          errorBox.textContent = error.userMessage || "ログインできませんでした。";
          loginButton.disabled = false;
          loginButton.textContent = "ログイン";
        }
      });

      setTimeout(function () {
        if (userLabel.input.value) {
          passwordLabel.input.focus();
        } else {
          userLabel.input.focus();
        }
      }, 0);
    });
  }

  async function consumeOneTimeTicketIfPresent() {
    var paramName = state.config.ONE_TIME_TICKET_PARAM || "ticket";
    var url;
    try {
      url = new URL(window.location.href);
    } catch (error) {
      return { ok: false, reason: "no_ticket" };
    }

    var ticket = url.searchParams.get(paramName);
    if (!ticket) {
      return { ok: false, reason: "no_ticket" };
    }

    // 成否にかかわらずURLからチケットを除去する。チケットはワンタイムなので残すと混乱の元になる。
    url.searchParams.delete(paramName);
    try {
      window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
    } catch (replaceError) {
      /* ignore */
    }

    try {
      var response = await post("consumeOneTimeTicket", {
        ticket: ticket,
        deviceId: getDeviceId(),
        deviceName: getDeviceName(),
      });

      if (!response.ok || !response.loginToken) {
        clearStoredSession();
        return guestResult(response.error === "token_invalid" ? "token_invalid" : "auth_failed");
      }

      saveSession(response.user && response.user.userId, response.loginToken, response.user);
      return userResult(response.user, response.loginToken);
    } catch (error) {
      return guestResult(error.reason || "network_error");
    }
  }

  function getDeviceId() {
    var key = storageKey("deviceId");
    var existing = safeLocalStorageGet(key);
    if (existing) {
      return existing;
    }

    var id = "dev_" + randomId();
    safeLocalStorageSet(key, id);
    return id;
  }

  function getDeviceName() {
    var key = storageKey("deviceName");
    var existing = safeLocalStorageGet(key);
    if (existing) {
      return existing;
    }

    var name = state.config.DEFAULT_DEVICE_NAME || "browser";
    safeLocalStorageSet(key, name);
    return name;
  }

  function getStoredSession() {
    return {
      userId: safeLocalStorageGet(storageKey("userId")) || "",
      loginToken: safeLocalStorageGet(storageKey("loginToken")) || "",
      deviceId: getDeviceId(),
      deviceName: getDeviceName(),
    };
  }

  function clearStoredSession() {
    safeLocalStorageRemove(storageKey("userId"));
    safeLocalStorageRemove(storageKey("loginToken"));
  }

  // PBKDF2-HMAC-SHA256 でパスワードハッシュを計算する。
  // - HTTPS / localhost では Web Crypto (window.crypto.subtle) を利用する。
  // - 校内HTTPサーバなど secure context で動かない環境では純JS実装にフォールバックする。
  // どちらも入力が同じなら同じバイト列を返すため、サーバ側に保存したハッシュは
  // HTTPSでもHTTPでも同じように検証できる。
  async function hashPassword(password, salt) {
    var encoder = new TextEncoder();
    var passwordBytes = encoder.encode(String(password));
    var saltBytes = encoder.encode(String(salt));
    var iterations = Number(state.config.PASSWORD_HASH_ITERATIONS || 100000);
    var bits = null;

    if (window.crypto && window.crypto.subtle) {
      try {
        var keyMaterial = await window.crypto.subtle.importKey(
          "raw",
          passwordBytes,
          { name: "PBKDF2" },
          false,
          ["deriveBits"]
        );
        var buffer = await window.crypto.subtle.deriveBits(
          {
            name: "PBKDF2",
            salt: saltBytes,
            iterations: iterations,
            hash: "SHA-256",
          },
          keyMaterial,
          256
        );
        bits = new Uint8Array(buffer);
      } catch (error) {
        bits = null;
      }
    }

    if (!bits) {
      bits = pbkdf2HmacSha256(passwordBytes, saltBytes, iterations, 32);
    }

    return uint8ArrayToBase64(bits);
  }

  // ---- 純JS版 SHA-256 / HMAC-SHA256 / PBKDF2-HMAC-SHA256 ----
  // PBKDF2 の出力は仕様上、入力が同じなら実装に依らず同一バイト列になる。
  // Web Crypto で生成したハッシュとビット単位で一致する必要があるため、
  // RFC 2898 / RFC 6234 に従って素直に実装している。

  var SHA256_K = [
    0x428a2f98 | 0, 0x71374491 | 0, 0xb5c0fbcf | 0, 0xe9b5dba5 | 0,
    0x3956c25b | 0, 0x59f111f1 | 0, 0x923f82a4 | 0, 0xab1c5ed5 | 0,
    0xd807aa98 | 0, 0x12835b01 | 0, 0x243185be | 0, 0x550c7dc3 | 0,
    0x72be5d74 | 0, 0x80deb1fe | 0, 0x9bdc06a7 | 0, 0xc19bf174 | 0,
    0xe49b69c1 | 0, 0xefbe4786 | 0, 0x0fc19dc6 | 0, 0x240ca1cc | 0,
    0x2de92c6f | 0, 0x4a7484aa | 0, 0x5cb0a9dc | 0, 0x76f988da | 0,
    0x983e5152 | 0, 0xa831c66d | 0, 0xb00327c8 | 0, 0xbf597fc7 | 0,
    0xc6e00bf3 | 0, 0xd5a79147 | 0, 0x06ca6351 | 0, 0x14292967 | 0,
    0x27b70a85 | 0, 0x2e1b2138 | 0, 0x4d2c6dfc | 0, 0x53380d13 | 0,
    0x650a7354 | 0, 0x766a0abb | 0, 0x81c2c92e | 0, 0x92722c85 | 0,
    0xa2bfe8a1 | 0, 0xa81a664b | 0, 0xc24b8b70 | 0, 0xc76c51a3 | 0,
    0xd192e819 | 0, 0xd6990624 | 0, 0xf40e3585 | 0, 0x106aa070 | 0,
    0x19a4c116 | 0, 0x1e376c08 | 0, 0x2748774c | 0, 0x34b0bcb5 | 0,
    0x391c0cb3 | 0, 0x4ed8aa4a | 0, 0x5b9cca4f | 0, 0x682e6ff3 | 0,
    0x748f82ee | 0, 0x78a5636f | 0, 0x84c87814 | 0, 0x8cc70208 | 0,
    0x90befffa | 0, 0xa4506ceb | 0, 0xbef9a3f7 | 0, 0xc67178f2 | 0,
  ];

  function sha256InitialState() {
    return [
      0x6a09e667 | 0, 0xbb67ae85 | 0, 0x3c6ef372 | 0, 0xa54ff53a | 0,
      0x510e527f | 0, 0x9b05688c | 0, 0x1f83d9ab | 0, 0x5be0cd19 | 0,
    ];
  }

  // 1ブロック (64バイト) を圧縮し、state を更新する。
  function sha256CompressBlock(stateArr, block, blockOffset) {
    var W = new Array(64);
    var i;
    for (i = 0; i < 16; i += 1) {
      var p = blockOffset + i * 4;
      W[i] = ((block[p] << 24) | (block[p + 1] << 16) | (block[p + 2] << 8) | block[p + 3]) | 0;
    }
    for (i = 16; i < 64; i += 1) {
      var x = W[i - 15];
      var s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
      var y = W[i - 2];
      var s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
    }
    var a = stateArr[0], b = stateArr[1], c = stateArr[2], d = stateArr[3];
    var e = stateArr[4], f = stateArr[5], g = stateArr[6], h = stateArr[7];
    for (i = 0; i < 64; i += 1) {
      var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      var ch = (e & f) ^ (~e & g);
      var t1 = (h + S1 + ch + SHA256_K[i] + W[i]) | 0;
      var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      var mj = (a & b) ^ (a & c) ^ (b & c);
      var t2 = (S0 + mj) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    stateArr[0] = (stateArr[0] + a) | 0;
    stateArr[1] = (stateArr[1] + b) | 0;
    stateArr[2] = (stateArr[2] + c) | 0;
    stateArr[3] = (stateArr[3] + d) | 0;
    stateArr[4] = (stateArr[4] + e) | 0;
    stateArr[5] = (stateArr[5] + f) | 0;
    stateArr[6] = (stateArr[6] + g) | 0;
    stateArr[7] = (stateArr[7] + h) | 0;
  }

  function sha256Bytes(input) {
    var stateArr = sha256InitialState();
    var msgLen = input.length;
    var bitLen = msgLen * 8;
    var paddedLen = ((msgLen + 9 + 63) >>> 6) << 6;
    var padded = new Uint8Array(paddedLen);
    padded.set(input);
    padded[msgLen] = 0x80;
    // 末尾8バイトに 64bit big-endian でビット長。
    // パスワード/Salt 用途では bitLen は 2^32 未満なので上位4バイトは0で良い。
    padded[paddedLen - 4] = (bitLen >>> 24) & 0xff;
    padded[paddedLen - 3] = (bitLen >>> 16) & 0xff;
    padded[paddedLen - 2] = (bitLen >>> 8) & 0xff;
    padded[paddedLen - 1] = bitLen & 0xff;
    for (var off = 0; off < paddedLen; off += 64) {
      sha256CompressBlock(stateArr, padded, off);
    }
    var out = new Uint8Array(32);
    for (var i = 0; i < 8; i += 1) {
      out[i * 4] = (stateArr[i] >>> 24) & 0xff;
      out[i * 4 + 1] = (stateArr[i] >>> 16) & 0xff;
      out[i * 4 + 2] = (stateArr[i] >>> 8) & 0xff;
      out[i * 4 + 3] = stateArr[i] & 0xff;
    }
    return out;
  }

  // HMAC-SHA256 を、鍵側の前処理済み state を再利用して計算するためのヘルパ。
  // PBKDF2 では同じ鍵 (パスワード) で何万回も HMAC を計算するので、
  // ipad/opad を入れた 1 ブロック分の state を一度だけ作って使い回すと、
  // 1 回あたりの圧縮回数を半分に減らせる (実測で約2倍速)。
  function buildHmacContext(key) {
    var k = key;
    if (k.length > 64) {
      k = sha256Bytes(k);
    }
    var paddedKey = new Uint8Array(64);
    paddedKey.set(k);

    var ipadBlock = new Uint8Array(64);
    var opadBlock = new Uint8Array(64);
    for (var i = 0; i < 64; i += 1) {
      ipadBlock[i] = paddedKey[i] ^ 0x36;
      opadBlock[i] = paddedKey[i] ^ 0x5c;
    }
    var innerInit = sha256InitialState();
    sha256CompressBlock(innerInit, ipadBlock, 0);
    var outerInit = sha256InitialState();
    sha256CompressBlock(outerInit, opadBlock, 0);
    return { innerInit: innerInit, outerInit: outerInit };
  }

  // 既に ipad ブロックを処理済みの状態 (innerInit) を起点に、メッセージを足して
  // SHA-256 を完了させ、その結果を opad 済み状態 (outerInit) で再度ハッシュする。
  function hmacFinalize(ctx, message) {
    var inner = ctx.innerInit.slice(0);
    // 仮想的な合計長: 64 (ipadブロック) + message.length バイト。
    var totalLen = 64 + message.length;
    var bitLen = totalLen * 8;
    // メッセージ部分を64バイト境界でパディングする。
    var msgLen = message.length;
    var paddedLen = ((msgLen + 9 + 63) >>> 6) << 6;
    var padded = new Uint8Array(paddedLen);
    padded.set(message);
    padded[msgLen] = 0x80;
    padded[paddedLen - 4] = (bitLen >>> 24) & 0xff;
    padded[paddedLen - 3] = (bitLen >>> 16) & 0xff;
    padded[paddedLen - 2] = (bitLen >>> 8) & 0xff;
    padded[paddedLen - 1] = bitLen & 0xff;
    for (var off = 0; off < paddedLen; off += 64) {
      sha256CompressBlock(inner, padded, off);
    }

    var innerDigest = new Uint8Array(32);
    for (var i = 0; i < 8; i += 1) {
      innerDigest[i * 4] = (inner[i] >>> 24) & 0xff;
      innerDigest[i * 4 + 1] = (inner[i] >>> 16) & 0xff;
      innerDigest[i * 4 + 2] = (inner[i] >>> 8) & 0xff;
      innerDigest[i * 4 + 3] = inner[i] & 0xff;
    }

    // 外側: outerInit (opadブロック処理済み) + innerDigest (32バイト) を仕上げる。
    var outer = ctx.outerInit.slice(0);
    var outerTotalLen = 64 + 32;
    var outerBitLen = outerTotalLen * 8;
    // 32バイトのメッセージなのでパディング後ちょうど64バイト。
    var outerBlock = new Uint8Array(64);
    outerBlock.set(innerDigest);
    outerBlock[32] = 0x80;
    outerBlock[60] = (outerBitLen >>> 24) & 0xff;
    outerBlock[61] = (outerBitLen >>> 16) & 0xff;
    outerBlock[62] = (outerBitLen >>> 8) & 0xff;
    outerBlock[63] = outerBitLen & 0xff;
    sha256CompressBlock(outer, outerBlock, 0);

    var out = new Uint8Array(32);
    for (var j = 0; j < 8; j += 1) {
      out[j * 4] = (outer[j] >>> 24) & 0xff;
      out[j * 4 + 1] = (outer[j] >>> 16) & 0xff;
      out[j * 4 + 2] = (outer[j] >>> 8) & 0xff;
      out[j * 4 + 3] = outer[j] & 0xff;
    }
    return out;
  }

  function pbkdf2HmacSha256(password, salt, iterations, dkLen) {
    var hLen = 32;
    var blocks = Math.ceil(dkLen / hLen);
    var output = new Uint8Array(blocks * hLen);
    var ctx = buildHmacContext(password);

    for (var blockIndex = 1; blockIndex <= blocks; blockIndex += 1) {
      var saltBlock = new Uint8Array(salt.length + 4);
      saltBlock.set(salt);
      saltBlock[salt.length] = (blockIndex >>> 24) & 0xff;
      saltBlock[salt.length + 1] = (blockIndex >>> 16) & 0xff;
      saltBlock[salt.length + 2] = (blockIndex >>> 8) & 0xff;
      saltBlock[salt.length + 3] = blockIndex & 0xff;

      var u = hmacFinalize(ctx, saltBlock);
      var t = new Uint8Array(u);
      for (var iter = 1; iter < iterations; iter += 1) {
        u = hmacFinalize(ctx, u);
        for (var k = 0; k < hLen; k += 1) {
          t[k] ^= u[k];
        }
      }
      output.set(t, (blockIndex - 1) * hLen);
    }
    return output.subarray(0, dkLen);
  }

  // 旧タイピングシステム互換のハッシュ。sha256(password + salt) を hex 小文字で返す。
  // dual-hash ログイン（移行直後の初回ログイン）でのみ使う。
  function legacyHashHex(password, salt) {
    var encoder = new TextEncoder();
    var input = encoder.encode(String(password) + String(salt));
    var digest = sha256Bytes(input);
    var hex = "";
    for (var i = 0; i < digest.length; i += 1) {
      var byte = digest[i];
      hex += (byte < 16 ? "0" : "") + byte.toString(16);
    }
    return hex;
  }

  function uint8ArrayToBase64(bytes) {
    var binary = "";
    var chunkSize = 0x8000;
    for (var i = 0; i < bytes.length; i += chunkSize) {
      var chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, chunk);
    }
    return window.btoa(binary);
  }

  // ---- ここまで純JS版ハッシュ ----

  async function post(action, params) {
    var endpoint = String(state.config.GAS_ENDPOINT || "").trim();
    if (!endpoint || endpoint.indexOf("ここに") === 0) {
      throw authError("gas_error", "GASエンドポイントが設定されていません。");
    }

    var body = new URLSearchParams();
    body.set("action", action);
    var input = params || {};
    Object.keys(input).forEach(function (key) {
      if (input[key] !== undefined && input[key] !== null) {
        body.set(key, String(input[key]));
      }
    });

    var response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: body.toString(),
        credentials: "omit",
      });
    } catch (error) {
      throw authError("network_error", "認証サーバに接続できません。");
    }

    if (!response.ok) {
      throw authError("network_error", "認証サーバから正常な応答がありません。");
    }

    try {
      return await response.json();
    } catch (error) {
      throw authError("gas_error", "認証サーバの応答を読み取れません。");
    }
  }

  function saveSession(userId, loginToken, user) {
    if (userId) {
      safeLocalStorageSet(storageKey("userId"), String(userId));
    }
    safeLocalStorageSet(storageKey("loginToken"), String(loginToken));
    if (user) {
      safeLocalStorageSet(storageKey("lastUser"), JSON.stringify(user));
    }
  }

  function userResult(user, loginToken) {
    var normalizedUser = normalizeUser(user);
    if (loginToken) {
      safeLocalStorageSet(storageKey("loginToken"), String(loginToken));
    }
    return {
      ok: true,
      mode: "user",
      authenticated: true,
      user: normalizedUser,
      deviceId: getDeviceId(),
    };
  }

  function guestResult(reason) {
    return {
      ok: true,
      mode: "guest",
      authenticated: false,
      user: null,
      deviceId: getDeviceId(),
      reason: reason || "not_logged_in",
    };
  }

  function normalizeUser(user) {
    var source = user || {};
    var role = String(source.role || source.Role || "user").toLowerCase();
    if (role !== "admin") {
      role = "user";
    }
    return {
      userId: String(source.userId || source.UserId || ""),
      classId: String(source.classId || source.ClassId || ""),
      number: String(source.number || source.Number || ""),
      displayName: String(source.displayName || source.DisplayName || ""),
      role: role,
    };
  }

  function readLastUserId() {
    var raw = safeLocalStorageGet(storageKey("lastUser"));
    if (!raw) {
      return "";
    }
    try {
      var parsed = JSON.parse(raw);
      return parsed && parsed.userId ? String(parsed.userId) : "";
    } catch (error) {
      return "";
    }
  }

  function renderAuthWidget(result, options) {
    var widgetOptions = merge(state.options, options || {});
    if (!widgetOptions.showLoginButton && !widgetOptions.mount) {
      return;
    }

    ensureWidgetStyle();
    var mount = resolveMount(widgetOptions.mount);
    var widget = mount.querySelector(".midori-auth-widget");
    if (!widget) {
      widget = document.createElement("div");
      widget.className = "midori-auth-widget";
      mount.appendChild(widget);
    }

    widget.innerHTML = "";
    var status = document.createElement("div");
    status.className = "midori-auth-widget-status";
    if (result.mode === "user") {
      status.textContent =
        "ログイン中: " +
        (result.user.displayName || result.user.userId || "ユーザ");
    } else {
      status.textContent = "未ログイン";
    }
    widget.appendChild(status);

    var actions = document.createElement("div");
    actions.className = "midori-auth-widget-actions";

    if (result.mode !== "user" && widgetOptions.showLoginButton) {
      var loginButton = document.createElement("button");
      loginButton.type = "button";
      loginButton.textContent = "ログイン";
      loginButton.addEventListener("click", async function () {
        try {
          var loggedIn = await showLoginDialog({ appName: widgetOptions.appName });
          renderAuthWidget(loggedIn, widgetOptions);
        } catch (error) {
          renderAuthWidget(guestResult(error.reason || "auth_failed"), widgetOptions);
        }
      });
      actions.appendChild(loginButton);
    }

    if (result.mode === "user") {
      var logoutButton = document.createElement("button");
      logoutButton.type = "button";
      logoutButton.textContent = "ログアウト";
      logoutButton.addEventListener("click", function () {
        logout();
      });
      actions.appendChild(logoutButton);
    }

    if (actions.childNodes.length > 0) {
      widget.appendChild(actions);
    }
  }

  function resolveMount(mount) {
    if (mount && mount.nodeType === 1) {
      return mount;
    }
    if (typeof mount === "string") {
      var selected = document.querySelector(mount);
      if (selected) {
        return selected;
      }
    }
    return document.body;
  }

  function labelWithInput(text, type, autocomplete) {
    var label = document.createElement("label");
    label.className = "midori-auth-field";
    var span = document.createElement("span");
    span.textContent = text;
    var input = document.createElement("input");
    input.type = type;
    input.autocomplete = autocomplete || "off";
    label.appendChild(span);
    label.appendChild(input);
    return { label: label, input: input };
  }

  function ensureWidgetStyle() {
    if (state.styleInjected) {
      return;
    }
    var style = document.createElement("style");
    style.textContent =
      ".midori-auth-widget{font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;border:1px solid #cbd5e1;background:#fff;padding:10px 12px;margin:8px 0;border-radius:8px;max-width:480px;color:#0f172a;box-shadow:0 2px 8px rgba(15,23,42,.08)}" +
      ".midori-auth-widget-status{font-weight:700;font-size:14px}.midori-auth-widget-actions{margin-top:8px;display:flex;gap:8px;flex-wrap:wrap}" +
      ".midori-auth-widget button,.midori-auth-dialog button{appearance:none;border:1px solid #94a3b8;background:#fff;color:#0f172a;border-radius:6px;padding:8px 12px;font:inherit;cursor:pointer}" +
      ".midori-auth-widget button:hover,.midori-auth-dialog button:hover{background:#f8fafc}.midori-auth-dialog-overlay{position:fixed;inset:0;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;z-index:2147483000;padding:16px}" +
      ".midori-auth-dialog{width:min(420px,100%);background:#fff;color:#0f172a;border-radius:8px;padding:20px;box-shadow:0 20px 60px rgba(15,23,42,.25);font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}" +
      ".midori-auth-dialog h2{font-size:20px;margin:0 0 8px}.midori-auth-dialog-message{font-size:14px;color:#475569;margin:0 0 16px}.midori-auth-login-form{display:grid;gap:12px}.midori-auth-field{display:grid;gap:6px;font-size:14px;font-weight:700}" +
      ".midori-auth-field input{box-sizing:border-box;width:100%;border:1px solid #94a3b8;border-radius:6px;padding:9px 10px;font:inherit}.midori-auth-dialog-error{min-height:20px;color:#b91c1c;font-size:13px}.midori-auth-dialog-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}.midori-auth-dialog .midori-auth-primary{background:#0f766e;border-color:#0f766e;color:#fff}.midori-auth-dialog .midori-auth-primary:hover{background:#115e59}";
    document.head.appendChild(style);
    state.styleInjected = true;
  }

  function randomId() {
    if (window.crypto && window.crypto.getRandomValues) {
      var bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      return Array.prototype.map
        .call(bytes, function (byte) {
          return byte.toString(16).padStart(2, "0");
        })
        .join("");
    }
    return String(Date.now()) + "_" + Math.random().toString(36).slice(2);
  }

  function authError(reason, userMessage) {
    var error = new Error(userMessage || reason || "auth_error");
    error.reason = reason || "auth_failed";
    error.userMessage = userMessage || "認証処理に失敗しました。";
    return error;
  }

  function dispatchAuthEvent(name, detail) {
    try {
      window.dispatchEvent(new CustomEvent(name, { detail: detail }));
    } catch (error) {
      var event = document.createEvent("CustomEvent");
      event.initCustomEvent(name, false, false, detail);
      window.dispatchEvent(event);
    }
  }

  var MidoriAuth = {
    init: init,
    start: start,
    requireLogin: requireLogin,
    verifyToken: verifyToken,
    login: login,
    logout: logout,
    showLoginDialog: showLoginDialog,
    consumeOneTimeTicketIfPresent: consumeOneTimeTicketIfPresent,
    getDeviceId: getDeviceId,
    getDeviceName: getDeviceName,
    getStoredSession: getStoredSession,
    clearStoredSession: clearStoredSession,
    hashPassword: hashPassword,
    fetchStudentRoster: fetchStudentRoster,
    post: post,
  };

  window.MidoriAuth = MidoriAuth;
})(window, document);
