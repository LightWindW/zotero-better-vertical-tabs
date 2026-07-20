/**
 * Category reorder gap preview.
 *
 * While a category is dragged between other categories, a blank gap one
 * header-height tall opens at the target position: the wrappers at and below
 * the gap slide down (shared `vt-drop-preview-shift` class, transform
 * transition), and a green bar fades in, vertically centered in the gap.
 * Same target is a no-op; moving between targets transitions smoothly;
 * clearing slides everything back and fades the bar out.
 *
 * Positions are computed in LAYOUT coordinates (offsetTop), which are
 * unaffected by the in-flight shift transforms, so the indicator never
 * chases its own animation.
 */

const STATE_KEY = "__vtCategoryGapPreviewState";
// Shared with dropPreview.ts (item shifts) — same CSS class and var.
const SHIFT_CLASS = "vt-drop-preview-shift";
const SHIFT_VAR = "--vt-drop-shift-y";
const INDICATOR_CLASS = "vertical-tabs-category-gap-indicator";
const GAP_HEIGHT_PX = 36;
const INDICATOR_FADE_MS = 150;

interface CategoryGapPreviewState {
  shifted: Set<Element>;
  /** First shifted wrapper; null means the gap sits after the last category. */
  gapBefore: Element | null;
  /** Whether a gap is currently shown (gapBefore may be null for "at end"). */
  active: boolean;
  indicator: HTMLElement | null;
  indicatorTimeout: number | undefined;
}

function getState(doc: Document): CategoryGapPreviewState {
  const existing = (doc as any)[STATE_KEY] as
    | CategoryGapPreviewState
    | undefined;
  if (existing) return existing;
  const state: CategoryGapPreviewState = {
    shifted: new Set(),
    gapBefore: null,
    active: false,
    indicator: null,
    indicatorTimeout: undefined,
  };
  (doc as any)[STATE_KEY] = state;
  return state;
}

function getCategoryWrappers(container: Element): HTMLElement[] {
  return Array.from(
    container.querySelectorAll(":scope > .vertical-tabs-category"),
  ) as HTMLElement[];
}

/**
 * Every container child that must slide with the gap: category wrappers AND
 * the uncategorized drop-zone AND separators. Shifting only the categories
 * would let the content below (drop-zone with its tabs) overlap the shifted
 * categories by one gap height.
 */
function getShiftableChildren(container: Element): HTMLElement[] {
  return (Array.from(container.children) as HTMLElement[]).filter(
    (el) => !el.classList.contains(INDICATOR_CLASS),
  );
}

function applyShift(el: HTMLElement): void {
  el.style.setProperty(SHIFT_VAR, `${GAP_HEIGHT_PX}px`);
  el.classList.add(SHIFT_CLASS);
}

function removeShift(el: Element): void {
  const htmlEl = el as HTMLElement;
  htmlEl.classList.remove(SHIFT_CLASS);
  htmlEl.style.removeProperty(SHIFT_VAR);
}

function cancelIndicatorTimeout(
  doc: Document,
  state: CategoryGapPreviewState,
): void {
  if (state.indicatorTimeout !== undefined) {
    doc.defaultView?.clearTimeout(state.indicatorTimeout);
    state.indicatorTimeout = undefined;
  }
}

/**
 * Show/move the gap to `position` relative to `targetWrapper`
 * ("before" opens the gap above it, "after" below it).
 */
export function applyCategoryGapPreview(
  doc: Document,
  targetWrapper: HTMLElement,
  position: "before" | "after",
): void {
  const container = targetWrapper.parentElement;
  if (!container) return;
  const state = getState(doc);
  const wrappers = getCategoryWrappers(container);
  const targetIndex = wrappers.indexOf(targetWrapper);
  if (targetIndex < 0) return;

  // "after" shifts the NEXT container child, which may be the drop-zone (or
  // a separator) when the target is the last category.
  const shiftables = getShiftableChildren(container);
  const firstShifted =
    position === "before"
      ? targetWrapper
      : (shiftables[shiftables.indexOf(targetWrapper) + 1] ?? null);
  if (state.active && state.gapBefore === firstShifted && state.indicator)
    return;

  // Update the shifted set: everything below the gap, so no content stays
  // behind to be overlapped.
  const desired = new Set<Element>(
    firstShifted ? shiftables.slice(shiftables.indexOf(firstShifted)) : [],
  );
  for (const el of state.shifted) {
    if (!desired.has(el)) removeShift(el);
  }
  for (const el of desired) {
    applyShift(el as HTMLElement);
  }
  state.shifted = desired;
  state.gapBefore = firstShifted;
  state.active = true;

  // Gap center in layout coordinates (offsetTop ignores transforms).
  const gapLayoutTop = firstShifted
    ? firstShifted.offsetTop
    : wrappers.length > 0
      ? wrappers[wrappers.length - 1].offsetTop +
        wrappers[wrappers.length - 1].offsetHeight
      : 0;

  cancelIndicatorTimeout(doc, state);
  let indicator = state.indicator;
  if (!indicator || !indicator.isConnected) {
    indicator = doc.createElement("div");
    indicator.className = INDICATOR_CLASS;
    container.appendChild(indicator);
    state.indicator = indicator;
    // Commit the initial transparent state before fading in.
    indicator.style.top = `${gapLayoutTop + GAP_HEIGHT_PX / 2 - 1}px`;
    void indicator.offsetHeight;
  }
  indicator.style.top = `${gapLayoutTop + GAP_HEIGHT_PX / 2 - 1}px`;
  indicator.style.opacity = "1";
}

