/**
 * 自定义标签副标题：字段目录、pref 解析/持久化、字段取值。
 *
 * 侧栏渲染（subtitleRenderer）与首选项弹窗（prefs/subtitle/*）共用这一份
 * 目录与解析逻辑，避免两处各写一套字段顺序/默认值。
 *
 * pref 语义（verticalTabs.subtitleFields，CSV）：
 * - 键缺失（undefined）→ 用默认三项；
 * - 空字符串 → 用户主动清空（0 个字段，合法状态）；
 * - 其余 → 过滤未知 id、去重保序、截断到 MAX 个。
 */

import { getPref, setPref } from "../../utils/prefs";
import type { ItemInfo } from "./itemInfoCache";

export type SubtitleFieldId =
  | "firstAuthorLastName"
  | "firstAuthor"
  | "allAuthors"
  | "lastRead"
  | "year"
  | "date"
  | "journalShort"
  | "journal"
  | "shortTitle";

export type SubtitleFieldGroup = "authors" | "time" | "publication" | "title";

/** 标签池的行顺序（图 2）。 */
export const SUBTITLE_FIELD_GROUPS: ReadonlyArray<{
  id: SubtitleFieldGroup;
  fields: SubtitleFieldId[];
}> = [
  {
    id: "authors",
    fields: ["firstAuthorLastName", "firstAuthor", "allAuthors"],
  },
  { id: "time", fields: ["lastRead", "year", "date"] },
  { id: "publication", fields: ["journalShort", "journal"] },
  { id: "title", fields: ["shortTitle"] },
];

/** 全部字段 id，按图 2 的阅读顺序展开。 */
export const SUBTITLE_FIELD_IDS: SubtitleFieldId[] =
  SUBTITLE_FIELD_GROUPS.flatMap((group) => group.fields);

export const DEFAULT_SUBTITLE_FIELDS: SubtitleFieldId[] = [
  "lastRead",
  "firstAuthorLastName",
  "journalShort",
];

/** 副标题最多显示的标签数。 */
export const MAX_SUBTITLE_FIELDS = 3;

const SUBTITLE_FIELDS_PREF = "verticalTabs.subtitleFields";

const FIELD_LABEL_IDS: Record<SubtitleFieldId, string> = {
  firstAuthorLastName: "vertical-tabs-subtitle-field-first-author-last-name",
  firstAuthor: "vertical-tabs-subtitle-field-first-author",
  allAuthors: "vertical-tabs-subtitle-field-all-authors",
  lastRead: "vertical-tabs-subtitle-field-last-read",
  year: "vertical-tabs-subtitle-field-year",
  date: "vertical-tabs-subtitle-field-date",
  journalShort: "vertical-tabs-subtitle-field-journal-short",
  journal: "vertical-tabs-subtitle-field-journal",
  shortTitle: "vertical-tabs-subtitle-field-short-title",
};

const GROUP_LABEL_IDS: Record<SubtitleFieldGroup, string> = {
  authors: "vertical-tabs-subtitle-group-authors",
  time: "vertical-tabs-subtitle-group-time",
  publication: "vertical-tabs-subtitle-group-publication",
  title: "vertical-tabs-subtitle-group-title",
};

export function isSubtitleFieldId(value: unknown): value is SubtitleFieldId {
  return (
    typeof value === "string" &&
    (SUBTITLE_FIELD_IDS as string[]).includes(value)
  );
}

/**
 * 把 pref 里的 CSV 解析成有序字段列表。
 * 未知 id 丢弃、重复只保留第一次出现、超过 MAX 截断。
 */
export function parseSubtitleFields(raw: unknown): SubtitleFieldId[] {
  // 键缺失（从未写过 pref / pref 被 clear）→ 默认组合。
  if (typeof raw !== "string") return [...DEFAULT_SUBTITLE_FIELDS];
  // 用户主动清空：0 个字段是合法状态，不回落默认。
  if (!raw.trim()) return [];

  const result: SubtitleFieldId[] = [];
  for (const part of raw.split(",")) {
    const id = part.trim();
    if (!isSubtitleFieldId(id)) continue;
    if (result.includes(id)) continue;
    result.push(id);
    if (result.length >= MAX_SUBTITLE_FIELDS) break;
  }
  return result;
}

export function serializeSubtitleFields(
  fields: readonly SubtitleFieldId[],
): string {
  return fields.join(",");
}

/** 读取当前副标题字段组合（每次渲染读一次，避免逐行读 pref）。 */
export function getSubtitleFields(): SubtitleFieldId[] {
  return parseSubtitleFields(getPref(SUBTITLE_FIELDS_PREF));
}

/** 持久化副标题字段组合。 */
export function setSubtitleFields(fields: readonly SubtitleFieldId[]): void {
  setPref(SUBTITLE_FIELDS_PREF, serializeSubtitleFields(fields));
}

/** 字段的中文/英文/西语标签 FTL id（不含插件前缀，调用方用 getString）。 */
export function subtitleFieldLabelId(field: SubtitleFieldId): string {
  return FIELD_LABEL_IDS[field];
}

/** 标签池分组名的 FTL id（不含插件前缀）。 */
export function subtitleGroupLabelId(group: SubtitleFieldGroup): string {
  return GROUP_LABEL_IDS[group];
}

export interface SubtitleFieldContext {
  info: ItemInfo;
  /** 「上次阅读时间」的显示值（活动 tab 恒「刚刚」，由调用方算好）。 */
  lastReadText: string;
}

/** 单个字段的显示值（空字符串表示该字段不渲染）。 */
export function resolveSubtitleValue(
  field: SubtitleFieldId,
  ctx: SubtitleFieldContext,
): string {
  const info = ctx.info;
  switch (field) {
    case "lastRead":
      return ctx.lastReadText;
    case "firstAuthorLastName":
      return info.firstAuthorLastName;
    case "firstAuthor":
      return info.firstAuthor;
    case "allAuthors":
      return info.allAuthors;
    case "year":
      return info.yearOnly;
    case "date":
      return info.dateRaw;
    case "journalShort":
      return info.journalShort;
    case "journal":
      return info.venue;
    case "shortTitle":
      return info.shortTitle;
  }
}

/** 按当前组合生成「有值的字段」列表，空值字段整段跳过（含分隔符）。 */
export function buildSubtitleValues(
  fields: readonly SubtitleFieldId[],
  ctx: SubtitleFieldContext,
): Array<{ field: SubtitleFieldId; text: string }> {
  const values: Array<{ field: SubtitleFieldId; text: string }> = [];
  for (const field of fields) {
    const text = resolveSubtitleValue(field, ctx).trim();
    if (text) values.push({ field, text });
  }
  return values;
}
