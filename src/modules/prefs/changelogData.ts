/**
 * Changelog 数据层。
 *
 * `changelog.json` 在构建期被内联进 bundle（不做运行时 IO，离线可用）。
 * 这里只负责类型、当前版本判定、按语言取正文。
 */

import rawChangelog from "./changelog.json";
import { PLUGIN_VERSION } from "../update/versionInfo";

export type ChangelogEntryType = "new" | "optimize" | "fix";

export interface ChangelogEntry {
  type: ChangelogEntryType;
  zh: string;
  en: string;
  es: string;
}

export interface ChangelogVersion {
  version: string;
  date: string;
  entries: ChangelogEntry[];
}

/** 类型胶囊的文案 id（对应 preferences.ftl）。 */
export const TYPE_LABEL_IDS: Record<ChangelogEntryType, string> = {
  new: "pref-changelog-type-new",
  optimize: "pref-changelog-type-optimize",
  fix: "pref-changelog-type-fix",
};

const DATA = rawChangelog as unknown as { versions: ChangelogVersion[] };

export function getChangelogVersions(): ChangelogVersion[] {
  return DATA.versions;
}

/** 该版本号是否就是当前安装的版本。 */
export function isCurrentVersion(version: string): boolean {
  try {
    return Zotero.Utilities.semverCompare(version, PLUGIN_VERSION) === 0;
  } catch {
    return false;
  }
}

/** 该版本号比当前安装版本更新（已发布但用户尚未升级）。 */
export function isPendingVersion(version: string): boolean {
  try {
    return Zotero.Utilities.semverCompare(version, PLUGIN_VERSION) > 0;
  } catch {
    return false;
  }
}

/** 按版本号从新到旧排序（远程数据合并后统一排序）。 */
export function sortChangelogVersions(
  versions: ChangelogVersion[],
): ChangelogVersion[] {
  return [...versions].sort((a, b) => {
    try {
      return Zotero.Utilities.semverCompare(b.version, a.version);
    } catch {
      return b.version.localeCompare(a.version);
    }
  });
}

/** 按当前界面语言取正文；缺失时回落到英文。 */
export function getEntryText(entry: ChangelogEntry, locale: string): string {
  if (locale.startsWith("zh")) return entry.zh || entry.en;
  if (locale.startsWith("es")) return entry.es || entry.en;
  return entry.en || entry.zh;
}

/** 把 ISO 日期（2026-11-06）显示为参考图样式（2026/11/06）。 */
export function formatVersionDate(date: string): string {
  return date.replace(/-/g, "/");
}
