/**
 * Drag-and-drop preview: shift items below the drop indicator downward
 * to visually indicate where the dragged item will land.
 *
 * This module only manipulates visual DOM classes/styles. It does not
 * mutate persisted data; the real reorder happens on `drop`.
 */

import { clearCategoryPreview } from "./categoryPreview";

const SHIFT_CLASS = "vt-drop-preview-shift";
const PREVIEW_STATE_KEY = "__vtDropPreviewState";
const ROW_ANCHOR_KEY = "__vtDropPreviewRowAnchor";
const GAP_ANCHOR_KEY = "__vtDropPreviewGapAnchor";

interface PreviewState {
  shifted: Set<Element>;
  shiftHeight: number;
}

function getState(doc: Document): PreviewState {
  const existing = (doc as any)[PREVIEW_STATE_KEY] as PreviewState | undefined;
  if (existing) return existing;
  const state: PreviewState = { shifted: new Set(), shiftHeight: 0 };
  (doc as any)[PREVIEW_STATE_KEY] = state;
  return state;
}

// ── Dragover early-exit anchors ──
//
// dragover events fire continuously while the cursor moves, but the preview
// outcome only changes when the cursor crosses a row boundary (row anchor)
// or the computed gap index changes (gap anchor). The handlers record the
// last applied anchor and skip the whole recompute — querySelectorAll scans,
// layout reads and class writes — while it is unchanged. Anchors hold
// element references, so a mid-drag re-render (which destroys the rows)
// invalidates them automatically. Both anchors are cleared by
// clearItemShiftPreview, which every clear/drop/dragend path goes through.

interface RowAnchor {
  row: Element;
  before: boolean;
}

interface GapAnchor {
  container: Element;
  index: number;
}

/** True when the row-level preview for exactly this (row, before) is applied. */
export function isSameRowPreviewAnchor(
  doc: Document,
  row: Element,
  before: boolean,
): boolean {
  const anchor = (doc as any)[ROW_ANCHOR_KEY] as RowAnchor | undefined;
  return !!anchor && anchor.row === row && anchor.before === before;
}

export function setRowPreviewAnchor(
  doc: Document,
  row: Element,
  before: boolean,
): void {
  const anchor: RowAnchor = { row, before };
  (doc as any)[ROW_ANCHOR_KEY] = anchor;
  // The two anchor kinds are one logical "last applied position" cursor:
  // applying one kind must invalidate the other, or switching row→gap→row
  // would skip the re-apply on the way back (stale anchor, missing preview).
  delete (doc as any)[GAP_ANCHOR_KEY];
}

/** True when the gap preview for exactly this (container, index) is applied. */
export function isSameGapPreviewAnchor(
  doc: Document,
  container: Element,
  index: number,
): boolean {
  const anchor = (doc as any)[GAP_ANCHOR_KEY] as GapAnchor | undefined;
  return !!anchor && anchor.container === container && anchor.index === index;
}

export function setGapPreviewAnchor(
  doc: Document,
  container: Element,
  index: number,
): void {
  const anchor: GapAnchor = { container, index };
  (doc as any)[GAP_ANCHOR_KEY] = anchor;
  // See setRowPreviewAnchor — the anchor kinds are mutually exclusive.
  delete (doc as any)[ROW_ANCHOR_KEY];
}

function clearPreviewAnchors(doc: Document): void {
  delete (doc as any)[ROW_ANCHOR_KEY];
  delete (doc as any)[GAP_ANCHOR_KEY];
}

function getItemRows(container: Element): Element[] {
  return Array.from(container.querySelectorAll(":scope > .vertical-tabs-item"));
}

function itemSelectorFor(tabId: string): string {
  return `.vertical-tabs-item[data-tab-id="${CSS.escape(tabId)}"]`;
}

function applyShift(el: Element, height: number): void {
  const htmlEl = el as HTMLElement;
  htmlEl.style.setProperty("--vt-drop-shift-y", `${height}px`);
  htmlEl.classList.add(SHIFT_CLASS);
}

function removeShift(el: Element): void {
  const htmlEl = el as HTMLElement;
  htmlEl.classList.remove(SHIFT_CLASS);
  htmlEl.style.removeProperty("--vt-drop-shift-y");
}

