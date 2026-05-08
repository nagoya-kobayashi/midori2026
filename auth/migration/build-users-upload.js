#!/usr/bin/env node
// 旧タイピングシステムの Auth シート CSV から、新システムの管理画面
// 「3. 編集済みCSVの一括アップロード」(apiBulkUpsertUsers) で投入できる CSV を生成する。
//
// 入力: ./緑高校タイピング2026 - Auth.csv
//   ヘッダ: uid,salt,passwordHash,sessionId,updatedAt,updatedAtIso
// 出力: ./users-upload.csv
//   ヘッダ: UserId,ClassId,Number,DisplayName,Role,LegacySalt,LegacyPasswordHash
//
// 変換ルール:
//   - ClassId   = uid[3] を大文字化（例 s26b00 → "B"）
//   - Number    = uid[4..5]（例 s26b00 → "00"）
//   - DisplayName = "{ClassId}-{Number}"（例 "B-00"）
//   - Role      = Number が "00" または "99" のとき "admin"、それ以外は "user"
//   - LegacySalt / LegacyPasswordHash は salt / passwordHash をそのまま転記
//   - sessionId / updatedAt / updatedAtIso は破棄（移行先で再発行されるため）
//
// 実行: node build-users-upload.js

"use strict";

var fs = require("fs");
var path = require("path");

var INPUT = path.join(__dirname, "緑高校タイピング2026 - Auth.csv");
var OUTPUT = path.join(__dirname, "users-upload.csv");

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
    } else {
      if (ch === "\"") {
        quoted = true;
      } else if (ch === ",") {
        current.push(field);
        field = "";
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && input[i + 1] === "\n") i += 1;
        current.push(field);
        field = "";
        rows.push(current);
        current = [];
      } else {
        field += ch;
      }
    }
  }
  if (field.length || current.length) {
    current.push(field);
    rows.push(current);
  }
  return rows.filter(function (r) {
    return r.length && !(r.length === 1 && r[0] === "");
  });
}

function csvEscape(value) {
  var s = String(value == null ? "" : value);
  if (/[",\r\n]/.test(s)) {
    return "\"" + s.replace(/"/g, "\"\"") + "\"";
  }
  return s;
}

function deriveClassNumber(uid) {
  var text = String(uid || "").trim();
  if (text.length < 6) return { classId: "", number: "" };
  var classChar = text.charAt(3);
  var numberPart = text.substring(4, 6);
  if (!/^[a-zA-Z]$/.test(classChar) || !/^\d{2}$/.test(numberPart)) {
    return { classId: "", number: "" };
  }
  return { classId: classChar.toUpperCase(), number: numberPart };
}

function deriveRole(number) {
  return (number === "00" || number === "99") ? "admin" : "user";
}

function main() {
  var raw = fs.readFileSync(INPUT, "utf-8");
  var rows = parseCsv(raw);
  if (!rows.length) {
    console.error("input is empty: " + INPUT);
    process.exit(1);
  }

  var header = rows[0].map(function (h) { return String(h || "").trim().toLowerCase(); });
  var idxUid = header.indexOf("uid");
  var idxSalt = header.indexOf("salt");
  var idxHash = header.indexOf("passwordhash");
  if (idxUid < 0 || idxSalt < 0 || idxHash < 0) {
    console.error("input header must contain uid,salt,passwordHash. got: " + header.join(","));
    process.exit(1);
  }

  var outHeader = ["UserId", "ClassId", "Number", "DisplayName", "Role", "LegacySalt", "LegacyPasswordHash"];
  var outLines = [outHeader.join(",")];
  var counters = { total: 0, admin: 0, user: 0, skipped: 0, classes: {} };

  for (var i = 1; i < rows.length; i += 1) {
    var row = rows[i];
    var uid = String(row[idxUid] || "").trim();
    var salt = String(row[idxSalt] || "").trim();
    var hash = String(row[idxHash] || "").trim().toLowerCase();
    if (!uid || !salt || !hash) {
      counters.skipped += 1;
      continue;
    }
    var d = deriveClassNumber(uid);
    if (!d.classId || !d.number) {
      console.error("skip (cannot derive class/number): " + uid);
      counters.skipped += 1;
      continue;
    }
    var role = deriveRole(d.number);
    var displayName = d.classId + "-" + d.number;

    var fields = [uid, d.classId, d.number, displayName, role, salt, hash];
    outLines.push(fields.map(csvEscape).join(","));

    counters.total += 1;
    if (role === "admin") counters.admin += 1; else counters.user += 1;
    counters.classes[d.classId] = (counters.classes[d.classId] || 0) + 1;
  }

  fs.writeFileSync(OUTPUT, outLines.join("\r\n") + "\r\n", "utf-8");

  console.log("wrote: " + OUTPUT);
  console.log("  total : " + counters.total);
  console.log("  admin : " + counters.admin);
  console.log("  user  : " + counters.user);
  console.log("  skipped: " + counters.skipped);
  var classKeys = Object.keys(counters.classes).sort();
  classKeys.forEach(function (k) {
    console.log("  class " + k + ": " + counters.classes[k]);
  });
}

main();
