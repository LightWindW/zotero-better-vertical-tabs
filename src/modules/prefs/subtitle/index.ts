/**
 * 首选项「自定义标签副标题」弹窗的装配与生命周期。
 *
 * 由 preferenceScript.ts 的按钮点击调用；一个窗口同时只允许一个实例（重开先
 * 关旧、幂等）。本文件只做组装与关闭矩阵，各子模块职责：
 * - dialogShell   壳 + 开关动画
 * - previewPanel  预览面板（装饰标题条 + chip 行挂载点）
 * - chipRow       预览区 chip 行 / chip 工厂 / 拖放空槽
 * - pool          标签池（4 组，只显示未选中项）
 * - chipFlip      FLIP / 浮影 / 淡出动画原语
 * - dragController 鼠标拖拽
 * - state         组合状态 + 即时持久化 + 广播
 *
 * 关闭矩阵：✕ / Esc（capture + preventDefault，避免关掉预置窗口）/ 点遮罩 /
 * 切换左侧面板（navigation select + pane hidden 观察）/ 窗口 unload。
 * 全部改动已即时持久化，关闭时不再做任何「回落/补值」——允许 0 个 tag
 * （pref 空串即 0 个字段，侧栏此时不显示副标题行）。
 * 关窗时先取消拖拽，再播离场动画并在 animationend / 300ms 兜底后清理全部
 * doc/window 级监听。
 */

import { config } from "../../../../package.json";
import {
  DEFAULT_SUBTITLE_FIELDS,
  getSubtitleFields,
  type SubtitleFieldId,
} from "../../render/subtitleFields";
import {
  FLIP_MS,
  captureRects,
  fadeOutClone,
  playFlip,
  type ChipRectMap,
} from "./chipFlip";
import { createChipRow } from "./chipRow";
import { createDialogShell, type DialogShell } from "./dialogShell";
import { createDragController } from "./dragController";
import { createPool } from "./pool";
import { createPreviewPanel } from "./previewPanel";
import { createSubtitleState } from "./state";

/** 「恢复默认」时被移除 chip 的克隆淡出：略长于 FLIP，ease-in-out 收尾更柔。 */
const CHIP_FADE_MS = 170;
const CHIP_FADE_EASING = "ease-in-out";

interface WindowWithConstructors extends Window {
  MutationObserver?: typeof MutationObserver;
}

interface SubtitleDialog {
  requestClose(): void;
  forceClose(): void;
}

/** 每个预置窗口最多一个弹窗；重开时先同步关掉旧的。 */
const DIALOGS = new Map<Window, SubtitleDialog>();

export function openSubtitleDialog(win: Window): void {
  const existing = DIALOGS.get(win);
  if (existing) existing.forceClose();
  try {
    createDialog(win);
  } catch (error) {
    ztoolkit.log("Failed to open subtitle dialog", error);
  }
}

export function closeSubtitleDialog(win: Window): void {
  DIALOGS.get(win)?.requestClose();
}

