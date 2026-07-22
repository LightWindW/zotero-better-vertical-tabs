/**
 * Item drop indicator positioning for drop-zones and categories.
 *
 * Both the uncategorized drop-zone and category item lists use the same
 * visual model: the green insertion line is vertically centered inside the
 * one-tag-height gap that is being opened, instead of sitting at the edge of
 * the target item. The line is always attached to an element that does *not*
 * shift (the item above the gap, or the container's top edge) so it stays
 * stationary while items below animate downward.
 */

const INDICATOR_OFFSET_VAR = "--vt-drop-indicator-offset";
const TOP_GAP_OFFSET_VAR = "--vt-drop-indicator-top-offset";
const EMPTY_PREVIEW_CLASS = "vt-drop-preview-empty";
const TOP_GAP_PREVIEW_CLASS = "vt-drop-preview-top-gap";
const ACTIVE_KEY = "__vtActiveDropIndicators";

/**
 * Per-document set of elements carrying an active drop indicator. The clear
 * path iterates this (0–2 elements in practice) instead of scanning the
 * whole document with querySelectorAll on every dragover event. Stale
 * entries (rows destroyed by a re-render) are harmless: clearing classes on
 * a detached element is a no-op and the set is drained on the next clear.
 */
function getActiveIndicators(doc: Document): Set<Element> {
  let set = (doc as any)[ACTIVE_KEY] as Set<Element> | undefined;
  if (!set) {
    set = new Set();
    (doc as any)[ACTIVE_KEY] = set;
  }
  return set;
}

export function setItemDropIndicator(
  row: HTMLElement,
  before: boolean,
  shiftHeight: number,
): void {
  clearItemDropIndicator(row);
  row.classList.add(before ? "drop-before" : "drop-after");
  const offset = Math.floor(shiftHeight / 2);
  row.style.setProperty(INDICATOR_OFFSET_VAR, `-${offset}px`);
  const doc = row.ownerDocument;
  if (doc) getActiveIndicators(doc).add(row);
}

export function clearItemDropIndicator(row: HTMLElement): void {
  // Only remove the visibility class so the pseudo-element fades out at its
  // current offset instead of snapping to the item edge.
  row.classList.remove("drop-before", "drop-after");
  const doc = row.ownerDocument;
  if (doc) getActiveIndicators(doc).delete(row);
}

export function getDefaultItemHeight(container: HTMLElement): number {
  const win = container.ownerDocument?.defaultView || (globalThis as any);
  const computed = win.getComputedStyle(container);
  const minHeight = computed.getPropertyValue("--vt-item-min-height");
  if (minHeight) {
    const parsed = parseInt(minHeight, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 55;
}

function clearEmptyIndicator(container: HTMLElement): void {
  container.classList.remove(EMPTY_PREVIEW_CLASS);
}

function clearTopGapIndicator(container: HTMLElement): void {
  container.classList.remove(TOP_GAP_PREVIEW_CLASS);
  // Keep --vt-drop-indicator-top-offset so the pseudo-element fades out at
  // its current position.
}

export function setEmptyDropZoneIndicator(dropZone: HTMLElement): void {
  clearEmptyIndicator(dropZone);
  clearTopGapIndicator(dropZone);
  dropZone.classList.add(EMPTY_PREVIEW_CLASS);
  const doc = dropZone.ownerDocument;
  if (doc) getActiveIndicators(doc).add(dropZone);

  // Position the green bar at "half a tag height down from the top of the
  // uncategorized area" — the center of the virtual first tag slot.
  const win = dropZone.ownerDocument?.defaultView || (globalThis as any);
  const computed = win.getComputedStyle(dropZone);
  const paddingTop = parseFloat(computed.paddingTop) || 0;
  const itemHeight = getDefaultItemHeight(dropZone);
  const offset = paddingTop + Math.floor(itemHeight / 2);
  dropZone.style.setProperty(TOP_GAP_OFFSET_VAR, `${offset}px`);
}

export function setTopGapIndicator(
  container: HTMLElement,
  shiftHeight: number,
): void {
  clearEmptyIndicator(container);
  clearTopGapIndicator(container);
  container.classList.add(TOP_GAP_PREVIEW_CLASS);
  const doc = container.ownerDocument;
  if (doc) getActiveIndicators(doc).add(container);

  const win = container.ownerDocument?.defaultView || (globalThis as any);
  const computed = win.getComputedStyle(container);
  const paddingTop = parseFloat(computed.paddingTop) || 0;
  const offset = paddingTop + Math.floor(shiftHeight / 2);
  container.style.setProperty(TOP_GAP_OFFSET_VAR, `${offset}px`);
}

export function clearAllItemDropIndicators(doc: Document): void {
  const active = getActiveIndicators(doc);
  for (const el of active) {
    (el as HTMLElement).classList.remove(
      "drop-before",
      "drop-after",
      TOP_GAP_PREVIEW_CLASS,
      EMPTY_PREVIEW_CLASS,
    );
  }
  active.clear();
}

/**
 * @deprecated Use `clearAllItemDropIndicators` instead.
 */
export function clearAllDropZoneItemIndicators(doc: Document): void {
  clearAllItemDropIndicators(doc);
}
