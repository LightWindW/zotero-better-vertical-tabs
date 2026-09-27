/**
 * Multi-tab drag: source-side collapse/restore and drop helpers.
 *
 * When the user starts dragging a SELECTED tab (selection size > 1), every
 * selected row fades out and collapses (0.25s, batched pin → reflow → zero)
 * so the whole selection disappears smoothly while the native drag image of
 * the grabbed row shows. The ordered tabIds and the per-category source
 * counts are stashed on the document for the preview (gap height = N rows,
 * tNew accounting) and the drop handlers.
 *
 * On cancel (dragend without a drop) the rows fade/expand back; on a
 * successful drop the re-render replaces the DOM and the cascade release
 * (multiTabRelease.ts) takes over.
 */

import { getOpenedPDFs } from "../track/itemTracker";
import { dispatchVtEvent } from "../core/events";
import type { ItemTabEntry } from "../track/dataStore";
import { clearTabSelection } from "./multiSelect";
import { markMultiTabRelease } from "../render/multiTabRelease";
import { measureRowGeometry } from "../render/boxMeasure";

const DRAG_IDS_KEY = "__vtMultiDragTabIds";
const SOURCE_COUNTS_KEY = "__vtMultiDragSourceCounts";
export const MULTI_SOURCE_CLASS = "vt-multi-source-collapse";
const COLLAPSE_MS = 250;

function findRow(doc: Document, tabId: string): HTMLElement | null {
  return doc.querySelector(
    `.vertical-tabs-item[data-tab-id="${CSS.escape(tabId)}"]`,
  ) as HTMLElement | null;
}

/**
 * Start the multi drag: stash ordered ids + source counts, and (after the
 * drag image is captured, handled by the caller's rAF) collapse every
 * selected row.
 */
export function startMultiDrag(doc: Document, orderedTabIds: string[]): void {
  (doc as any)[DRAG_IDS_KEY] = orderedTabIds;

  const counts = new Map<string, number>();
  for (const tabId of orderedTabIds) {
    const catId =
      (findRow(doc, tabId)?.closest(".vertical-tabs-category") as HTMLElement)
        ?.dataset.categoryId ?? "__uncategorized__";
    counts.set(catId, (counts.get(catId) ?? 0) + 1);
  }
  (doc as any)[SOURCE_COUNTS_KEY] = counts;
}

/** Collapse all selected rows (call inside rAF, after image capture). */
export function collapseMultiDragSource(doc: Document): void {
  const ids = (doc as any)[DRAG_IDS_KEY] as string[] | undefined;
  if (!ids) return;
  const rows = ids
    .map((id) => findRow(doc, id))
    .filter((r): r is HTMLElement => !!r);
  if (!rows.length) return;
  // Measure natural geometry (content-box heights!) and pin all rows.
  const geometries = rows.map((row) => measureRowGeometry(doc, row));
  rows.forEach((row, i) => {
    row.classList.add(MULTI_SOURCE_CLASS);
    row.style.height = `${geometries[i].content}px`;
    row.style.opacity = "1";
  });
  // Commit the natural state with ONE reflow, then zero everything —
  // min-height would otherwise block the collapse at 36px, and residual
  // padding would leave an 8px sliver per row.
  void rows[0].offsetHeight;
  for (const row of rows) {
    row.style.minHeight = "0px";
    row.style.height = "0px";
    row.style.paddingTop = "0px";
    row.style.paddingBottom = "0px";
    row.style.marginTop = "0px";
    row.style.marginBottom = "0px";
    row.style.opacity = "0";
  }
}

/** The ordered tabIds of the active multi drag, or null for single/no drag. */
export function getMultiDragTabIds(doc: Document): string[] | null {
  const ids = (doc as any)[DRAG_IDS_KEY] as string[] | undefined;
  return ids && ids.length ? ids : null;
}

