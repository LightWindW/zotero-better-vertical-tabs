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

interface CategoryPreviewState {
  target: Element | null;
}

function getState(doc: Document): CategoryPreviewState {
  const existing = (doc as any)[PREVIEW_STATE_KEY] as
    | CategoryPreviewState
    | undefined;
  if (existing) return existing;
  const state: CategoryPreviewState = { target: null };
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

function applyPreviewToElement(
  container: Element,
  tNew: number,
  doc: Document,
): void {
  const itemHeight = getItemHeight(container, doc);
  const padding = getVerticalPadding(container, doc);
  const previewHeight = tNew * itemHeight + padding;

  const htmlEl = container as HTMLElement;
  htmlEl.style.setProperty(
    "--vt-category-preview-height",
    `${previewHeight}px`,
  );

  if (container.classList.contains("vertical-tabs-category")) {
    htmlEl.classList.add(CATEGORY_PREVIEW_CLASS);
  } else if (container.classList.contains("vertical-tabs-drop-zone")) {
    htmlEl.classList.add(DROP_ZONE_PREVIEW_CLASS);
  }
}

export function applyCategoryPreview(
  doc: Document,
  targetContainer: Element,
  sourceCategoryId: string | null,
  draggedCount = 1,
): void {
  const state = getState(doc);

  // No-op if we are already previewing the same container with the same count.
  if (state.target === targetContainer) {
    const tNew = computeTnew(targetContainer, sourceCategoryId, draggedCount);
    const current = (targetContainer as HTMLElement).style.getPropertyValue(
      "--vt-category-preview-tnew",
    );
    if (current === String(tNew)) return;
  }

  clearCategoryPreview(doc);

  const tNew = computeTnew(targetContainer, sourceCategoryId, draggedCount);
  applyPreviewToElement(targetContainer, tNew, doc);
  (targetContainer as HTMLElement).style.setProperty(
    "--vt-category-preview-tnew",
    String(tNew),
  );
  state.target = targetContainer;
}

export function clearCategoryPreview(doc: Document): void {
  const state = getState(doc);
  const target = state.target;
  if (!target) return;

  const htmlEl = target as HTMLElement;
  htmlEl.classList.remove(CATEGORY_PREVIEW_CLASS, DROP_ZONE_PREVIEW_CLASS);
  htmlEl.style.removeProperty("--vt-category-preview-height");
  htmlEl.style.removeProperty("--vt-category-preview-tnew");
  state.target = null;
}

export function destroyCategoryPreviewState(doc: Document): void {
  clearCategoryPreview(doc);
  delete (doc as any)[PREVIEW_STATE_KEY];
}
