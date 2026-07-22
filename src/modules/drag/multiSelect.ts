/**
 * Multi-tab selection state (Ctrl/Shift, Windows Explorer semantics).
 *
 * - Ctrl+click toggles one tab and moves the anchor to it.
 * - Shift+click selects the contiguous range between the anchor and the
 *   clicked tab (DOM visual order, works across categories); the anchor does
 *   NOT move on shift+click (same as Explorer). With no anchor, the clicked
 *   tab becomes the anchor (and the only selected one).
 *
 * State is per-document (a UI concern, not persisted). Selected rows carry
 * the `.vt-selected` class; the overlay element inside the row provides the
 * 0.2s fade in/out via CSS. Re-rendered rows re-apply the class at creation
 * time, so selection survives data-change re-renders without animating.
 */

import { getCategoriesContainer } from "../sidebar/sidebar";

const STATE_KEY = "__vtMultiSelectState";
const FADE_OUT_KEY = "__vtSelectionFadeOutIds";
const FADE_OUT_STALE_KEY = "__vtSelectionFadeOutStaleTimeout";
/**
 * How long a fade-out stash stays valid. Only the navigate-on-plain-click
 * path renders immediately after a clear; anything later would be an
 * unrelated render and must not replay the fade.
 */
const FADE_OUT_STALE_MS = 300;
export const SELECTED_CLASS = "vt-selected";

interface MultiSelectState {
  selected: Set<string>;
  anchor: string | null;
}

function getState(doc: Document): MultiSelectState {
  const existing = (doc as any)[STATE_KEY] as MultiSelectState | undefined;
  if (existing) return existing;
  const state: MultiSelectState = { selected: new Set(), anchor: null };
  (doc as any)[STATE_KEY] = state;
  return state;
}

function setRowVisual(doc: Document, tabId: string, on: boolean): void {
  doc
    .querySelectorAll(`.vertical-tabs-item[data-tab-id="${CSS.escape(tabId)}"]`)
    .forEach((el: Element) => el.classList.toggle(SELECTED_CLASS, on));
}

export function isTabSelected(doc: Document, tabId: string): boolean {
  return getState(doc).selected.has(tabId);
}

export function getSelectedTabCount(doc: Document): number {
  return getState(doc).selected.size;
}

export function getSelectedTabIds(doc: Document): ReadonlySet<string> {
  return getState(doc).selected;
}

/**
 * The selected tabIds in the VT's current VISUAL (DOM) order — the order
 * used for the multi-drag collapse and the contiguous block insertion.
 */
export function getOrderedSelectedTabIds(doc: Document): string[] {
  const container = getCategoriesContainer(doc);
  if (!container) return [];
  const { selected } = getState(doc);
  return Array.from(container.querySelectorAll(".vertical-tabs-item"))
    .map((el) => (el as HTMLElement).dataset.tabId || "")
    .filter((id) => id && selected.has(id));
}

/** Ctrl+click: toggle a single tab; the anchor moves to it. */
export function toggleTabSelection(doc: Document, tabId: string): void {
  const state = getState(doc);
  if (state.selected.has(tabId)) {
    state.selected.delete(tabId);
    setRowVisual(doc, tabId, false);
    if (state.anchor === tabId) {
      state.anchor = state.selected.values().next().value ?? null;
    }
  } else {
    state.selected.add(tabId);
    state.anchor = tabId;
    setRowVisual(doc, tabId, true);
  }
}

/**
 * Pure range computation for shift+click: everything between anchorId and
 * targetId (inclusive) in the given visual order. Empty when either id is
 * missing from the order.
 */
export function computeRangeSelection(
  anchorId: string,
  targetId: string,
  orderedIds: string[],
): string[] {
  const a = orderedIds.indexOf(anchorId);
  const b = orderedIds.indexOf(targetId);
  if (a < 0 || b < 0) return [];
  const [from, to] = a <= b ? [a, b] : [b, a];
  return orderedIds.slice(from, to + 1);
}

