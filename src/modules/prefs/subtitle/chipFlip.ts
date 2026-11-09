/**
 * chip 拖拽 / 重排的动画原语：FLIP、浮影落位、原地淡出。
 *
 * 只做几何测量与 inline style，不碰业务状态。FLIP 快照按 chip 的
 * `data-vt-subtitle-field` 键控而不是元素引用：chip 行与标签池每次渲染都会
 * 重建 DOM，跨渲染的 FIRST/LAST 必须按字段 id 对齐。
 *
 * 运动曲线统一走 MOTION_EASING。曲线选型的关键是「起始斜率不能为 0」：
 * - ease-out 起步最快 → 首帧吃掉大段距离，像"先跳一下再走"；
 * - cubic-bezier(0.35, 0, 0.25, 1) 的 y1 = 0 → 起始速度≈0，前 ~40ms 只动
 *   1~2px（看着卡住），随后几十 ms 补完（像瞬移）；
 * - 现在用 cubic-bezier(0.3, 0.25, 0.2, 1)：起始斜率 0.25/0.3 ≈ 0.83（首帧即
 *   有明显但柔和的位移），中段加速、末段 y2 = 1 且 x2 < 1 减速收尾。
 * 不用 WAAPI / pointer events（沙盒与仓库均无先例），清理一律走 setTimeout
 * 兜底，元素被销毁时自然失效。
 */

export interface ChipRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type ChipRectMap = Map<string, ChipRect>;

/** chip 上标识字段的 DOM 属性（FLIP 以它为键）。 */
export const CHIP_FIELD_ATTR = "data-vt-subtitle-field";
/** 拖拽中的源 chip：退出布局（display:none）。 */
export const CHIP_HIDDEN_CLASS = "vt-prefs-subtitle-chip-hidden";
/** 等待浮影落位的真实 chip：保留布局但不可见（visibility:hidden）。 */
export const CHIP_AWAITING_CLASS = "vt-prefs-subtitle-chip-awaiting";

const FLIP_SKIP_CLASSES = [CHIP_HIDDEN_CLASS, CHIP_AWAITING_CLASS];

/** 共享运动曲线：起始斜率 ≈ 0.83（非 0，首帧就有位移），中段加速、末段减速。 */
export const MOTION_EASING = "cubic-bezier(0.3, 0.05, 0.2, 1)";
/** FLIP 位移时长（同行 chip 让位）。 */
export const FLIP_MS = 200;
/** 浮影飞行时长（落位/回弹）。 */
export const DROP_MS = 220;
/** 落位后浮影淡出时长。 */
export const GHOST_FADE_MS = 110;
/** 浮影阴影淡入/淡出时长。 */
export const GHOST_SHADOW_MS = 120;
const DEFAULT_FADE_MS = 150;

