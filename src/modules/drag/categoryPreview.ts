/**
 * Drag-and-drop category / drop-zone height preview.
 *
 * While an item is being dragged over a category or the uncategorized drop-zone,
 * this module temporarily expands the target container so that items shifted
 * downward by dropPreview.ts remain visible and are not clipped by
 * `overflow: hidden`.
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

const PREVIEW_STATE_KEY = "__vtCategoryPreviewState";
const CATEGORY_PREVIEW_CLASS = "vt-category-preview";
const DROP_ZONE_PREVIEW_CLASS = "vt-drop-zone-preview";
const DEFAULT_ITEM_HEIGHT = 55;
const PREVIEW_ANIMATION_MS = 450;

interface PendingClear {
  element: HTMLElement;
  timeout: number;
}

interface CategoryPreviewState {
  target: HTMLElement | null;
  pendingClear: PendingClear | null;
  naturalHeights: Map<HTMLElement, number>;
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

function getContainerItems(container: Element): Element[] {
  return (
    Array.from(
      container.querySelectorAll(":scope .vertical-tabs-item"),
    ) as Element[]
  ).filter((el) => !el.classList.contains("vt-drag-source-collapsed"));
}

function getContainerItemCount(container: Element): number {
  return container.querySelectorAll(":scope .vertical-tabs-item").length;
}

function getItemHeight(container: Element, doc: Document): number {
  const items = getContainerItems(container);
  const first = items[0] as HTMLElement | undefined;
  if (first) return first.getBoundingClientRect().height;

  // Empty container: fall back to the configured item min-height.
  const inner =
    container.querySelector(":scope > .vertical-tabs-items") || container;
  const win = doc.defaultView || (globalThis as any);
  const computed = win.getComputedStyle(inner as HTMLElement);
  const minHeight = computed.getPropertyValue("--vt-item-min-height");
  if (minHeight) {
    const parsed = parseInt(minHeight, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return DEFAULT_ITEM_HEIGHT;
}

function getVerticalPadding(container: Element, doc: Document): number {
  const inner =
    container.querySelector(":scope > .vertical-tabs-items") || container;
  const win = doc.defaultView || (globalThis as any);
  const computed = win.getComputedStyle(inner as HTMLElement);
  return pxValue(computed, "padding-top") + pxValue(computed, "padding-bottom");
}

function getContainerCategoryId(container: Element): string {
  if (container.classList.contains("vertical-tabs-category")) {
    return (container as HTMLElement).dataset.categoryId || "";
  }
  return "__uncategorized__";
}

function computeTnew(
  container: Element,
  sourceCategoryId: string | null,
  draggedCount: number,
): number {
  const targetCategoryId = getContainerCategoryId(container);
  const currentCount = getContainerItemCount(container);
  const fromTarget =
    sourceCategoryId && sourceCategoryId === targetCategoryId
      ? draggedCount
      : 0;
  return currentCount - fromTarget + draggedCount;
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
    // Use the actual rendered height of the items wrapper. This matches the
    // current visual height, so the transition starts from the exact visual
    // height and does not jump.
    return target.getBoundingClientRect().height;
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
  htmlEl.style.removeProperty("--vt-category-preview-tnew");
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

function computePreviewHeight(
  container: Element,
  tNew: number,
  doc: Document,
): number {
  const itemHeight = getItemHeight(container, doc);
  const padding = getVerticalPadding(container, doc);
  return tNew * itemHeight + padding;
}

function applyPreviewHeight(
  container: Element,
  tNew: number,
  doc: Document,
): void {
  setCategoryPreviewHeight(
    container as HTMLElement,
    computePreviewHeight(container, tNew, doc),
  );
}

function isPreviewActive(container: Element): boolean {
  return (
    container.classList.contains(CATEGORY_PREVIEW_CLASS) ||
    container.classList.contains(DROP_ZONE_PREVIEW_CLASS)
  );
}

function enterPreview(container: Element, tNew: number, doc: Document): void {
  const htmlEl = container as HTMLElement;

  // Cancel any in-progress collapse/expand animation before taking over the
  // items height, otherwise the old cleanup timeout could wipe out the preview
  // height we are about to set.
  cancelCategoryCollapseAnimation(htmlEl);

  // If the container is already previewed, just update the target height.
  if (isPreviewActive(container)) {
    applyPreviewHeight(container, tNew, doc);
    return;
  }

  const target = getPreviewTargetElement(container);
  if (!target) return;

  // 1. Record the starting (natural) height as an explicit pixel value so the
  //    browser has a concrete length to interpolate from.
  const naturalHeight = getNaturalHeight(container, doc);
  getState(doc).naturalHeights.set(htmlEl, naturalHeight);
  target.style.height = `${naturalHeight}px`;

  // 2. Enable the preview state. The CSS transition is now active.
  addPreviewClass(container);

  // 3. Force a reflow so the browser commits the starting height before we
  //    ask it to animate toward the preview height.
  void target.offsetHeight;

  // 4. Move to the final preview height. This triggers the smooth transition.
  applyPreviewHeight(container, tNew, doc);
}

export function applyCategoryPreview(
  doc: Document,
  targetContainer: Element,
  sourceCategoryId: string | null,
  draggedCount = 1,
): void {
  const state = getState(doc);
  const tNew = computeTnew(targetContainer, sourceCategoryId, draggedCount);

  // Same container: only the count changed; update height smoothly.
  if (state.target === targetContainer) {
    const current = (targetContainer as HTMLElement).style.getPropertyValue(
      "--vt-category-preview-tnew",
    );
    if (current === String(tNew)) return;
    applyPreviewHeight(targetContainer, tNew, doc);
    (targetContainer as HTMLElement).style.setProperty(
      "--vt-category-preview-tnew",
      String(tNew),
    );
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

  enterPreview(targetContainer, tNew, doc);
  (targetContainer as HTMLElement).style.setProperty(
    "--vt-category-preview-tnew",
    String(tNew),
  );
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
    removePreviewClassAndVars(target);
  }

  state.target = null;
}

export function destroyCategoryPreviewState(doc: Document): void {
  const state = getState(doc);
  state.naturalHeights.clear();
  clearCategoryPreview(doc, false);
  delete (doc as any)[PREVIEW_STATE_KEY];
}
