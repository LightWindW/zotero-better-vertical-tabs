/**
 * Shared open/close animation for VT popup menus (context menus).
 *
 * Uses the same keyframes as the "more" menu (`vt-more-menu-appear` /
 * `vt-more-menu-leave`: scale 0.95↔1 + opacity, 0.15s) so every VT popup
 * feels identical. The transform origin is pinned per menu — top-right for
 * anchor-below popups, top-left for cursor-positioned context menus.
 *
 * Open plays automatically once the class is added. Close swaps in the
 * leaving class and removes the element on `animationend` (a fallback timer
 * covers lost animation events). Close is idempotent: multiple triggers
 * (item click, outside mousedown, programmatic) collapse into one removal.
 */

const CLOSING_FLAG = "vtPopupClosing";
const CLOSE_FALLBACK_MS = 300;

/** Play the appear animation on a freshly appended popup element. */
export function animatePopupOpen(el: HTMLElement, origin: string): void {
  el.style.transformOrigin = origin;
  el.classList.add("vt-popup-appear");
}

/**
 * Clamp a fixed-position popup so it stays fully inside the window. Context
 * menus are positioned at the cursor, so rows near the window's right/bottom
 * edge would otherwise push the menu off-screen and make items unclickable.
 * Call AFTER the element is appended (its size must be measurable) and
 * BEFORE animatePopupOpen; returns the transform-origin to use ("bottom
 * left" when the menu had to flip above the cursor).
 */
export function placePopupWithinWindow(
  el: HTMLElement,
  x: number,
  y: number,
): string {
  const win = el.ownerDocument?.defaultView;
  if (!win) return "top left";
  const rect = el.getBoundingClientRect();
  let left = x;
  let top = y;
  if (left + rect.width > win.innerWidth - 4) {
    left = Math.max(4, win.innerWidth - rect.width - 4);
  }
  if (top + rect.height > win.innerHeight - 4) {
    top = Math.max(4, win.innerHeight - rect.height - 4);
  }
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
  return top < y ? "bottom left" : "top left";
}

/**
 * Play the leave animation, then remove the element and invoke `onDone`
 * (exactly once, even if the animation event is lost). Calling this on an
 * element already closing is a no-op.
 */
export function animatePopupClose(el: HTMLElement, onDone?: () => void): void {
  if (el.dataset[CLOSING_FLAG]) return;
  el.dataset[CLOSING_FLAG] = "1";
  let finished = false;
  const finish = (): void => {
    if (finished) return;
    finished = true;
    el.removeEventListener("animationend", onAnimationEnd);
    if (el.isConnected) el.remove();
    onDone?.();
  };
  const onAnimationEnd = (): void => finish();
  el.addEventListener("animationend", onAnimationEnd);
  el.classList.remove("vt-popup-appear");
  el.classList.add("vt-popup-leaving");
  el.ownerDocument?.defaultView?.setTimeout(finish, CLOSE_FALLBACK_MS);
}