export function rectOf(el: HTMLElement): ChipRect {
  const rect = el.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

function fieldOf(el: HTMLElement): string | null {
  return el.getAttribute(CHIP_FIELD_ATTR);
}

function isMeasurable(rect: ChipRect): boolean {
  return rect.width > 0 || rect.height > 0;
}

/** 每个元素当前挂着的 FLIP 清理定时器，重复播放时先清掉旧的。 */
const flipTimers = new WeakMap<HTMLElement, number>();

function clearFlipTimer(el: HTMLElement): void {
  const timer = flipTimers.get(el);
  if (timer === undefined) return;
  el.ownerDocument?.defaultView?.clearTimeout(timer);
  flipTimers.delete(el);
}

/**
 * 记录一批 chip 的当前位置（按字段 id 索引）。
 * display:none / 尚未布局的元素 rect 为 0，直接跳过，避免 FLIP 从 (0,0) 飞入。
 */
export function captureRects(elements: readonly HTMLElement[]): ChipRectMap {
  const map: ChipRectMap = new Map();
  for (const el of elements) {
    const field = fieldOf(el);
    if (!field) continue;
    const rect = rectOf(el);
    if (!isMeasurable(rect)) continue;
    map.set(field, rect);
  }
  return map;
}

/**
 * FLIP：把 `elements` 从 `first`（旧位置）补间到当前布局位置。
 * 写入顺序：inline transform + transition:none → 强制 reflow → 清 transform
 * 并开 transition。没有旧快照的新元素（首次出现）直接跳过。
 */
export function playFlip(
  elements: readonly HTMLElement[],
  first: ChipRectMap,
  options: { durationMs?: number } = {},
): void {
  const durationMs = options.durationMs ?? FLIP_MS;
  const moving: HTMLElement[] = [];

  for (const el of elements) {
    if (!el.isConnected) continue;
    // 正在拖拽（display:none）或等待浮影落位（visibility:hidden）的元素不参与
    // FLIP：它的 first 可能是「同一字段在另一个容器里的旧位置」，反演会把它从
    // 池子/副标题的旧位置一路动画过来（落位那一帧就会闪/跳）。
    if (FLIP_SKIP_CLASSES.some((cls) => el.classList.contains(cls))) continue;
    const field = fieldOf(el);
    if (!field) continue;
    const before = first.get(field);
    if (!before) continue;
    const after = rectOf(el);
    if (!isMeasurable(after)) continue;
    const dx = before.left - after.left;
    const dy = before.top - after.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
    el.style.transition = "none";
    el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    moving.push(el);
  }

  if (!moving.length) return;
  const win = moving[0].ownerDocument?.defaultView;
  // 强制 reflow，让浏览器先提交「旧位置」这一帧，后续清 transform 才有过渡。
  void moving[0].offsetWidth;

  for (const el of moving) {
    clearFlipTimer(el);
    el.style.transition = `transform ${durationMs}ms ${MOTION_EASING}`;
    el.style.transform = "";
  }

  if (!win) return;
  for (const el of moving) {
    const timer = win.setTimeout(() => {
      flipTimers.delete(el);
      if (!el.isConnected) return;
      el.style.transition = "";
      el.style.transform = "";
    }, durationMs + 40);
    flipTimers.set(el, timer);
  }
}

/**
 * 浮影飞到 `target`，交接流程为「先露出真实 chip（onDone），再让浮影连同阴影
 * 淡出」。这样真实 chip 在浮影底下显形、浮影 110ms 淡出收尾，阴影自然过渡，
 * 也兜住了「落位瞬间闪一下」的残余观感。
 *
 * transition 同时包含 transform / box-shadow / opacity；transitionend 只认
 * transform（opacity 结束不能重复触发）。丢失事件时用定时器兜底。
 */
export function flyGhostTo(
  ghost: HTMLElement,
  target: ChipRect,
  durationMs: number = DROP_MS,
  onDone?: () => void,
): void {
  const win = ghost.ownerDocument?.defaultView;
  let finished = false;
  const finish = (): void => {
    if (finished) return;
    finished = true;
    ghost.removeEventListener("transitionend", onTransitionEnd);
    // 先让真实 chip 在浮影底下显形，浮影再淡出（含阴影）→ 无缝交接。
    onDone?.();
    ghost.classList.remove("is-lifted");
    ghost.style.opacity = "0";
    win?.setTimeout(() => {
      if (ghost.isConnected) ghost.remove();
    }, GHOST_FADE_MS + 40);
  };
  const onTransitionEnd = (event: TransitionEvent): void => {
    if (event.target !== ghost || event.propertyName !== "transform") return;
    finish();
  };
  ghost.addEventListener("transitionend", onTransitionEnd);
  ghost.style.transition =
    `transform ${durationMs}ms ${MOTION_EASING}, ` +
    `box-shadow ${GHOST_SHADOW_MS}ms ease-out, ` +
    `opacity ${GHOST_FADE_MS}ms ease-out`;
  // 先提交 transition 再改 transform，否则同一帧内会被合并成瞬移。
  void ghost.offsetWidth;
  ghost.style.transform = `translate3d(${target.left}px, ${target.top}px, 0)`;
  win?.setTimeout(finish, durationMs + 80);
}

/** 原地淡出并移除元素（落位兜底路径的浮影收尾）。 */
export function fadeOutElement(
  el: HTMLElement,
  durationMs: number = DEFAULT_FADE_MS,
  onDone?: () => void,
): void {
  const win = el.ownerDocument?.defaultView;
  let finished = false;
  const finish = (): void => {
    if (finished) return;
    finished = true;
    if (el.isConnected) el.remove();
    onDone?.();
  };
  el.style.transition = `opacity ${durationMs}ms ${MOTION_EASING}`;
  void el.offsetWidth;
  el.style.opacity = "0";
  win?.setTimeout(finish, durationMs + 40);
}

/**
 * 给即将重渲染删除的 chip 留一个 fixed 克隆再淡出。
 * 必须在 DOM 重渲染之前调用（克隆需要测量到原矩形）。
 * `easing` 默认走 MOTION_EASING；「恢复默认」的克隆淡出可传 ease-in-out。
 */
export function fadeOutClone(
  source: HTMLElement,
  durationMs: number = DEFAULT_FADE_MS,
  easing: string = MOTION_EASING,
): void {
  const doc = source.ownerDocument;
  const win = doc?.defaultView;
  if (!doc || !doc.documentElement) return;
  const rect = rectOf(source);
  if (!isMeasurable(rect)) return;

  const clone = source.cloneNode(true) as HTMLElement;
  clone.classList.add("vt-prefs-subtitle-clone");
  clone.style.position = "fixed";
  clone.style.left = `${rect.left}px`;
  clone.style.top = `${rect.top}px`;
  clone.style.width = `${rect.width}px`;
  clone.style.height = `${rect.height}px`;
  clone.style.margin = "0";
  clone.style.pointerEvents = "none";
  clone.style.zIndex = "100002";
  clone.style.transition = `opacity ${durationMs}ms ${easing}`;
  clone.style.opacity = "1";
  doc.documentElement.appendChild(clone);
  void clone.offsetWidth;
  clone.style.opacity = "0";
  win?.setTimeout(() => clone.remove(), durationMs + 40);
}

export { DEFAULT_FADE_MS };
