/**
 * Exit animation for tab closing (quick fade + collapse, then the actual
 * close).
 *
 * Closing a native tab triggers a notifier → re-render that removes the row,
 * so the row would vanish instantly. Like the category exit, the animation
 * must play BEFORE the close: the live row is collapsed (height → 0,
 * opacity → 0, padding → 0) and only then is `onComplete` (the actual
 * `Zotero_Tabs.close`) invoked. By the time the re-render removes the row it
 * is already zero-sized and transparent, and the rows below have slid up
 * smoothly.
 *
 * VT rows are content-box and carry `min-height: 36px`, which would block an
 * inline `height: 0` — so geometry is pinned via `measureRowGeometry` and
 * height/padding/min-height are all driven inline (min-height snaps to 0,
 * the rest transition over 0.2s via the `.vt-tab-exit` class).
 *
 * If a re-render destroys a row mid-animation, the commit still fires on
 * schedule and the close degrades to the old instant behavior. Supports
 * closing several tabs at once (close-others): all rows collapse together
 * with a single reflow, then one commit closes them all.
 */

import { measureRowGeometry } from "./boxMeasure";
import { getCategoriesContainer } from "../sidebar/sidebar";

const EXIT_CLASS = "vt-tab-exit";
/**
 * Commit delay = the collapse duration (0.3s ease-out). The fade finishes
 * earlier (0.2s), so the row is already transparent while the rows below
 * finish sliding up.
 */
export const TAB_EXIT_ANIMATION_MS = 300;

/** Rows currently animating out (guards against double commits). */
const exitingRows = new WeakSet<HTMLElement>();

/**
 * Play the collapse+fade exit on the rows for `tabIds`, then run `onComplete`
 * (the actual close). When none of the rows can be found in the live DOM, the
 * commit runs immediately so the close is never lost.
 */
export function animateTabsExit(
  doc: Document,
  tabIds: string[],
  onComplete: () => void,
): void {
  const container = getCategoriesContainer(doc);
  const rows: HTMLElement[] = [];
  if (container) {
    for (const tabId of tabIds) {
      const row = container.querySelector(
        `.vertical-tabs-item[data-tab-id="${CSS.escape(tabId)}"]`,
      ) as HTMLElement | null;
      if (row && !exitingRows.has(row)) {
        exitingRows.add(row);
        rows.push(row);
      }
    }
  }
  if (!rows.length) {
    onComplete();
    return;
  }

  // Pin current geometry on every row, commit with a single reflow, then
  // zero everything — the rows below slide up as the heights collapse.
  for (const row of rows) {
    const geo = measureRowGeometry(doc, row);
    row.classList.add(EXIT_CLASS);
    row.style.height = `${geo.content}px`;
    row.style.minHeight = "0px";
    row.style.opacity = doc.defaultView?.getComputedStyle(row)?.opacity ?? "1";
  }
  void rows[0].offsetHeight;
  for (const row of rows) {
    row.style.height = "0px";
    row.style.paddingTop = "0px";
    row.style.paddingBottom = "0px";
    row.style.opacity = "0";
  }

  let finished = false;
  const finish = (): void => {
    if (finished) return;
    finished = true;
    onComplete();
  };
  const win = doc.defaultView;
  if (win) {
    win.setTimeout(finish, TAB_EXIT_ANIMATION_MS);
  } else {
    finish();
  }
}
