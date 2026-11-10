/**
 * chip 拖拽控制器：mousedown 起手（5px 阈值）→ 浮影跟手 → 松手落位/取消。
 *
 * 技术约束（仓库既有事实，勿改成 pointer events / WAAPI / HTML5 DnD）：
 * - 插件跑在 Cu.Sandbox，rAF 必须走 `win.requestAnimationFrame`；
 * - 仓库拖拽先例是 mousedown/mousemove/mouseup（Reader 沙盒直接禁了 HTML5
 *   DnD，见 drag/dragState.ts 顶部注释）；
 * - 所有补间走 CSS transition：位移 200ms MOTION_EASING（cubic-bezier(0.3,
 *   0.25, 0.2, 1)，起始斜率非 0）+ 浮影飞行 220ms 同曲线；落位后浮影 110ms 淡出收尾。
 *
 * 交互语义：
 * - 池 → 预览区：插入（满 4 个拒绝：回弹 + onMaxReached 提示）。
 * - 预览区内部：换序（目标索引与当前位置相同 = 取消）。
 * - 预览区 → 区域外松手：删除（回池）。
 * - 区域外松手 / 满员 / Esc：取消，同一个浮影连续飞回原位。
 *
 * 三种落位路径都遵循「一个浮影飞到位 → 落位后无缝换成真实 chip」：拖拽期间
 * 真实 chip 保持 display:none（取消/删除）或 visibility:hidden（成功落位），
 * 不会在原位置先闪出一个 tag，也不会出现浮影与真实 chip 同时可见。
 *
 * 让位时序是「并发」的：删除回池 / 取消回位时，state 变更（或源 chip 切换为
 * awaiting 让出布局）后立刻 playFlip，同行标签与浮影飞行同时移动，不到落位才动。
 * 落位显形由 revealChip 负责：清内联 FLIP 残留 + 强制 reflow，再摘 hidden/
 * awaiting/entering，不做淡入（浮影同帧交接，避免闪一帧）。
 *
 * 拖拽期间不改业务状态、不重渲染；预览区内的「让位」靠 chipRow 的占位空槽 +
 * FLIP（每次插入索引变化才播一次），松手成功才调用 state 变更（含持久化）。
 */

import {
  CHIP_FIELD_ATTR,
  type ChipRect,
  type ChipRectMap,
  DROP_MS,
  FLIP_MS,
  captureRects,
  fadeOutElement,
  flyGhostTo,
  playFlip,
  rectOf,
} from "./chipFlip";
import {
  CHIP_AWAITING_CLASS,
  CHIP_ENTERING_CLASS,
  CHIP_HIDDEN_CLASS,
  CHIP_REMOVE_CLASS,
  CHIP_SOURCE_ATTR,
  createChip,
  fieldOfChip,
  type ChipRow,
} from "./chipRow";
import type { Pool } from "./pool";
import type { SubtitleState } from "./state";
import type { SubtitleFieldId } from "../../render/subtitleFields";

const GHOST_CLASS = "vt-prefs-subtitle-ghost";
/** 落位时让 ✕ 从透明淡入（动画时长与 CSS 对齐）。 */
const CHIP_REMOVE_ENTERING_CLASS = "vt-prefs-subtitle-chip-remove-entering";
const CHIP_REMOVE_ENTERING_MS = 220;
const GHOST_LIFTED_CLASS = "is-lifted";
const DOC_DRAGGING_CLASS = "vt-prefs-subtitle-dragging";

const DRAG_THRESHOLD = 5;
const DELETE_FADE_MS = 150;

export interface DragControllerOptions {
  doc: Document;
  win: Window;
  /** 命中判定区域：整个预览面板（含装饰标题条）。 */
  previewElement: HTMLElement;
  chipRow: ChipRow;
  pool: Pool;
  state: SubtitleState;
  /** 落点在预览区但已满 4 个时回调（弹窗据此播提示动画）。 */
  onMaxReached?: () => void;
}

export interface DragController {
  isDragging(): boolean;
  cancel(): void;
  /**
   * 点 ✕ 移除：与「拖出预览区删除」走同一套浮影飞行 + 池行 hold-FLIP。
   * 返回是否真的启动了动画（字段不存在/已销毁时 false）。
   */
  returnFieldToPool(field: SubtitleFieldId): boolean;
  destroy(): void;
}

interface PendingDrag {
  field: SubtitleFieldId;
  source: "preview" | "pool";
  element: HTMLElement;
  startX: number;
  startY: number;
}

