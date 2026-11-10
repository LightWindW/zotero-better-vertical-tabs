/**
 * Changelog 远程数据源。
 *
 * 本地 `src/modules/prefs/changelog.json` 在构建期内联进 bundle（离线可用）；
 * 远端 `doc/changelog.json` 由 `npm run changelog:sync` 从本地源生成并受版本
 * 控制，运行时从 GitHub 拉取——这样发版后即使用户没有升级插件，也能在更新
 * 日志面板里看到新版本的记录。
 *
 * 数据走 GitHub API contents 接口（`Accept: application/vnd.github.raw`）：
 * `raw.githubusercontent.com` 在部分网络下 DNS 不可用。
 * 10 分钟缓存 + 失败 60s 冷却 + 在途请求去重；失败时 reject，由面板回退到
 * 内置数据（面板始终可用）。
 */

import {
  getChangelogVersions,
  sortChangelogVersions,
  type ChangelogEntry,
  type ChangelogEntryType,
  type ChangelogVersion,
} from "./changelogData";

const REPO = "LightWindW/zotero-better-vertical-tabs";
const BRANCH = "main";
const CHANGELOG_PATH = "doc/changelog.json";
const DATA_URL = `https://api.github.com/repos/${REPO}/contents/${CHANGELOG_PATH}?ref=${BRANCH}`;
const CACHE_TTL_MS = 10 * 60 * 1000;
const FAILURE_COOLDOWN_MS = 60 * 1000;
const ENTRY_TYPES: ReadonlySet<string> = new Set(["new", "optimize", "fix"]);
const VERSION_RE = /^\d+\.\d+\.\d+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

let cache: { at: number; versions: ChangelogVersion[] } | null = null;
let lastFailureAt = 0;
let inFlight: Promise<ChangelogVersion[]> | null = null;

/**
 * 远程数据 + 本地独有版本（如尚未发版的开发版本）合并：
 * 同版本远程优先，结果按 semver 从新到旧。
 */
export function mergeWithLocalChangelog(
  remote: ChangelogVersion[],
): ChangelogVersion[] {
  const byVersion = new Map<string, ChangelogVersion>();
  for (const version of remote) byVersion.set(version.version, version);
  for (const local of getChangelogVersions()) {
    if (!byVersion.has(local.version)) byVersion.set(local.version, local);
  }
  return sortChangelogVersions([...byVersion.values()]);
}

/**
 * 拉取远程 changelog（已与本地合并）。
 * 失败（网络 / 接口 / 格式非法）时 reject，调用方回退 `getChangelogVersions()`。
 */
export function loadRemoteChangelog(): Promise<ChangelogVersion[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return Promise.resolve(cache.versions);
  }
  if (inFlight) return inFlight;
  if (Date.now() - lastFailureAt < FAILURE_COOLDOWN_MS) {
    return Promise.reject(new Error("remote-changelog-cooldown"));
  }

  const request = fetchRemoteChangelog()
    .then((versions) => {
      cache = { at: Date.now(), versions };
      return versions;
    })
    .catch((error) => {
      lastFailureAt = Date.now();
      ztoolkit.log("Failed to load remote changelog:", error);
      throw error;
    })
    .finally(() => {
      inFlight = null;
    });
  inFlight = request;
  return request;
}

async function fetchRemoteChangelog(): Promise<ChangelogVersion[]> {
  const xhr = await Zotero.HTTP.request("GET", DATA_URL, {
    timeout: 10000,
    noCache: true,
    errorDelayMax: 0,
    headers: { Accept: "application/vnd.github.raw" },
  });
  const text = xhr.responseText;
  if (!text) throw new Error("empty remote changelog");
  const parsed = parseRemoteChangelog(text);
  if (!parsed.length) throw new Error("remote changelog has no versions");
  return mergeWithLocalChangelog(parsed);
}

/** 解析并校验远程 JSON；任何非法条目都抛错（整体回退本地数据）。 */
export function parseRemoteChangelog(raw: string): ChangelogVersion[] {
  return validateChangelogData(JSON.parse(raw) as unknown);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** 校验 `{ versions: [{ version, date, entries }] }` 结构。 */
export function validateChangelogData(data: unknown): ChangelogVersion[] {
  if (!isRecord(data) || !Array.isArray(data.versions)) {
    throw new Error("changelog: missing versions array");
  }
  const versions: ChangelogVersion[] = [];
  const seen = new Set<string>();
  data.versions.forEach((item, versionIndex) => {
    if (!isRecord(item)) {
      throw new Error(`changelog: versions[${versionIndex}] is not an object`);
    }
    const version = readText(item.version).replace(/^v/i, "");
    if (!VERSION_RE.test(version)) {
      throw new Error(
        `changelog: versions[${versionIndex}] has invalid version "${String(item.version)}"`,
      );
    }
    if (seen.has(version)) {
      throw new Error(`changelog: duplicate version ${version}`);
    }
    seen.add(version);
    const date = readText(item.date);
    if (!DATE_RE.test(date)) {
      throw new Error(
        `changelog: ${version} has invalid date "${String(item.date)}"`,
      );
    }
    if (!Array.isArray(item.entries)) {
      throw new Error(`changelog: ${version} is missing entries array`);
    }
    const entries = item.entries.map((entry, entryIndex) =>
      validateEntry(entry, version, entryIndex),
    );
    versions.push({ version, date, entries });
  });
  return versions;
}

function validateEntry(
  raw: unknown,
  version: string,
  entryIndex: number,
): ChangelogEntry {
  const where = `changelog: ${version} entries[${entryIndex}]`;
  if (!isRecord(raw)) throw new Error(`${where} is not an object`);
  if (typeof raw.type !== "string" || !ENTRY_TYPES.has(raw.type)) {
    throw new Error(`${where} has invalid type "${String(raw.type)}"`);
  }
  const zh = readText(raw.zh);
  const en = readText(raw.en);
  const es = readText(raw.es);
  if (!zh && !en && !es) throw new Error(`${where} has no text`);
  return { type: raw.type as ChangelogEntryType, zh, en, es };
}
