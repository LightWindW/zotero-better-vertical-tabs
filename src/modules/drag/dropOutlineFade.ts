/**
 * Drop outline fade-out.
 *
 * While dragging over a category wrapper or the uncategorized drop-zone, the
 * target shows a dashed outline via the `.drag-over` class. On drop, the data
 * change re-renders the whole categories DOM: the outlined element is destroyed
 * and the outline vanishes instantly instead of transitioning.
 *
 * This module records the drop target at drop time. The render post-processing
 * then replays the fade-out on the freshly rendered element by briefly
 * re-adding `.drag-over` with transitions pinned off (so it appears instantly,
 * never fades in) and removing it again, letting the base rule's
 * `outline-color 0.3s ease` transition play the fade-out. No timers or inline
 * styles are left behind; dark mode colors come from the existing CSS rules.
 */

import type { DropTarget } from "./dropTarget";

export type DropOutlineFadeTarget =
  | { type: "category"; categoryId: string }
  | { type: "drop-zone" };

const TARGET_KEY = "__vtDropOutlineFadeTarget";
const STALE_TIMEOUT_KEY = "__vtDropOutlineFadeStaleTimeout";
/**
 * A mark is meant to be consumed by the very next re-render. If no render
 * follows (failed drop, no data change), expire the mark so a later unrelated
 * render cannot replay a stale fade.
 */
const STALE_TIMEOUT_MS = 2000;

function clearStaleTimeout(doc: Document): void {
  const win = doc.defaultView;
  const existing = (doc as any)[STALE_TIMEOUT_KEY] as number | undefined;
  if (existing !== undefined && win) {
    win.clearTimeout(existing);
  }
  delete (doc as any)[STALE_TIMEOUT_KEY];
}

/**
 * Record the drop target whose dashed outline should fade out after the next
 * re-render. A null target (element/type without a dashed outline) is ignored.
 * A later mark overwrites an earlier one.
 */
export function markDropOutlineFade(
  doc: Document,
  target: DropOutlineFadeTarget | null,
): void {
  if (!target) return;
  clearStaleTimeout(doc);
  (doc as any)[TARGET_KEY] = target;
  const win = doc.defaultView;
  if (win) {
    (doc as any)[STALE_TIMEOUT_KEY] = win.setTimeout(() => {
      delete (doc as any)[TARGET_KEY];
      delete (doc as any)[STALE_TIMEOUT_KEY];
    }, STALE_TIMEOUT_MS);
  }
}

/** Take the pending fade target (once), clearing any stale-timeout. */
export function consumeDropOutlineFade(
  doc: Document,
): DropOutlineFadeTarget | null {
  const target = (doc as any)[TARGET_KEY] as DropOutlineFadeTarget | undefined;
  delete (doc as any)[TARGET_KEY];
  clearStaleTimeout(doc);
  return target ?? null;
}

/** Drop a pending mark without consuming it (drop aborted / render never came). */
export function clearDropOutlineFade(doc: Document): void {
  delete (doc as any)[TARGET_KEY];
  clearStaleTimeout(doc);
}

/**
 * Map a mainPaneDrop DropTarget to a fade target. Returns null for targets
 * that never show a dashed outline (item before/after indicators, none).
 */
export function dropOutlineFadeTargetFromDropTarget(
  target: DropTarget,
): DropOutlineFadeTarget | null {
  if (target.type === "category") {
    return { type: "category", categoryId: target.categoryId };
  }
  if (target.type === "drop-zone") {
    return { type: "drop-zone" };
  }
  return null;
}

/**
 * Map a DOM element (category wrapper or drop-zone) to a fade target.
 * Returns null for anything else.
 */
export function dropOutlineFadeTargetForElement(
  el: Element | null,
): DropOutlineFadeTarget | null {
  if (!el) return null;
  if (el.classList.contains("vertical-tabs-category")) {
    const categoryId = (el as HTMLElement).dataset.categoryId;
    return categoryId ? { type: "category", categoryId } : null;
  }
  if (el.classList.contains("vertical-tabs-drop-zone")) {
    return { type: "drop-zone" };
  }
  return null;
}

/**
 * Replay the dashed-outline fade-out on the freshly rendered target element.
 * Must run synchronously right after renderCategories, before the next paint.
 *
 * The inline `transition: none` pin guarantees the outline appears instantly
 * even if the new element's style was already committed during rendering
 * (otherwise adding the class would fade IN first). Removing the class after
 * the reflow lets the base `outline-color 0.3s ease` transition fade it out.
 */
export function playDropOutlineFade(
  container: Element,
  target: DropOutlineFadeTarget,
): void {
  const el =
    target.type === "category"
      ? container.querySelector(
          `.vertical-tabs-category[data-category-id="${CSS.escape(target.categoryId)}"]`,
        )
      : container.querySelector(".vertical-tabs-drop-zone");
  if (!el) return;
  const htmlEl = el as HTMLElement;
  htmlEl.style.transition = "none";
  htmlEl.classList.add("drag-over");
  // Force a reflow so the dashed outline is committed with no transition.
  void htmlEl.offsetHeight;
  htmlEl.style.transition = "";
  htmlEl.classList.remove("drag-over");
}
