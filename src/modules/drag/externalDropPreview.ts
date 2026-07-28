/**
 * External library-item drag preview.
 *
 * Gives the drag-over visuals of an external drag (items dragged from the
 * Zotero item pane into the VT sidebar) the exact same appearance as an
 * internal VT tab drag: a one-row blank gap opens (rows below shift down via
 * transform, the container height animates), the green insertion bar sits
 * vertically centered inside that gap, and hovering a collapsed category
 * preview-expands it (chevron rotates, items height animates open).
 *
 * All building blocks are shared with the internal path: dropPreview (row
 * shifts + early-exit anchors), categoryPreview (container height animation),
 * dropZoneIndicator (centered green bar) and dropContainerUtils (gap math).
 * An external drag has no source rows inside the VT, so the shift/preview
 * exclusion set is empty and the source category is null (target containers
 * always grow by exactly one row — the gap stays one row tall regardless of
 * how many items are dragged, matching the internal multi-tab rule).
 *
 * This module only manipulates visual DOM classes/styles; the actual data
 * insertion happens in mainPaneDrop's drop handler, which resolves the drop
 * position through the same computeExternalInsertTarget used here, so the
 * drop always lands where the green bar showed.
 */

import {
  applyDropPreview,
  clearDropPreview,
  clearItemShiftPreview,
  isSameGapPreviewAnchor,
  isSameRowPreviewAnchor,
  setGapPreviewAnchor,
  setRowPreviewAnchor,
} from "./dropPreview";
import { applyCategoryPreview } from "./categoryPreview";
import {
  clearAllItemDropIndicators,
  getDefaultItemHeight,
  setEmptyDropZoneIndicator,
  setItemDropIndicator,
  setTopGapIndicator,
} from "./dropZoneIndicator";
import { clearAllDropVisuals } from "./dropTarget";
import { isNewCategoryZonePointer } from "./newCategoryDrop";
import {
  computeDropZoneInsertIndex,
  getContainerVisibleItems,
  setWrapperDragOver,
} from "./dropContainerUtils";

const UNCATEGORIZED = "__uncategorized__";
/**
 * Sentinel for applyDropPreview's dragged-row exclusion: an external drag has
 * no dragged row inside the VT, and no real row ever carries an empty
 * data-tab-id, so the exclusion selector matches nothing.
 */
const NO_DRAGGED_TAB_ID = "";

export interface ExternalInsertTarget {
  /** Real category id, or "__uncategorized__" for the drop-zone. */
  categoryId: string;
  /** The new tabs should be inserted before this tab; undefined = append. */
  insertBeforeTabId?: string;
}

function categoryIdOfRow(row: HTMLElement): string {
  const wrapper = row.closest(".vertical-tabs-category") as HTMLElement | null;
  return wrapper?.dataset.categoryId || UNCATEGORIZED;
}

/**
 * Compute where an external drop at (target, clientY) would land, using the
 * same gap math as the preview below. Called by both the preview (implicitly,
 * via identical branches) and mainPaneDrop's drop handler, guaranteeing the
 * drop lands exactly where the indicator showed.
 *
 * Branch order mirrors the internal listeners: a hovered row claims the event
 * first, then the container gaps, then the drop-zone background, then the
 * category header/empty area (= first position, matching the shift-all
 * preview shown there).
 */
