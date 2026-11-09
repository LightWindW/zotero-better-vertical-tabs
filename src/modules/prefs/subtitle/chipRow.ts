/**
 * 预览区的 chip 行 + chip 元素工厂。
 *
 * 只负责这一块 DOM：构建 chip（可带 ✕ 移除按钮）、空态浮动提示、拖拽占位空槽
 * （拖到预览区上方时插在目标索引处，让同行 chip 用 FLIP 让位）。拖拽逻辑在
 * dragController.ts，FLIP 在 chipFlip.ts。
 *
 * 空态提示是持久的 absolute 浮动层（不占布局、不随 render 重建），只切
 * `.is-visible` 做 150ms 淡入淡出——这样拖拽 gap 出现/消失时占位文字不会被挤走。
 *
 * 每次 render 都会重建 chip 元素；「刚出现的 chip」加 `.vt-prefs-subtitle-
 * chip-entering` 播一次 0.18s 淡入（恢复默认等场景；拖拽落位不走这个类，
 * 浮影落位后直接显形，避免「闪一下」）。
 */

import {
  CHIP_FIELD_ATTR,
  CHIP_HIDDEN_CLASS,
  FLIP_MS,
  type ChipRectMap,
  captureRects,
  fadeOutClone,
  playFlip,
} from "./chipFlip";
import {
  subtitleFieldLabelId,
  type SubtitleFieldId,
} from "../../render/subtitleFields";
import { getString } from "../../../utils/locale";
import { createPrefsElement } from "../prefsIcons";
import type { FluentMessageId } from "../../../../typings/i10n";

export const CHIP_SOURCE_ATTR = "data-vt-subtitle-source";
export const CHIP_ENTERING_CLASS = "vt-prefs-subtitle-chip-entering";
export const CHIP_REMOVE_CLASS = "vt-prefs-subtitle-chip-remove";
// 拖拽/落位状态类定义在 chipFlip（playFlip 需要跳过它们），这里转出给调用方。
export { CHIP_AWAITING_CLASS, CHIP_HIDDEN_CLASS } from "./chipFlip";

const CHIP_CLASS = "vt-prefs-subtitle-chip";
const ROW_CLASS = "vt-prefs-subtitle-preview-row";
const ROW_GAP_CLASS = "has-gap";
const EMPTY_CLASS = "vt-prefs-subtitle-empty";
const EMPTY_VISIBLE_CLASS = "is-visible";
const GAP_CLASS = "vt-prefs-subtitle-gap";
const GAP_FADE_MS = 120;

export type ChipSource = "preview" | "pool";

export function fieldOfChip(el: HTMLElement): SubtitleFieldId | null {
  const field = el.getAttribute(CHIP_FIELD_ATTR);
  return (field as SubtitleFieldId | null) ?? null;
}

export interface ChipSize {
  width: number;
  height: number;
}

export interface ChipRow {
  element: HTMLElement;
  render(fields: readonly SubtitleFieldId[]): void;
  getChipElements(): HTMLElement[];
  getChipElement(field: SubtitleFieldId): HTMLElement | null;
  /** 在 `index` 处显示拖放空槽；尺寸取被拖 chip 的尺寸。 */
  showGap(index: number, size: ChipSize): void;
  /**
   * 移除空槽。默认 120ms 淡出（fixed 克隆），布局立刻让位给 chip 的 FLIP；
   * 级联清理（销毁/关窗）传 false 立即移除，避免残留克隆。
   */
  clearGap(animate?: boolean): void;
  isGapShown(): boolean;
  destroy(): void;
}

/** 建一个 chip；预览区 chip 带 ✕（removable=true），池里的不带。 */
export function createChip(
  doc: Document,
  field: SubtitleFieldId,
  source: ChipSource,
  removable: boolean,
): HTMLElement {
  const chip = createPrefsElement(doc, "span", CHIP_CLASS);
  chip.setAttribute(CHIP_FIELD_ATTR, field);
  chip.setAttribute(CHIP_SOURCE_ATTR, source);
  // 禁用浏览器原生拖拽（HTML5 DnD），拖拽全部由 dragController 的 mouse 事件实现。
  chip.setAttribute("draggable", "false");

  const label = createPrefsElement(doc, "span", "vt-prefs-subtitle-chip-label");
  label.textContent = getString(subtitleFieldLabelId(field) as FluentMessageId);
  chip.appendChild(label);

  if (removable) {
    const remove = createPrefsElement(doc, "button", CHIP_REMOVE_CLASS);
    remove.type = "button";
    remove.textContent = "×";
    const removeLabel = getString("vertical-tabs-subtitle-remove");
    remove.title = removeLabel;
    remove.setAttribute("aria-label", removeLabel);
    chip.appendChild(remove);
  }

  return chip;
}

export interface ChipRowOptions {
  doc: Document;
  onRemove: (field: SubtitleFieldId) => void;
}

