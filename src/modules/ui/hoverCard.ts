import { config } from "../../../package.json";
import { getString } from "../../utils/locale";
import { getItemInfo } from "../render/uiRenderer";
import { isDarkMode, watchDarkMode } from "../render/colorUtils";
import { isExpandAnimating, SIDEBAR_ID } from "../sidebar/sidebar";

const CARD_ID = "vertical-tabs-hover-card";
const SHOW_DELAY_MS = 150;
const HIDE_DELAY_MS = 150;

function createEl(doc: Document, tag: string): HTMLElement {
  return doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    tag,
  ) as HTMLElement;
}

function createCard(doc: Document): HTMLElement {
  const existing = doc.getElementById(CARD_ID) as HTMLElement | null;
  if (existing) return existing;

  const card = createEl(doc, "div");
  card.id = CARD_ID;

  const dark = isDarkMode(doc);
  card.style.cssText = `
    position: fixed;
    display: none;
    opacity: 0;
    width: 320px;
    background: ${dark ? "rgba(42, 42, 42, 0.5)" : "rgba(242, 242, 242, 0.5)"};
    border: 1px solid ${dark ? "rgba(85, 85, 85, 0.5)" : "rgba(182, 182, 182, 0.5)"};
    border-radius: 6px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.18);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    z-index: 100001;
    padding: 12px;
    font-size: 13px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: ${dark ? "#eee" : "var(--material-text, #222)"};
    pointer-events: none;
    transition: opacity 0.15s ease-out, left 0.1s ease-out, top 0.1s ease-out, width 0.25s ease-out, height 0.25s ease-out;
  `;
  doc.documentElement?.appendChild(card);
  return card;
}

/**
 * Explicitly override hover card colors for dark/light mode switch.
 * CSS variables from Zotero theme may not update reactively in reader sandbox.
 */
function applyCardDarkMode(card: HTMLElement, isDark: boolean): void {
  card.style.background = isDark
    ? "rgba(42, 42, 42, 0.5)"
    : "rgba(242, 242, 242, 0.5)";
  card.style.color = isDark ? "#eee" : "var(--material-text, #222)";
  card.style.borderColor = isDark
    ? "rgba(85, 85, 85, 0.5)"
    : "rgba(182, 182, 182, 0.5)";

  // Update label colors inside the card
  const labels = card.querySelectorAll<HTMLElement>(
    '[style*="font-weight: 600"]',
  );
  labels.forEach((label: HTMLElement) => {
    label.style.color = isDark ? "#aaa" : "var(--material-text-muted, #666)";
  });
}

function fadeIn(
  card: HTMLElement,
  target: HTMLElement,
  mouseX?: number,
  mouseY?: number,
): void {
  // Position the card at the target location before making it visible,
  // so the left/top transition does not animate from the previous location.
  const originalTransition = card.style.transition;
  card.style.transition = "none";
  card.style.display = "block";
  card.style.opacity = "0";
  positionCard(
    card,
    target,
    mouseX ?? rectCenterX(target),
    mouseY ?? rectCenterY(target),
  );
  void card.offsetWidth;
  card.style.transition = originalTransition;
  card.style.opacity = "1";
}

function fadeOut(card: HTMLElement): void {
  card.style.opacity = "0";
}

function createField(doc: Document, label: string, value: string): HTMLElement {
  const row = createEl(doc, "div");
  row.style.cssText =
    "margin-top: 6px; display: flex; gap: 6px; align-items: baseline;";

  const labelEl = createEl(doc, "span");
  labelEl.style.cssText =
    "font-weight: 600; color: var(--material-text-muted, #666); flex-shrink: 0;";
  labelEl.textContent = `${label}:`;
  row.appendChild(labelEl);

  const valueEl = createEl(doc, "span");
  valueEl.style.cssText =
    "overflow: hidden; text-overflow: ellipsis; white-space: nowrap;";
  valueEl.textContent = value;
  row.appendChild(valueEl);

  return row;
}