export function computeExternalInsertTarget(
  doc: Document,
  target: EventTarget | null,
  clientY: number,
): ExternalInsertTarget | null {
  const el = target as Element | null;
  if (!el || typeof el.closest !== "function") return null;

  // 1. Row: before/after by the row's vertical midpoint.
  const row = el.closest(".vertical-tabs-item") as HTMLElement | null;
  if (row?.dataset.tabId) {
    const container = (row.closest(".vertical-tabs-items") ||
      row.closest(".vertical-tabs-drop-zone")) as HTMLElement | null;
    if (!container) return null;
    const visibleItems = getContainerVisibleItems(container);
    const rowIndex = visibleItems.indexOf(row);
    if (rowIndex < 0) return null;
    const rect = row.getBoundingClientRect();
    const before = clientY < rect.top + rect.height / 2;
    const insertIndex = before ? rowIndex : rowIndex + 1;
    return {
      categoryId: categoryIdOfRow(row),
      insertBeforeTabId: visibleItems[insertIndex]?.dataset.tabId || undefined,
    };
  }

  // 2. Gap inside a category's items container.
  const itemsContainer = el.closest(".vertical-tabs-items") as HTMLElement | null;
  if (itemsContainer) {
    const wrapper = itemsContainer.closest(
      ".vertical-tabs-category",
    ) as HTMLElement | null;
    const categoryId = wrapper?.dataset.categoryId;
    if (!categoryId) return null;
    const visibleItems = getContainerVisibleItems(itemsContainer);
    const insertIndex = computeDropZoneInsertIndex(itemsContainer, clientY);
    return {
      categoryId,
      insertBeforeTabId: visibleItems[insertIndex]?.dataset.tabId || undefined,
    };
  }

  // 3. Uncategorized drop-zone background (also the empty-VT state).
  const dropZone = el.closest(".vertical-tabs-drop-zone") as HTMLElement | null;
  if (dropZone) {
    const visibleItems = getContainerVisibleItems(dropZone);
    const insertIndex = computeDropZoneInsertIndex(dropZone, clientY);
    return {
      categoryId: UNCATEGORIZED,
      insertBeforeTabId: visibleItems[insertIndex]?.dataset.tabId || undefined,
    };
  }

  // 4. Category header / remaining wrapper area: first position (the preview
  //    shifts every row down, opening the gap directly under the header).
  const wrapper = el.closest(".vertical-tabs-category") as HTMLElement | null;
  if (wrapper?.dataset.categoryId) {
    const items = wrapper.querySelector(
      ":scope > .vertical-tabs-items",
    ) as HTMLElement | null;
    const first = items ? getContainerVisibleItems(items)[0] : undefined;
    return {
      categoryId: wrapper.dataset.categoryId,
      insertBeforeTabId: first?.dataset.tabId || undefined,
    };
  }

  return null;
}

/** Row branch: hover over an item row — shift rows below, center the bar. */
function applyRowPreview(doc: Document, row: HTMLElement, clientY: number): void {
  const container = (row.closest(".vertical-tabs-items") ||
    row.closest(".vertical-tabs-drop-zone")) as HTMLElement | null;
  if (!container) return;
  const rect = row.getBoundingClientRect();
  const before = clientY < rect.top + rect.height / 2;

  // Early-exit: the preview for exactly this (row, before) is already applied.
  if (isSameRowPreviewAnchor(doc, row, before)) return;
  setRowPreviewAnchor(doc, row, before);

  const wrapper = (row.closest(".vertical-tabs-category") ||
    row.closest(".vertical-tabs-drop-zone")) as HTMLElement | null;
  if (wrapper) {
    applyCategoryPreview(doc, wrapper, null, 1);
    setWrapperDragOver(wrapper, doc);
  }

  const shiftHeight = applyDropPreview(doc, {
    type: "item",
    container,
    targetRow: row,
    before,
    draggedTabId: NO_DRAGGED_TAB_ID,
  });

  // The green bar is attached to the element above the gap (or the container
  // top edge) so it stays put while items below animate downward.
  clearAllItemDropIndicators(doc);
  const visibleItems = getContainerVisibleItems(container);
  const rowIndex = visibleItems.indexOf(row);
  if (before) {
    if (rowIndex <= 0) {
      setTopGapIndicator(container, shiftHeight);
    } else {
      setItemDropIndicator(visibleItems[rowIndex - 1], false, shiftHeight);
    }
  } else {
    setItemDropIndicator(row, false, shiftHeight);
  }
}

/**
 * Gap branch shared by the items container and the uncategorized drop-zone:
 * the cursor is between rows (or below the last one) with the container
 * itself as the event target.
 */
function applyGapPreview(
  doc: Document,
  container: HTMLElement,
  clientY: number,
): void {
  const insertIndex = computeDropZoneInsertIndex(container, clientY);
  // Early-exit: the preview for exactly this gap position is already applied.
  if (isSameGapPreviewAnchor(doc, container, insertIndex)) return;

  const visibleItems = getContainerVisibleItems(container);
  if (visibleItems.length === 0) {
    clearItemShiftPreview(doc);
    clearAllItemDropIndicators(doc);
    if (container.classList.contains("vertical-tabs-drop-zone")) {
      setEmptyDropZoneIndicator(container);
    } else {
      setTopGapIndicator(container, getDefaultItemHeight(container));
    }
  } else if (insertIndex >= visibleItems.length) {
    // Append-to-end: no item shift, bar centered below the last item.
    clearItemShiftPreview(doc);
    const lastItem = visibleItems[visibleItems.length - 1];
    clearAllItemDropIndicators(doc);
    setItemDropIndicator(lastItem, false, lastItem.offsetHeight || 0);
  } else {
    const targetRow = visibleItems[insertIndex];
    const shiftHeight = applyDropPreview(doc, {
      type: "item",
      container,
      targetRow,
      before: true,
      draggedTabId: NO_DRAGGED_TAB_ID,
    });
    clearAllItemDropIndicators(doc);
    if (insertIndex === 0) {
      setTopGapIndicator(container, shiftHeight);
    } else {
      setItemDropIndicator(visibleItems[insertIndex - 1], false, shiftHeight);
    }
  }
  setGapPreviewAnchor(doc, container, insertIndex);
}