/**
 * Clear the gap preview. With animate=true the shifted wrappers slide back
 * via their transform transition and the bar fades out; otherwise everything
 * is removed instantly (used on drop, right before the re-render).
 */
export function clearCategoryGapPreview(doc: Document, animate = true): void {
  const state = (doc as any)[STATE_KEY] as CategoryGapPreviewState | undefined;
  if (!state) return;
  for (const el of state.shifted) {
    removeShift(el);
  }
  state.shifted.clear();
  state.gapBefore = null;
  state.active = false;

  cancelIndicatorTimeout(doc, state);
  const indicator = state.indicator;
  if (!indicator) return;
  if (!animate) {
    indicator.remove();
    state.indicator = null;
    return;
  }
  indicator.style.opacity = "0";
  const win = doc.defaultView;
  state.indicatorTimeout = win?.setTimeout(() => {
    state.indicatorTimeout = undefined;
    indicator.remove();
    if (state.indicator === indicator) state.indicator = null;
  }, INDICATOR_FADE_MS);
}

export function destroyCategoryGapPreview(doc: Document): void {
  clearCategoryGapPreview(doc, false);
  delete (doc as any)[STATE_KEY];
}

/**
 * Drop the state WITHOUT touching any visuals. Used by the release handoff:
 * on drop the gap stays visible in the old DOM (siblings' shifted positions
 * match the fresh DOM's natural positions), the re-render destroys it, and
 * the release spawns a fade-out bar in the fresh DOM.
 */
export function resetCategoryGapPreview(doc: Document): void {
  const state = (doc as any)[STATE_KEY] as CategoryGapPreviewState | undefined;
  if (!state) return;
  cancelIndicatorTimeout(doc, state);
  state.shifted.clear();
  state.gapBefore = null;
  state.active = false;
  state.indicator = null;
}

/**
 * The insertBeforeCategoryId matching the currently shown gap, so the drop
 * lands exactly where the green bar is:
 * - a category id  -> insert before that category,
 * - null           -> gap sits after the last category (append to end),
 * - undefined      -> no gap is currently shown.
 */
export function getCategoryGapInsertBefore(
  doc: Document,
): string | null | undefined {
  const state = (doc as any)[STATE_KEY] as CategoryGapPreviewState | undefined;
  if (!state || !state.active) return undefined;
  const el = state.gapBefore;
  if (!el) return null;
  if (el.classList.contains("vertical-tabs-category")) {
    return (el as HTMLElement).dataset.categoryId || null;
  }
  // Gap before the drop-zone / a separator: right after the last category.
  return null;
}

/**
 * Spawn the green bar at `layoutTopPx` (container layout coordinates) at full
 * opacity and fade it out. Used by the release animation so the bar dissolves
 * exactly where the moved category fades in.
 */
export function spawnGapIndicatorFadeOut(
  doc: Document,
  container: Element,
  layoutTopPx: number,
): void {
  const state = getState(doc);
  cancelIndicatorTimeout(doc, state);
  let indicator = state.indicator;
  if (!indicator || !indicator.isConnected) {
    indicator = doc.createElement("div");
    indicator.className = INDICATOR_CLASS;
    container.appendChild(indicator);
    state.indicator = indicator;
  }
  indicator.style.top = `${layoutTopPx + GAP_HEIGHT_PX / 2 - 1}px`;
  indicator.style.opacity = "1";
  // Commit the fully visible state, then fade out.
  void indicator.offsetHeight;
  indicator.style.opacity = "0";
  const win = doc.defaultView;
  state.indicatorTimeout = win?.setTimeout(() => {
    state.indicatorTimeout = undefined;
    indicator.remove();
    if (state.indicator === indicator) state.indicator = null;
  }, INDICATOR_FADE_MS);
}
