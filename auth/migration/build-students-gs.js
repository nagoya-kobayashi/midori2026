#!/usr/bin/env node
// ローカルの student.csv から GAS 用 Students.gs を生成する。
// student.csv も Students.gs も .gitignore で GitHub には公開されない。
// 生成された Students.gs を GAS スクリプトエディタにコピー＆貼り付けして使う。
//
// 入力: ../student.csv
// 出力: ../gas/Students.gs
//
// 実行: node build-students-gs.js

"use strict";

var fs = require("fs");
var path = require("path");

var INPUT = path.join(__dirname, "..", "student.csv");
var OUTPUT = path.join(__dirname, "..", "gas", "Students.gs");

function main() {
  if (!fs.existsSync(INPUT)) {
    console.error("input not found: " + INPUT);
    process.exit(1);
  }

  var raw = fs.readFileSync(INPUT, "utf8");
  // BOM を除去
  if (raw.charCodeAt(0) === 0xfeff) {
    raw = raw.slice(1);
  }
  var normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n+$/, "");
  var lines = normalized.split("\n");

  if (!lines.length) {
    console.error("input is empty");
    process.exit(1);
  }

  // フィールド内カンマや改行は学校運用上発生しない前提だが、念のため警告だけ出す
  for (var i = 0; i < lines.length; i += 1) {
    if (lines[i].indexOf("\"") !== -1) {
      console.warn("warning: line " + (i + 1) + " contains a double quote; CSV パーサは引用符を解釈しません");
    }
  }

  var escapedLines = lines.map(function (line) {
    return "  " + JSON.stringify(line) + ",";
  }).join("\n");

  var output =
    "/**\n" +
    " * 生徒名簿 (student.csv 相当)。\n" +
    " * このファイルは .gitignore で GitHub に公開されないようになっている。\n" +
    " * `migration/build-students-gs.js` で `student.csv` から再生成できる。\n" +
    " */\n" +
    "var STUDENT_ROSTER_CSV = [\n" +
    escapedLines + "\n" +
    "].join(\"\\n\");\n";

  fs.writeFileSync(OUTPUT, output, "utf8");
  console.log("wrote " + OUTPUT + " (" + lines.length + " lines including header)");
}

main();
