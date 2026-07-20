/**
 * Category color cross-fade.
 *
 * Changing a category color persists the data and re-renders the whole
 * categories DOM, so the fresh wrapper already carries the new color and the
 * background would change instantly.
 *
 * This module records the old/new colors at change time. The render
 * post-processing then pins the OLD color on the fresh wrapper with transitions
 * disabled, commits it with a reflow, and releases to the new color — the base
 * rule's `background 0.3s ease` transition plays the cross-fade (old color
 * fades out while the new color fades in). No overlay elements, no inline
 * residue beyond what the render itself would set, no leftover timers.
 */

import { isDarkMode, lightToDark } from "./colorUtils";

export interface CategoryColorFadeMark {
  categoryId: string;
  /** Previous light-mode color (undefined = no color). */
  oldColor?: string;
  /** New light-mode color (undefined = color removed). */
  newColor?: string;
}

const MARK_KEY = "__vtCategoryColorFade";
const STALE_TIMEOUT_KEY = "__vtCategoryColorFadeStaleTimeout";
/**
 * A mark is meant to be consumed by the very next re-render. If no render
 * follows, expire the mark so a later unrelated render cannot replay a stale
 * fade.
 */
const STALE_TIMEOUT_MS = 2000;

function clearStaleTimeout(doc: Document): void {
  const win = doc.defaultView;
  const existing = (doc as any)[STALE_TIMEOUT_KEY] as number | undefined;
  if (existing !== undefined && win) {
    win.clearTimeout(existing);
  }
  delete (doc as any)[STALE_TIMEOUT_KEY];
}

/** "#F2F2F2" is the "no color" sentinel — normalize it away. */
function normalizeColor(color: string | undefined): string | undefined {
  return color && color.toUpperCase() !== "#F2F2F2" ? color : undefined;
}

/**
 * Record a color change for a category. Must be called before the persist
 * that triggers the re-render. A later mark overwrites an earlier one.
 */
export function markCategoryColorFade(
  doc: Document,
  mark: CategoryColorFadeMark,
): void {
  const oldColor = normalizeColor(mark.oldColor);
  const newColor = normalizeColor(mark.newColor);
  if (oldColor === newColor) return;
  clearStaleTimeout(doc);
  (doc as any)[MARK_KEY] = { categoryId: mark.categoryId, oldColor, newColor };
  const win = doc.defaultView;
  if (win) {
    (doc as any)[STALE_TIMEOUT_KEY] = win.setTimeout(() => {
      delete (doc as any)[MARK_KEY];
      delete (doc as any)[STALE_TIMEOUT_KEY];
    }, STALE_TIMEOUT_MS);
  }
}

/** Take the pending color-fade mark (once), clearing any stale-timeout. */
export function consumeCategoryColorFade(
  doc: Document,
): CategoryColorFadeMark | null {
  const mark = (doc as any)[MARK_KEY] as CategoryColorFadeMark | undefined;
  delete (doc as any)[MARK_KEY];
  clearStaleTimeout(doc);
  return mark ?? null;
}

/**
 * Replay the cross-fade on the freshly rendered category wrapper. Must run
 * synchronously right after renderCategories, before the next paint.
 *
 * The inline `transition: none` pin commits the old color instantly (no
 * fade-in); releasing to the new color then lets the base rule's
 * `background 0.3s ease` transition play the cross-fade. When the new color
 * is "none", the inline background ends as `transparent` — visually identical
 * to the default and re-synced by the next render or dark-mode switch.
 */
export function playCategoryColorFade(
  doc: Document,
  container: Element,
  mark: CategoryColorFadeMark,
): void {
  const wrapper = container.querySelector(
    `.vertical-tabs-category[data-category-id="${CSS.escape(mark.categoryId)}"]`,
  ) as HTMLElement | null;
  if (!wrapper) return;
  const dark = isDarkMode(doc);
  const from = mark.oldColor
    ? dark
      ? lightToDark(mark.oldColor)
      : mark.oldColor
    : "transparent";
  const to = mark.newColor
    ? dark
      ? lightToDark(mark.newColor)
      : mark.newColor
    : "transparent";
  wrapper.style.transition = "none";
  wrapper.style.background = from;
  // Force a reflow so the old color is committed with no transition.
  void wrapper.offsetHeight;
  wrapper.style.transition = "";
  wrapper.style.background = to;
}
