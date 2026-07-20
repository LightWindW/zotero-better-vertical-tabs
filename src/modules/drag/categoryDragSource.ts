/**
 * Category reorder drag: source-side animation sequence.
 *
 * When the user starts dragging a category header:
 * 1. (next frame, after the native drag image is captured) the source
 *    category smoothly collapses if it was expanded — the standard 0.45s
 *    collapse animation, persisted state untouched;
 * 2. once collapsed, the whole wrapper fades and shrinks to zero height
 *    (0.3s), so the original slot disappears and the list closes up.
 *
 * On cancel (dragend without a successful drop) the sequence reverses: the
 * wrapper fades back in and re-expands if it was expanded before the drag.
 * On a successful drop the reorder re-render replaces the DOM and the
 * release animation (categoryRelease.ts) takes over on the fresh wrapper.
 */

import {
  cancelCategoryCollapseAnimation,
  COLLAPSE_ANIMATION_MS,
  toggleCategoryCollapseAnimated,
} from "../render/categoryCollapse";

const STATE_KEY = "__vtCategoryDragSourceState";
const SOURCE_FADE_MS = 300;
/** Collapsed wrapper visual height (category header height). */
const COLLAPSED_WRAPPER_HEIGHT_PX = 36;

type SourcePhase = "collapsing" | "fading" | "hidden" | "restoring";

interface CategoryDragSourceState {
  categoryId: string;
  wasCollapsed: boolean;
  wrapper: HTMLElement;
  phase: SourcePhase;
  timeouts: number[];
  dropped: boolean;
}

export interface CategoryDragSourceInfo {
  categoryId: string;
  wasCollapsed: boolean;
}

function peekState(doc: Document): CategoryDragSourceState | undefined {
  return (doc as any)[STATE_KEY] as CategoryDragSourceState | undefined;
}

function clearStateTimeouts(
  doc: Document,
  state: CategoryDragSourceState,
): void {
  const win = doc.defaultView;
  for (const t of state.timeouts) {
    win?.clearTimeout(t);
  }
  state.timeouts = [];
}

export function startCategoryDragSource(
  doc: Document,
  wrapper: HTMLElement,
  categoryId: string,
): void {
  // Defensive: terminate any previous source sequence.
  const prev = peekState(doc);
  if (prev) {
    clearStateTimeouts(doc, prev);
    delete (doc as any)[STATE_KEY];
  }

  const state: CategoryDragSourceState = {
    categoryId,
    wasCollapsed: wrapper.classList.contains("collapsed"),
    wrapper,
    phase: "collapsing",
    timeouts: [],
    dropped: false,
  };
  (doc as any)[STATE_KEY] = state;

  const win = doc.defaultView;

  const fadeOutWrapper = () => {
    if (!wrapper.isConnected || peekState(doc) !== state) return;
    state.phase = "fading";
    wrapper.classList.add("vt-catdrag-source");
    wrapper.style.height = `${wrapper.getBoundingClientRect().height}px`;
    wrapper.style.opacity = "1";
    void wrapper.offsetHeight;
    wrapper.style.height = "0px";
    wrapper.style.opacity = "0";
    const t = win?.setTimeout(() => {
      state.phase = "hidden";
    }, SOURCE_FADE_MS);
    if (t !== undefined) state.timeouts.push(t);
  };

  const begin = () => {
    if (!wrapper.isConnected || peekState(doc) !== state) return;
    if (state.wasCollapsed) {
      fadeOutWrapper();
    } else {
      // Play the standard smooth collapse, then fade the wrapper once the
      // collapse completes.
      toggleCategoryCollapseAnimated(doc, wrapper);
      const t = win?.setTimeout(fadeOutWrapper, COLLAPSE_ANIMATION_MS);
      if (t !== undefined) state.timeouts.push(t);
    }
  };

  // Defer one frame so the native drag image is captured from the pre-drag
  // appearance (same pattern as the item-row dragstart).
  if (win?.requestAnimationFrame) {
    win.requestAnimationFrame(begin);
  } else {
    begin();
  }
}

/** The drop handler marks a successful drop so dragend does not restore. */
export function markCategoryDragDropped(doc: Document): void {
  const state = peekState(doc);
  if (state) state.dropped = true;
}

/** Whether the current source drag already landed a successful drop. */
export function isCategoryDragDropped(doc: Document): boolean {
  return peekState(doc)?.dropped ?? false;
}

/** Info for the drop handler to build the release animation mark. */
export function getCategoryDragSource(
  doc: Document,
): CategoryDragSourceInfo | null {
  const state = peekState(doc);
  if (!state) return null;
  return { categoryId: state.categoryId, wasCollapsed: state.wasCollapsed };
}

/**
 * dragend: restore the source wrapper on cancel (fade back in, then
 * re-expand if it was expanded before the drag). After a successful drop
 * this only clears the state — the reorder re-render replaces the DOM.
 */
export function endCategoryDragSource(doc: Document): void {
  const state = peekState(doc);
  if (!state) return;
  delete (doc as any)[STATE_KEY];
  clearStateTimeouts(doc, state);
  if (state.dropped) return;

  const { wrapper } = state;
  if (!wrapper.isConnected) return;
  state.phase = "restoring";
  const win = doc.defaultView;

  // Stop any running collapse animation (keeping current inline values) and
  // snap the items area to the collapsed end state — the wrapper fade/clip
  // hides this correction.
  cancelCategoryCollapseAnimation(wrapper);
  wrapper.classList.add("collapsed");
  const items = wrapper.querySelector(
    ":scope > .vertical-tabs-items",
  ) as HTMLElement | null;
  if (items) items.style.height = "";

  // Fade the wrapper back in from its current (possibly zero) geometry.
  wrapper.classList.add("vt-catdrag-source");
  wrapper.style.height = `${wrapper.getBoundingClientRect().height}px`;
  wrapper.style.opacity =
    doc.defaultView?.getComputedStyle(wrapper)?.opacity ?? "0";
  void wrapper.offsetHeight;
  wrapper.style.height = `${COLLAPSED_WRAPPER_HEIGHT_PX}px`;
  wrapper.style.opacity = "1";

  const t = win?.setTimeout(() => {
    wrapper.classList.remove("vt-catdrag-source");
    wrapper.style.height = "";
    wrapper.style.opacity = "";
    if (!state.wasCollapsed && wrapper.isConnected) {
      // Re-expand with the standard animation; the persisted state still
      // says expanded, so this only restores the pre-drag visual.
      toggleCategoryCollapseAnimated(doc, wrapper);
    }
  }, SOURCE_FADE_MS);
  if (t !== undefined) state.timeouts.push(t);
}

export function destroyCategoryDragSource(doc: Document): void {
  const state = peekState(doc);
  if (!state) return;
  clearStateTimeouts(doc, state);
  delete (doc as any)[STATE_KEY];
}
