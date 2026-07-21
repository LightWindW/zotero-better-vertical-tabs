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

/**
 * Decide the insertBeforeCategoryId for a category REORDER drop, matching the
 * gap the preview showed:
 * - "before" the target category -> the target's own id.
 * - "after" the target category -> the NEXT visible category's id, or null
 *   when the target is the last one (reorderCategories appends on null).
 * Pure and DOM-free; the wrapper list order is supplied by the caller.
 */
export function computeCategoryReorderInsertBefore(
  position: "before" | "after",
  targetCategoryId: string,
  orderedCategoryIds: string[],
): string | null {
  if (position === "before") return targetCategoryId;
  const idx = orderedCategoryIds.indexOf(targetCategoryId);
  if (idx < 0 || idx + 1 >= orderedCategoryIds.length) return null;
  return orderedCategoryIds[idx + 1];
}

/**
 * Resolve "insert AFTER targetTabId" to an insertBeforeTabId within the same
 * ordered list: the id of the row right after the target, or null when the
 * target is last / unknown (append to end). Shared by the reorder handler's
 * category and uncategorized branches so an "after the middle row" drop
 * lands right after that row instead of at the very end.
 */
export function resolveAfterInsertBefore(
  orderedIds: string[],
  targetTabId: string,
): string | null {
  const idx = orderedIds.indexOf(targetTabId);
  if (idx < 0 || idx + 1 >= orderedIds.length) return null;
  return orderedIds[idx + 1];
}