/**
 * Category header / empty wrapper area branch: shift all rows down (the gap
 * opens directly under the header) and center the green bar in it. The
 * container height animation preview-expands even a collapsed category.
 */
function applyCategoryHeaderPreview(doc: Document, wrapper: HTMLElement): void {
  setWrapperDragOver(wrapper, doc);
  // Early-exit: the whole-category preview only changes on enter/leave.
  if (isSameGapPreviewAnchor(doc, wrapper, 0)) return;

  applyCategoryPreview(doc, wrapper, null, 1);
  const shiftHeight = applyDropPreview(doc, {
    type: "category",
    categoryWrapper: wrapper,
    draggedTabId: NO_DRAGGED_TAB_ID,
  });

  // Explicit first-gap bar, vertically centered in the blank that just opened
  // under the header (empty category: center in the virtual first slot).
  clearAllItemDropIndicators(doc);
  const itemsContainer = wrapper.querySelector(
    ":scope > .vertical-tabs-items",
  ) as HTMLElement | null;
  if (itemsContainer) {
    setTopGapIndicator(
      itemsContainer,
      shiftHeight > 0 ? shiftHeight : getDefaultItemHeight(itemsContainer),
    );
  }
  setGapPreviewAnchor(doc, wrapper, 0);
}

/**
 * Apply the internal-style drag-over preview for an external library drag.
 * Called from mainPaneDrop's sidebar-level dragover listener; e.target is the
 * actual element under the cursor (transform-aware), matching what the
 * internal per-element listeners see.
 */
export function applyExternalDropPreview(doc: Document, e: DragEvent): void {
  // The top strip is claimed by the quick-create-category drop zone; its own
  // sidebar listener (registered after mainPaneDrop's) clears these visuals.
  if (isNewCategoryZonePointer(doc, e.clientY)) return;

  const el = e.target as Element | null;
  if (!el || typeof el.closest !== "function") return;

  const row = el.closest(".vertical-tabs-item") as HTMLElement | null;
  if (row?.dataset.tabId) {
    applyRowPreview(doc, row, e.clientY);
    return;
  }

  const itemsContainer = el.closest(".vertical-tabs-items") as HTMLElement | null;
  if (itemsContainer) {
    const wrapper = itemsContainer.closest(
      ".vertical-tabs-category",
    ) as HTMLElement | null;
    if (wrapper) {
      applyCategoryPreview(doc, wrapper, null, 1);
      setWrapperDragOver(wrapper, doc);
    }
    applyGapPreview(doc, itemsContainer, e.clientY);
    return;
  }

  const dropZone = el.closest(".vertical-tabs-drop-zone") as HTMLElement | null;
  if (dropZone) {
    applyCategoryPreview(doc, dropZone, null, 1);
    setWrapperDragOver(dropZone, doc);
    applyGapPreview(doc, dropZone, e.clientY);
    return;
  }

  const wrapper = el.closest(".vertical-tabs-category") as HTMLElement | null;
  if (wrapper?.dataset.categoryId) {
    applyCategoryHeaderPreview(doc, wrapper);
    return;
  }

  // Between-category gaps / other sidebar areas: no target. Mirror the
  // internal wrapper-dragleave behavior — clear the row-level visuals but
  // keep the container height preview alive for a smooth handoff when the
  // cursor enters the next category.
  clearAllDropVisuals(doc);
  clearAllItemDropIndicators(doc);
  clearItemShiftPreview(doc);
}

/**
 * Clear only the indicators (green bar + dashed outline), keeping the gap
 * shifts and container height preview in place. Used at the drop moment: the
 * drop-triggered re-render replaces the DOM, and the old shifted geometry
 * matches the new natural geometry, so the list does not flash.
 */
export function clearExternalDropIndicators(doc: Document): void {
  clearAllDropVisuals(doc);
  clearAllItemDropIndicators(doc);
}

/** Full teardown: indicators, row shifts, container height preview, anchors. */
export function clearExternalDropPreview(doc: Document): void {
  clearExternalDropIndicators(doc);
  clearDropPreview(doc);
}
