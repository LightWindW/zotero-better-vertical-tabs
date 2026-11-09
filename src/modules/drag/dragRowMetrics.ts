/**
 * Drag-time row metrics: the single place that measures the REAL layout
 * heights used by the drag previews.
 *
 * Measured facts about the real CSS (`.vertical-tabs-items` / vertical-tabs-item):
 * - Rows are border-box, so `getBoundingClientRect().height` is the full row.
 * - Rows carry `margin: 4px`, but ADJACENT vertical margins COLLAPSE: two
 *   neighbouring rows are separated by 4px, not 8px. A row therefore adds
 *   `rect + 4px` to the container (plus 4px above the first and below the last
 *   row of the content block). Summing `rect + 8px` per row over-allocates by
 *   4px per row — that is what left a growing blank strip under the last row.
 * - The one-row insertion placeholder must reserve exactly what the dropped row
 *   will add: `draggedRect + 4px` at a non-empty container, or
 *   `draggedRect + 8px` in an empty container (both margins of the new row).
 *
 * Measurement is cached per container for one drag session —
 * `invalidateRowHeightCache()` runs on dragstart AND dragend (a canceled drag
 * leaves its source rows collapsed without a re-render, so a following
 * external drag must not reuse the short cached sums).
 */

import { getDraggedRowHeight, getDragSourceCategoryId } from "./itemDragState";
import { MULTI_SOURCE_CLASS } from "./multiDrag";

const ITEMS_SELECTOR = ":scope > .vertical-tabs-items";
const ROW_SELECTOR = ":scope > .vertical-tabs-item";
const ITEM_MIN_HEIGHT_VAR = "--vt-item-min-height";
/** Rows collapsed as drag sources (single / multi) take no layout space. */
const COLLAPSED_SOURCE_CLASSES = [
  "vt-drag-source-collapsed",
  MULTI_SOURCE_CLASS,
];
/** `.vertical-tabs-item` margin: 4px on each side (fallback when unmeasurable). */
const ITEM_MARGIN = 4;
/** A row's rect height never drops below the tab-height baseline. */
const FALLBACK_ITEM_HEIGHT = 55;

interface RowsMetrics {
  /** Number of rows that currently occupy layout. */
  count: number;
  /** Height of the first layout row (rect); 0 when the container is empty. */
  firstRowHeight: number;
  /** Collapsed distance between two neighbouring rows. */
  gap: number;
  /** Margins above the first and below the last row (only used when empty). */
  edgeMargins: number;
  /** Content-box height of the rows: Σ rects + collapsed margins. */
  contentHeight: number;
}

const EMPTY_METRICS: RowsMetrics = {
  count: 0,
  firstRowHeight: 0,
  gap: ITEM_MARGIN,
  edgeMargins: 2 * ITEM_MARGIN,
  contentHeight: 0,
};

let _rowsMetricsCache = new WeakMap<Element, RowsMetrics>();

/** Drop every cached measurement (one drag session's worth). */
export function invalidateRowHeightCache(): void {
  _rowsMetricsCache = new WeakMap();
}

/**
 * The element whose children are the rows: a category nests them under
 * `.vertical-tabs-items`, while the uncategorized drop-zone holds them
 * directly.
 */
function resolveRowsContainer(container: Element): Element {
  if (!container.classList.contains("vertical-tabs-category")) return container;
  return container.querySelector(ITEMS_SELECTOR) ?? container;
}

/** Rows that currently occupy layout (collapsed drag sources excluded). */
export function getLayoutRows(container: Element): HTMLElement[] {
  const rowsContainer = resolveRowsContainer(container);
  const rows = Array.from(
    rowsContainer.querySelectorAll(ROW_SELECTOR),
  ) as HTMLElement[];
  return rows.filter(
    (row) =>
      !COLLAPSED_SOURCE_CLASSES.some((cls) => row.classList.contains(cls)),
  );
}

/**
 * Rendered height of one row. `transform` (the drag shift) does not change the
 * box height, so this stays valid while the preview animates.
 */
export function getRowHeight(row: HTMLElement): number {
  return Math.max(0, row.getBoundingClientRect().height);
}

