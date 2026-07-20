/**
 * Category reorder release animation.
 *
 * The reorder dispatch triggers a data-changed re-render that rebuilds the
 * categories DOM, so the moved category would normally just pop in at its
 * new position. The drop handler marks the moved category (and whether it
 * was collapsed before the drag); the render post-processing then replays
 * the release on the fresh wrapper:
 *
 * - Was collapsed: the header simply fades in at the gap position (the
 *   persisted state is collapsed, so that is also the final state).
 * - Was expanded: the wrapper first commits the collapsed visual (so the
 *   list geometry matches the pre-drop gap and nothing jumps), the header
 *   fades in, then the standard expand animation opens the items area.
 *
 * Geometry note: in the pre-drop DOM the wrappers below the gap were
 * shifted down by exactly one header height; in the fresh DOM the moved
 * category occupies that gap, so every sibling keeps its visual position —
 * the only change is the moved category appearing.
 *
 * Mirrors the mark/consume pattern of drag/dropOutlineFade.ts.
 */

import { toggleCategoryCollapseAnimated } from "../render/categoryCollapse";
import {
  resetCategoryGapPreview,
  spawnGapIndicatorFadeOut,
} from "./categoryGapPreview";

const RELEASE_KEY = "__vtCategoryRelease";
const STALE_TIMEOUT_KEY = "__vtCategoryReleaseStaleTimeout";
/**
 * A mark is meant to be consumed by the very next re-render. If no render
 * follows, expire it so a later unrelated render cannot replay a stale
 * release on an arbitrary category.
 */
const STALE_TIMEOUT_MS = 2000;
const HEADER_FADE_MS = 300;

export interface CategoryReleaseInfo {
  categoryId: string;
  wasCollapsed: boolean;
}

function clearStaleTimeout(doc: Document): void {
  const win = doc.defaultView;
  const existing = (doc as any)[STALE_TIMEOUT_KEY] as number | undefined;
  if (existing !== undefined && win) {
    win.clearTimeout(existing);
  }
  delete (doc as any)[STALE_TIMEOUT_KEY];
}

export function markCategoryRelease(
  doc: Document,
  info: CategoryReleaseInfo,
): void {
  clearStaleTimeout(doc);
  (doc as any)[RELEASE_KEY] = info;
  const win = doc.defaultView;
  if (win) {
    (doc as any)[STALE_TIMEOUT_KEY] = win.setTimeout(() => {
      delete (doc as any)[RELEASE_KEY];
      delete (doc as any)[STALE_TIMEOUT_KEY];
    }, STALE_TIMEOUT_MS);
  }
}

export function consumeCategoryRelease(
  doc: Document,
): CategoryReleaseInfo | null {
  const info = (doc as any)[RELEASE_KEY] as CategoryReleaseInfo | undefined;
  delete (doc as any)[RELEASE_KEY];
  clearStaleTimeout(doc);
  return info ?? null;
}

/**
 * Play the release animation on the freshly rendered category wrapper.
 * Must run synchronously right after renderCategories, before the next paint.
 */
export function playCategoryRelease(
  doc: Document,
  container: Element,
  info: CategoryReleaseInfo,
): void {
  const el = container.querySelector(
    `.vertical-tabs-category[data-category-id="${CSS.escape(info.categoryId)}"]`,
  ) as HTMLElement | null;
  if (!el) return;

  // Green-bar handoff: the drop left the gap visible in the old DOM (whose
  // shifted geometry matches this fresh DOM); spawn the bar at the moved
  // category's position and let it dissolve as the category fades in.
  const layoutTop = el.offsetTop;
  resetCategoryGapPreview(doc);
  spawnGapIndicatorFadeOut(doc, container, layoutTop);

  if (!info.wasCollapsed) {
    // Commit the collapsed visual as the FIRST style so the list below keeps
    // its pre-drop (gap) position; expanding later pushes it down smoothly.
    el.classList.add("collapsed");
  }
  el.style.opacity = "0";
  void el.offsetHeight;

  // Fade the header in at the gap position.
  el.style.transition = "opacity 0.3s ease";
  el.style.opacity = "1";

  doc.defaultView?.setTimeout(() => {
    if (!el.isConnected) return;
    el.style.transition = "";
    el.style.opacity = "";
    if (!info.wasCollapsed) {
      // Then smoothly expand to the persisted (expanded) state.
      toggleCategoryCollapseAnimated(doc, el);
    }
  }, HEADER_FADE_MS);
}
