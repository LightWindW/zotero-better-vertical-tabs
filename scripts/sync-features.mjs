#!/usr/bin/env node
/**
 * 把「新功能」中文源 + translations.json（en/es 翻译表）同步成两份产物：
 *   1. doc/features.md           —— 受版本控制的 md 副本（运行时从 GitHub 拉取的就是它；
 *                                   other/ 被 .gitignore 忽略，不能作为远程源）
 *   2. src/modules/features/features.json —— 构建期内联进 bundle 的三语数据
 *
 * 源的选择：本地存在 other/新功能提示.md 时以它为源（并刷新 doc/features.md）；
 * CI 等场景没有 other/（被 gitignore），则以 doc/features.md 为源。
 *
 * 用法：
 *   npm run features:sync    生成/更新 doc/features.md 与 features.json
 *   npm run features:check   校验两者是否与源/翻译表一致（CI 用）
 *   node scripts/sync-features.mjs --allow-missing   缺翻译时用中文占位并警告
 *
 * md 写作约定：
 *   # v1.2.62 新功能            版本标题（每个版本一个，内容可空）
 *   普通一行                     段落
 *   * 开头一行                   列表项
 *   ![说明](CardFigs.gif)       图片（说明可空）；<CardFigs.gif> 为兼容写法
 *   **文字**                     加粗（原样保留，运行时拆分）
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOCAL_MD_PATH = path.join(ROOT, "other", "新功能提示.md");
const TRACKED_MD_PATH = path.join(ROOT, "doc", "features.md");
const TRANSLATIONS_PATH = path.join(
  ROOT,
  "src",
  "modules",
  "features",
  "translations.json",
);
const OUTPUT_PATH = path.join(
  ROOT,
  "src",
  "modules",
  "features",
  "features.json",
);
const FIGS_DIR = path.join(ROOT, "addon", "content", "figs");

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");
const allowMissing = args.has("--allow-missing");

function fail(message, details = []) {
  console.error(`\n✖ ${message}\n`);
  for (const detail of details) console.error(`  - ${detail}`);
  console.error("");
  process.exit(1);
}

function readText(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (error) {
    fail(`读取文件失败：${file}`, [String(error)]);
  }
}

// CI（无 other/）以受控 md 为源；本地开发以 other/ 源为准。
const hasLocalSource = fs.existsSync(LOCAL_MD_PATH);
const sourceMdPath = hasLocalSource ? LOCAL_MD_PATH : TRACKED_MD_PATH;
const md = readText(sourceMdPath).replace(/\r\n?/g, "\n");
const normalizedMd = md.endsWith("\n") ? md : `${md}\n`;
const translations = JSON.parse(readText(TRANSLATIONS_PATH));

const headingRe = /^#\s+v?(\d+\.\d+\.\d+)\s+新功能\s*$/;
const markdownImageRe = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/;
const angleImageRe = /^<([^>]+)>\s*$/;
const bulletRe = /^\*\s+(.*\S)\s*$/;

const versions = [];
const missingTranslations = [];
const usedTranslationKeys = new Set();
const seenVersions = new Set();
const seenImages = new Set();
let textCount = 0;

let currentVersion = null;
const lines = md.split(/\r?\n/);

for (let index = 0; index < lines.length; index++) {
  const line = lines[index].trim();
  if (!line) continue;
  const lineNo = index + 1;

  const heading = line.match(headingRe);
  if (heading) {
    const version = heading[1];
    if (seenVersions.has(version)) {
      fail(`版本标题重复：v${version}（第 ${lineNo} 行）`);
    }
    seenVersions.add(version);
    currentVersion = { version, entries: [] };
    versions.push(currentVersion);
    continue;
  }

  if (line.startsWith("#")) {
    fail(`第 ${lineNo} 行标题格式不对，应为「# v1.2.62 新功能」`, [line]);
  }
  if (!currentVersion) {
    fail(`第 ${lineNo} 行的内容出现在任何版本标题之前`, [line]);
  }

  const imageMatch = line.match(markdownImageRe);
  const angleMatch = imageMatch ? null : line.match(angleImageRe);
  if (imageMatch || angleMatch) {
    const alt = imageMatch ? imageMatch[1].trim() : "";
    const file = imageMatch ? imageMatch[2].trim() : angleMatch[1].trim();
    if (!/^[^/\\]+\.(gif|png|jpe?g|webp)$/i.test(file)) {
      fail(
        `第 ${lineNo} 行图片写法不对，应为 ![说明](文件名.gif) 或 <文件名.gif>`,
        [line],
      );
    }
    if (!fs.existsSync(path.join(FIGS_DIR, file))) {
      fail(`图片不存在：addon/content/figs/${file}`, [
        `请把图片放进 addon/content/figs/，或检查文件名大小写`,
      ]);
    }
    seenImages.add(file);
    const entry = { type: "image", file, zh: alt, en: "", es: "" };
    if (alt) {
      const translation = lookupTranslation(alt, lineNo);
      entry.en = translation.en;
      entry.es = translation.es;
      textCount++;
    }
    currentVersion.entries.push(entry);
    continue;
  }

  if (line.startsWith("![") || line.startsWith("<")) {
    fail(`第 ${lineNo} 行看起来是图片但没有独立成行或格式不完整`, [line]);
  }

  const bullet = line.match(bulletRe);
  const text = bullet ? bullet[1] : line;
  const translation = lookupTranslation(text, lineNo);
  currentVersion.entries.push({
    type: bullet ? "bullet" : "paragraph",
    zh: text,
    en: translation.en,
    es: translation.es,
  });
  textCount++;
}

if (versions.length === 0) {
  fail("没有解析到任何版本标题（应为「# v1.2.62 新功能」）");
}

const unusedKeys = Object.keys(translations).filter(
  (key) => !usedTranslationKeys.has(key),
);
if (unusedKeys.length) {
  console.warn(
    `⚠ translations.json 里有 ${unusedKeys.length} 条翻译没有被 md 使用（可清理）：`,
  );
  for (const key of unusedKeys) console.warn(`  - ${key.slice(0, 60)}`);
}

if (missingTranslations.length && !allowMissing) {
  fail("以下中文缺少 en/es 翻译（补进 translations.json 后重跑）", [
    ...missingTranslations,
  ]);
}
if (missingTranslations.length && allowMissing) {
  console.warn(`⚠ ${missingTranslations.length} 条缺少翻译，已用中文占位：`);
  for (const item of missingTranslations) console.warn(`  - ${item}`);
}

const output = `${JSON.stringify({ versions }, null, 2)}\n`;
const summary = `版本 ${versions.length} 个 / 文本 ${textCount} 条 / 图片 ${seenImages.size} 张`;

if (checkOnly) {
  let existingTrackedMd = "";
  try {
    existingTrackedMd = fs.readFileSync(TRACKED_MD_PATH, "utf8");
  } catch {
    fail("doc/features.md 不存在，请先运行 npm run features:sync 并提交");
  }
  if (existingTrackedMd !== normalizedMd) {
    fail("doc/features.md 与 md 源不同步，请运行 npm run features:sync 后提交");
  }
  let existing = "";
  try {
    existing = fs.readFileSync(OUTPUT_PATH, "utf8");
  } catch {
    fail("features.json 不存在，请运行 npm run features:sync");
  }
  if (existing !== output) {
    fail(
      "features.json 与 md/翻译表不同步，请运行 npm run features:sync 后提交",
    );
  }
  console.log(`✔ doc/features.md 与 features.json 均已同步（${summary}）`);
  process.exit(0);
}

fs.writeFileSync(TRACKED_MD_PATH, normalizedMd, "utf8");
fs.writeFileSync(OUTPUT_PATH, output, "utf8");
console.log(`✔ 已生成（${summary}）`);
console.log(`  输出：${path.relative(ROOT, TRACKED_MD_PATH)}`);
console.log(`  输出：${path.relative(ROOT, OUTPUT_PATH)}`);
if (!hasLocalSource) {
  console.log("  （未找到 other/新功能提示.md，已按 doc/features.md 生成）");
}

function lookupTranslation(text, lineNo) {
  usedTranslationKeys.add(text);
  const translation = translations[text];
  if (!translation || !translation.en || !translation.es) {
    missingTranslations.push(`第 ${lineNo} 行：${text.slice(0, 60)}…`);
    return { en: text, es: text };
  }
  return { en: translation.en, es: translation.es };
}
