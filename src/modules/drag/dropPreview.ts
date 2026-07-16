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

function computeDesiredShifted(target: DropPreviewTarget): {
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

  const sourceSelector = itemSelectorFor(target.draggedTabId);
  const elements = candidateRows.filter((el) => !el.matches(sourceSelector));

  const height = elements[0] ? (elements[0] as HTMLElement).offsetHeight : 0;
  return { elements, height };
}

export function applyDropPreview(
  doc: Document,
  target: DropPreviewTarget,
): number {
  const state = getState(doc);
  const { elements: desired, height } = computeDesiredShifted(target);
  const desiredSet = new Set(desired);

  // Remove shift from elements that are no longer in the desired set.
  for (const el of state.shifted) {
    if (!desiredSet.has(el)) {
      removeShift(el);
    }
  }

  // Apply shift to new or remaining elements.
  for (const el of desired) {
    applyShift(el, height);
  }

  state.shifted = desiredSet;
  state.shiftHeight = height;
  return height;
}

export function clearDropPreview(doc: Document): void {
  clearCategoryPreview(doc);
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