function pxValue(raw: string | undefined): number {
  if (!raw) return 0;
  const parsed = parseFloat(raw);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getRowMargins(
  doc: Document,
  row: HTMLElement,
): { marginTop: number; marginBottom: number } {
  const computed = doc.defaultView?.getComputedStyle(row);
  return {
    marginTop: pxValue(computed?.marginTop),
    marginBottom: pxValue(computed?.marginBottom),
  };
}

/** Collapsed vertical margins of the rows container (cached per drag). */
export function getRowsMetrics(doc: Document, container: Element): RowsMetrics {
  const cached = _rowsMetricsCache.get(container);
  if (cached) return cached;

  const rows = getLayoutRows(container);
  if (!rows.length) {
    _rowsMetricsCache.set(container, EMPTY_METRICS);
    return EMPTY_METRICS;
  }

  const { marginTop, marginBottom } = getRowMargins(doc, rows[0]);
  const gap = Math.max(marginTop, marginBottom);
  const rowsHeight = rows.reduce((sum, row) => sum + getRowHeight(row), 0);
  const metrics: RowsMetrics = {
    count: rows.length,
    firstRowHeight: getRowHeight(rows[0]),
    gap,
    edgeMargins: marginTop + marginBottom,
    contentHeight:
      rowsHeight + marginTop + marginBottom + gap * (rows.length - 1),
  };
  _rowsMetricsCache.set(container, metrics);
  return metrics;
}

/** Σ of the rows' rendered heights plus the collapsed margins between them. */
export function getRowsContentHeight(
  doc: Document,
  container: Element,
): number {
  return getRowsMetrics(doc, container).contentHeight;
}

/** Fallback row height: the configured tab-height baseline. */
export function getDefaultRowHeight(doc: Document, container: Element): number {
  const rowsContainer = resolveRowsContainer(container);
  const win = doc.defaultView || (globalThis as any);
  const computed = win.getComputedStyle?.(rowsContainer as HTMLElement);
  const raw = computed?.getPropertyValue?.(ITEM_MIN_HEIGHT_VAR) || "";
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) ? FALLBACK_ITEM_HEIGHT : parsed;
}

const UNCATEGORIZED = "__uncategorized__";

/** Category id of a preview container (wrapper, its items list, or drop-zone). */
function getContainerCategoryId(container: Element): string {
  const host = container.classList.contains("vertical-tabs-category")
    ? container
    : (container.closest?.(".vertical-tabs-category") ?? container);
  const id = (host as HTMLElement).dataset?.categoryId;
  if (id) return id;
  if (
    container.classList.contains("vertical-tabs-drop-zone") ||
    container.closest?.(".vertical-tabs-drop-zone")
  ) {
    return UNCATEGORIZED;
  }
  return "";
}

/** True when the previewed container is the category the drag started in. */
export function isSameDragContainer(
  doc: Document,
  container: Element,
): boolean {
  const source = getDragSourceCategoryId(doc);
  if (!source) return false;
  return source === getContainerCategoryId(container);
}

/**
 * True when the source row of THIS container has already collapsed. Used only
 * for the container-height delta: the collapse removes the row from layout, so
 * the placeholder has to be added back on top of the (now smaller) height.
 * When the first dragover arrives before the collapse rAF, the height still
 * contains the row and nothing has to be added.
 */
function isDragSourceCollapsed(container: Element): boolean {
  return !!(
    container.querySelector(`.${COLLAPSED_SOURCE_CLASSES[0]}`) ||
    container.querySelector(`.${COLLAPSED_SOURCE_CLASSES[1]}`)
  );
}

/**
 * Height of the ONE-ROW insertion placeholder (row shift + green bar):
 * 1. the actually dragged row (rect, registered at dragstart before it
 *    collapses) + one collapsed gap when inserting into another container,
 * 2. the target container's first layout row (external drags),
 * 3. the configured baseline (empty container: both margins are added).
 *
 * Inserting back into the SAME container needs the row height only: collapsing
 * it does NOT merge the two 4px margins around it (the collapsed row keeps its
 * own block box, `overflow: hidden`), so the rows below move up by exactly the
 * row height and the placeholder moves them back by the same amount.
 */
export function getPlaceholderHeight(
  doc: Document,
  container: Element,
): number {
  const metrics = getRowsMetrics(doc, container);
  const dragged = getDraggedRowHeight(doc);
  const rowHeight = dragged ?? (metrics.count > 0 ? metrics.firstRowHeight : 0);
  const effective =
    rowHeight > 0 ? rowHeight : getDefaultRowHeight(doc, container);
  if (metrics.count === 0) {
    // The dropped row becomes the only row: both of its margins are new.
    return effective + metrics.edgeMargins;
  }
  if (isSameDragContainer(doc, container)) return effective;
  return effective + metrics.gap;
}

/**
 * How much taller the previewed container must become:
 * - another container: the full placeholder slot (row + inter-row gap);
 * - the drag's own container: the placeholder only once the source row has
 *   actually collapsed (before that the measured height still includes it), so
 *   the target height stays exactly the category's original height either way.
 */
export function getContainerPreviewDelta(
  doc: Document,
  container: Element,
): number {
  if (!isSameDragContainer(doc, container)) {
    return getPlaceholderHeight(doc, container);
  }
  return isDragSourceCollapsed(container)
    ? getPlaceholderHeight(doc, container)
    : 0;
}