async function renderCard(doc: Document, itemId: number): Promise<void> {
  const card = createCard(doc);
  card.innerHTML = "";

  const item = Zotero.Items.get(itemId) as Zotero.Item | false;
  const parentId = item ? item.parentItemID : undefined;
  const itemType = item ? item.itemType : "";
  const isNote = itemType === "note";
  const metaItem = parentId ? Zotero.Items.get(parentId as number) : item;
  const info = metaItem
    ? getItemInfo(metaItem as Zotero.Item)
    : {
        title: `Item ${itemId}`,
        authors: "",
        year: "",
        journal: "",
        university: "",
        extra: "",
        tags: [],
      };

  // Title (no label, bold)
  const title = createEl(doc, "div");
  title.style.cssText = "font-weight: 600; margin-top: 8px; line-height: 1.4;";
  title.textContent = info.title;
  card.appendChild(title);

  // 父条目 (for notes)
  if (isNote && parentId) {
    const parentItem = Zotero.Items.get(parentId as number) as
      | Zotero.Item
      | false;
    if (parentItem) {
      const parentTitle = (parentItem.getField("title") as string) || "";
      if (parentTitle) {
        card.appendChild(createField(doc, "父条目", parentTitle));
      }
    }
  }

  // Authors
  if (info.authors) {
    card.appendChild(
      createField(doc, getString("vertical-tabs-authors"), info.authors),
    );
  }

  // Date
  if (info.year) {
    card.appendChild(
      createField(doc, getString("vertical-tabs-year"), info.year),
    );
  }

  // Publication / Conference / School (skip for notes)
  if (!isNote) {
    const pubLabel = info.journal
      ? getString("vertical-tabs-journal")
      : info.university
        ? getString("vertical-tabs-university")
        : "";
    const pubValue = info.journal || info.university || "";
    if (pubValue) {
      card.appendChild(createField(doc, pubLabel, pubValue));
    }
  }

  // Extra (备注) — only when preference enabled
  const showExtra = Zotero.Prefs.get(
    `${config.prefsPrefix}.verticalTabs.showExtra`,
    false,
  ) as boolean;
  if (showExtra) {
    const extraClean = info.extra.replace(/<\/?[^>]+(>|$)/g, "").trim();
    if (extraClean) {
      card.appendChild(
        createField(doc, getString("vertical-tabs-extra"), extraClean),
      );
    }
  }
}

function positionCard(
  card: HTMLElement,
  target: HTMLElement,
  mouseX: number,
  mouseY: number,
): void {
  const rect = target.getBoundingClientRect();
  const cardWidth = card.offsetWidth || 320;
  const cardHeight = card.offsetHeight || 240;
  const win = target.ownerDocument?.defaultView;
  const winWidth = win?.innerWidth ?? 800;
  const winHeight = win?.innerHeight ?? 600;

  let left = rect.right + 8;
  if (left + cardWidth > winWidth) {
    left = Math.max(8, rect.left - cardWidth - 8);
  }

  let top = mouseY - cardHeight / 2;
  top = Math.max(8, Math.min(top, winHeight - cardHeight - 8));

  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
}

let _showTimeout: ReturnType<typeof setTimeout> | null = null;
let _hideTimeout: ReturnType<typeof setTimeout> | null = null;
let _currentTarget: HTMLElement | null = null;
let _currentItemId: number | null = null;
let _pendingItemId: number | null = null;
let _pendingTabId: string | null = null;

function showHoverCard(
  doc: Document,
  target: HTMLElement,
  itemId: number,
  tabId: string,
  mouseX?: number,
  mouseY?: number,
): void {
  _currentTarget = target;

  if (_hideTimeout) {
    clearTimeout(_hideTimeout);
    _hideTimeout = null;
  }

  const card = createCard(doc);
  const isSwitch = card.style.display === "block";

  const doShow = async () => {
    if (_currentTarget !== target) return;

    if (isSwitch && _currentItemId !== itemId) {
      // Switching items: update immediately, transitions handle the animation
      await renderCard(doc, itemId);
      _currentItemId = itemId;
      positionCard(
        card,
        target,
        mouseX ?? rectCenterX(target),
        mouseY ?? rectCenterY(target),
      );
    } else if (!isSwitch) {
      // Card was fully hidden: fade in at the target location without
      // animating left/top from the previous location.
      fadeIn(card, target, mouseX, mouseY);
      _currentItemId = itemId;
      await renderCard(doc, itemId);
    }
  };

  if (isSwitch) {
    // Already visible: no delay
    void doShow();
  } else {
    _showTimeout = setTimeout(() => void doShow(), SHOW_DELAY_MS);
  }
}