/** Shift+click: replace the selection with the anchor↔target range. */
export function selectTabRange(
  doc: Document,
  targetTabId: string,
  orderedTabIds: string[],
): void {
  const state = getState(doc);
  const range = state.anchor
    ? computeRangeSelection(state.anchor, targetTabId, orderedTabIds)
    : [];
  const next = new Set(range.length ? range : [targetTabId]);
  if (!state.anchor || range.length === 0) {
    // No anchor yet, or the anchor is gone from the current order (e.g. its
    // tab was closed): fall back to the clicked tab as the new anchor.
    state.anchor = targetTabId;
  }

  // Visual pass: select rows in the range, deselect everything else.
  const container = getCategoriesContainer(doc);
  if (container) {
    container.querySelectorAll(".vertical-tabs-item").forEach((el: Element) => {
      const id = (el as HTMLElement).dataset.tabId || "";
      el.classList.toggle(SELECTED_CLASS, next.has(id));
    });
  }
  state.selected = next;
}

/**
 * Clear the selection (rows fade out via the overlay's 0.2s opacity
 * transition) and RESET the range anchor — a cleared session must not leak
 * its anchor into the next shift+click.
 *
 * With `forRender: true` the just-cleared ids are also stashed (300ms
 * expiry): the plain-click-navigate path triggers a re-render that would
 * otherwise destroy the rows mid-fade; the render post-processing replays
 * the fade on the fresh rows. Safe to call when nothing is selected.
 */
export function clearTabSelection(
  doc: Document,
  opts?: { forRender?: boolean },
): void {
  const state = (doc as any)[STATE_KEY] as MultiSelectState | undefined;
  // Fast path: no selection — skip the document-wide scan entirely. The
  // document-level capture listener calls this on EVERY mousedown/click
  // anywhere in the window. Invariant: rows only carry SELECTED_CLASS while
  // their tabId is in state.selected (creation, setRowVisual, range toggle
  // and the fade replay all keep it in sync), so an empty set guarantees no
  // stale classes — and the anchor is always null when the set is empty.
  if (!state || state.selected.size === 0) return;
  if (opts?.forRender) {
    (doc as any)[FADE_OUT_KEY] = Array.from(state.selected);
    const win = doc.defaultView;
    const previous = (doc as any)[FADE_OUT_STALE_KEY] as number | undefined;
    if (previous !== undefined && win) win.clearTimeout(previous);
    if (win) {
      (doc as any)[FADE_OUT_STALE_KEY] = win.setTimeout(() => {
        delete (doc as any)[FADE_OUT_KEY];
        delete (doc as any)[FADE_OUT_STALE_KEY];
      }, FADE_OUT_STALE_MS);
    }
  }
  state.selected.clear();
  state.anchor = null;
  doc
    .querySelectorAll(`.vertical-tabs-item.${SELECTED_CLASS}`)
    .forEach((el: Element) => el.classList.remove(SELECTED_CLASS));
}

/**
 * Take the stashed just-cleared tabIds (once), for the render
 * post-processing to replay the fade-out on the freshly rendered rows.
 */
export function consumeSelectionFadeOut(doc: Document): string[] | null {
  const ids = (doc as any)[FADE_OUT_KEY] as string[] | undefined;
  delete (doc as any)[FADE_OUT_KEY];
  const win = doc.defaultView;
  const timeout = (doc as any)[FADE_OUT_STALE_KEY] as number | undefined;
  if (timeout !== undefined && win) win.clearTimeout(timeout);
  delete (doc as any)[FADE_OUT_STALE_KEY];
  return ids && ids.length ? ids : null;
}

/**
 * Replay the selection fade-out on freshly rendered rows: add `.vt-selected`
 * back (committing the visible overlay), then remove it so the overlay's
 * 0.2s opacity transition plays the fade on the new DOM. Must run
 * synchronously right after renderCategories, before the next paint.
 */
export function replaySelectionFadeOut(
  container: Element,
  tabIds: string[],
): void {
  const rows = tabIds
    .map(
      (id) =>
        container.querySelector(
          `.vertical-tabs-item[data-tab-id="${CSS.escape(id)}"]`,
        ) as HTMLElement | null,
    )
    .filter((r): r is HTMLElement => !!r);
  if (!rows.length) return;
  for (const row of rows) {
    row.classList.add(SELECTED_CLASS);
  }
  // Commit the visible overlay on all rows with a single reflow, then
  // release — the CSS transition fades every overlay out.
  void rows[0].offsetHeight;
  for (const row of rows) {
    row.classList.remove(SELECTED_CLASS);
  }
}

export function destroyTabSelection(doc: Document): void {
  clearTabSelection(doc);
  delete (doc as any)[STATE_KEY];
}
