/**
 * Drop-zone specific drop indicator positioning.
 *
 * In the uncategorized drop-zone we want the green insertion line to be
 * vertically centered inside the one-tag-height gap that is being opened,
 * instead of sitting at the edge of the target item. Category items keep
 * the edge behavior and do not use this module.
 */

const INDICATOR_OFFSET_VAR = "--vt-drop-indicator-offset";
const TOP_GAP_OFFSET_VAR = "--vt-drop-indicator-top-offset";
const EMPTY_PREVIEW_CLASS = "vt-drop-preview-empty";
const TOP_GAP_PREVIEW_CLASS = "vt-drop-preview-top-gap";

function getDropZones(doc: Document): HTMLElement[] {
  return Array.from(
    doc.querySelectorAll(".vertical-tabs-drop-zone"),
  ) as HTMLElement[];
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
}

export function clearItemDropIndicator(row: HTMLElement): void {
  // Only remove the visibility class so the pseudo-element fades out at its
  // current offset instead of snapping to the item edge.
  row.classList.remove("drop-before", "drop-after");
}

function getDefaultItemHeight(dropZone: HTMLElement): number {
  const win = dropZone.ownerDocument?.defaultView || (globalThis as any);
  const computed = win.getComputedStyle(dropZone);
  const minHeight = computed.getPropertyValue("--vt-item-min-height");
  if (minHeight) {
    const parsed = parseInt(minHeight, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 55;
}

export function setEmptyDropZoneIndicator(dropZone: HTMLElement): void {
  clearDropZoneEmptyIndicator(dropZone);
  clearDropZoneTopGapIndicator(dropZone);
  dropZone.classList.add(EMPTY_PREVIEW_CLASS);

  // Position the green bar at "half a tag height down from the top of the
  // uncategorized area" — the center of the virtual first tag slot.
  const win = dropZone.ownerDocument?.defaultView || (globalThis as any);
  const computed = win.getComputedStyle(dropZone);
  const paddingTop = parseFloat(computed.paddingTop) || 0;
  const itemHeight = getDefaultItemHeight(dropZone);
  const offset = paddingTop + Math.floor(itemHeight / 2);
  dropZone.style.setProperty(TOP_GAP_OFFSET_VAR, `${offset}px`);
}

function clearDropZoneEmptyIndicator(dropZone: HTMLElement): void {
  dropZone.classList.remove(EMPTY_PREVIEW_CLASS);
}

export function setTopGapIndicator(
  dropZone: HTMLElement,
  shiftHeight: number,
): void {
  clearDropZoneEmptyIndicator(dropZone);
  clearDropZoneTopGapIndicator(dropZone);
  dropZone.classList.add(TOP_GAP_PREVIEW_CLASS);

  const win = dropZone.ownerDocument?.defaultView || (globalThis as any);
  const computed = win.getComputedStyle(dropZone);
  const paddingTop = parseFloat(computed.paddingTop) || 0;
  const offset = paddingTop + Math.floor(shiftHeight / 2);
  dropZone.style.setProperty(TOP_GAP_OFFSET_VAR, `${offset}px`);
}

function clearDropZoneTopGapIndicator(dropZone: HTMLElement): void {
  dropZone.classList.remove(TOP_GAP_PREVIEW_CLASS);
  // Keep --vt-drop-indicator-top-offset so the pseudo-element fades out at
  // its current position.
}

export function clearAllDropZoneItemIndicators(doc: Document): void {
  for (const dropZone of getDropZones(doc)) {
    clearDropZoneEmptyIndicator(dropZone);
    clearDropZoneTopGapIndicator(dropZone);
    const items = dropZone.querySelectorAll(":scope > .vertical-tabs-item");
    for (const item of items) {
      clearItemDropIndicator(item as HTMLElement);
    }
  }
}
