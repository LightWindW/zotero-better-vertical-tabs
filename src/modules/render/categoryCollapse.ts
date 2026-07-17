/**
 * Smooth collapse/expand animation for category wrappers.
 *
 * The default CSS lets the grid track size follow the natural height of
 * `.vertical-tabs-items`. The `.collapsed` class pins the items at
 * `height: 0` (plus opacity 0 and chevron rotation), so the collapsed end
 * state stays collapsed after this module clears its inline styles. This
 * module animates the actual `height` of the items container so the wrapper
 * shrinks/grows smoothly.
 *
 * Animating `height` between explicit pixel values is more reliable in
 * Firefox/Zotero than transitioning `grid-template-rows` with `auto`/`1fr`.
 *
 * It is intentionally separate from `categoryPreview.ts` (drag preview) to
 * keep the two animation systems isolated; each system cancels the other
 * before taking over an element, preventing conflicting inline styles.
 */

const ANIMATION_CLASS = "vt-height-animating";
const ITEMS_SELECTOR = ":scope > .vertical-tabs-items";
const ANIMATION_MS = 450;

interface CollapseState {
  timeout: number;
}

const stateMap = new WeakMap<HTMLElement, CollapseState>();

function getWindow(doc: Document | null): Window | undefined {
  return doc?.defaultView || undefined;
}

function getItemsContainer(wrapper: HTMLElement): HTMLElement | null {
  return wrapper.querySelector(ITEMS_SELECTOR);
}

function clearState(wrapper: HTMLElement): void {
  stateMap.delete(wrapper);
}

function finishAnimation(wrapper: HTMLElement): void {
  const items = getItemsContainer(wrapper);
  if (items) items.style.height = "";
  wrapper.classList.remove(ANIMATION_CLASS);
  clearState(wrapper);
}

function forceReflow(element: HTMLElement): void {
  void element.offsetHeight;
}

function nextFrame(doc: Document, fn: () => void): void {
  const win = getWindow(doc);
  if (!win) {
    fn();
    return;
  }
  win.requestAnimationFrame(() => {
    win.requestAnimationFrame(fn);
  });
}

function scheduleFinish(doc: Document, wrapper: HTMLElement): void {
  const existing = stateMap.get(wrapper);
  const win = getWindow(doc);
  if (existing && win) {
    win.clearTimeout(existing.timeout);
  }

  if (!win) {
    finishAnimation(wrapper);
    return;
  }

  const timeout = win.setTimeout(() => {
    if (wrapper.isConnected) {
      finishAnimation(wrapper);
    } else {
      clearState(wrapper);
    }
  }, ANIMATION_MS);

  stateMap.set(wrapper, { timeout });
}

/**
 * Toggle the collapsed state of a category wrapper with a smooth height
 * animation. Returns the target collapsed state.
 */
export function toggleCategoryCollapseAnimated(
  doc: Document,
  wrapper: HTMLElement,
): boolean {
  const targetCollapsed = !wrapper.classList.contains("collapsed");

  // Cancel any in-progress animation first so we can re-measure from the
  // current interpolated height without the old cleanup overwriting us.
  cancelCategoryCollapseAnimation(wrapper);

  const items = getItemsContainer(wrapper);
  if (!items) {
    wrapper.classList.toggle("collapsed", targetCollapsed);
    return targetCollapsed;
  }

  if (targetCollapsed) {
    // Collapse: pin items at its current rendered height, then add .collapsed
    // for the chevron and let .vt-height-animating keep items visible during
    // the transition to 0.
    const startHeight = items.getBoundingClientRect().height;
    items.style.height = `${startHeight}px`;
    wrapper.classList.add("collapsed");
    wrapper.classList.add(ANIMATION_CLASS);
    forceReflow(items);
    nextFrame(doc, () => {
      items.style.height = "0px";
    });
  } else {
    // Expand: pin items at their current rendered height before removing
    // .collapsed so the wrapper does not flash open. The pinned value is ~0
    // for a fully collapsed category, or the interpolated height when
    // reversing a collapse mid-animation (seamless reverse).
    const startHeight = items.getBoundingClientRect().height;
    items.style.height = `${startHeight}px`;
    wrapper.classList.remove("collapsed");
    wrapper.classList.add(ANIMATION_CLASS);
    forceReflow(items);
    const targetHeight = items.scrollHeight;
    nextFrame(doc, () => {
      items.style.height = `${targetHeight}px`;
    });
  }

  scheduleFinish(doc, wrapper);
  return targetCollapsed;
}

/**
 * Immediately stop any collapse/expand animation on the wrapper.
 *
 * By default the inline `height` on `.vertical-tabs-items` is preserved so
 * that a new animation can start smoothly from the current interpolated
 * height. Pass `{ reset: true }` to also clear the inline style, restoring
 * full control to the CSS classes.
 */
export function cancelCategoryCollapseAnimation(
  wrapper: HTMLElement,
  options: { reset?: boolean } = {},
): void {
  const state = stateMap.get(wrapper);
  if (state) {
    const win = getWindow(wrapper.ownerDocument);
    if (win) win.clearTimeout(state.timeout);
    clearState(wrapper);
  }
  wrapper.classList.remove(ANIMATION_CLASS);
  if (options.reset) {
    const items = getItemsContainer(wrapper);
    if (items) items.style.height = "";
  }
}

/**
 * Returns true if the wrapper currently has a collapse/expand animation
 * in progress.
 */
export function isCategoryCollapseAnimating(wrapper: HTMLElement): boolean {
  return stateMap.has(wrapper);
}
