/**
 * Drag-and-drop category / drop-zone height preview.
 *
 * While an item is being dragged over a category or the uncategorized drop-zone,
 * this module temporarily expands the target container so that items shifted
 * downward by dropPreview.ts remain visible and are not clipped by
 * `overflow: hidden`.
 *
 * The target height is the container's REAL content height:
 *   Σ(visible row heights) + (one-row insertion gap) + container padding.
 * Rows are not a fixed height (a row with the "extra" field enabled is one
 * line taller), so a row-count × baseline formula under-allocates and clips
 * the bottom rows. The row sum and the gap height both come from
 * drag/dragRowMetrics.ts; the collapsed drag-source rows are excluded from the
 * sum, and for a multi-tab drag the gap stands for the topmost dragged row
 * (the drop cascade shows that row at full height first).
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

interface PendingClear {
  element: HTMLElement;
  timeout: number;
}

interface CategoryPreviewState {
  target: HTMLElement | null;
  pendingClear: PendingClear | null;
  naturalHeights: Map<HTMLElement, number>;
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
    pendingClear: null,
    naturalHeights: new Map(),
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

function getNaturalHeight(container: Element, doc: Document): number {
  const target = getPreviewTargetElement(container);
  if (!target) return 0;

  if (isCategoryContainer(container)) {
    // Collapsed items are pinned to height 0 (padding 0), so their rendered
    // height says nothing about the content: `scrollHeight` is the height the
    // preview has to expand to. Expanded containers use the exact rendered
    // height — it already reflects every remaining row's real height (rows can
    // be taller with "show extra") and the collapsed drag-source rows.
    return container.classList.contains("collapsed")
      ? target.scrollHeight
      : target.getBoundingClientRect().height;
  }

  if (isDropZoneContainer(container)) {
    const win = doc.defaultView || (globalThis as any);
    const computed = win.getComputedStyle(target);
    const minHeight = pxValue(computed, "min-height");
    const paddingTop = pxValue(computed, "padding-top");
    const paddingBottom = pxValue(computed, "padding-bottom");
    return minHeight + paddingTop + paddingBottom;
  }

  return 0;
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

function cancelPendingClear(state: CategoryPreviewState, doc: Document): void {
  if (!state.pendingClear) return;
  const win = doc.defaultView || (globalThis as any);
  win.clearTimeout(state.pendingClear.timeout);
  state.pendingClear = null;
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

function schedulePreviewClear(
  state: CategoryPreviewState,
  container: Element,
  doc: Document,
): void {
  const win = doc.defaultView || (globalThis as any);
  const htmlEl = container as HTMLElement;

  // Transition back to the container's natural height (recorded when we
  // entered preview). If we re-measure while preview is active we would read
  // the preview height and the container would not shrink.
  const naturalHeight = state.naturalHeights.get(htmlEl);
  if (naturalHeight !== undefined) {
    setCategoryPreviewHeight(htmlEl, naturalHeight);
  }

  const timeout = win.setTimeout(() => {
    state.naturalHeights.delete(htmlEl);
    state.appliedHeights.delete(htmlEl);
    state.previewHeights.delete(htmlEl);
    removePreviewClassAndVars(htmlEl);
    if (state.pendingClear?.element === htmlEl) {
      state.pendingClear = null;
    }
    if (state.target === htmlEl) {
      state.target = null;
    }
  }, PREVIEW_ANIMATION_MS);

  state.pendingClear = { element: htmlEl, timeout };
}

/**
 * The real height this container needs while the current drag hovers it.
 * `getContainerPreviewDelta` already encodes the "same container vs other
 * container" difference (and returns 0 when the source row has not collapsed
 * yet, because the measured height still contains it).
 */
function computePreviewHeight(
  state: CategoryPreviewState,
  doc: Document,
  container: Element,
): number {
  const delta = getContainerPreviewDelta(doc, container);
  if (isCategoryContainer(container)) {
    const base =
      state.naturalHeights.get(container as HTMLElement) ??
      getNaturalHeight(container, doc);
    return base + delta;
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
      computePreviewHeight(state, doc, container);
    state.previewHeights.set(container, height);
    applyPreviewHeight(container, height, doc);
    return;
  }

  const target = getPreviewTargetElement(container);
  if (!target) return;

  // 1. Record the starting (natural) height as an explicit pixel value so the
  //    browser has a concrete length to interpolate from. It is also the base
  //    the preview height is derived from (collapsed categories: scrollHeight).
  const naturalHeight = getNaturalHeight(container, doc);
  state.naturalHeights.set(htmlEl, naturalHeight);
  // 2. Decide the target height ONCE. The source row may collapse after this
  //    first dragover (the collapse happens in a rAF callback), so re-deriving
  //    the height from the later layout would add one extra row of blank space.
  const targetHeight = computePreviewHeight(state, doc, container);
  state.previewHeights.set(container, targetHeight);

  target.style.height = `${naturalHeight}px`;

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
      computePreviewHeight(state, doc, targetContainer);
    state.previewHeights.set(targetContainer, height);
    if (state.appliedHeights.get(targetContainer) === height) return;
    applyPreviewHeight(targetContainer, height, doc);
    return;
  }

  // If this container was scheduled to be cleared (e.g. rapid A->B->A),
  // cancel the cleanup so we can re-enter preview cleanly.
  if (state.pendingClear && state.pendingClear.element === targetContainer) {
    cancelPendingClear(state, doc);
  }

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
  if (!target) {
    cancelPendingClear(state, doc);
    return;
  }

  cancelPendingClear(state, doc);

  if (animate) {
    // schedulePreviewClear reads the recorded natural height to transition
    // back to — do NOT delete it here; its own timeout deletes the entry
    // after the animation completes. (Deleting it first froze the height at
    // the preview value and snapped it when the cleanup ran.)
    schedulePreviewClear(state, target, doc);
  } else {
    state.naturalHeights.delete(target);
    state.appliedHeights.delete(target);
    state.previewHeights.delete(target);
    removePreviewClassAndVars(target);
  }

  state.target = null;
}

export function destroyCategoryPreviewState(doc: Document): void {
  const state = getState(doc);
  state.naturalHeights.clear();
  state.appliedHeights = new WeakMap();
  state.previewHeights = new WeakMap();
  clearCategoryPreview(doc, false);
  delete (doc as any)[PREVIEW_STATE_KEY];
}