export interface ItemDropPreviewTarget {
  type: "item";
  container: Element;
  targetRow: Element;
  before: boolean;
  draggedTabId: string;
}

export interface CategoryDropPreviewTarget {
  type: "category";
  categoryWrapper: Element;
  draggedTabId: string;
}

export interface DropZoneEmptyPreviewTarget {
  type: "drop-zone-empty";
  dropZone: Element;
  draggedTabId: string;
}

export type DropPreviewTarget =
  | ItemDropPreviewTarget
  | CategoryDropPreviewTarget
  | DropZoneEmptyPreviewTarget;

function computeDesiredShifted(
  target: DropPreviewTarget,
  excludeTabIds?: ReadonlySet<string>,
): {
  elements: Element[];
  height: number;
} {
  if (target.type === "drop-zone-empty") {
    return { elements: [], height: 0 };
  }

  let container: Element;
  let startRow: Element | null = null;

  if (target.type === "category") {
    container =
      target.categoryWrapper.querySelector(":scope > .vertical-tabs-items") ||
      target.categoryWrapper;
    startRow = container.querySelector(":scope > .vertical-tabs-item");
  } else {
    container = target.container;
    startRow = target.before
      ? target.targetRow
      : target.targetRow.nextElementSibling;

    // In the uncategorized drop-zone or a category item list, dropping after
    // the last item means appending to the end: there is nothing below to shift.
    if (
      !target.before &&
      !startRow &&
      (container.classList.contains("vertical-tabs-drop-zone") ||
        container.classList.contains("vertical-tabs-items"))
    ) {
      const height = (target.targetRow as HTMLElement).offsetHeight || 0;
      return { elements: [], height };
    }
  }

  const rows = getItemRows(container);
  const startIndex = startRow ? rows.indexOf(startRow) : -1;
  const candidateRows =
    startIndex >= 0 ? rows.slice(startIndex) : rows.length > 0 ? rows : [];

  // Multi-tab drag: exclude every dragged row from the shift set; single
  // drag keeps the original draggedTabId exclusion.
  const sourceSelector = itemSelectorFor(target.draggedTabId);
  const elements = candidateRows.filter((el) => {
    if (excludeTabIds) {
      const id = (el as HTMLElement).dataset.tabId || "";
      if (excludeTabIds.has(id)) return false;
    }
    return !el.matches(sourceSelector);
  });

  // The gap is always ONE row tall, regardless of how many tabs are dragged.
  const height = elements[0] ? (elements[0] as HTMLElement).offsetHeight : 0;
  return { elements, height };
}

export function applyDropPreview(
  doc: Document,
  target: DropPreviewTarget,
  excludeTabIds?: ReadonlySet<string>,
): number {
  const state = getState(doc);
  const { elements: desired, height } = computeDesiredShifted(
    target,
    excludeTabIds,
  );
  const desiredSet = new Set(desired);

  // Remove shift from elements that are no longer in the desired set.
  for (const el of state.shifted) {
    if (!desiredSet.has(el)) {
      removeShift(el);
    }
  }

  // Apply shift only to newly shifted elements, or to all of them when the
  // height changed. (Previously every dragover re-wrote the class and the
  // CSS variable on every shifted row — pure style churn.)
  const heightChanged = state.shiftHeight !== height;
  for (const el of desired) {
    if (!heightChanged && state.shifted.has(el)) continue;
    applyShift(el, height);
  }

  state.shifted = desiredSet;
  state.shiftHeight = height;
  return height;
}

export function clearDropPreview(doc: Document): void {
  clearCategoryPreview(doc);
  clearItemShiftPreview(doc);
}

export function clearItemShiftPreview(doc: Document): void {
  clearPreviewAnchors(doc);
  const state = (doc as any)[PREVIEW_STATE_KEY] as PreviewState | undefined;
  if (!state) return;
  for (const el of state.shifted) {
    removeShift(el);
  }
  state.shifted.clear();
  state.shiftHeight = 0;
}

export function destroyPreviewState(doc: Document): void {
  clearDropPreview(doc);
  delete (doc as any)[PREVIEW_STATE_KEY];
}
