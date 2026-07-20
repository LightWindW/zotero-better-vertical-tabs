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

export function setDraggedTabId(doc: Document, tabId: string | null): void {
  (doc as any)[DRAGGED_TAB_ID_KEY] = tabId;
}

export function getDraggedTabId(doc: Document): string | null {
  return (doc as any)[DRAGGED_TAB_ID_KEY] || null;
}
