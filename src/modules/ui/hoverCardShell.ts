/**
 * Shared hover card shell.
 *
 * ONE card element (#vertical-tabs-hover-card) is driven by both the item
 * hover card (hoverCard.ts) and the category hover card
 * (categoryHoverCard.ts). Because both render into the same element,
 * switching hover between a tab row and a category header MORPHS the card —
 * left/top/width/height transitions animate it to the new target while the
 * content is swapped in place — instead of two separate cards fading out
 * and in at unrelated spots.
 *
 * Morph discipline (the "no re-wrap jump" rule): the content lives in an
 * inner wrapper whose width is pinned to the FINAL content width BEFORE the
 * card's width transition starts, and the card's target height is measured
 * at that final width. The text is therefore laid out exactly as it will
 * finally appear from the very first frame — the card merely clips it via
 * overflow:hidden while its size glides over. Rendering at the OLD width
 * (e.g. category-narrow) would wrap the title into many lines, measure a
 * bogus tall height, then visibly unwrap — and the pinned height would
 * never shrink back (the "blank row" bug).
 *
 * Owner tracking ("item" | "category") lets each module act only when it
 * owns the card: render-invalidation retargets/hides only its own card, and
 * one module's hover-end never hides the other's card.
 *
 * The card is box-sizing: border-box — offset sizes include padding+border,
 * so pinning them back as style sizes is exact (with content-box the card
 * would grow by padding+border on every pin).
 */

import { getPopupColors, getPopupStyleSheet } from "../render/popupStyleUtils";
import { isDarkMode } from "../render/colorUtils";

export const HOVER_CARD_ID = "vertical-tabs-hover-card";
export type HoverCardOwner = "item" | "category";

/** Card horizontal padding (12px × 2) — inner width = clientWidth minus it. */
const CARD_PADDING_X = 24;

let _owner: HoverCardOwner | null = null;
let _currentTarget: HTMLElement | null = null;
let _hideTimer: ReturnType<typeof setTimeout> | null = null;
let _displayNoneTimer: ReturnType<typeof setTimeout> | null = null;

/** Grace period between opacity 0 and display:none so the fade-out plays. */
const FADE_OUT_SETTLE_MS = 160;

function createEl(doc: Document, tag: string): HTMLElement {
  return doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    tag,
  ) as HTMLElement;
}

export function getCardOwner(): HoverCardOwner | null {
  return _owner;
}

export function getCardTarget(): HTMLElement | null {
  return _currentTarget;
}

/** Retarget without re-rendering (row was rebuilt for the same content). */
export function setCardTarget(target: HTMLElement | null): void {
  _currentTarget = target;
}

function getCardInner(card: HTMLElement): HTMLElement {
  return card.firstElementChild as HTMLElement;
}

export function getCardEl(doc: Document): HTMLElement {
  const existing = doc.getElementById(HOVER_CARD_ID) as HTMLElement | null;
  if (existing) return existing;

  const card = createEl(doc, "div");
  card.id = HOVER_CARD_ID;
  card.style.cssText = `
    position: fixed;
    display: none;
    opacity: 0;
    z-index: 100001;
    box-sizing: border-box;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    ${getPopupStyleSheet(doc, {
      kind: "hover",
      extra:
        "padding: 12px; max-width: 340px; pointer-events: none; overflow: hidden; transition: opacity 0.12s ease-out, left 0.15s ease-out, top 0.15s ease-out, width 0.2s ease-out, height 0.2s ease-out;",
    })}
  `;
  const inner = createEl(doc, "div");
  card.appendChild(inner);
  doc.documentElement?.appendChild(card);
  return card;
}

/**
 * Re-apply popup colors (background/border/shadow/blur + muted labels) —
 * called by the dark-mode and blur-pref watchers and on every show.
 */
export function applyCardTheme(doc: Document): void {
  const card = doc.getElementById(HOVER_CARD_ID) as HTMLElement | null;
  if (!card) return;
  const colors = getPopupColors(doc, "hover");
  card.style.background = colors.background;
  card.style.color = colors.text;
  card.style.border = colors.border;
  card.style.boxShadow = colors.shadow;
  card.style.backdropFilter =
    colors.backdropFilter === "none" ? "" : colors.backdropFilter;

  const dark = isDarkMode(doc);
  const labels = card.querySelectorAll<HTMLElement>(
    '[style*="font-weight: 600"]',
  );
  labels.forEach((label: HTMLElement) => {
    label.style.color = dark ? "#aaa" : "var(--material-text-muted, #666)";
  });
}

export function isCardShown(doc: Document): boolean {
  const card = doc.getElementById(HOVER_CARD_ID) as HTMLElement | null;
  return card?.style.display === "block";
}

export interface CardShowOptions {
  /** Fixed content width (item card: 320) or "auto" (category: measured). */
  width: number | "auto";
  /** Cap for auto width (px). */
  maxWidth?: number;
  /** Cursor Y — used for the first show; switches center on the row rect. */
  mouseY?: number;
}

function cancelHide(): void {
  if (_hideTimer) {
    clearTimeout(_hideTimer);
    _hideTimer = null;
  }
  if (_displayNoneTimer) {
    clearTimeout(_displayNoneTimer);
    _displayNoneTimer = null;
  }
}

interface CardTargetSize {
  width: number;
  height: number;
}

