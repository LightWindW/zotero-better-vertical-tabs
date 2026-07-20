/**
 * Entrance animation for the quick-create-category flow.
 *
 * Confirming the new-category dialog triggers a data-changed re-render that
 * rebuilds the categories DOM, so the new top category would normally just
 * pop in. The dispatching side marks the new category's id on the document;
 * the render post-processing then replays a slide-down + fade-in on the
 * freshly rendered wrapper (height 0 -> natural, opacity 0 -> 1), so the new
 * category fades in while the content below moves down smoothly.
 *
 * Mirrors the mark/consume pattern of drag/dropOutlineFade.ts.
 */

const ENTRANCE_ID_KEY = "__vtNewCategoryEntranceId";
const STALE_TIMEOUT_KEY = "__vtNewCategoryEntranceStaleTimeout";
const ENTRANCE_CLASS = "vt-new-category-entrance";
export const ENTRANCE_ANIMATION_MS = 300;
/**
 * A mark is meant to be consumed by the very next re-render. If no render
 * follows, expire it so a later unrelated render cannot replay a stale
 * entrance on whatever category happens to be first.
 */
const STALE_TIMEOUT_MS = 2000;

const entranceTimeouts = new WeakMap<HTMLElement, number>();

function clearStaleTimeout(doc: Document): void {
  const win = doc.defaultView;
  const existing = (doc as any)[STALE_TIMEOUT_KEY] as number | undefined;
  if (existing !== undefined && win) {
    win.clearTimeout(existing);
  }
  delete (doc as any)[STALE_TIMEOUT_KEY];
}

/** Mark the category that should play the entrance on the next re-render. */
export function markNewCategoryEntrance(
  doc: Document,
  categoryId: string,
): void {
  clearStaleTimeout(doc);
  (doc as any)[ENTRANCE_ID_KEY] = categoryId;
  const win = doc.defaultView;
  if (win) {
    (doc as any)[STALE_TIMEOUT_KEY] = win.setTimeout(() => {
      delete (doc as any)[ENTRANCE_ID_KEY];
      delete (doc as any)[STALE_TIMEOUT_KEY];
    }, STALE_TIMEOUT_MS);
  }
}

/** Take the pending entrance category id (once). */
export function consumeNewCategoryEntrance(doc: Document): string | null {
  const id = (doc as any)[ENTRANCE_ID_KEY] as string | undefined;
  delete (doc as any)[ENTRANCE_ID_KEY];
  clearStaleTimeout(doc);
  return id || null;
}

/**
 * Play the slide-down + fade-in on the freshly rendered category wrapper.
 * Must run synchronously right after renderCategories, before the next paint.
 * The `.vt-new-category-entrance` class provides overflow:hidden and the
 * height/opacity transition (higher specificity than the base category rule);
 * inline styles carry the animated values.
 */
export function playNewCategoryEntrance(
  doc: Document,
  container: Element,
  categoryId: string,
): void {
  const el = container.querySelector(
    `.vertical-tabs-category[data-category-id="${CSS.escape(categoryId)}"]`,
  ) as HTMLElement | null;
  if (!el) return;
  const win = doc.defaultView;

  const previous = entranceTimeouts.get(el);
  if (previous !== undefined && win) {
    win.clearTimeout(previous);
    entranceTimeouts.delete(el);
  }

  // Measure the natural height BEFORE pinning 0, then commit the collapsed
  // start state with a reflow so the transition has concrete endpoints.
  const naturalHeight = el.getBoundingClientRect().height;
  el.classList.add(ENTRANCE_CLASS);
  el.style.height = "0px";
  el.style.opacity = "0";
  void el.offsetHeight;
  el.style.height = `${naturalHeight}px`;
  el.style.opacity = "1";

  if (win) {
    const timeout = win.setTimeout(() => {
      entranceTimeouts.delete(el);
      // Hand the steady state back to CSS (auto height, full opacity).
      el.style.height = "";
      el.style.opacity = "";
      el.classList.remove(ENTRANCE_CLASS);
    }, ENTRANCE_ANIMATION_MS);
    entranceTimeouts.set(el, timeout);
  }
}
