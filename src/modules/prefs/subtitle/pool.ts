/**
 * 标签池：按 SUBTITLE_FIELD_GROUPS 的 4 组渲染，只显示「未被选中的标签」。
 *
 * 组名占左侧约 44px 的固定列（muted），右侧 pill 自动换行。chip 元素由
 * chipRow.createChip 统一构建（source="pool"，无 ✕）。拖拽监听由
 * dragController 挂在元素上，本模块不管交互。
 *
 * render 会对比上一次的选中集合：从选中集「回到」池里的字段加
 * `.vt-prefs-subtitle-chip-entering` 播一次淡入（✕ 移除 / 拖出删除后回位）。
 */

import {
  SUBTITLE_FIELD_GROUPS,
  subtitleGroupLabelId,
  type SubtitleFieldId,
} from "../../render/subtitleFields";
import { getString } from "../../../utils/locale";
import { createPrefsElement } from "../prefsIcons";
import type { FluentMessageId } from "../../../../typings/i10n";
import { CHIP_FIELD_ATTR } from "./chipFlip";
import { CHIP_ENTERING_CLASS, createChip, fieldOfChip } from "./chipRow";

const POOL_CLASS = "vt-prefs-subtitle-pool";
const ROW_CLASS = "vt-prefs-subtitle-pool-row";
const GROUP_CLASS = "vt-prefs-subtitle-pool-group";
const ITEMS_CLASS = "vt-prefs-subtitle-pool-items";

export interface Pool {
  element: HTMLElement;
  render(selected: readonly SubtitleFieldId[]): void;
  getChipElements(): HTMLElement[];
  getChipElement(field: SubtitleFieldId): HTMLElement | null;
  destroy(): void;
}

export function createPool(doc: Document): Pool {
  const root = createPrefsElement(doc, "div", POOL_CLASS);
  let previousSelected: SubtitleFieldId[] | null = null;

  const getChipElements = (): HTMLElement[] =>
    Array.from(root.querySelectorAll(`[${CHIP_FIELD_ATTR}]`)) as HTMLElement[];

  const render = (selected: readonly SubtitleFieldId[]): void => {
    while (root.firstChild) root.removeChild(root.firstChild);

    for (const group of SUBTITLE_FIELD_GROUPS) {
      const row = createPrefsElement(doc, "div", ROW_CLASS);

      const groupLabel = createPrefsElement(doc, "span", GROUP_CLASS);
      groupLabel.textContent = getString(
        subtitleGroupLabelId(group.id) as FluentMessageId,
      );
      row.appendChild(groupLabel);

      const items = createPrefsElement(doc, "div", ITEMS_CLASS);
      for (const field of group.fields) {
        if (selected.includes(field)) continue;
        const chip = createChip(doc, field, "pool", false);
        // 上一次是选中的 → 说明刚从预览区回来，淡入回位。
        if (previousSelected?.includes(field)) {
          chip.classList.add(CHIP_ENTERING_CLASS);
        }
        items.appendChild(chip);
      }
      row.appendChild(items);
      // 组标签被全部移出后仍保留该行（不塌缩），行高由 CSS 的 min-height 兜住。
      root.appendChild(row);
    }

    previousSelected = selected.slice();
  };

  return {
    element: root,
    render,
    getChipElements,
    getChipElement: (field) =>
      getChipElements().find((el) => fieldOfChip(el) === field) ?? null,
    destroy: () => root.remove(),
  };
}