function createDialog(win: Window): void {
  const doc = win.document;
  if (!doc || !doc.documentElement) return;

  const state = createSubtitleState(getSubtitleFields());
  const navigation = doc.getElementById("prefs-navigation");

  let finalized = false;
  let closing = false;
  let unsubscribe: (() => void) | null = null;
  let observer: MutationObserver | null = null;
  let instance: SubtitleDialog | null = null;

  const shell: DialogShell = createDialogShell({
    doc,
    onClosed: () => finalize(),
  });
  const chipRow = createChipRow({
    doc,
    onRemove: (field) => handleRemove(field),
  });
  const pool = createPool(doc);
  const preview = createPreviewPanel(doc);

  preview.rowHost.appendChild(chipRow.element);
  shell.previewHost.appendChild(preview.element);
  shell.poolHost.appendChild(pool.element);

  const drag = createDragController({
    doc,
    win,
    previewElement: preview.element,
    chipRow,
    pool,
    state,
    onMaxReached: () => shell.playMaxReachedHint(),
  });

  const captureAll = (): ChipRectMap =>
    captureRects([...chipRow.getChipElements(), ...pool.getChipElements()]);

  const renderAll = (ids: SubtitleFieldId[]): void => {
    if (closing) return;
    chipRow.render(ids);
    pool.render(ids);
  };

  unsubscribe = state.onChange(renderAll);
  renderAll(state.get());

  shell.restoreButton.addEventListener("click", () => handleRestore());
  shell.closeButton.addEventListener("click", () => requestClose());

  // ── 交互：✕ 移除 / 恢复默认 ──

  function fadeOutChips(fields: readonly SubtitleFieldId[]): void {
    for (const field of fields) {
      const chip = chipRow.getChipElement(field);
      if (chip) fadeOutClone(chip, CHIP_FADE_MS, CHIP_FADE_EASING);
    }
  }

  /**
   * ✕ 移除：交给 dragController 的 returnFieldToPool，和「拖出预览区删除」共用
   * 同一条浮影飞行动画（副标题行与池行同时并发让位，落位后显形）。
   */
  function handleRemove(field: SubtitleFieldId): void {
    if (closing) return;
    drag.returnFieldToPool(field);
  }

  function handleRestore(): void {
    if (closing) return;
    const before = state.get();
    const unchanged =
      before.length === DEFAULT_SUBTITLE_FIELDS.length &&
      before.every((id, index) => id === DEFAULT_SUBTITLE_FIELDS[index]);
    if (unchanged) return;
    const first = captureAll();
    fadeOutChips(before.filter((id) => !DEFAULT_SUBTITLE_FIELDS.includes(id)));
    state.resetDefault();
    playFlip([...chipRow.getChipElements(), ...pool.getChipElements()], first, {
      durationMs: FLIP_MS,
    });
  }

  // ── 关闭矩阵 ──

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key !== "Escape") return;
    // 别让预置窗口自己响应 Esc 关闭。
    event.preventDefault();
    event.stopPropagation();
    if (drag.isDragging()) {
      drag.cancel();
      return;
    }
    requestClose();
  }

  function onMouseDown(event: MouseEvent): void {
    const target = event.target as Node | null;
    if (!target) return;
    if (shell.card.contains(target)) return;
    requestClose();
  }

  function onUnload(): void {
    forceClose();
  }

  function requestClose(): void {
    if (closing || finalized) return;
    closing = true;
    drag.destroy();
    // 防抖窗口内可能还有未写盘的变更：关窗时强制落盘 + 广播一次。
    state.flushPending();
    shell.close();
  }

  function forceClose(): void {
    if (finalized) return;
    closing = true;
    drag.destroy();
    state.flushPending();
    shell.destroy();
    finalize();
  }

  function finalize(): void {
    if (finalized) return;
    finalized = true;
    unsubscribe?.();
    unsubscribe = null;
    doc.removeEventListener("keydown", onKeyDown, true);
    doc.removeEventListener("mousedown", onMouseDown, true);
    navigation?.removeEventListener("select", requestClose);
    observer?.disconnect();
    observer = null;
    win.removeEventListener("unload", onUnload);
    drag.destroy();
    pool.destroy();
    chipRow.destroy();
    if (instance && DIALOGS.get(win) === instance) DIALOGS.delete(win);
  }

  doc.addEventListener("keydown", onKeyDown, true);
  doc.addEventListener("mousedown", onMouseDown, true);
  win.addEventListener("unload", onUnload);
  navigation?.addEventListener("select", requestClose);

  // 面板被 Zotero 用 hidden 属性隐藏时也要关（覆盖面切换/刷新等路径）。
  const Observer = (win as WindowWithConstructors).MutationObserver;
  const host = doc.getElementById(`${config.addonRef}-custom-subtitle`);
  const paneContainer = host?.closest(".pane-container") as HTMLElement | null;
  if (paneContainer && Observer) {
    observer = new Observer(() => {
      if (paneContainer.hidden) requestClose();
    });
    observer.observe(paneContainer, {
      attributes: true,
      attributeFilter: ["hidden"],
    });
  }

  instance = { requestClose, forceClose };
  DIALOGS.set(win, instance);
}
