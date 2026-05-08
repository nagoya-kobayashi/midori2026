(function () {
  "use strict";

  var elements = {};
  var state = {
    users: [],
    sessions: [],
    logs: [],
    authUser: null,
  };

  document.addEventListener("DOMContentLoaded", function () {
    collectElements();
    MidoriAuth.init({ appId: "auth-admin", appName: "共通認証 管理画面" });
    bindEvents();
    boot();
  });

  function collectElements() {
    var ids = [
      "connectionPanel",
      "connectionStatus",
      "message",
      "bootstrapPanel",
      "bootstrapForm",
      "bootstrapUserId",
      "bootstrapDisplayName",
      "bootstrapPassword",
      "bootstrapPasswordConfirm",
      "loginPanel",
      "loginForm",
      "loginUserId",
      "loginPassword",
      "adminPanel",
      "currentAdminName",
      "logoutButton",
      "setupSheets",
      "cleanupSessions",
      "cleanupLogs",
      "usersSection",
      "refreshUsers",
      "userForm",
      "userId",
      "classId",
      "number",
      "displayName",
      "role",
      "disabled",
      "userSearch",
      "usersBody",
      "migrationSection",
      "legacyImportFile",
      "legacyOverwriteHash",
      "legacyImportButton",
      "legacyImportSummary",
      "exportUsersButton",
      "bulkUpsertFile",
      "bulkUpsertButton",
      "bulkUpsertSummary",
      "sessionsSection",
      "sessionUserId",
      "refreshSessions",
      "revokeUserSessions",
      "revokeAllSessions",
      "sessionsBody",
      "logsSection",
      "refreshLogs",
      "logsBody",
    ];
    ids.forEach(function (id) {
      elements[id] = document.getElementById(id);
    });
  }

  function bindEvents() {
    elements.bootstrapForm.addEventListener("submit", handleBootstrap);
    elements.loginForm.addEventListener("submit", handleLogin);
    elements.logoutButton.addEventListener("click", handleLogout);
    elements.setupSheets.addEventListener("click", setupSheets);
    elements.cleanupSessions.addEventListener("click", cleanupSessions);
    elements.cleanupLogs.addEventListener("click", cleanupLogs);
    elements.refreshUsers.addEventListener("click", refreshUsers);
    elements.userForm.addEventListener("submit", saveUser);
    elements.userSearch.addEventListener("input", renderUsers);
    elements.legacyImportFile.addEventListener("change", function () {
      elements.legacyImportButton.disabled = !elements.legacyImportFile.files || !elements.legacyImportFile.files.length;
    });
    elements.legacyImportButton.addEventListener("click", importLegacyUsers);
    elements.exportUsersButton.addEventListener("click", exportUsers);
    elements.bulkUpsertFile.addEventListener("change", function () {
      elements.bulkUpsertButton.disabled = !elements.bulkUpsertFile.files || !elements.bulkUpsertFile.files.length;
    });
    elements.bulkUpsertButton.addEventListener("click", bulkUpsertUsers);
    elements.refreshSessions.addEventListener("click", refreshSessions);
    elements.revokeUserSessions.addEventListener("click", revokeUserSessions);
    elements.revokeAllSessions.addEventListener("click", revokeAllSessions);
    elements.refreshLogs.addEventListener("click", refreshLogs);
  }

  async function boot() {
    elements.connectionStatus.textContent = "認証サーバの状態を確認しています。";
    showOnly(["connectionPanel"]);

    try {
      var status = await MidoriAuth.post("bootstrapStatus", {});
      if (!status.ok) {
        elements.connectionStatus.textContent = "認証サーバの応答が異常です: " + safeError(status);
        return;
      }
      elements.connectionStatus.textContent = "認証サーバに接続できました。";

      if (status.needsBootstrap) {
        showOnly(["connectionPanel", "bootstrapPanel"]);
        return;
      }

      await tryAutoLogin();
    } catch (error) {
      elements.connectionStatus.textContent =
        "認証サーバに接続できません: " + (error.userMessage || error.message || "network_error");
    }
  }

  async function tryAutoLogin() {
    var session = MidoriAuth.getStoredSession();
    if (!session.userId || !session.loginToken) {
      showLoginPanel();
      return;
    }
    try {
      var verified = await MidoriAuth.verifyToken();
      if (verified.mode === "user" && verified.user && verified.user.role === "admin") {
        enterAdminMode(verified.user);
        return;
      }
      if (verified.mode === "user") {
        setMessage("このユーザは管理者権限を持っていません。", "error");
        await MidoriAuth.logout();
      }
      showLoginPanel();
    } catch (error) {
      showLoginPanel();
      setMessage("接続できません。少し待ってから再度お試しください。", "error");
    }
  }

  function showLoginPanel() {
    elements.loginUserId.value = MidoriAuth.getStoredSession().userId || "";
    elements.loginPassword.value = "";
    showOnly(["connectionPanel", "loginPanel"]);
    setTimeout(function () {
      if (elements.loginUserId.value) {
        elements.loginPassword.focus();
      } else {
        elements.loginUserId.focus();
      }
    }, 0);
  }

  function enterAdminMode(user) {
    state.authUser = user;
    elements.currentAdminName.textContent = user.displayName || user.userId;
    showOnly([
      "connectionPanel",
      "adminPanel",
      "usersSection",
      "migrationSection",
      "sessionsSection",
      "logsSection",
    ]);
    setMessage("ログインしました。", "ok");
    refreshUsers();
  }

  async function handleBootstrap(event) {
    event.preventDefault();
    var userId = elements.bootstrapUserId.value.trim();
    var displayName = elements.bootstrapDisplayName.value.trim() || "管理者";
    var password = elements.bootstrapPassword.value;
    var confirm = elements.bootstrapPasswordConfirm.value;

    if (!userId || !password) {
      setMessage("ユーザIDとパスワードを入力してください。", "error");
      return;
    }
    if (password !== confirm) {
      setMessage("パスワードと確認用パスワードが一致しません。", "error");
      return;
    }

    var submitButton = elements.bootstrapForm.querySelector("button[type='submit']");
    submitButton.disabled = true;
    try {
      var salt = generateClientSalt();
      var passwordHash = await MidoriAuth.hashPassword(password, salt);
      var result = await MidoriAuth.post("bootstrap", {
        userId: userId,
        salt: salt,
        passwordHash: passwordHash,
        displayName: displayName,
      });
      if (!result.ok) {
        setMessage("管理者を登録できません: " + safeError(result), "error");
        return;
      }
      setMessage("管理者を登録しました。続けてログインしてください。", "ok");
      elements.bootstrapPassword.value = "";
      elements.bootstrapPasswordConfirm.value = "";
      // bootstrap直後はそのままユーザIDを引き継いでログインフォームへ
      elements.loginUserId.value = userId;
      elements.loginPassword.focus();
      showOnly(["connectionPanel", "loginPanel"]);
    } catch (error) {
      setMessage(error.userMessage || error.message || "管理者を登録できません。", "error");
    } finally {
      submitButton.disabled = false;
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    var submitButton = elements.loginForm.querySelector("button[type='submit']");
    submitButton.disabled = true;
    try {
      var loggedIn = await MidoriAuth.login(
        elements.loginUserId.value,
        elements.loginPassword.value,
        { deviceName: "auth-admin" }
      );
      elements.loginPassword.value = "";
      if (loggedIn.user.role !== "admin") {
        setMessage("このユーザは管理者権限を持っていません。", "error");
        await MidoriAuth.logout();
        return;
      }
      enterAdminMode(loggedIn.user);
    } catch (error) {
      setMessage(error.userMessage || "ログインできませんでした。", "error");
    } finally {
      submitButton.disabled = false;
    }
  }

  async function handleLogout() {
    await MidoriAuth.logout();
    state.authUser = null;
    state.users = [];
    state.sessions = [];
    state.logs = [];
    elements.usersBody.innerHTML = "";
    elements.sessionsBody.innerHTML = "";
    elements.logsBody.innerHTML = "";
    setMessage("ログアウトしました。", "ok");
    showLoginPanel();
  }

  async function setupSheets() {
    await runButton(elements.setupSheets, async function () {
      var result = await adminPost("setupSheets", {});
      if (result.ok) {
        setMessage("シートを同期しました。", "ok");
      } else {
        handleAdminError(result, "シート同期に失敗しました");
      }
    });
  }

  async function cleanupSessions() {
    await runButton(elements.cleanupSessions, async function () {
      var result = await adminPost("cleanupSessions", { olderThanDays: "30" });
      if (result.ok) {
        setMessage("失効済みSessionを" + (result.removed || 0) + "件削除しました。", "ok");
        await refreshSessions();
      } else {
        handleAdminError(result, "Sessionsを整理できません");
      }
    });
  }

  async function cleanupLogs() {
    await runButton(elements.cleanupLogs, async function () {
      var result = await adminPost("cleanupLogs", { keepLast: "2000" });
      if (result.ok) {
        setMessage("古いLogsを" + (result.removed || 0) + "件削除しました。", "ok");
      } else {
        handleAdminError(result, "Logsを整理できません");
      }
    });
  }

  async function refreshUsers() {
    await runButton(elements.refreshUsers, async function () {
      var result = await adminPost("listUsers", {});
      if (!result.ok) {
        handleAdminError(result, "Usersを取得できません");
        return;
      }
      state.users = result.users || [];
      renderUsers();
      setMessage("Usersを読み込みました。", "ok");
    });
  }

  async function saveUser(event) {
    event.preventDefault();
    await runButton(elements.userForm.querySelector("button[type='submit']"), async function () {
      var result = await adminPost("createOrUpdateUser", {
        userId: elements.userId.value.trim(),
        classId: elements.classId.value.trim(),
        number: elements.number.value.trim(),
        displayName: elements.displayName.value.trim(),
        role: elements.role.value,
        disabled: elements.disabled.checked ? "TRUE" : "FALSE",
      });

      if (!result.ok) {
        handleAdminError(result, "ユーザを保存できません");
        return;
      }

      setMessage("ユーザを保存しました。", "ok");
      await refreshUsers();
    });
  }

  function renderUsers() {
    var query = elements.userSearch.value.trim().toLowerCase();
    var users = state.users.filter(function (user) {
      if (!query) {
        return true;
      }
      return [user.userId, user.classId, user.number, user.displayName, user.role]
        .join(" ")
        .toLowerCase()
        .indexOf(query) !== -1;
    });

    elements.usersBody.innerHTML = "";
    users.forEach(function (user) {
      var tr = document.createElement("tr");
      tr.appendChild(td(user.userId));
      tr.appendChild(td(user.classId));
      tr.appendChild(td(user.number));
      tr.appendChild(td(user.displayName));
      tr.appendChild(td(user.role));
      tr.appendChild(td(user.hasPassword ? "設定済み" : "未設定"));
      tr.appendChild(statusTd(user.disabled ? "無効" : "有効", !user.disabled));

      var actionCell = document.createElement("td");
      actionCell.appendChild(actionButton("編集", function () {
        elements.userId.value = user.userId || "";
        elements.classId.value = user.classId || "";
        elements.number.value = user.number || "";
        elements.displayName.value = user.displayName || "";
        elements.role.value = user.role === "admin" ? "admin" : "user";
        elements.disabled.checked = !!user.disabled;
        elements.userId.focus();
      }));
      actionCell.appendChild(actionButton(user.disabled ? "有効化" : "無効化", function () {
        setUserDisabled(user.userId, !user.disabled);
      }));
      actionCell.appendChild(actionButton("Session表示", function () {
        elements.sessionUserId.value = user.userId;
        refreshSessions();
      }));
      actionCell.appendChild(actionButton("全Session失効", function () {
        revokeSessionsForUserId(user.userId);
      }));
      tr.appendChild(actionCell);
      elements.usersBody.appendChild(tr);
    });
  }

  async function setUserDisabled(userId, disabled) {
    var result = await adminPost("setUserDisabled", {
      userId: userId,
      disabled: disabled ? "TRUE" : "FALSE",
    });
    if (!result.ok) {
      handleAdminError(result, "状態を変更できません");
      return;
    }
    setMessage(disabled ? "ユーザを無効化しました。" : "ユーザを有効化しました。", "ok");
    await refreshUsers();
  }

  async function refreshSessions() {
    await runButton(elements.refreshSessions, async function () {
      var result = await adminPost("listSessions", {
        userId: elements.sessionUserId.value.trim(),
      });
      if (!result.ok) {
        handleAdminError(result, "Sessionsを取得できません");
        return;
      }
      state.sessions = result.sessions || [];
      renderSessions();
      setMessage("Sessionsを読み込みました。", "ok");
    });
  }

  function renderSessions() {
    elements.sessionsBody.innerHTML = "";
    state.sessions.forEach(function (session) {
      var tr = document.createElement("tr");
      tr.appendChild(td(session.sessionId));
      tr.appendChild(td(session.userId));
      tr.appendChild(td(session.deviceId));
      tr.appendChild(td(session.deviceName));
      tr.appendChild(td(session.createdAt));
      tr.appendChild(td(session.lastUsedAt));
      tr.appendChild(td(session.expiresAt || "無期限"));
      tr.appendChild(statusTd(session.revoked ? "失効" : "有効", !session.revoked));
      var actionCell = document.createElement("td");
      var button = actionButton("失効", function () {
        revokeSession(session.sessionId);
      });
      button.disabled = !!session.revoked;
      actionCell.appendChild(button);
      tr.appendChild(actionCell);
      elements.sessionsBody.appendChild(tr);
    });
  }

  async function revokeSession(sessionId) {
    var result = await adminPost("revokeSession", { sessionId: sessionId });
    if (!result.ok) {
      handleAdminError(result, "Sessionを失効できません");
      return;
    }
    setMessage("Sessionを失効しました。", "ok");
    await refreshSessions();
  }

  async function revokeUserSessions() {
    var userId = elements.sessionUserId.value.trim();
    if (!userId) {
      setMessage("ユーザIDを入力してください。", "error");
      return;
    }
    await revokeSessionsForUserId(userId);
  }

  async function revokeSessionsForUserId(userId) {
    var result = await adminPost("revokeUserSessions", { userId: userId });
    if (!result.ok) {
      handleAdminError(result, "ユーザのSessionを失効できません");
      return;
    }
    setMessage("ユーザの全Sessionを失効しました。", "ok");
    await refreshSessions();
  }

  async function revokeAllSessions() {
    if (!window.confirm("本当に全ユーザのSessionを失効しますか？")) {
      return;
    }
    var result = await adminPost("revokeAllSessions", {});
    if (!result.ok) {
      handleAdminError(result, "全Sessionを失効できません");
      return;
    }
    setMessage("全Sessionを失効しました。", "ok");
    await refreshSessions();
  }

  async function importLegacyUsers() {
    var file = elements.legacyImportFile.files && elements.legacyImportFile.files[0];
    if (!file) {
      setMessage("CSVファイルを選択してください。", "error");
      return;
    }
    await runButton(elements.legacyImportButton, async function () {
      elements.legacyImportSummary.textContent = "";
      var text = await readFileAsText(file);
      var rows = parseCsv(text);
      if (!rows.length) {
        setMessage("CSVに有効なデータ行がありません。", "error");
        return;
      }
      // 旧 Auth シート形式（uid,salt,passwordHash,...）またはユーザCSV形式の両方に対応する。
      var headers = rows[0].map(function (h) { return String(h || "").trim(); });
      var headerLower = headers.map(function (h) { return h.toLowerCase(); });
      var idx = {
        userId: indexOfAny(headerLower, ["userid", "uid"]),
        salt: indexOfAny(headerLower, ["legacysalt", "salt"]),
        hash: indexOfAny(headerLower, ["legacypasswordhash", "passwordhash"]),
        classId: indexOfAny(headerLower, ["classid"]),
        number: indexOfAny(headerLower, ["number", "no"]),
        displayName: indexOfAny(headerLower, ["displayname"]),
      };
      if (idx.userId < 0 || idx.salt < 0 || idx.hash < 0) {
        setMessage("CSVヘッダに userId(uid), salt, passwordHash の3列が必要です。", "error");
        return;
      }

      var records = [];
      for (var i = 1; i < rows.length; i += 1) {
        var row = rows[i];
        if (!row || !row.length) continue;
        var rec = {
          userId: (row[idx.userId] || "").trim(),
          legacySalt: (row[idx.salt] || "").trim(),
          legacyPasswordHash: (row[idx.hash] || "").trim().toLowerCase(),
        };
        if (idx.classId >= 0) rec.classId = (row[idx.classId] || "").trim();
        if (idx.number >= 0) rec.number = (row[idx.number] || "").trim();
        if (idx.displayName >= 0) rec.displayName = (row[idx.displayName] || "").trim();
        if (!rec.userId || !rec.legacySalt || !rec.legacyPasswordHash) continue;
        records.push(rec);
      }
      if (!records.length) {
        setMessage("CSVから移行可能なレコードを抽出できませんでした。", "error");
        return;
      }
      if (!window.confirm(records.length + "件のユーザを移行アップロードします。よろしいですか？")) {
        return;
      }

      var result = await adminPost("importLegacyUsers", {
        records: JSON.stringify(records),
        overwriteExistingPassword: elements.legacyOverwriteHash.checked ? "TRUE" : "FALSE",
      });
      if (!result.ok) {
        handleAdminError(result, "移行アップロードに失敗しました");
        return;
      }
      var summary =
        "新規 " + (result.imported || 0) + " 件 / 更新 " + (result.updated || 0) +
        " 件 / スキップ " + (result.skipped || 0) + " 件";
      if (result.errors && result.errors.length) {
        summary += " / エラー " + result.errors.length + " 件";
      }
      elements.legacyImportSummary.textContent = summary;
      setMessage("移行アップロードが完了しました。" + summary, "ok");
      await refreshUsers();
    });
  }

  async function exportUsers() {
    await runButton(elements.exportUsersButton, async function () {
      var result = await adminPost("exportUsers", {});
      if (!result.ok) {
        handleAdminError(result, "ユーザ一覧をエクスポートできません");
        return;
      }
      var headers = result.headers || [];
      var users = result.users || [];
      var csv = buildCsv(headers, users);
      var stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
      downloadTextFile("midori-auth-users-" + stamp + ".csv", csv);
      setMessage(users.length + " 件のユーザをCSVに出力しました。", "ok");
    });
  }

  async function bulkUpsertUsers() {
    var file = elements.bulkUpsertFile.files && elements.bulkUpsertFile.files[0];
    if (!file) {
      setMessage("CSVファイルを選択してください。", "error");
      return;
    }
    await runButton(elements.bulkUpsertButton, async function () {
      elements.bulkUpsertSummary.textContent = "";
      var text = await readFileAsText(file);
      var rows = parseCsv(text);
      if (!rows.length) {
        setMessage("CSVに有効なデータ行がありません。", "error");
        return;
      }
      var headers = rows[0].map(function (h) { return String(h || "").trim(); });
      var userIdIdx = -1;
      for (var i = 0; i < headers.length; i += 1) {
        var key = headers[i].toLowerCase();
        if (key === "userid" || key === "uid") {
          userIdIdx = i;
          break;
        }
      }
      if (userIdIdx < 0) {
        setMessage("CSVヘッダに UserId 列が必要です。", "error");
        return;
      }

      var records = [];
      for (var r = 1; r < rows.length; r += 1) {
        var row = rows[r];
        if (!row || !row.length) continue;
        var rec = {};
        var hasAny = false;
        headers.forEach(function (header, idx) {
          if (!header) return;
          var value = row[idx] !== undefined ? row[idx] : "";
          rec[header] = value;
          if (String(value).length > 0) hasAny = true;
        });
        var uid = String(rec[headers[userIdIdx]] || "").trim();
        if (!uid || !hasAny) continue;
        records.push(rec);
      }
      if (!records.length) {
        setMessage("CSVから取り込めるレコードがありません。", "error");
        return;
      }
      if (!window.confirm(records.length + "件のユーザを一括更新します。よろしいですか？")) {
        return;
      }

      var result = await adminPost("bulkUpsertUsers", {
        records: JSON.stringify(records),
      });
      if (!result.ok) {
        handleAdminError(result, "一括アップロードに失敗しました");
        return;
      }
      var summary =
        "新規 " + (result.created || 0) + " 件 / 更新 " + (result.modified || 0) +
        " 件 / 変更なし " + (result.unchanged || 0) + " 件";
      if (result.errors && result.errors.length) {
        summary += " / エラー " + result.errors.length + " 件";
      }
      elements.bulkUpsertSummary.textContent = summary;
      setMessage("一括アップロードが完了しました。" + summary, "ok");
      await refreshUsers();
    });
  }

  function readFileAsText(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || "")); };
      reader.onerror = function () { reject(new Error("file_read_error")); };
      reader.readAsText(file, "utf-8");
    });
  }

  // 雑な CSV パーサ。RFC 4180 準拠（ダブルクォート escape, "," / "\r\n" 区切り）。
  function parseCsv(text) {
    var rows = [];
    var current = [];
    var field = "";
    var quoted = false;
    var input = String(text || "").replace(/^﻿/, "");
    for (var i = 0; i < input.length; i += 1) {
      var ch = input[i];
      if (quoted) {
        if (ch === "\"") {
          if (input[i + 1] === "\"") { field += "\""; i += 1; }
          else { quoted = false; }
        } else {
          field += ch;
        }
        continue;
      }
      if (ch === "\"") { quoted = true; continue; }
      if (ch === ",") { current.push(field); field = ""; continue; }
      if (ch === "\r") { continue; }
      if (ch === "\n") {
        current.push(field); field = "";
        if (current.length > 1 || current[0] !== "") rows.push(current);
        current = [];
        continue;
      }
      field += ch;
    }
    if (field.length > 0 || current.length) {
      current.push(field);
      if (current.length > 1 || current[0] !== "") rows.push(current);
    }
    return rows;
  }

  function buildCsv(headers, records) {
    var lines = [headers.map(escapeCsvCell).join(",")];
    records.forEach(function (record) {
      lines.push(headers.map(function (h) { return escapeCsvCell(record[h]); }).join(","));
    });
    return "﻿" + lines.join("\r\n") + "\r\n";
  }

  function escapeCsvCell(value) {
    var text = value === undefined || value === null ? "" : String(value);
    if (/[",\r\n]/.test(text)) {
      return "\"" + text.replace(/"/g, "\"\"") + "\"";
    }
    return text;
  }

  function downloadTextFile(filename, content) {
    var blob = new Blob([content], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function indexOfAny(arr, candidates) {
    for (var i = 0; i < candidates.length; i += 1) {
      var idx = arr.indexOf(candidates[i]);
      if (idx >= 0) return idx;
    }
    return -1;
  }

  async function refreshLogs() {
    await runButton(elements.refreshLogs, async function () {
      var result = await adminPost("listLogs", {});
      if (!result.ok) {
        handleAdminError(result, "Logsを取得できません");
        return;
      }
      state.logs = result.logs || [];
      renderLogs();
      setMessage("Logsを読み込みました。", "ok");
    });
  }

  function renderLogs() {
    elements.logsBody.innerHTML = "";
    state.logs.forEach(function (log) {
      var tr = document.createElement("tr");
      tr.appendChild(td(log.timestamp));
      tr.appendChild(td(log.action));
      tr.appendChild(td(log.userId));
      tr.appendChild(td(log.detail));
      tr.appendChild(td(log.actor));
      tr.appendChild(td(log.deviceId));
      tr.appendChild(td(log.result));
      elements.logsBody.appendChild(tr);
    });
  }

  async function adminPost(action, params) {
    var session = MidoriAuth.getStoredSession();
    var enriched = Object.assign({
      userId: session.userId,
      loginToken: session.loginToken,
      deviceId: session.deviceId,
    }, params || {});
    return MidoriAuth.post(action, enriched);
  }

  function handleAdminError(result, baseMessage) {
    var error = safeError(result);
    if (error === "auth_required" || error === "token_invalid" || error === "forbidden") {
      setMessage("セッションが無効になりました。再度ログインしてください。", "error");
      MidoriAuth.clearStoredSession();
      state.authUser = null;
      showLoginPanel();
      return;
    }
    setMessage(baseMessage + ": " + error, "error");
  }

  async function runButton(button, fn) {
    if (button) {
      button.disabled = true;
    }
    try {
      await fn();
    } catch (error) {
      setMessage(error.userMessage || "処理に失敗しました。", "error");
    } finally {
      if (button) {
        button.disabled = false;
      }
    }
  }

  function showOnly(panelIds) {
    var all = [
      "connectionPanel",
      "bootstrapPanel",
      "loginPanel",
      "adminPanel",
      "usersSection",
      "migrationSection",
      "sessionsSection",
      "logsSection",
    ];
    all.forEach(function (id) {
      if (!elements[id]) {
        return;
      }
      elements[id].hidden = panelIds.indexOf(id) === -1;
    });
  }

  function generateClientSalt() {
    if (window.crypto && window.crypto.getRandomValues) {
      var bytes = new Uint8Array(24);
      window.crypto.getRandomValues(bytes);
      return "salt_" + Array.prototype.map.call(bytes, function (b) {
        return b.toString(16).padStart(2, "0");
      }).join("");
    }
    return "salt_" + Date.now().toString(16) + "_" + Math.random().toString(36).slice(2);
  }

  function td(value) {
    var cell = document.createElement("td");
    cell.textContent = value === undefined || value === null || value === "" ? "-" : String(value);
    return cell;
  }

  function statusTd(text, ok) {
    var cell = document.createElement("td");
    var pill = document.createElement("span");
    pill.className = "pill " + (ok ? "ok" : "bad");
    pill.textContent = text;
    cell.appendChild(pill);
    return cell;
  }

  function actionButton(text, handler) {
    var button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.addEventListener("click", handler);
    return button;
  }

  function setMessage(text, type) {
    elements.message.textContent = text;
    elements.message.className = "message" + (type ? " " + type : "");
  }

  function safeError(result) {
    return result && result.error ? result.error : "unknown_error";
  }
})();