export function createChipRow(options: ChipRowOptions): ChipRow {
  const { doc, onRemove } = options;
  const root = createPrefsElement(doc, "div", ROW_CLASS);
  let rendered: SubtitleFieldId[] | null = null;
  let gapEl: HTMLElement | null = null;

  // 空态提示是持久的浮动层（absolute 居中、不占布局）：render 只重建 chips，
  // 不重建它，避免拖拽 gap 出现/消失时把占位文字挤到右边。
  const emptyEl = createPrefsElement(doc, "div", EMPTY_CLASS);
  emptyEl.textContent = getString("vertical-tabs-subtitle-empty-hint");
  root.appendChild(emptyEl);

  const getChipElements = (): HTMLElement[] =>
    Array.from(root.querySelectorAll(`[${CHIP_FIELD_ATTR}]`)) as HTMLElement[];

  const onClick = (event: MouseEvent): void => {
    const target = event.target as Element | null;
    if (!target || typeof target.closest !== "function") return;
    const button = target.closest(`.${CHIP_REMOVE_CLASS}`);
    if (!button) return;
    const chip = button.closest(`[${CHIP_FIELD_ATTR}]`) as HTMLElement | null;
    if (!chip) return;
    const field = fieldOfChip(chip);
    if (field) onRemove(field);
  };

  root.addEventListener("click", onClick);

  const render = (fields: readonly SubtitleFieldId[]): void => {
    const previous = rendered;
    // 只清 chips / gap，保留持久的空态浮动层。
    for (const child of Array.from(root.children)) {
      if (child === emptyEl) continue;
      child.remove();
    }
    gapEl = null;
    root.classList.remove(ROW_GAP_CLASS);

    for (const field of fields) {
      const chip = createChip(doc, field, "preview", true);
      if (previous && !previous.includes(field)) {
        chip.classList.add(CHIP_ENTERING_CLASS);
      }
      root.appendChild(chip);
    }

    emptyEl.classList.toggle(EMPTY_VISIBLE_CLASS, fields.length === 0);
    rendered = fields.slice();
  };

  const showGap = (index: number, size: ChipSize): void => {
    let gap = gapEl;
    const appearing = !gap || !gap.isConnected || !root.contains(gap);
    if (!gap) {
      gap = createPrefsElement(doc, "div", GAP_CLASS);
      gap.setAttribute("aria-hidden", "true");
      gapEl = gap;
    }
    gap.style.width = `${Math.max(24, size.width)}px`;
    gap.style.height = `${Math.max(20, size.height)}px`;

    // 首次出现：先 pin 起始态（同一同步任务内不会 paint），插入后 reflow 再
    // 释放 inline，让 CSS 的 120ms opacity/scale 过渡播淡入。移动位置时不播。
    if (appearing) {
      gap.style.transition = "none";
      gap.style.opacity = "0";
      gap.style.transform = "scale(0.9)";
    }

    // 拖拽中的源 chip 仍是 DOM 子节点（display:none），不能占用插入索引的位次，
    // 否则「源在前、目标在后」时空槽会插早一位。
    const chips = getChipElements().filter(
      (el) => !el.classList.contains(CHIP_HIDDEN_CLASS),
    );
    const before = chips[index] ?? null;
    if (before) {
      root.insertBefore(gap, before);
    } else {
      root.appendChild(gap);
    }
    root.classList.add(ROW_GAP_CLASS);

    if (appearing) {
      void gap.offsetWidth;
      gap.style.transition = "";
      gap.style.opacity = "";
      gap.style.transform = "";
    }
  };

  const clearGap = (animate = true): void => {
    const gap = gapEl;
    gapEl = null;
    root.classList.remove(ROW_GAP_CLASS);
    if (!gap || !gap.isConnected) return;
    if (!animate) {
      gap.remove();
      return;
    }
    // 归一 inline 后再克隆，保证克隆从「可见」状态开始淡出。
    gap.style.transition = "";
    gap.style.opacity = "";
    gap.style.transform = "";
    fadeOutClone(gap, GAP_FADE_MS);
    // 立刻移出布局，让同行 chip 的 FLIP 拿到正确的新位置；淡出由 fixed 克隆完成。
    gap.remove();
  };

  const destroy = (): void => {
    root.removeEventListener("click", onClick);
    gapEl = null;
    root.remove();
  };

  return {
    element: root,
    render,
    getChipElements,
    getChipElement: (field) =>
      getChipElements().find((el) => fieldOfChip(el) === field) ?? null,
    showGap,
    clearGap,
    isGapShown: () => gapEl !== null,
    destroy,
  };
}

/** 预览行重排时让同行 chip 让位（chip 元素会被重渲染，所以按字段键控）。 */
export function flipChipRow(row: ChipRow, before: ChipRectMap): void {
  playFlip(row.getChipElements(), before, { durationMs: FLIP_MS });
}

export function captureChipRow(row: ChipRow): ChipRectMap {
  return captureRects(row.getChipElements());
}
