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
