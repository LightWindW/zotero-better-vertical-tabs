/**
 * 新功能介绍数据层。
 *
 * `features.json` 由 `npm run features:sync` 从 `other/新功能提示.md` 与
 * `translations.json` 生成，构建期被内联进 bundle（离线可用）。
 * 这里只负责类型、排序、语言回退与 `**粗体**` 拆分。
 */

import rawFeatures from "./features.json";
import { PLUGIN_VERSION } from "../update/versionInfo";

export type FeatureEntryType = "paragraph" | "bullet" | "image";

export interface FeatureEntry {
  type: FeatureEntryType;
  zh: string;
  en: string;
  es: string;
  /** 仅 image 条目：`addon/content/figs/` 下的文件名 */
  file?: string;
}

export interface FeatureVersion {
  version: string;
  entries: FeatureEntry[];
}

const DATA = rawFeatures as unknown as { versions: FeatureVersion[] };

export { PLUGIN_VERSION };

export function getFeatureVersions(): FeatureVersion[] {
  return DATA.versions;
}

function compareVersionDesc(a: string, b: string): number {
  try {
    return Zotero.Utilities.semverCompare(b, a);
  } catch {
    return b.localeCompare(a);
  }
}

/** 按版本号从新到旧排序（数据文件按 md 顺序存，展示时统一排序）。 */
export function sortFeatureVersions(
  versions: FeatureVersion[],
): FeatureVersion[] {
  return [...versions].sort((a, b) => compareVersionDesc(a.version, b.version));
}

/** 按当前界面语言取正文；缺失时回落英文。 */
export function getLocalizedText(entry: FeatureEntry, locale: string): string {
  if (locale.startsWith("zh")) return entry.zh || entry.en;
  if (locale.startsWith("es")) return entry.es || entry.en;
  return entry.en || entry.zh;
}

export interface InlineSegment {
  text: string;
  bold: boolean;
}

/** 把 `**粗体**` 拆成文本片段（不支持嵌套与转义，够用即可）。 */
export function parseInlineSegments(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  const pattern = /\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match = pattern.exec(text);
  while (match) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), bold: false });
    }
    segments.push({ text: match[1], bold: true });
    lastIndex = match.index + match[0].length;
    match = pattern.exec(text);
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), bold: false });
  }
  return segments;
}