/**
 * Measure the card's FINAL size for the new content, with transitions off.
 * Pins the inner wrapper to the final content width (text laid out as it
 * will finally appear) and reads the natural card height at that width.
 * Leaves the card AT the target width with height unpinned — callers either
 * keep it (first show, card invisible) or restore the from-size before
 * starting the transition (switch).
 */
function measureTargetSize(
  card: HTMLElement,
  opts: CardShowOptions,
): CardTargetSize {
  const inner = getCardInner(card);
  card.style.maxWidth = opts.maxWidth ? `${opts.maxWidth}px` : "";
  // Unfix the previous inner width so an auto measurement reflects the NEW
  // content, not the previous card's content width.
  if (inner) inner.style.width = "";
  let targetWidth: number;
  if (opts.width === "auto") {
    card.style.width = "";
    targetWidth = card.offsetWidth;
  } else {
    targetWidth = opts.width;
  }
  card.style.width = `${targetWidth}px`;
  if (inner) inner.style.width = `${card.clientWidth - CARD_PADDING_X}px`;
  card.style.height = "";
  const targetHeight = card.offsetHeight;
  return { width: targetWidth, height: targetHeight };
}

function positionCard(
  card: HTMLElement,
  target: HTMLElement,
  size: CardTargetSize,
  opts: CardShowOptions,
  useMouseY: boolean,
): void {
  const rect = target.getBoundingClientRect();
  const win = target.ownerDocument?.defaultView;
  const winWidth = win?.innerWidth ?? 800;
  const winHeight = win?.innerHeight ?? 600;

  let left = rect.right + 8;
  if (left + size.width > winWidth) {
    left = Math.max(8, rect.left - size.width - 8);
  }
  let top: number;
  if (useMouseY && opts.mouseY != null) {
    top = opts.mouseY - size.height / 2;
  } else {
    top = rect.top;
  }
  top = Math.max(8, Math.min(top, winHeight - size.height - 8));

  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
}

/**
 * Show the shared card for `owner`, rendering content into its inner
 * wrapper. First show: sized/positioned invisibly (transitions disabled)
 * then faded in. Switch while visible: content is laid out at the FINAL
 * width immediately, and the card's size/position transitions glide from
 * the current rendered geometry to the target.
 */
export async function showCard(
  doc: Document,
  owner: HoverCardOwner,
  target: HTMLElement,
  opts: CardShowOptions,
  render: (cardContent: HTMLElement) => void,
): Promise<void> {
  const card = getCardEl(doc);
  // Cancel any pending fade-out/display-none — a show during the fade-out
  // window must win, otherwise the card stays invisible at opacity 0.
  cancelHide();
  const isSwitch = card.style.display === "block";
  _owner = owner;
  _currentTarget = target;
  applyCardTheme(doc);

  const originalTransition = card.style.transition;
  card.style.transition = "none";

  if (isSwitch) {
    // Current rendered size = transition start (may be mid-animation).
    const fromWidth = card.offsetWidth;
    const fromHeight = card.offsetHeight;
    render(getCardInner(card));
    const size = measureTargetSize(card, opts);
    // Restore the from-size, commit it, then transition to the targets.
    card.style.width = `${fromWidth}px`;
    card.style.height = `${fromHeight}px`;
    void card.offsetWidth;
    card.style.transition = originalTransition;
    card.style.width = `${size.width}px`;
    card.style.height = `${size.height}px`;
    positionCard(card, target, size, opts, false);
    // Restore opacity in case the card was mid fade-out.
    card.style.opacity = "1";
    return;
  }

  card.style.display = "block";
  card.style.opacity = "0";
  render(getCardInner(card));
  const size = measureTargetSize(card, opts);
  card.style.height = `${size.height}px`;
  positionCard(card, target, size, opts, true);
  void card.offsetWidth;
  card.style.transition = originalTransition;
  card.style.opacity = "1";
}

/** Delayed fade-out. `owner` guards: a module can only hide its own card. */
export function hideCard(
  doc: Document,
  owner: HoverCardOwner,
  delayMs: number,
): void {
  if (_owner && _owner !== owner) return;
  cancelHide();
  _hideTimer = setTimeout(() => {
    _hideTimer = null;
    const card = doc.getElementById(HOVER_CARD_ID) as HTMLElement | null;
    if (!card) {
      _owner = null;
      _currentTarget = null;
      return;
    }
    card.style.opacity = "0";
    // Let the opacity transition actually play before removing the card
    // from layout — setting display:none in the same frame kills the fade.
    _displayNoneTimer = setTimeout(() => {
      _displayNoneTimer = null;
      if (card.style.opacity === "0") card.style.display = "none";
      _owner = null;
      _currentTarget = null;
    }, FADE_OUT_SETTLE_MS);
  }, delayMs);
}

/** Immediate hide (dismiss on click/right-click/drag, dead target, destroy). */
export function hideCardNow(
  doc: Document,
  owner: HoverCardOwner | null,
): void {
  if (owner && _owner && _owner !== owner) return;
  cancelHide();
  const card = doc.getElementById(HOVER_CARD_ID) as HTMLElement | null;
  if (card) {
    card.style.opacity = "0";
    card.style.display = "none";
  }
  _owner = null;
  _currentTarget = null;
}

/** Remove the element and clear all state (full teardown). */
export function destroyCardEl(doc: Document): void {
  cancelHide();
  _owner = null;
  _currentTarget = null;
  doc.getElementById(HOVER_CARD_ID)?.remove();
}
