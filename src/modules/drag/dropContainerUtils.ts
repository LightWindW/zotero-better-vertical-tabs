/**
 * Shared container/row helpers for item drag-and-drop previews.
 *
 * Used by both the internal VT tab drag (uiRenderer's per-element listeners)
 * and the external library-item drag (drag/externalDropPreview.ts), so both
 * paths compute insertion gaps and drag-over highlights identically.
 */

/**
 * Item rows of a container that currently take up layout space: rows collapsed
 * as drag sources (single or multi) are excluded — they are being dragged and
 * must not receive shift previews or count as insertion neighbors.
 */
export function getContainerVisibleItems(container: HTMLElement): HTMLElement[] {
  const allItems = Array.from(
    container.querySelectorAll(":scope > .vertical-tabs-item"),
  ) as HTMLElement[];
  return allItems.filter(
    (el) =>
      !el.classList.contains("vt-drag-source-collapsed") &&
      !el.classList.contains("vt-multi-source-collapse"),
  );
}

/**
 * Index at which a drop at clientY would land inside a container's visible
 * rows: before the first row whose vertical midpoint is below the cursor,
 * otherwise after the last row.
 */
export function computeDropZoneInsertIndex(
  dropZone: HTMLElement,
  clientY: number,
): number {
  const visibleItems = getContainerVisibleItems(dropZone);
  let insertIndex = 0;
  for (let i = 0; i < visibleItems.length; i++) {
    const rect = visibleItems[i].getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    if (clientY < midY) {
      return i;
    }
    insertIndex = i + 1;
  }
  return insertIndex;
}

/**
 * Add the drag-over (dashed outline) class to a category wrapper or the
 * uncategorized drop-zone, removing it from any other container first — at
 * most one container is highlighted at a time.
 */
export function setWrapperDragOver(
  wrapper: HTMLElement | null,
  doc: Document,
): void {
  if (!wrapper) return;
  // Fast path: the invariant "at most one .drag-over at a time" means there
  // is nothing to scan for when this wrapper already carries the class.
  if (wrapper.classList.contains("drag-over")) return;
  doc
    .querySelectorAll(
      ".vertical-tabs-category.drag-over, .vertical-tabs-drop-zone.drag-over",
    )
    .forEach((el: Element) => {
      if (el !== wrapper) el.classList.remove("drag-over");
    });
  wrapper.classList.add("drag-over");
}