interface ActiveDrag extends PendingDrag {
  ghost: HTMLElement;
  offsetX: number;
  offsetY: number;
  pointerX: number;
  pointerY: number;
  rafId: number | null;
  /** 当前空槽索引；null = 预览区外/不允许放置。 */
  gapIndex: number | null;
  sourceRect: ChipRect;
}

export function createDragController(
  options: DragControllerOptions,
): DragController {
  const { doc, win, previewElement, chipRow, pool, state, onMaxReached } =
    options;

  let pending: PendingDrag | null = null;
  let active: ActiveDrag | null = null;
  let destroyed = false;

  const allChips = (): HTMLElement[] => [
    ...chipRow.getChipElements(),
    ...pool.getChipElements(),
  ];

  const isInsidePreview = (x: number, y: number): boolean => {
    const rect = previewElement.getBoundingClientRect();
    return (
      x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
    );
  };

  /**
   * 多行插入索引：行优先（先比行中点，再比 chip 中点），DOM 顺序即阅读顺序。
   * 排除被拖的源 chip（拖拽期间它被 display:none 隐藏，但仍会被 query 到）。
   */
  const computeInsertIndex = (drag: ActiveDrag): number => {
    const chips = chipRow.getChipElements().filter((el) => el !== drag.element);
    if (!chips.length) return 0;

    const rects = chips.map((el) => rectOf(el));
    const rows: Array<{ first: number; last: number; midY: number }> = [];
    rects.forEach((rect, index) => {
      const row = rows[rows.length - 1];
      if (row && Math.abs(rect.top - rects[row.first].top) < 2) {
        row.last = index;
        return;
      }
      rows.push({
        first: index,
        last: index,
        midY: rect.top + rect.height / 2,
      });
    });

    let target = rows[rows.length - 1];
    for (const row of rows) {
      if (drag.pointerY < row.midY) {
        target = row;
        break;
      }
    }

    for (let i = target.first; i <= target.last; i++) {
      const rect = rects[i];
      if (drag.pointerX < rect.left + rect.width / 2) return i;
    }
    return target.last + 1;
  };

  const applyGap = (index: number): void => {
    if (!active) return;
    const first = captureRects(chipRow.getChipElements());
    chipRow.showGap(index, {
      width: active.sourceRect.width,
      height: active.sourceRect.height,
    });
    playFlip(chipRow.getChipElements(), first, { durationMs: FLIP_MS });
    active.gapIndex = index;
  };

  const removeGapWithFlip = (): void => {
    if (!active) {
      chipRow.clearGap();
      return;
    }
    if (active.gapIndex === null) {
      chipRow.clearGap();
      return;
    }
    const first = captureRects(chipRow.getChipElements());
    chipRow.clearGap();
    playFlip(chipRow.getChipElements(), first, { durationMs: FLIP_MS });
    active.gapIndex = null;
  };

  const updateDropTarget = (): void => {
    if (!active) return;
    const inside = isInsidePreview(active.pointerX, active.pointerY);
    const canDrop = active.source === "preview" || state.canInsert();
    if (!inside || !canDrop) {
      if (active.gapIndex !== null) removeGapWithFlip();
      return;
    }
    const index = computeInsertIndex(active);
    if (active.gapIndex === index) return;
    applyGap(index);
  };

  const endSession = (): void => {
    if (!active) return;
    if (active.rafId !== null) {
      win.cancelAnimationFrame(active.rafId);
      active.rafId = null;
    }
    doc.documentElement?.classList.remove(DOC_DRAGGING_CLASS);
    active = null;
  };

  /**
   * 落位显形：先清掉 FLIP 可能残留的内联 transition/transform/opacity 并强制
   * reflow（确保这一帧就在最终位置），再摘掉 hidden/awaiting/entering。不做任何
   * 淡入——浮影刚被移除，真实 chip 必须同帧出现在同一位置，否则会闪一下。
   */
  const revealChip = (chip: HTMLElement): void => {
    if (!chip.isConnected) return;
    chip.style.transition = "";
    chip.style.transform = "";
    chip.style.opacity = "";
    void chip.offsetWidth;
    chip.classList.remove(CHIP_HIDDEN_CLASS);
    chip.classList.remove(CHIP_AWAITING_CLASS);
    chip.classList.remove(CHIP_ENTERING_CLASS);
    // 拖拽浮影上看不到 ✕；只有落进副标题后，真实 chip 的 ✕ 才淡入。
    const removeBtn = chip.querySelector(
      `.${CHIP_REMOVE_CLASS}`,
    ) as HTMLElement | null;
    if (removeBtn) {
      // 摘类 + reflow 再加重播动画；连续落位时也能从头淡入。
      removeBtn.classList.remove(CHIP_REMOVE_ENTERING_CLASS);
      void removeBtn.offsetWidth;
      removeBtn.classList.add(CHIP_REMOVE_ENTERING_CLASS);
      win.setTimeout(() => {
        if (removeBtn.isConnected) {
          removeBtn.classList.remove(CHIP_REMOVE_ENTERING_CLASS);
        }
      }, CHIP_REMOVE_ENTERING_MS);
    }
  };

  /** 建浮影：克隆源 chip，fixed + translate3d 定位，append 到 documentElement。 */
  const createGhostFrom = (
    source: HTMLElement,
    rect: ChipRect,
  ): HTMLElement => {
    const ghost = source.cloneNode(true) as HTMLElement;
    ghost.classList.add(GHOST_CLASS);
    ghost.style.position = "fixed";
    ghost.style.left = "0";
    ghost.style.top = "0";
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.style.margin = "0";
    ghost.style.pointerEvents = "none";
    ghost.style.zIndex = "100002";
    ghost.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`;
    doc.documentElement?.appendChild(ghost);
    // 下一帧才加 is-lifted：让幽灵阴影从 0 淡入，而不是出现即硬切。
    win.requestAnimationFrame(() => {
      if (ghost.isConnected) ghost.classList.add(GHOST_LIFTED_CLASS);
    });
    return ghost;
  };

  /**
   * 删除回池：先把池内目标 chip 置为 awaiting（保留布局、不可见）并量 rect。
   * 必须在 playFlip 之前调用——playFlip 会跳过 awaiting 元素，否则会把它的
   * first（删除前副标题里的旧位置）反演回来，出现「先跳回副标题再移动」。
   */
  const awaitPoolTarget = (
    field: SubtitleFieldId,
  ): { chip: HTMLElement | null; target: ChipRect | null } => {
    const chip = pool.getChipElement(field);
    if (!chip) return { chip: null, target: null };
    chip.classList.add(CHIP_AWAITING_CLASS);
    return { chip, target: rectOf(chip) };
  };

  /**
   * 删除回池的统一收尾（拖出删除 / 点 ✕ 共用）：让位 FLIP 由调用方在 state
   * 变更后立即播放（与浮影飞行并发，不等落位）；这里只负责浮影飞向池内目标，
   * 落位后按字段取当前 DOM 显形。
   */
  const flyGhostToPool = (
    ghost: HTMLElement,
    field: SubtitleFieldId,
    poolChip: HTMLElement | null,
    target: ChipRect | null,
  ): void => {
    if (!poolChip || !target) {
      fadeOutElement(ghost, DELETE_FADE_MS);
      return;
    }
    // 落点是池内 chip（无 ✕）：飞行途中隐藏浮影克隆上的 ✕，交接更无缝。
    ghost.classList.add("vt-prefs-subtitle-ghost-pool");
    flyGhostTo(ghost, target, DROP_MS, () => {
      // 飞行期间可能发生重渲染：按字段重新取当前元素再显形，取不到才用旧引用。
      const current = pool.getChipElement(field);
      if (current) revealChip(current);
      else revealChip(poolChip);
    });
  };

  /**
   * 取消（回原位）：源 chip 换成 awaiting（保留布局、不可见）→ 同行标签立刻
   * FLIP 右挤（与浮影飞回并发）；浮影落位后只 reveal，不做淡入。
   */
  const cancelActive = (drag: ActiveDrag): void => {
    removeGapWithFlip();

    // FIRST 必须在源 chip 还 display:none 时量：同行标签此时是「收起」位置。
    const first = captureRects(allChips());
    drag.element.classList.remove(CHIP_HIDDEN_CLASS);
    drag.element.classList.add(CHIP_AWAITING_CLASS);
    const target = rectOf(drag.element);
    // 源 chip 是 awaiting，playFlip 会跳过它；同行标签并发右挤。
    playFlip(allChips(), first, { durationMs: FLIP_MS });

    if (drag.source === "pool") {
      // 回池：落点是纯 pill（无 ✕），飞行中隐藏克隆上的 ✕ 保持交接无缝。
      drag.ghost.classList.add("vt-prefs-subtitle-ghost-pool");
    }
    endSession();
    flyGhostTo(drag.ghost, target, DROP_MS, () => {
      const chip = drag.element;
      if (chip.isConnected) revealChip(chip);
    });
  };

  /** 松手成功：其余 chip FLIP，真实 chip 等浮影落位后再显示。 */
  const completeDrop = (drag: ActiveDrag, first: ChipRectMap): void => {
    const chip = chipRow.getChipElement(drag.field);
    let target: ChipRect | null = null;
    if (chip) {
      chip.classList.add(CHIP_AWAITING_CLASS);
      // 必须在 playFlip 写 inline transform 之前量落位矩形。
      target = rectOf(chip);
    }
    playFlip(allChips(), first, { durationMs: FLIP_MS });

    if (!chip || !target) {
      fadeOutElement(drag.ghost, DELETE_FADE_MS);
      endSession();
      return;
    }

    endSession();
    flyGhostTo(drag.ghost, target, DROP_MS, () => revealChip(chip));
  };

  const finishDrop = (
    drag: ActiveDrag,
    clientX: number,
    clientY: number,
  ): void => {
    drag.pointerX = clientX;
    drag.pointerY = clientY;

    const sourceIndex = state.get().indexOf(drag.field);
    if (!isInsidePreview(clientX, clientY)) {
      if (drag.source === "pool") {
        cancelActive(drag);
        return;
      }
      if (sourceIndex < 0) {
        cancelActive(drag);
        return;
      }
      // 拖出预览区 = 删除回池：state 变更后立即 playFlip——副标题行合拢 + 池行
      // 同行标签右移，与浮影 220ms 飞行并发（不等落位）。目标池 chip 先置
      // awaiting，playFlip 会跳过它，避免把「删除前副标题旧位置」反演回来。
      const first = captureRects(allChips());
      chipRow.clearGap();
      drag.gapIndex = null;
      state.removeAt(sourceIndex);
      const awaited = awaitPoolTarget(drag.field);
      playFlip(allChips(), first, { durationMs: FLIP_MS });
      endSession();
      flyGhostToPool(drag.ghost, drag.field, awaited.chip, awaited.target);
      return;
    }

    const insertIndex = computeInsertIndex(drag);

    if (drag.source === "pool") {
      if (!state.canInsert()) {
        onMaxReached?.();
        cancelActive(drag);
        return;
      }
      const first = captureRects(allChips());
      chipRow.clearGap();
      drag.gapIndex = null;
      if (!state.insertAt(drag.field, insertIndex)) {
        cancelActive(drag);
        return;
      }
      completeDrop(drag, first);
      return;
    }

    if (sourceIndex < 0) {
      cancelActive(drag);
      return;
    }
    if (insertIndex === sourceIndex) {
      cancelActive(drag);
      return;
    }
    const first = captureRects(allChips());
    chipRow.clearGap();
    drag.gapIndex = null;
    if (!state.move(sourceIndex, insertIndex)) {
      cancelActive(drag);
      return;
    }
    completeDrop(drag, first);
  };

  const applyFrame = (): void => {
    if (!active) return;
    active.rafId = null;
    const x = active.pointerX - active.offsetX;
    const y = active.pointerY - active.offsetY;
    active.ghost.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    updateDropTarget();
  };

  const scheduleFrame = (): void => {
    if (!active || active.rafId !== null) return;
    active.rafId = win.requestAnimationFrame(applyFrame);
  };

  const beginDrag = (clientX: number, clientY: number): void => {
    const drag = pending;
    pending = null;
    if (!drag) return;

    const rect = rectOf(drag.element);
    // 池来源的浮影用「副标题 chip 外观」（带 ✕）当克隆源，避免落位那一刻右上角
    // ✕ 突然出现（也会被误看成「闪一下」）。
    const ghostSource =
      drag.source === "pool"
        ? createChip(doc, drag.field, "preview", true)
        : drag.element;
    const ghost = createGhostFrom(ghostSource, rect);
    active = {
      ...drag,
      ghost,
      offsetX: drag.startX - rect.left,
      offsetY: drag.startY - rect.top,
      pointerX: clientX,
      pointerY: clientY,
      rafId: null,
      gapIndex: null,
      sourceRect: rect,
    };
    doc.documentElement?.classList.add(DOC_DRAGGING_CLASS);

    // 源 chip 隐藏 → 行内 chip FLIP 左挤（取消时反向恢复）。
    const first = captureRects(allChips());
    drag.element.classList.add(CHIP_HIDDEN_CLASS);
    playFlip(
      allChips().filter((el) => el !== drag.element),
      first,
      { durationMs: FLIP_MS },
    );
    applyFrame();
  };

  const onMouseDown = (event: MouseEvent): void => {
    if (event.button !== 0) return;
    const target = event.target as Element | null;
    if (!target || typeof target.closest !== "function") return;
    // ✕ 按钮走 click；不要起拖。
    if (target.closest(`.${CHIP_REMOVE_CLASS}`)) return;
    const chip = target.closest(`[${CHIP_FIELD_ATTR}]`) as HTMLElement | null;
    if (!chip) return;
    const field = fieldOfChip(chip);
    if (!field) return;
    const source =
      chip.getAttribute(CHIP_SOURCE_ATTR) === "pool" ? "pool" : "preview";
    pending = {
      field,
      source,
      element: chip,
      startX: event.clientX,
      startY: event.clientY,
    };
    // 阻止拖拽过程中选中文本；click 仍会照常派发。
    event.preventDefault();
  };

  const onMouseMove = (event: MouseEvent): void => {
    if (active) {
      // 在窗口外松开鼠标时 mouseup 可能丢失，按「左键已松开」兜底收尾。
      if (event.buttons === 0) {
        finishDrop(active, event.clientX, event.clientY);
        return;
      }
      active.pointerX = event.clientX;
      active.pointerY = event.clientY;
      scheduleFrame();
      return;
    }
    if (!pending) return;
    if (
      Math.abs(event.clientX - pending.startX) < DRAG_THRESHOLD &&
      Math.abs(event.clientY - pending.startY) < DRAG_THRESHOLD
    ) {
      return;
    }
    beginDrag(event.clientX, event.clientY);
  };

  const onMouseUp = (event: MouseEvent): void => {
    pending = null;
    if (!active) return;
    finishDrop(active, event.clientX, event.clientY);
  };

  const onWindowBlur = (): void => {
    pending = null;
    if (active) cancelActive(active);
  };

  /**
   * 点 ✕ 移除：克隆一个飞行浮影 → 立即 removeAt（副标题行与池行同时 playFlip
   * 让位，与浮影飞行并发）→ 飞向池内目标，落位后露出真实 chip。与拖出删除同
   * 一条路径。
   */
  const returnFieldToPool = (field: SubtitleFieldId): boolean => {
    if (destroyed) return false;
    const index = state.get().indexOf(field);
    if (index < 0) return false;
    const chip = chipRow.getChipElement(field);
    if (!chip) return false;

    const rect = rectOf(chip);
    const first = captureRects(allChips());
    // 先克隆：浮影必须基于还带 ✕、未重渲染的源 chip。
    const ghost = createGhostFrom(chip, rect);

    state.removeAt(index);
    const awaited = awaitPoolTarget(field);
    playFlip(allChips(), first, { durationMs: FLIP_MS });
    flyGhostToPool(ghost, field, awaited.chip, awaited.target);
    return true;
  };

  pool.element.addEventListener("mousedown", onMouseDown);
  chipRow.element.addEventListener("mousedown", onMouseDown);
  doc.addEventListener("mousemove", onMouseMove);
  doc.addEventListener("mouseup", onMouseUp);
  win.addEventListener("blur", onWindowBlur);

  return {
    isDragging: () => active !== null,
    cancel: () => {
      pending = null;
      if (active) cancelActive(active);
    },
    returnFieldToPool,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      pending = null;
      if (active) {
        if (active.rafId !== null) win.cancelAnimationFrame(active.rafId);
        if (active.ghost.isConnected) active.ghost.remove();
        active.element.classList.remove(CHIP_HIDDEN_CLASS);
        chipRow.clearGap(false);
        doc.documentElement?.classList.remove(DOC_DRAGGING_CLASS);
        active = null;
      }
      doc.removeEventListener("mousemove", onMouseMove);
      doc.removeEventListener("mouseup", onMouseUp);
      win.removeEventListener("blur", onWindowBlur);
      pool.element.removeEventListener("mousedown", onMouseDown);
      chipRow.element.removeEventListener("mousedown", onMouseDown);
      // 落位/淡出动画可能还在飞（此时 active 已为 null）：关窗时把浮影与临时
      // 克隆一并清掉，避免弹窗消失后残留 110~220ms 的碎片。
      const floating = doc.querySelectorAll(
        ".vt-prefs-subtitle-ghost, .vt-prefs-subtitle-clone",
      );
      floating.forEach((el: Element) => el.remove());
    },
  };
}
