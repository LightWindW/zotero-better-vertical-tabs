/**
 * 侧栏标签卡片第二行「副标题」的组装。
 *
 * 字段组合来自 pref（见 subtitleFields.getSubtitleFields），取值全部落在
 * ItemInfo（缓存）与调用方算好的「上次阅读时间」文本上，本模块不读 pref、
 * 不持有全局状态，只做「有序非空字段 → DOM」的纯组装，便于单测。
 */

import type { ItemInfo } from "./itemInfoCache";
import { buildSubtitleValues, type SubtitleFieldId } from "./subtitleFields";

const XHTML_NS = "http://www.w3.org/1999/xhtml";

/** 字段之间的分隔符（与既有副标题一致）。 */
const SUBTITLE_SEPARATOR = "·";

export interface SubtitleRowContext {
  /** 条目显示信息（父条目/笔记的父条目由调用方决定）。 */
  info: ItemInfo;
  /** 当前 pref 的字段组合快照（每轮渲染读一次后下传）。 */
  fields: readonly SubtitleFieldId[];
  /** 「上次阅读时间」文本，由调用方用 formatRowTime(pdf) 算好。 */
  lastReadText: string;
  /** 笔记行：无元数据标签，固定只渲染上次阅读时间。 */
  isNote: boolean;
}

/**
 * 纯逻辑：算出该行实际要渲染的「非空字段」列表（已过滤空值）。
 *
 * 笔记行不受自定义组合影响——固定只保留 lastRead（即使 pref 里没有它），
 * 其余字段即使有值也不渲染。
 */
export function resolveSubtitleParts(
  ctx: SubtitleRowContext,
): Array<{ field: SubtitleFieldId; text: string }> {
  if (ctx.isNote) {
    return buildSubtitleValues(["lastRead"], {
      info: ctx.info,
      lastReadText: ctx.lastReadText,
    });
  }
  return buildSubtitleValues(ctx.fields, {
    info: ctx.info,
    lastReadText: ctx.lastReadText,
  });
}

/**
 * 把副标题渲染到行内容块末尾。
 *
 * - 全部字段为空时不创建 meta 元素、不 append，返回 null（调用方无需处理）；
 * - lastRead 的 span 保留 `.vertical-tabs-item-time`，使 refreshRelativeTimes /
 *   updateActiveTabRow 的原地刷新零改动；
 * - 其余字段带 `.vertical-tabs-item-meta-field`；
 * - 最后一个渲染出的字段额外带 `.vertical-tabs-item-pub`（末位省略号）。
 *
 * @returns 创建出的 meta 元素；无字段可渲染时返回 null。
 */
export function appendSubtitle(
  doc: Document,
  parent: HTMLElement,
  ctx: SubtitleRowContext,
): HTMLElement | null {
  const parts = resolveSubtitleParts(ctx);
  if (parts.length === 0) return null;

  const metaEl = doc.createElementNS(XHTML_NS, "div") as HTMLElement;
  metaEl.className = "vertical-tabs-item-meta";

  parts.forEach((part, index) => {
    if (index > 0) {
      const dot = doc.createElementNS(XHTML_NS, "span") as HTMLElement;
      dot.className = "vertical-tabs-item-dot";
      dot.textContent = SUBTITLE_SEPARATOR;
      metaEl.appendChild(dot);
    }

    const span = doc.createElementNS(XHTML_NS, "span") as HTMLElement;
    const classes: string[] = [];
    if (part.field === "lastRead") {
      // 原地刷新（分钟 tick / active 切换）依赖这个类名。
      classes.push("vertical-tabs-item-time");
    } else {
      classes.push("vertical-tabs-item-meta-field");
    }
    if (index === parts.length - 1) {
      // 末位字段可收缩并显示省略号（CSS 见 styles.ts）。
      classes.push("vertical-tabs-item-pub");
    }
    span.className = classes.join(" ");
    span.dataset.subtitleField = part.field;
    span.textContent = part.text;
    metaEl.appendChild(span);
  });

  parent.appendChild(metaEl);
  return metaEl;
}
