/**
 * Drag-and-drop category / drop-zone height preview.
 *
 * While an item is being dragged over a category or the uncategorized drop-zone,
 * this module temporarily expands the target container so that items shifted
 * downward by dropPreview.ts remain visible and are not clipped by
 * `overflow: hidden`.
 *
 * The target height is the container's REAL height plus one placeholder:
 * an expanded container already reflects every remaining row's rendered height
 * (rows can be taller with "show extra"), so nothing is derived from a row
 * count. `getContainerPreviewDelta` supplies the one difference that matters:
 * inserting into the drag's OWN container adds no extra inter-row gap (and no
 * delta at all while the source row has not collapsed yet), inserting into
 * another container adds the full placeholder slot.
 *
 * Categories are animated by transitioning `.vertical-tabs-items` `height`
 * between explicit pixel values, which is more reliable in Firefox/Zotero than
 * `grid-template-rows` transitions involving `auto`/`1fr`.
 *
 * The uncategorized drop-zone has no inner items wrapper, so it keeps using a
 * CSS variable that drives `min-height`.
 *
 * Like dropPreview.ts, this module only manipulates visual DOM classes/styles
 * and does not mutate persisted data.
 */

import { cancelCategoryCollapseAnimation } from "../render/categoryCollapse";
import {
  getContainerPreviewDelta,
  getRowsContentHeight,
} from "./dragRowMetrics";

const PREVIEW_STATE_KEY = "__vtCategoryPreviewState";
const CATEGORY_PREVIEW_CLASS = "vt-category-preview";
const DROP_ZONE_PREVIEW_CLASS = "vt-drop-zone-preview";
const PREVIEW_ANIMATION_MS = 450;

interface CategoryPreviewState {
  target: HTMLElement | null;
  /**
   * Containers currently animating back to their natural height, each with its
   * own cleanup timeout. A single slot (the previous design) lost track of the
   * older entries when the drag hopped between three or more containers: the
   * orphaned timeout then stripped a container that had been re-entered,
   * snapping its height instead of animating it.
   */
  pendingClears: Map<HTMLElement, number>;
  /** Height most recently applied to each previewed container. */
  appliedHeights: WeakMap<Element, number>;
  /**
   * Target height decided when the container entered preview. It must not be
   * recomputed while the drag lasts: the source row can collapse AFTER the
   * first dragover (the rAF callback runs after the first drag events), and
   * re-deriving the height from the then-changed layout would grow the
   * container by one extra row.
   */
  previewHeights: WeakMap<Element, number>;
}

function getState(doc: Document): CategoryPreviewState {
  const existing = (doc as any)[PREVIEW_STATE_KEY] as
    | CategoryPreviewState
    | undefined;
  if (existing) return existing;
  const state: CategoryPreviewState = {
    target: null,
    pendingClears: new Map(),
    appliedHeights: new WeakMap(),
    previewHeights: new WeakMap(),
  };
  (doc as any)[PREVIEW_STATE_KEY] = state;
  return state;
}

