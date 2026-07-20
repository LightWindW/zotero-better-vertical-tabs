/**
 * Exit animation for category deletion.
 *
 * Unlike the entrance (which replays on freshly rendered DOM), a removed
 * category no longer exists in the post-delete DOM, so the animation must
 * play BEFORE the data commit: this module collapses the live wrapper
 * (height -> 0, opacity -> 0, margin-bottom -> 0 so the trailing 2px does not
 * snap) and only then invokes the commit callback that mutates the data and
 * triggers the re-render. By the time the wrapper is removed from the DOM it
 * is already visually zero-sized and transparent, so the removal is
 * invisible and the content below has slid up smoothly.
 *
 * If another re-render destroys the wrapper mid-animation, the commit still
 * fires on schedule and the deletion simply degrades to the old instant
 * behavior.
 */

import { getCategoriesContainer } from "../sidebar/sidebar";

const EXIT_CLASS = "vt-category-exit";
export const EXIT_ANIMATION_MS = 300;

/** Wrappers currently animating out (guards against double commits). */
const exitingWrappers = new WeakSet<HTMLElement>();

/**
 * Play the collapse+fade exit on the category wrapper, then run `onComplete`
 * (the data commit). When the wrapper cannot be found in the live DOM, the
 * commit runs immediately so the deletion is never lost.
 */
export function animateCategoryExit(
  doc: Document,
  categoryId: string,
  onComplete: () => void,
): void {
  const container = getCategoriesContainer(doc);
  const el = container?.querySelector(
    `.vertical-tabs-category[data-category-id="${CSS.escape(categoryId)}"]`,
  ) as HTMLElement | null;
  if (!el) {
    onComplete();
    return;
  }
  if (exitingWrappers.has(el)) return;
  exitingWrappers.add(el);

  // Pin the current (possibly interpolated) geometry, commit it, then
  // transition to the collapsed target.
  el.classList.add(EXIT_CLASS);
  el.style.height = `${el.getBoundingClientRect().height}px`;
  el.style.opacity = doc.defaultView?.getComputedStyle(el)?.opacity ?? "1";
  void el.offsetHeight;
  el.style.height = "0px";
  el.style.opacity = "0";
  el.style.marginBottom = "0px";

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    exitingWrappers.delete(el);
    onComplete();
  };
  const win = doc.defaultView;
  if (win) {
    win.setTimeout(finish, EXIT_ANIMATION_MS);
  } else {
    finish();
  }
}
