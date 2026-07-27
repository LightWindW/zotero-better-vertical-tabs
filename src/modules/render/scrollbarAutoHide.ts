/**
 * Auto-hiding vertical scrollbar for the VT categories list.
 *
 * The thin scrollbar is always reserved (`scrollbar-width: thin`) so the
 * rows never reflow, but its color is fully transparent while idle. Because
 * `scrollbar-color` cannot be CSS-transitioned, the thumb alpha is
 * interpolated per frame via rAF: it fades IN over 200ms when scrolling
 * starts and fades OUT over 250ms once scrolling stops (250ms debounce
 * after the last scroll event). Scrolling again mid-fade reverses from the
 * current alpha.
 *
 * Attached per categories-container element (the container persists across
 * re-renders; only its children are rebuilt). The listener dies with the
 * element when the sidebar is destroyed, so no explicit teardown is needed.
 */

import { isDarkMode } from "./colorUtils";
import { SIDEBAR_ID } from "./styles";

const FADE_IN_MS = 200;
const FADE_OUT_MS = 250;
const HIDE_DELAY_MS = 250;
const MAX_ALPHA = 0.3;

export function attachScrollbarAutoHide(doc: Document): void {
  const container = doc.querySelector(
    `#${SIDEBAR_ID} .vertical-tabs-categories`,
  ) as HTMLElement | null;
  if (!container) return;
  if ((container as any).__vtScrollbarAutoHide) return;
  (container as any).__vtScrollbarAutoHide = true;

  const win = doc.defaultView;
  let alpha = 0;
  let rafId: number | null = null;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;

  const writeColor = () => {
    const rgb = isDarkMode(doc) ? "255, 255, 255" : "0, 0, 0";
    container.style.setProperty(
      "scrollbar-color",
      `rgba(${rgb}, ${alpha.toFixed(3)}) transparent`,
    );
  };

  const fadeTo = (target: number, duration: number) => {
    if (rafId !== null && win) {
      win.cancelAnimationFrame(rafId);
      rafId = null;
    }
    const startAlpha = alpha;
    if (startAlpha === target || !win) {
      alpha = target;
      writeColor();
      return;
    }
    const startTime = Date.now();
    const step = () => {
      const t = Math.min(1, (Date.now() - startTime) / duration);
      alpha = startAlpha + (target - startAlpha) * t;
      writeColor();
      if (t < 1) {
        rafId = win.requestAnimationFrame(step);
      } else {
        rafId = null;
      }
    };
    rafId = win.requestAnimationFrame(step);
  };

  container.addEventListener(
    "scroll",
    () => {
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
      fadeTo(MAX_ALPHA, FADE_IN_MS);
      hideTimer = setTimeout(() => {
        hideTimer = null;
        fadeTo(0, FADE_OUT_MS);
      }, HIDE_DELAY_MS);
    },
    { passive: true },
  );
}
