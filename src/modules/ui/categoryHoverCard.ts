/**
 * Category header hover card.
 *
 * Shown ONLY in the collapsed floating strip when auto-expand is disabled
 * (`verticalTabs.autoExpand` off): hovering a category header shows the
 * shared hover card (hoverCardShell) with the category name and its tab
 * count. Because it is the same card element the item hover card uses,
 * moving between a tab row and a category header morphs one card
 * (position/size transitions) instead of two cards blinking in and out.
 * With auto-expand on the strip expands within 300ms and reveals the names
 * itself, so no card is needed there; pinned mode always shows full rows,
 * so no card either.
 *
 * The card hides on hover-end, on header click (collapse toggle), on
 * right-click (context menu opens), and on drag start. A re-render that
 * removes the hovered header hides it immediately (dead-row protection,
 * same rationale as hoverCard).
 */

import { getString } from "../../utils/locale";
import { isAutoExpandEnabled, SIDEBAR_ID } from "../sidebar/sidebar";
import {
  getCardOwner,
  getCardTarget,
  hideCard,
  hideCardNow,
  isCardShown,
  showCard,
} from "./hoverCardShell";

const SHOW_DELAY_MS = 150;
const HIDE_DELAY_MS = 150;
/** Auto-sized content, capped (long category names ellipsize). */
const CARD_MAX_WIDTH = 280;

let _showTimeout: ReturnType<typeof setTimeout> | null = null;
let _categorySuppressed = false;

function createEl(doc: Document, tag: string): HTMLElement {
  return doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    tag,
  ) as HTMLElement;
}

function clearShowTimeout(): void {
  if (_showTimeout) {
    clearTimeout(_showTimeout);
    _showTimeout = null;
  }
}

function renderCard(
  doc: Document,
  card: HTMLElement,
  name: string,
  count: number,
): void {
  card.innerHTML = "";

  const title = createEl(doc, "div");
  title.style.cssText =
    "font-weight: 600; line-height: 1.4; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;";
  title.textContent = name;
  card.appendChild(title);

  const countLine = createEl(doc, "div");
  countLine.style.cssText = "font-size: 12px; opacity: 0.75; margin-top: 2px;";
  countLine.textContent = getString("vertical-tabs-category-tabs-count", {
    args: { count },
  });
  card.appendChild(countLine);
}

function showCategoryCard(
  doc: Document,
  target: HTMLElement,
  name: string,
  count: number,
): void {
  const doShow = () => {
    void showCard(
      doc,
      "category",
      target,
      { width: "auto", maxWidth: CARD_MAX_WIDTH },
      (card) => renderCard(doc, card, name, count),
    );
  };

  // Already visible (item card showing): switch with no delay.
  if (isCardShown(doc)) {
    clearShowTimeout();
    doShow();
    return;
  }
  clearShowTimeout();
  _showTimeout = setTimeout(() => {
    _showTimeout = null;
    doShow();
  }, SHOW_DELAY_MS);
}

/** The card only makes sense in the collapsed strip with auto-expand off. */
function shouldShow(doc: Document): boolean {
  const sidebar = doc.getElementById(SIDEBAR_ID);
  if (!sidebar?.classList.contains("vertical-tabs-sidebar-floating")) {
    return false;
  }
  if (sidebar.classList.contains("vertical-tabs-sidebar-expanded")) {
    return false;
  }
  return !isAutoExpandEnabled();
}

function handleCategoryHover(event: Event): void {
  const { name, count } = (event as CustomEvent).detail as {
    categoryId: string;
    name: string;
    count: number;
  };
  const target = event.target as HTMLElement;
  const doc = target.ownerDocument;
  if (!doc) return;
  if (!shouldShow(doc)) return;
  if (_categorySuppressed) {
    _categorySuppressed = false;
    return;
  }
  showCategoryCard(doc, target, name, count);
}

function handleCategoryHoverEnd(event: Event): void {
  const target = event.target as HTMLElement;
  const doc = target.ownerDocument;
  if (!doc) return;
  _categorySuppressed = false;
  clearShowTimeout();
  hideCard(doc, "category", HIDE_DELAY_MS);
}

/** Click / right-click / drag on a header dismisses the card immediately
 * (forced — even if the item card is the one currently visible). */
function handleDismiss(event: Event): void {
  const node = event.target as Node | null;
  const doc = node?.ownerDocument ?? (event.target as Document | null);
  if (!doc || typeof doc.getElementById !== "function") return;
  clearShowTimeout();
  _categorySuppressed = true;
  hideCard(doc, "category", 0);
}

/**
 * Re-render rebuilds the headers: if the hovered header is gone, hide the
 * card — nothing remains to hover-leave and it would stick open otherwise.
 * Only acts when this module owns the shared card.
 */
function handleRendered(event: Event): void {
  const doc =
    (event.target as Node).ownerDocument ?? (event.target as Document);
  if (!doc) return;
  if (getCardOwner() !== "category") return;
  const currentTarget = getCardTarget();
  if (!currentTarget || currentTarget.isConnected) return;
  hideCardNow(doc, "category");
}

export function initCategoryHoverCard(doc: Document): void {
  doc.addEventListener("vertical-tabs:category-hover", handleCategoryHover);
  doc.addEventListener(
    "vertical-tabs:category-hover-end",
    handleCategoryHoverEnd,
  );
  doc.addEventListener("vertical-tabs:category-context", handleDismiss);
  doc.addEventListener(
    "vertical-tabs:category-toggle-collapsed",
    handleDismiss,
  );
  doc.addEventListener("dragstart", handleDismiss, true);
  doc.addEventListener("vertical-tabs:rendered", handleRendered);
}

export function destroyCategoryHoverCard(doc: Document): void {
  doc.removeEventListener("vertical-tabs:category-hover", handleCategoryHover);
  doc.removeEventListener(
    "vertical-tabs:category-hover-end",
    handleCategoryHoverEnd,
  );
  doc.removeEventListener("vertical-tabs:category-context", handleDismiss);
  doc.removeEventListener(
    "vertical-tabs:category-toggle-collapsed",
    handleDismiss,
  );
  doc.removeEventListener("dragstart", handleDismiss, true);
  doc.removeEventListener("vertical-tabs:rendered", handleRendered);

  clearShowTimeout();
  _categorySuppressed = false;
  // Element teardown happens in hoverCard's destroyCardEl (shared element);
  // here we only release ownership if we hold it.
  hideCardNow(doc, "category");
}
