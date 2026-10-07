import { config } from "../../../package.json";
import { getString } from "../../utils/locale";
import { getItemInfo } from "../render/uiRenderer";
import { watchDarkMode } from "../render/colorUtils";
import { getCardFigureDataUrl, getCardFigureItemId } from "./cardFigure";
import {
  isAutoExpandEnabled,
  isExpandAnimating,
  SIDEBAR_ID,
} from "../sidebar/sidebar";
import {
  applyCardTheme,
  CARD_PADDING_X,
  destroyCardEl,
  getCardOwner,
  getCardTarget,
  hideCard,
  hideCardNow,
  isCardShown,
  setCardTarget,
  showCard,
} from "./hoverCardShell";

const SHOW_DELAY_MS = 150;
const HIDE_DELAY_MS = 150;
/** Item card content width (fixed so width transitions morph it to the
 * auto-sized category card and back). */
const ITEM_CARD_WIDTH = 320;
const CARD_FIGURE_MAX_HEIGHT = 220;
const PREF_ENABLE_BLUR = `${config.prefsPrefix}.verticalTabs.enableBlur`;

function createEl(doc: Document, tag: string): HTMLElement {
  return doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    tag,
  ) as HTMLElement;
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

async function renderCard(
  doc: Document,
  card: HTMLElement,
  itemId: number,
): Promise<void> {
  card.innerHTML = "";
  const renderKey = {};
  (card as any).__vtCardRenderKey = renderKey;

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

  // Keep the original card content available immediately.  Image loading is
  // optional and must never leave the hover card empty when a render is
  // cancelled or the data URL cannot be decoded by Gecko.
  const title = createEl(doc, "div");
  title.style.cssText = "font-weight: 600; line-height: 1.4;";
  title.textContent = info.title;
  card.appendChild(title);

  let figureUrl: string | null = null;
  try {
    figureUrl = await getCardFigureDataUrl(itemId);
  } catch (error) {
    ztoolkit.log("Failed to load card figure:", error);
  }
  if ((card as any).__vtCardRenderKey !== renderKey) return;

  if (figureUrl) {
    const shell = card.parentElement as HTMLElement | null;
    const cardBackground =
      shell?.style.background ||
      shell?.ownerDocument?.defaultView?.getComputedStyle(shell)
        ?.backgroundColor ||
      "#f2f2f2";
    const figure = createEl(doc, "div");
    const bleed = CARD_PADDING_X / 2;
    figure.style.cssText = `position:relative;display:block;box-sizing:border-box;width:calc(100% + ${CARD_PADDING_X}px);height:auto;max-height:${CARD_FIGURE_MAX_HEIGHT}px;margin:${-bleed}px ${-bleed}px 0;overflow:hidden;background:${cardBackground};`;
    const image = createEl(doc, "img") as HTMLImageElement;
    image.alt = "";
    image.style.cssText =
      "display:block;width:100%;height:auto;object-fit:cover;";
    figure.appendChild(image);

    const figureTitle = createEl(doc, "div");
    figureTitle.style.cssText = `position:absolute;left:0;right:0;bottom:0;box-sizing:border-box;padding:22px ${bleed}px 10px;font-weight:700;line-height:1.35;color:inherit;background:linear-gradient(to top,${cardBackground} 0%,${cardBackground} 30%,transparent 100%);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;`;
    figureTitle.textContent = info.title;
    figure.appendChild(figureTitle);
    card.insertBefore(figure, card.firstChild);

    await new Promise<void>((resolve) => {
      let settled = false;
      const timerState: { id?: number } = {};
      const settle = () => {
        if (settled) return;
        settled = true;
        if (timerState.id != null) {
          doc.defaultView?.clearTimeout(timerState.id);
        }
        resolve();
      };
      timerState.id = doc.defaultView?.setTimeout(settle, 3000);
      image.addEventListener("load", settle, { once: true });
      image.addEventListener("error", settle, { once: true });
      image.src = figureUrl;
      if (image.complete) {
        if (image.naturalWidth) {
          settle();
        } else if (typeof image.decode === "function") {
          try {
            void image.decode().then(settle, settle);
          } catch {
            settle();
          }
        } else {
          doc.defaultView?.setTimeout(settle, 0);
        }
      }
    });
    if ((card as any).__vtCardRenderKey !== renderKey) return;
    if (!image.naturalWidth || !image.naturalHeight) {
      figure.remove();
    } else {
      const figureWidth = figure.getBoundingClientRect().width;
      const naturalHeight =
        (figureWidth * image.naturalHeight) / image.naturalWidth;
      figure.style.height = `${Math.min(CARD_FIGURE_MAX_HEIGHT, naturalHeight)}px`;
    }
  }

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

let _showTimeout: ReturnType<typeof setTimeout> | null = null;
let _currentItemId: number | null = null;
let _captureItemId: number | null = null;
let _captureRowItemId: number | null = null;
let _renderToken = 0;
let _pendingItemId: number | null = null;
let _pendingTabId: string | null = null;
let _suppressed = false;
let _detached = false;

function showHoverCard(
  doc: Document,
  target: HTMLElement,
  itemId: number,
  mouseY?: number,
): void {
  _currentItemId = itemId;
  const renderToken = ++_renderToken;

  const doShow = async () => {
    if (_currentItemId !== itemId || _renderToken !== renderToken) return;
    try {
      await showCard(
        doc,
        "item",
        target,
        { width: ITEM_CARD_WIDTH, mouseY },
        (card) => renderCard(doc, card, itemId),
      );
      if (_currentItemId !== itemId || _renderToken !== renderToken) {
        hideCardNow(doc, "item");
      }
    } catch (error) {
      ztoolkit.log("Failed to show hover card:", error);
    }
  };

  // Already visible (possibly showing the category card): switch with no
  // delay, the shell morphs it to the new target.
  if (isCardShown(doc)) {
    doShow();
  } else {
    if (_showTimeout) clearTimeout(_showTimeout);
    _showTimeout = setTimeout(() => {
      _showTimeout = null;
      doShow();
    }, SHOW_DELAY_MS);
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

  // Right-click suppression: user must leave and re-enter to show card again.
  if (_suppressed) {
    _suppressed = false;
    return;
  }

  // Tab-close detachment: the card was frozen when its target row was
  // removed.  Ignore the first mouseenter that fires after a DOM rebuild —
  // morphing would produce a visible position glide.  The user must leave
  // and come back for a normal card transition.
  if (_detached) {
    _detached = false;
    return;
  }

  const sidebar = doc.getElementById(SIDEBAR_ID);
  // Pinned mode has no "expanded" class but is always fully expanded —
  // show the card like in expanded floating mode.
  const pinnedMode = !!sidebar?.classList.contains(
    "vertical-tabs-sidebar-pinned",
  );
  if (
    !pinnedMode &&
    !sidebar?.classList.contains("vertical-tabs-sidebar-expanded")
  ) {
    // Collapsed floating strip with auto-expand disabled: no expansion is
    // coming, so show the card right away, positioned just right of the
    // 35px strip (the row's rect).
    if (
      sidebar?.classList.contains("vertical-tabs-sidebar-floating") &&
      !isAutoExpandEnabled()
    ) {
      _pendingItemId = null;
      _pendingTabId = null;
      const me = customEvent as unknown as MouseEvent;
      showHoverCard(doc, target, itemId, me.clientY);
      return;
    }
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
  showHoverCard(doc, target, itemId, mouseEvent.clientY);
}

function handleItemHoverEnd(event: Event): void {
  const target = event.target as HTMLElement;
  const doc = target.ownerDocument;
  if (!doc) return;

  _suppressed = false;
  _detached = false;

  if (_showTimeout) {
    clearTimeout(_showTimeout);
    _showTimeout = null;
  }

  _pendingItemId = null;
  _pendingTabId = null;
  _currentItemId = null;
  _renderToken++;

  hideCard(doc, "item", HIDE_DELAY_MS);
}

function handleExpandAnimationComplete(event: Event): void {
  const doc =
    (event.target as Node).ownerDocument ?? (event.target as Document);
  if (!doc) return;

  const pendingItemId = _pendingItemId;
  _pendingItemId = null;
  _pendingTabId = null;

  if (!pendingItemId) return;

  // Find the current DOM element for the pending item.
  const item = doc.querySelector(
    `.vertical-tabs-item[data-item-id="${pendingItemId}"]`,
  ) as HTMLElement | null;
  if (!item) return;

  showHoverCard(doc, item, pendingItemId);
}

function eventDocument(event: Event): Document | null {
  const target = event.target as Node | null;
  if (!target) return null;
  return target.nodeType === 9
    ? (target as Document)
    : (target.ownerDocument ?? null);
}

async function handleCardFigureUpdated(event: Event): Promise<void> {
  const doc = eventDocument(event);
  const eventItemId = (event as CustomEvent).detail?.itemId as
    | number
    | undefined;
  const itemId = eventItemId || _captureItemId;
  if (!doc || !itemId) return;

  const rows = Array.from(
    doc.querySelectorAll(".vertical-tabs-item[data-item-id]"),
  ) as HTMLElement[];
  const currentTarget = getCardTarget();
  const captureRow = _captureRowItemId
    ? (rows.find((row) => Number(row.dataset.itemId) === _captureRowItemId) ??
      null)
    : null;
  // The row can be rebuilt when the floating sidebar collapses. If the
  // original DOM row is gone, continue with the stable item-ID lookup below.
  const target =
    (currentTarget?.isConnected &&
    currentTarget.ownerDocument === doc &&
    Number(currentTarget.dataset.itemId) > 0 &&
    getCardFigureItemId(Number(currentTarget.dataset.itemId)) === itemId
      ? currentTarget
      : null) ??
    captureRow ??
    (_currentItemId && getCardFigureItemId(_currentItemId) === itemId
      ? (rows.find((row) => Number(row.dataset.itemId) === _currentItemId) ??
        null)
      : null) ??
    rows.find((row) => {
      const rowItemId = Number(row.dataset.itemId);
      return rowItemId > 0 && getCardFigureItemId(rowItemId) === itemId;
    }) ??
    null;
  if (!target) return;

  const currentId = Number(target.dataset.itemId);
  _currentItemId = currentId;
  _renderToken++;
  const renderToken = _renderToken;
  try {
    await showCard(doc, "item", target, { width: ITEM_CARD_WIDTH }, (card) =>
      renderCard(doc, card, currentId),
    );
    if (_renderToken !== renderToken || _currentItemId !== currentId) {
      hideCardNow(doc, "item");
    }
  } catch (error) {
    ztoolkit.log("Failed to refresh card figure:", error);
  }
}

async function handleCardFiguresCleared(event: Event): Promise<void> {
  const doc = eventDocument(event);
  if (!doc || getCardOwner() !== "item" || !_currentItemId) return;

  const currentTarget = getCardTarget();
  if (currentTarget?.ownerDocument && currentTarget.ownerDocument !== doc) {
    return;
  }
  const itemId = _currentItemId;
  const target =
    currentTarget?.isConnected && currentTarget.ownerDocument === doc
      ? currentTarget
      : (doc.querySelector(
          `.vertical-tabs-item[data-item-id="${itemId}"]`,
        ) as HTMLElement | null);
  if (!target) return;

  setCardTarget(target);
  const renderToken = ++_renderToken;
  try {
    await showCard(doc, "item", target, { width: ITEM_CARD_WIDTH }, (card) =>
      renderCard(doc, card, itemId),
    );
    if (_renderToken !== renderToken) hideCardNow(doc, "item");
  } catch (error) {
    ztoolkit.log("Failed to clear card figure from hover card:", error);
  }
}

/**
 * Re-render invalidated the rows: fires AFTER the rebuild (the renderer
 * dispatches "vertical-tabs:rendered" once the fresh DOM is in place).
 * Retarget to the fresh row for the same item, or hide the card when the
 * item is gone (its tab was closed) — a card pointing at a dead row would
 * otherwise get stuck open forever (nothing left to hover-leave). Only acts
 * when this module owns the shared card.
 */
function handleRenderInvalidated(event: Event): void {
  const doc =
    (event.target as Node).ownerDocument ?? (event.target as Document);
  if (!doc) return;
  if (getCardOwner() !== "item") return;
  const currentTarget = getCardTarget();
  if (!currentTarget || currentTarget.isConnected) return;

  // Target row is gone (tab was closed).  If the card is still visible,
  // freeze it in place: set the detached flag so the next mouseenter is
  // swallowed.  The user must move the mouse away and back for the card
  // to transition normally — by then layout is stable and the morph
  // lands at the correct position on the first try.
  if (isCardShown(doc)) {
    _detached = true;
    return;
  }

  const replacement = _currentItemId
    ? (doc.querySelector(
        `.vertical-tabs-item[data-item-id="${_currentItemId}"]`,
      ) as HTMLElement | null)
    : null;
  if (replacement) {
    setCardTarget(replacement);
    return;
  }
  if (_showTimeout) {
    clearTimeout(_showTimeout);
    _showTimeout = null;
  }
  hideCard(doc, "item", 0);
}

/** Suppress the item card while a context-menu action is in progress. */
export function suppressCard(
  doc: Document,
  preserveItemId = false,
  immediate = false,
): void {
  _renderToken++;
  _suppressed = true;
  if (_showTimeout) {
    clearTimeout(_showTimeout);
    _showTimeout = null;
  }
  _pendingItemId = null;
  _pendingTabId = null;
  if (!preserveItemId) _currentItemId = null;
  if (immediate) {
    hideCardNow(doc, "item");
  } else {
    hideCard(doc, "item", 0);
  }
}

export function setCardFigureCaptureItem(
  itemId: number | null,
  rowItemId = itemId,
): void {
  _captureItemId = itemId;
  _captureRowItemId = rowItemId;
}

export function releaseCardSuppression(): void {
  _suppressed = false;
}

export function initHoverCard(doc: Document): void {
  doc.addEventListener("vertical-tabs:item-hover", handleItemHover);
  doc.addEventListener("vertical-tabs:item-hover-end", handleItemHoverEnd);
  doc.addEventListener(
    "vertical-tabs:expand-animation-complete",
    handleExpandAnimationComplete,
  );
  doc.addEventListener("vertical-tabs:rendered", handleRenderInvalidated);
  doc.addEventListener(
    "vertical-tabs:card-figure-updated",
    handleCardFigureUpdated,
  );
  doc.addEventListener(
    "vertical-tabs:card-figures-cleared",
    handleCardFiguresCleared,
  );

  // Watch dark mode switch to update card colors in real time
  const existingDark = (doc as any).__vtHoverDarkCleanup as
    | (() => void)
    | undefined;
  if (existingDark) existingDark();

  const darkCleanup = watchDarkMode(doc, () => {
    applyCardTheme(doc);
  });
  (doc as any).__vtHoverDarkCleanup = darkCleanup;

  // Watch disable-blur preference so toggling takes effect immediately
  const existingBlur = (doc as any).__vtHoverBlurCleanup as
    | (() => void)
    | undefined;
  if (existingBlur) existingBlur();

  let blurObserverSymbol: symbol | undefined;
  const blurObserver = (_value: boolean) => {
    applyCardTheme(doc);
  };

  try {
    blurObserverSymbol = Zotero.Prefs.registerObserver(
      PREF_ENABLE_BLUR,
      blurObserver,
      false,
    );
  } catch {
    // ignore
  }
  (doc as any).__vtHoverBlurCleanup = () => {
    if (!blurObserverSymbol) return;
    try {
      Zotero.Prefs.unregisterObserver(blurObserverSymbol);
    } catch {
      // ignore
    }
  };
}

export function destroyHoverCard(doc: Document): void {
  doc.removeEventListener("vertical-tabs:item-hover", handleItemHover);
  doc.removeEventListener("vertical-tabs:item-hover-end", handleItemHoverEnd);
  doc.removeEventListener(
    "vertical-tabs:expand-animation-complete",
    handleExpandAnimationComplete,
  );
  doc.removeEventListener("vertical-tabs:rendered", handleRenderInvalidated);
  doc.removeEventListener(
    "vertical-tabs:card-figure-updated",
    handleCardFigureUpdated,
  );
  doc.removeEventListener(
    "vertical-tabs:card-figures-cleared",
    handleCardFiguresCleared,
  );

  const darkCleanup = (doc as any).__vtHoverDarkCleanup as
    | (() => void)
    | undefined;
  if (darkCleanup) {
    darkCleanup();
    delete (doc as any).__vtHoverDarkCleanup;
  }

  const blurCleanup = (doc as any).__vtHoverBlurCleanup as
    | (() => void)
    | undefined;
  if (blurCleanup) {
    blurCleanup();
    delete (doc as any).__vtHoverBlurCleanup;
  }

  if (_showTimeout) clearTimeout(_showTimeout);
  _showTimeout = null;
  _renderToken++;
  _currentItemId = null;
  _captureItemId = null;
  _captureRowItemId = null;
  _pendingItemId = null;
  _pendingTabId = null;
  _suppressed = false;
  _detached = false;
  destroyCardEl(doc);
}
