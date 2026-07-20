/**
 * Box-model-safe geometry measurement for row height animations.
 *
 * VT rows are content-box (the items container needed an explicit border-box
 * rule), so an inline `height` targets the CONTENT box while
 * getBoundingClientRect() returns the TOTAL height (content + padding).
 * Pinning or targeting a row height with the raw rect value would start or
 * end the animation off by the vertical padding amount, so every pin/target
 * must go through this helper.
 */

export interface RowGeometry {
  /** Height the inline `height` property should use (content box). */
  content: number;
  padTop: number;
  padBottom: number;
}

/**
 * Measure the row's current rendered geometry. Must be called while the
 * row's padding is at its natural value (no zeroing inline styles set).
 */
export function measureRowGeometry(
  doc: Document,
  el: HTMLElement,
): RowGeometry {
  const total = el.getBoundingClientRect().height;
  const cs = doc.defaultView?.getComputedStyle(el);
  if (!cs || cs.boxSizing === "border-box") {
    return { content: total, padTop: 0, padBottom: 0 };
  }
  const padTop = parseFloat(cs.paddingTop) || 0;
  const padBottom = parseFloat(cs.paddingBottom) || 0;
  return {
    content: Math.max(0, total - padTop - padBottom),
    padTop,
    padBottom,
  };
}
