#!/usr/bin/env node
/**
 * 把本地 changelog 源同步成受版本控制的远程副本：
 *   src/modules/prefs/changelog.json → doc/changelog.json
 *
 * 运行时首选项「更新日志」面板会从 GitHub 拉 doc/changelog.json
 * （见 src/modules/prefs/changelogRemote.ts），这样发版后即使用户没有升级
 * 插件，也能看到新版本的更新记录。
 *
 * 用法：
 *   npm run changelog:sync    校验源并写出 doc/changelog.json
 *   npm run changelog:check   CI 用：校验源合法，且 doc/changelog.json 与源
 *                             语义一致（忽略格式/键序）
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_PATH = path.join(
  ROOT,
  "src",
  "modules",
  "prefs",
  "changelog.json",
);
const TRACKED_PATH = path.join(ROOT, "doc", "changelog.json");

const ENTRY_TYPES = new Set(["new", "optimize", "fix"]);
const VERSION_RE = /^\d+\.\d+\.\d+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const checkOnly = process.argv.slice(2).includes("--check");

function fail(message, details = []) {
  console.error(`\n✖ ${message}\n`);
  for (const detail of details) console.error(`  - ${detail}`);
  console.error("");
  process.exit(1);
}

function readFileText(file, label) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (error) {
    fail(`读取${label}失败：${path.relative(ROOT, file)}`, [String(error)]);
  }
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

/** 校验 `{ versions: [{ version, date, entries }] }`，返回规范化后的数据。 */
function validateChangelog(data, label) {
  if (!isRecord(data) || !Array.isArray(data.versions)) {
    fail(`${label} 缺少 versions 数组`);
  }
  const versions = [];
  const seen = new Set();
  data.versions.forEach((item, versionIndex) => {
    const where = `${label} versions[${versionIndex}]`;
    if (!isRecord(item)) fail(`${where} 不是对象`);

    const version = text(item.version).replace(/^v/i, "");
    if (!VERSION_RE.test(version)) {
      fail(`${where}.version 不是合法 semver：${String(item.version)}`);
    }
    if (seen.has(version)) fail(`${label} 版本号重复：${version}`);
    seen.add(version);

    const date = text(item.date);
    if (!DATE_RE.test(date)) {
      fail(`${where}.date 不是合法日期（YYYY-MM-DD）：${String(item.date)}`);
    }
    if (!Array.isArray(item.entries)) {
      fail(`${where}.entries 不是数组`);
    }

    const entries = item.entries.map((entry, entryIndex) => {
      const entryWhere = `${where}.entries[${entryIndex}]`;
      if (!isRecord(entry)) fail(`${entryWhere} 不是对象`);
      if (typeof entry.type !== "string" || !ENTRY_TYPES.has(entry.type)) {
        fail(
          `${entryWhere}.type 必须是 new/optimize/fix 之一：${String(entry.type)}`,
        );
      }
      const zh = text(entry.zh);
      const en = text(entry.en);
      const es = text(entry.es);
      if (!zh || !en || !es) {
        fail(`${entryWhere} 缺少 zh/en/es 三语文案`);
      }
      return { type: entry.type, zh, en, es };
    });

    versions.push({ version, date, entries });
  });
  return { versions };
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    return a.every((item, index) => deepEqual(item, b[index]));
  }
  if (isRecord(a) && isRecord(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(b, key) &&
        deepEqual(a[key], b[key]),
    );
  }
  return false;
}

function parseJson(rawText, label) {
  try {
    return JSON.parse(rawText);
  } catch (error) {
    fail(`${label} 不是合法 JSON`, [String(error)]);
  }
}

const sourceData = parseJson(
  readFileText(SOURCE_PATH, "changelog 源"),
  "changelog 源",
);
const normalized = validateChangelog(sourceData, "changelog 源");
const output = `${JSON.stringify(normalized, null, 2)}\n`;

if (checkOnly) {
  let trackedText;
  try {
    trackedText = fs.readFileSync(TRACKED_PATH, "utf8");
  } catch {
    fail("doc/changelog.json 不存在，请先运行 npm run changelog:sync 并提交");
  }
  const tracked = validateChangelog(
    parseJson(trackedText, "doc/changelog.json"),
    "doc/changelog.json",
  );
  if (!deepEqual(normalized, tracked)) {
    fail(
      "doc/changelog.json 与 src/modules/prefs/changelog.json 不同步，请运行 npm run changelog:sync 后提交",
    );
  }
  console.log(
    `✔ doc/changelog.json 已同步（版本 ${normalized.versions.length} 个）`,
  );
  process.exit(0);
}

fs.writeFileSync(TRACKED_PATH, output, "utf8");
console.log(
  `✔ 已生成 doc/changelog.json（版本 ${normalized.versions.length} 个）`,
);