function handleItemHover(event: Event): void {
  const customEvent = event as CustomEvent;
  const { itemId, tabId } = customEvent.detail as {
    itemId: number;
    tabId: string;
  };
  const target = event.target as HTMLElement;
  const doc = target.ownerDocument;
  if (!doc) return;

  const sidebar = doc.getElementById(SIDEBAR_ID);
  if (!sidebar?.classList.contains("vertical-tabs-sidebar-expanded")) {
    // VT not expanded yet: remember this item and show card once expansion completes.
    _pendingItemId = itemId;
    _pendingTabId = tabId;
    return;
  }
  // Wait for the VT expand width animation to finish before showing hover card.
  if (isExpandAnimating(doc)) {
    _pendingItemId = itemId;
    _pendingTabId = tabId;
    return;
  }

  _pendingItemId = null;
  _pendingTabId = null;

  const mouseEvent = customEvent as unknown as MouseEvent;
  showHoverCard(
    doc,
    target,
    itemId,
    tabId,
    mouseEvent.clientX,
    mouseEvent.clientY,
  );
}

function rectCenterX(element: HTMLElement): number {
  const rect = element.getBoundingClientRect();
  return rect.left + rect.width / 2;
}

function rectCenterY(element: HTMLElement): number {
  const rect = element.getBoundingClientRect();
  return rect.top + rect.height / 2;
}

function handleItemHoverEnd(event: Event): void {
  const target = event.target as HTMLElement;
  const doc = target.ownerDocument;
  if (!doc) return;

  if (_showTimeout) {
    clearTimeout(_showTimeout);
    _showTimeout = null;
  }

  _pendingItemId = null;
  _pendingTabId = null;

  _hideTimeout = setTimeout(() => {
    const card = doc.getElementById(CARD_ID) as HTMLElement | null;
    if (card) {
      fadeOut(card);
      // Hide after transition completes
      setTimeout(() => {
        if (card.style.opacity === "0") card.style.display = "none";
      }, 200);
    }
    _currentTarget = null;
    _currentItemId = null;
  }, HIDE_DELAY_MS);
}

function handleExpandAnimationComplete(event: Event): void {
  const doc =
    (event.target as Node).ownerDocument ?? (event.target as Document);
  if (!doc) return;

  const pendingItemId = _pendingItemId;
  const pendingTabId = _pendingTabId;
  _pendingItemId = null;
  _pendingTabId = null;

  if (!pendingItemId) return;

  // Find the current DOM element for the pending item.
  const item = doc.querySelector(
    `.vertical-tabs-item[data-item-id="${pendingItemId}"]`,
  ) as HTMLElement | null;
  if (!item) return;

  showHoverCard(doc, item, pendingItemId, pendingTabId || "");
}

export function initHoverCard(doc: Document): void {
  doc.addEventListener("vertical-tabs:item-hover", handleItemHover);
  doc.addEventListener("vertical-tabs:item-hover-end", handleItemHoverEnd);
  doc.addEventListener(
    "vertical-tabs:expand-animation-complete",
    handleExpandAnimationComplete,
  );

  // Watch dark mode switch to update card colors in real time
  const existing = (doc as any).__vtHoverDarkCleanup as
    | (() => void)
    | undefined;
  if (existing) existing();

  const cleanup = watchDarkMode(doc, (isDark) => {
    const card = doc.getElementById(CARD_ID) as HTMLElement | null;
    if (card) applyCardDarkMode(card, isDark);
  });
  (doc as any).__vtHoverDarkCleanup = cleanup;
}

export function destroyHoverCard(doc: Document): void {
  doc.removeEventListener("vertical-tabs:item-hover", handleItemHover);
  doc.removeEventListener("vertical-tabs:item-hover-end", handleItemHoverEnd);
  doc.removeEventListener(
    "vertical-tabs:expand-animation-complete",
    handleExpandAnimationComplete,
  );

  const cleanup = (doc as any).__vtHoverDarkCleanup as (() => void) | undefined;
  if (cleanup) {
    cleanup();
    delete (doc as any).__vtHoverDarkCleanup;
  }

  const card = doc.getElementById(CARD_ID);
  card?.remove();
  if (_showTimeout) clearTimeout(_showTimeout);
  if (_hideTimeout) clearTimeout(_hideTimeout);
  _showTimeout = null;
  _hideTimeout = null;
  _currentTarget = null;
  _currentItemId = null;
  _pendingItemId = null;
  _pendingTabId = null;
}
