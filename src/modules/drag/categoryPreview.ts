/**
 * Drag-and-drop category / drop-zone height preview.
 *
 * While an item is being dragged over a category or the uncategorized drop-zone,
 * this module temporarily expands the target container so that items shifted
 * downward by dropPreview.ts remain visible and are not clipped by
 * `overflow: hidden`.
 *
 * Like dropPreview.ts, this module only manipulates visual DOM classes/styles
 * and does not mutate persisted data.
 */

const PREVIEW_STATE_KEY = "__vtCategoryPreviewState";
const CATEGORY_PREVIEW_CLASS = "vt-category-preview";
const DROP_ZONE_PREVIEW_CLASS = "vt-drop-zone-preview";
const DEFAULT_ITEM_HEIGHT = 55;
const PREVIEW_ANIMATION_MS = 200;

interface PendingClear {
  element: Element;
  timeout: number;
}

interface CategoryPreviewState {
  target: Element | null;
  pendingClear: PendingClear | null;
}

function getState(doc: Document): CategoryPreviewState {
  const existing = (doc as any)[PREVIEW_STATE_KEY] as
    | CategoryPreviewState
    | undefined;
  if (existing) return existing;
  const state: CategoryPreviewState = { target: null, pendingClear: null };
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
  if (first) return first.offsetHeight;

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

function hasPreviewClass(container: Element): boolean {
  return (
    container.classList.contains(CATEGORY_PREVIEW_CLASS) ||
    container.classList.contains(DROP_ZONE_PREVIEW_CLASS)
  );
}

function getNaturalHeight(container: Element, doc: Document): number {
  if (isCategoryContainer(container)) {
    if (container.classList.contains("collapsed")) {
      return 0;
    }
    const items = container.querySelector(
      ":scope > .vertical-tabs-items",
    ) as HTMLElement | null;
    return items ? items.scrollHeight : 0;
  }

  if (isDropZoneContainer(container)) {
    const win = doc.defaultView || (globalThis as any);
    const computed = win.getComputedStyle(container as HTMLElement);
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
}

function cancelPendingClear(state: CategoryPreviewState, doc: Document): void {
  if (!state.pendingClear) return;
  const win = doc.defaultView || (globalThis as any);
  win.clearTimeout(state.pendingClear.timeout);
  state.pendingClear = null;
}

function schedulePreviewClear(
  state: CategoryPreviewState,
  container: Element,
  doc: Document,
): void {
  const win = doc.defaultView || (globalThis as any);
  const htmlEl = container as HTMLElement;

  // Transition back to the container's natural height first...
  htmlEl.style.setProperty(
    "--vt-category-preview-height",
    `${getNaturalHeight(container, doc)}px`,
  );

  const timeout = win.setTimeout(() => {
    removePreviewClassAndVars(htmlEl);
    if (state.pendingClear?.element === container) {
      state.pendingClear = null;
    }
    if (state.target === container) {
      state.target = null;
    }
  }, PREVIEW_ANIMATION_MS);

  state.pendingClear = { element: container, timeout };
}

function applyPreviewHeight(
  container: Element,
  tNew: number,
  doc: Document,
): void {
  const itemHeight = getItemHeight(container, doc);
  const padding = getVerticalPadding(container, doc);
  const previewHeight = tNew * itemHeight + padding;
  (container as HTMLElement).style.setProperty(
    "--vt-category-preview-height",
    `${previewHeight}px`,
  );
}

function enterPreview(container: Element, tNew: number, doc: Document): void {
  const htmlEl = container as HTMLElement;

  // If the container is already previewed, just update the target height.
  if (hasPreviewClass(container)) {
    applyPreviewHeight(container, tNew, doc);
    return;
  }

  // 1. Record the starting (natural) height so the browser has a concrete
  //    length to interpolate from.
  htmlEl.style.setProperty(
    "--vt-category-preview-height",
    `${getNaturalHeight(container, doc)}px`,
  );

  // 2. Enable the preview state. From now on grid-template-rows / min-height
  //    are controlled by the CSS variable and will transition.
  addPreviewClass(container);

  // 3. Force a reflow so the browser commits the starting height before we
  //    ask it to animate toward the preview height.
  void htmlEl.offsetHeight;

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
  state.target = targetContainer;
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
    schedulePreviewClear(state, target, doc);
  } else {
    removePreviewClassAndVars(target as HTMLElement);
  }

  state.target = null;
}

export function destroyCategoryPreviewState(doc: Document): void {
  clearCategoryPreview(doc, false);
  delete (doc as any)[PREVIEW_STATE_KEY];
}
