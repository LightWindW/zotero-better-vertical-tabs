/**
 * Per-document "which tab is being dragged" state for internal VT item drags.
 *
 * The dragstart handler on an item row records the dragged tabId on the
 * document; dragend clears it. Category drags (`cat:`) never set it, so a
 * non-null value reliably means "an item (tab) drag is in progress" — used by
 * the new-category drop zone to ignore category reorder drags, and by dragover
 * handlers that need the dragged id without access to the dataTransfer data.
 */

const DRAGGED_TAB_ID_KEY = "__vtDraggedTabId";
const DRAGGED_ROW_HEIGHT_KEY = "__vtDraggedRowHeight";
const DRAG_SOURCE_CATEGORY_KEY = "__vtDragSourceCategoryId";

export function setDraggedTabId(doc: Document, tabId: string | null): void {
  (doc as any)[DRAGGED_TAB_ID_KEY] = tabId;
}

export function getDraggedTabId(doc: Document): string | null {
  return (doc as any)[DRAGGED_TAB_ID_KEY] || null;
}

/**
 * Rendered height of the row the drag preview must reserve for the insertion
 * placeholder (the row is collapsed right after dragstart, so it cannot be
 * measured later). This is the row's real RECT height only — the preview adds
 * the collapsed inter-row margin itself (see drag/dragRowMetrics.ts).
 *
 * Multi-tab drags register the TOPMOST selected row: the drop cascade shows
 * that row at full height first and unfolds the rest afterwards, so it is the
 * height the one-row placeholder stands for.
 */
export function setDraggedRowHeight(
  doc: Document,
  height: number | null,
): void {
  if (height === null || !Number.isFinite(height)) {
    delete (doc as any)[DRAGGED_ROW_HEIGHT_KEY];
    return;
  }
  (doc as any)[DRAGGED_ROW_HEIGHT_KEY] = height;
}

export function getDraggedRowHeight(doc: Document): number | null {
  const height = (doc as any)[DRAGGED_ROW_HEIGHT_KEY] as number | undefined;
  return typeof height === "number" && Number.isFinite(height) ? height : null;
}

/**
 * Category the dragged row started in ("__uncategorized__" for the drop-zone).
 *
 * The drag previews use it to tell "inserting back into the source container"
 * from "inserting into another one" WITHOUT looking at the collapsed
 * drag-source class: the browser can dispatch the FIRST dragover in the same
 * task as dragstart, i.e. BEFORE the source row is collapsed by the rAF
 * callback — a class-based check would then misfire and reserve an extra row.
 */
export function setDragSourceCategoryId(
  doc: Document,
  categoryId: string | null,
): void {
  if (!categoryId) {
    delete (doc as any)[DRAG_SOURCE_CATEGORY_KEY];
    return;
  }
  (doc as any)[DRAG_SOURCE_CATEGORY_KEY] = categoryId;
}

export function getDragSourceCategoryId(doc: Document): string | null {
  return ((doc as any)[DRAG_SOURCE_CATEGORY_KEY] as string | undefined) ?? null;
}
