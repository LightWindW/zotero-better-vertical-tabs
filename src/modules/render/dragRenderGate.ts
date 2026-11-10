/**
 * Render gate: freeze the row DOM while a drag is in progress.
 *
 * Every re-render rebuilds the rows from persisted data — the fresh rows carry
 * no `vt-drag-source-collapsed` class and no `dragging` class, so a render that
 * lands mid-drag makes the row being dragged pop back at its original position
 * and wipes all drag previews. This was reproducible on the FIRST drag after
 * Zotero starts, when a render coalesced into a rAF (startup restore / reader
 * events) fired after dragstart.
 *
 * Renders that arrive during a drag are parked behind this flag and replayed by
 * the drag's `dragend` handler.
 */

import { getDraggedTabId } from "../drag/itemDragState";
import { getCategoryDragSource } from "../drag/categoryDragSource";

const DEFERRED_KEY = "__vtDeferredRenderWhileDragging";

/** True while an item drag or a category-reorder drag is in progress. */
export function isDragRenderLocked(doc: Document): boolean {
  return !!getDraggedTabId(doc) || !!getCategoryDragSource(doc);
}

/** Park a render that must wait for the current drag to end. */
export function markRenderDeferred(doc: Document): void {
  (doc as any)[DEFERRED_KEY] = true;
}

/** Take the parked flag (one-shot). */
export function takeDeferredRender(doc: Document): boolean {
  const deferred = !!(doc as any)[DEFERRED_KEY];
  delete (doc as any)[DEFERRED_KEY];
  return deferred;
}