/** Per-category (or "__uncategorized__") count of dragged-away rows. */
export function getMultiDragSourceCounts(
  doc: Document,
): Map<string, number> | null {
  return ((doc as any)[SOURCE_COUNTS_KEY] as Map<string, number>) ?? null;
}

/**
 * dragend: on cancel the rows fade/expand back from their current
 * (possibly interpolated) geometry; on a successful drop the keys are
 * cleared and the re-render takes over (the release mark was already made
 * by the drop handler).
 */
export function endMultiDrag(doc: Document, dropped: boolean): void {
  const ids = (doc as any)[DRAG_IDS_KEY] as string[] | undefined;
  delete (doc as any)[DRAG_IDS_KEY];
  delete (doc as any)[SOURCE_COUNTS_KEY];
  if (!ids || dropped) return;

  const win = doc.defaultView;
  for (const tabId of ids) {
    const row = findRow(doc, tabId);
    if (!row) continue;
    // Measure the natural geometry with the collapse inlines cleared (the
    // class stays on, providing the transition for the way back).
    row.style.height = "";
    row.style.minHeight = "";
    row.style.paddingTop = "";
    row.style.paddingBottom = "";
    row.style.marginTop = "";
    row.style.marginBottom = "";
    const geometry = measureRowGeometry(doc, row);
    const currentOpacity =
      doc.defaultView?.getComputedStyle(row)?.opacity ?? "0";
    // Re-commit the collapsed state, then animate open: natural content
    // height, natural padding, full opacity — all transitioned by the class.
    row.style.minHeight = "0px";
    row.style.height = "0px";
    row.style.paddingTop = "0px";
    row.style.paddingBottom = "0px";
    row.style.marginTop = "0px";
    row.style.marginBottom = "0px";
    row.style.opacity = currentOpacity;
    void row.offsetHeight;
    row.style.height = `${geometry.content}px`;
    row.style.paddingTop = `${geometry.padTop}px`;
    row.style.paddingBottom = `${geometry.padBottom}px`;
    row.style.marginTop = `${geometry.marginTop}px`;
    row.style.marginBottom = `${geometry.marginBottom}px`;
    row.style.opacity = "1";
    win?.setTimeout(() => {
      if (!row.isConnected) return;
      row.classList.remove(MULTI_SOURCE_CLASS);
      row.style.height = "";
      row.style.minHeight = "";
      row.style.paddingTop = "";
      row.style.paddingBottom = "";
      row.style.marginTop = "";
      row.style.marginBottom = "";
      row.style.opacity = "";
    }, COLLAPSE_MS);
  }
}

/** Build ItemTabEntry[] (visual order) for the data-layer insertion. */
export function buildMultiEntries(orderedTabIds: string[]): ItemTabEntry[] {
  const pdfs = getOpenedPDFs();
  const entries: ItemTabEntry[] = [];
  for (const tabId of orderedTabIds) {
    const pdf = pdfs.find((p) => p.tabId === tabId);
    if (pdf) entries.push({ itemId: pdf.itemId, tabId });
  }
  return entries;
}

/**
 * Unified multi-drop commit: clear the selection (per the confirmed
 * behavior), mark the cascade release for the next re-render, and dispatch
 * the contiguous-block move.
 */
export function dispatchMultiDrop(
  doc: Document,
  target: {
    categoryId: string; // real id or "__uncategorized__"
    insertBeforeTabId?: string; // undefined = append to end
    releaseTabIds: string[]; // visual order, for the cascade animation
  },
): void {
  const entries = buildMultiEntries(target.releaseTabIds);
  clearTabSelection(doc);
  markMultiTabRelease(doc, target.releaseTabIds);
  dispatchVtEvent(doc, "vertical-tabs:move-items", {
    categoryId: target.categoryId,
    entries,
    insertBeforeTabId: target.insertBeforeTabId,
  });
}

export function destroyMultiDrag(doc: Document): void {
  delete (doc as any)[DRAG_IDS_KEY];
  delete (doc as any)[SOURCE_COUNTS_KEY];
}