function pxValue(computed: CSSStyleDeclaration, property: string): number {
  const raw = computed.getPropertyValue(property);
  if (!raw) return 0;
  const parsed = parseFloat(raw);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function isCategoryContainer(container: Element): boolean {
  return container.classList.contains("vertical-tabs-category");
}

function isDropZoneContainer(container: Element): boolean {
  return container.classList.contains("vertical-tabs-drop-zone");
}

function getItemsContainer(wrapper: Element): HTMLElement | null {
  return wrapper.querySelector(":scope > .vertical-tabs-items");
}

/**
 * Return the DOM element whose `height` (or `min-height`) should be animated
 * for preview. For categories this is the inner `.vertical-tabs-items`; for
 * the drop-zone it is the drop-zone itself.
 */
function getPreviewTargetElement(container: Element): HTMLElement | null {
  if (isCategoryContainer(container)) {
    return getItemsContainer(container);
  }
  if (isDropZoneContainer(container)) {
    return container as HTMLElement;
  }
  return null;
}

/**
 * Content height the preview expands TO. Collapsed items are pinned to height 0
 * (padding 0), so their rendered height says nothing about the content:
 * `scrollHeight` is the height the preview has to expand to. Expanded containers
 * use the exact rendered height — it already reflects every remaining row's real
 * height (rows can be taller with "show extra") and the collapsed drag-source
 * rows.
 *
 * The inline pin is cleared for the synchronous measurement and restored in the
 * same task — no frame is painted in between, so nothing flickers.
 */
function measureContentHeight(container: Element, doc: Document): number {
  const target = getPreviewTargetElement(container);
  if (!target) return 0;

  if (isCategoryContainer(container)) {
    const pinnedHeight = target.style.height;
    target.style.height = "";
    const content = container.classList.contains("collapsed")
      ? target.scrollHeight
      : target.getBoundingClientRect().height;
    target.style.height = pinnedHeight;
    return content;
  }

  // Drop-zone: the preview height lives in a custom property that drives
  // `min-height`, so read `min-height` with that property removed.
  const htmlEl = container as HTMLElement;
  const win = doc.defaultView || (globalThis as any);
  const previewVar = htmlEl.style.getPropertyValue(
    "--vt-category-preview-height",
  );
  if (previewVar) htmlEl.style.removeProperty("--vt-category-preview-height");
  const computed = win.getComputedStyle(target);
  const content =
    pxValue(computed, "min-height") +
    pxValue(computed, "padding-top") +
    pxValue(computed, "padding-bottom");
  if (previewVar) {
    htmlEl.style.setProperty("--vt-category-preview-height", previewVar);
  }
  return content;
}

/**
 * Height the container RESTS at (the endpoint of a release):
 * - a collapsed category rests at 0, so the preview must both animate OPEN from
 *   0 and fold back to 0 — exactly like the normal expand/collapse animation;
 * - an expanded category rests at its current rendered height (re-measured, as
 *   the value recorded when the preview started can be stale).
 */
function measureRestingHeight(container: Element, doc: Document): number {
  const target = getPreviewTargetElement(container);
  if (!target) return 0;

  if (isCategoryContainer(container)) {
    if (container.classList.contains("collapsed")) return 0;
    const pinnedHeight = target.style.height;
    target.style.height = "";
    const resting = target.getBoundingClientRect().height;
    target.style.height = pinnedHeight;
    return resting;
  }

  // Drop-zone: fall back to the un-previewed `min-height` box.
  return measureContentHeight(container, doc);
}

function addPreviewClass(container: Element): void {
  if (isCategoryContainer(container)) {
    (container as HTMLElement).classList.add(CATEGORY_PREVIEW_CLASS);
  } else if (isDropZoneContainer(container)) {
    (container as HTMLElement).classList.add(DROP_ZONE_PREVIEW_CLASS);
  }
}

function removePreviewClassAndVars(htmlEl: HTMLElement): void {
  htmlEl.classList.remove(CATEGORY_PREVIEW_CLASS, DROP_ZONE_PREVIEW_CLASS);
  htmlEl.style.removeProperty("--vt-category-preview-height");
  // Clear any inline height we set on the category items or drop-zone.
  const target = getPreviewTargetElement(htmlEl);
  if (target) target.style.height = "";
  // Make sure a stale collapse/expand animation does not clobber the now
  // restored CSS-class-driven height.
  cancelCategoryCollapseAnimation(htmlEl, { reset: true });
}

/** Cancel the cleanup timeout of one container, or of every pending container. */
function cancelPendingClear(
  state: CategoryPreviewState,
  doc: Document,
  element?: HTMLElement,
): void {
  const win = doc.defaultView || (globalThis as any);
  if (element) {
    const timeout = state.pendingClears.get(element);
    if (timeout !== undefined) {
      win.clearTimeout(timeout);
      state.pendingClears.delete(element);
    }
    return;
  }
  for (const timeout of state.pendingClears.values()) {
    win.clearTimeout(timeout);
  }
  state.pendingClears.clear();
}

function setCategoryPreviewHeight(
  container: HTMLElement,
  height: number,
): void {
  if (isCategoryContainer(container)) {
    const items = getItemsContainer(container);
    if (items) items.style.height = `${height}px`;
  } else if (isDropZoneContainer(container)) {
    container.style.setProperty("--vt-category-preview-height", `${height}px`);
  }
}

/**
 * Finish a scheduled release immediately. Safe at any time: the release already
 * moved the height to its natural value, so dropping the inline pin does not
 * change the layout (nothing snaps).
 */
function finishPendingRelease(
  state: CategoryPreviewState,
  doc: Document,
  htmlEl: HTMLElement,
): void {
  cancelPendingClear(state, doc, htmlEl);
  state.appliedHeights.delete(htmlEl);
  state.previewHeights.delete(htmlEl);
  removePreviewClassAndVars(htmlEl);
  if (state.target === htmlEl) state.target = null;
}

function schedulePreviewClear(
  state: CategoryPreviewState,
  container: Element,
  doc: Document,
): void {
  const win = doc.defaultView || (globalThis as any);
  const htmlEl = container as HTMLElement;

  // Re-scheduling the same container must not stack cleanup timeouts.
  cancelPendingClear(state, doc, htmlEl);

  // Release to the container's RESTING height, measured fresh: an expanded
  // container returns to its current content height, a collapsed one folds back
  // to 0 with the same transition as a normal collapse. The timeout then removes
  // the inline pin at the same value, so nothing snaps at cleanup.
  setCategoryPreviewHeight(htmlEl, measureRestingHeight(container, doc));

  const timeout = win.setTimeout(() => {
    state.pendingClears.delete(htmlEl);
    state.appliedHeights.delete(htmlEl);
    state.previewHeights.delete(htmlEl);
    removePreviewClassAndVars(htmlEl);
    if (state.target === htmlEl) {
      state.target = null;
    }
  }, PREVIEW_ANIMATION_MS);

  state.pendingClears.set(htmlEl, timeout);
}

/**
 * The real height this container needs while the current drag hovers it.
 * `getContainerPreviewDelta` already encodes the "same container vs other
 * container" difference (and returns 0 when the source row has not collapsed
 * yet, because the measured height still contains it).
 */
function computePreviewHeight(doc: Document, container: Element): number {
  const delta = getContainerPreviewDelta(doc, container);
  if (isCategoryContainer(container)) {
    return measureContentHeight(container, doc) + delta;
  }
  // The uncategorized drop-zone previews through `min-height`, so the value
  // must cover the rows' content (collapsed margins included) + placeholder.
  return getRowsContentHeight(doc, container) + delta;
}

function applyPreviewHeight(
  container: Element,
  height: number,
  doc: Document,
): void {
  setCategoryPreviewHeight(container as HTMLElement, height);
  getState(doc).appliedHeights.set(container, height);
}

function isPreviewActive(container: Element): boolean {
  return (
    container.classList.contains(CATEGORY_PREVIEW_CLASS) ||
    container.classList.contains(DROP_ZONE_PREVIEW_CLASS)
  );
}

function enterPreview(container: Element, doc: Document): void {
  const htmlEl = container as HTMLElement;
  const state = getState(doc);

  // Cancel any in-progress collapse/expand animation before taking over the
  // items height, otherwise the old cleanup timeout could wipe out the preview
  // height we are about to set.
  cancelCategoryCollapseAnimation(htmlEl);

  // Already previewed (rapid A->B->A handoff): re-apply the height that was
  // decided when this container entered preview.
  if (isPreviewActive(container)) {
    const height =
      state.previewHeights.get(container) ??
      computePreviewHeight(doc, container);
    state.previewHeights.set(container, height);
    applyPreviewHeight(container, height, doc);
    return;
  }

  const target = getPreviewTargetElement(container);
  if (!target) return;

  // 1. Pin the STARTING height: the container's actual resting height — which is
  //    0 for a collapsed category. Pin it explicitly so the browser has a
  //    concrete length to interpolate from; pinning the expanded content height
  //    instead (the bug this replaces) made the category pop open instantly and
  //    only animate the last few pixels.
  const startHeight = measureRestingHeight(container, doc);
  // 2. Decide the target height ONCE. The source row may collapse after this
  //    first dragover (the collapse happens in a rAF callback), so re-deriving
  //    the height from the later layout would add one extra row of blank space.
  const targetHeight = computePreviewHeight(doc, container);
  state.previewHeights.set(container, targetHeight);

  target.style.height = `${startHeight}px`;

  // 3. Enable the preview state. The CSS transition is now active.
  addPreviewClass(container);

  // 4. Force a reflow so the browser commits the starting height before we
  //    ask it to animate toward the preview height.
  void target.offsetHeight;

  // 5. Move to the final preview height. This triggers the smooth transition.
  applyPreviewHeight(container, targetHeight, doc);
}

export function applyCategoryPreview(
  doc: Document,
  targetContainer: Element,
): void {
  const state = getState(doc);

  // Same container: the target height is fixed for the whole drag.
  if (state.target === targetContainer) {
    const height =
      state.previewHeights.get(targetContainer) ??
      computePreviewHeight(doc, targetContainer);
    state.previewHeights.set(targetContainer, height);
    if (state.appliedHeights.get(targetContainer) === height) return;
    applyPreviewHeight(targetContainer, height, doc);
    return;
  }

  // If a cleanup is pending for THIS container (rapid A->B->A and friends),
  // cancel it so the container is not stripped while it is previewed again.
  cancelPendingClear(state, doc, targetContainer as HTMLElement);

  // Smoothly release the previously previewed container, if any.
  if (state.target && state.target !== targetContainer) {
    schedulePreviewClear(state, state.target, doc);
  }

  enterPreview(targetContainer, doc);
  state.target = targetContainer as HTMLElement;
}

export function clearCategoryPreview(doc: Document, animate = false): void {
  const state = getState(doc);
  const target = state.target;

  // Pending releases of OTHER containers must not be left half-torn-down: their
  // cleanup timers are going away with this teardown, so finish them now (their
  // height is already at the natural value, so no visual snap).
  for (const htmlEl of Array.from(state.pendingClears.keys())) {
    if (!animate || htmlEl !== target) {
      finishPendingRelease(state, doc, htmlEl);
    }
  }
  if (!target) return;

  if (animate) {
    // Release the hovered container with a transition back to the natural
    // height; the scheduled cleanup removes the inline pin afterwards.
    schedulePreviewClear(state, target, doc);
  } else {
    state.appliedHeights.delete(target);
    state.previewHeights.delete(target);
    removePreviewClassAndVars(target);
  }

  state.target = null;
}

export function destroyCategoryPreviewState(doc: Document): void {
  const state = getState(doc);
  cancelPendingClear(state, doc);
  state.appliedHeights = new WeakMap();
  state.previewHeights = new WeakMap();
  clearCategoryPreview(doc, false);
  delete (doc as any)[PREVIEW_STATE_KEY];
}
