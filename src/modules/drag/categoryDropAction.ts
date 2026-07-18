/**
 * Decide where a dragged tab lands when dropped on a category.
 *
 * The dragover preview already computes an insert index from the cursor
 * position (see computeDropZoneInsertIndex in uiRenderer.ts). This module
 * turns that index into a concrete drop action so the drop RESULT always
 * matches what the preview indicated:
 *
 * - An index that hits a visible row inserts BEFORE that row.
 * - An index past the last row (or an empty category) appends to the END.
 *
 * The category header follows the same rule with index 0: dropping on the
 * header places the tab at the FIRST position (or the end of an empty
 * category, which is the only position available).
 *
 * Pure and DOM-free so the rule stays unit-testable; the event wiring lives
 * in uiRenderer.ts.
 */

export type CategoryDropAction =
  | { type: "insert-before"; targetTabId: string }
  | { type: "append-end" };

export function decideCategoryDropAction(
  insertIndex: number,
  visibleTabIds: string[],
): CategoryDropAction {
  if (insertIndex >= 0 && insertIndex < visibleTabIds.length) {
    return { type: "insert-before", targetTabId: visibleTabIds[insertIndex] };
  }
  return { type: "append-end" };
}
