/**
 * 首选项「新功能介绍」的远程数据源。
 *
 * 数据全部走 GitHub API（`api.github.com`，用户网络可达；`raw.githubusercontent.com`
 * 在部分网络下 DNS 不可用）：
 * - `doc/features.md`：受版本控制的中文 md（由 `npm run features:sync` 从
 *   `other/新功能提示.md` 生成）
 * - `src/modules/features/translations.json`：en/es 翻译表（缺失条目不报错，
 *   运行时回落中文）
 * - `releases?per_page=100`：全部已发布版本号（用于“没有功能更新的版本也要
 *   列出来”）
 *
 * 失败时调用方回退到内置数据（`getFeatureVersions` + 当前版本 + 缓存最新版）。
 */

import { getFeatureVersions, sortFeatureVersions } from "./featuresData";
import type { FeatureEntry, FeatureVersion } from "./featuresData";
import { PLUGIN_VERSION, getCachedStatus } from "../update/versionInfo";

const REPO = "LightWindW/zotero-better-vertical-tabs";
const BRANCH = "main";
const API_BASE = `https://api.github.com/repos/${REPO}`;
const FEATURES_MD_PATH = "doc/features.md";
const TRANSLATIONS_PATH = "src/modules/features/translations.json";
const RELEASES_API = `${API_BASE}/releases?per_page=100`;
const CACHE_TTL_MS = 10 * 60 * 1000;
const FAILURE_COOLDOWN_MS = 60 * 1000;

interface TranslationEntry {
  en?: string;
  es?: string;
}
type TranslationTable = Record<string, TranslationEntry>;

let cache: { at: number; versions: FeatureVersion[] } | null = null;
let lastFailureAt = 0;

/** 同步兜底：内置数据 + 当前版本 + 缓存的最新版本。 */
export function getLocalFeatureVersionsForAll(): FeatureVersion[] {
  const local = getFeatureVersions();
  const byVersion = new Map<string, FeatureVersion>();
  for (const item of local) {
    byVersion.set(item.version, item);
  }
  const ensure = (version: string): void => {
    if (!version || byVersion.has(version)) return;
    byVersion.set(version, { version, entries: [] });
  };
  ensure(PLUGIN_VERSION);
  ensure(getCachedStatus().latestVersion);
  return sortFeatureVersions([...byVersion.values()]);
}

/**
 * 拉取远程数据：md + 翻译表 + releases 版本列表。
 * 失败（网络/接口/格式）时 reject，调用方回退本地数据。
 */
export async function loadRemoteFeatureVersions(): Promise<FeatureVersion[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.versions;
  }
  if (Date.now() - lastFailureAt < FAILURE_COOLDOWN_MS) {
    throw new Error("remote-fetch-cooldown");
  }

  try {
    const [mdText, translations, releaseTags] = await Promise.all([
      fetchRepoText(FEATURES_MD_PATH),
      fetchRepoText(TRANSLATIONS_PATH)
        .then((raw) => parseTranslations(raw))
        .catch(() => ({}) as TranslationTable),
      fetchReleaseTags().catch(() => [] as string[]),
    ]);

    const parsed = parseFeaturesMarkdown(mdText, translations);
    if (!parsed.length) throw new Error("remote-md-empty");

    const byVersion = new Map<string, FeatureVersion>();
    for (const item of parsed) byVersion.set(item.version, item);
    for (const tag of releaseTags) {
      if (!byVersion.has(tag))
        byVersion.set(tag, { version: tag, entries: [] });
    }
    if (!byVersion.has(PLUGIN_VERSION)) {
      byVersion.set(PLUGIN_VERSION, { version: PLUGIN_VERSION, entries: [] });
    }

    const versions = sortFeatureVersions([...byVersion.values()]);
    cache = { at: Date.now(), versions };
    return versions;
  } catch (error) {
    lastFailureAt = Date.now();
    ztoolkit.log("Failed to load remote feature notes:", error);
    throw error;
  }
}

async function fetchRepoText(repoPath: string): Promise<string> {
  const xhr = await Zotero.HTTP.request(
    "GET",
    `${API_BASE}/contents/${repoPath}?ref=${BRANCH}`,
    {
      timeout: 10000,
      noCache: true,
      errorDelayMax: 0,
      headers: { Accept: "application/vnd.github.raw" },
    },
  );
  const text = xhr.responseText;
  if (!text) throw new Error(`empty remote file: ${repoPath}`);
  return text;
}

async function fetchReleaseTags(): Promise<string[]> {
  const xhr = await Zotero.HTTP.request("GET", RELEASES_API, {
    responseType: "json",
    timeout: 10000,
    noCache: true,
    errorDelayMax: 0,
    headers: { Accept: "application/vnd.github+json" },
  });
  const data = xhr.response as { tag_name?: unknown; draft?: unknown }[] | null;
  if (!Array.isArray(data)) return [];
  const tags: string[] = [];
  for (const release of data) {
    if (!release || typeof release !== "object") continue;
    if (release.draft === true) continue;
    if (typeof release.tag_name !== "string") continue;
    const version = normalizeVersion(release.tag_name);
    if (version) tags.push(version);
  }
  return tags;
}

function normalizeVersion(raw: string): string {
  return raw.trim().replace(/^v/i, "");
}

function parseTranslations(raw: string): TranslationTable {
  const data = JSON.parse(raw) as unknown;
  if (!data || typeof data !== "object") return {};
  const table: TranslationTable = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const item = value as { en?: unknown; es?: unknown };
    table[key] = {
      en: typeof item.en === "string" ? item.en : "",
      es: typeof item.es === "string" ? item.es : "",
    };
  }
  return table;
}

const headingRe = /^#\s+v?(\d+\.\d+\.\d+)\s+新功能\s*$/;
const markdownImageRe = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/;
const angleImageRe = /^<([^>]+)>\s*$/;
const bulletRe = /^\*\s+(.*\S)\s*$/;

/** 与 `scripts/sync-features.mjs` 相同的 md 解析规则（翻译缺失回落中文）。 */
function parseFeaturesMarkdown(
  md: string,
  translations: TranslationTable,
): FeatureVersion[] {
  const versions: FeatureVersion[] = [];
  let current: FeatureVersion | null = null;

  for (const rawLine of md.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const heading = line.match(headingRe);
    if (heading) {
      current = { version: heading[1], entries: [] };
      versions.push(current);
      continue;
    }
    if (line.startsWith("#") || !current) continue;

    const imageMatch = line.match(markdownImageRe);
    const angleMatch = imageMatch ? null : line.match(angleImageRe);
    if (imageMatch || angleMatch) {
      const alt = imageMatch ? imageMatch[1].trim() : "";
      const file = imageMatch
        ? imageMatch[2].trim()
        : (angleMatch?.[1] ?? "").trim();
      if (!file) continue;
      const entry: FeatureEntry = {
        type: "image",
        file,
        zh: alt,
        en: "",
        es: "",
      };
      if (alt) {
        const translation = translations[alt];
        entry.en = translation?.en ?? "";
        entry.es = translation?.es ?? "";
      }
      current.entries.push(entry);
      continue;
    }

    const bullet = line.match(bulletRe);
    const text = bullet ? bullet[1] : line;
    const translation = translations[text];
    current.entries.push({
      type: bullet ? "bullet" : "paragraph",
      zh: text,
      en: translation?.en ?? "",
      es: translation?.es ?? "",
    });
  }

  return versions;
}
