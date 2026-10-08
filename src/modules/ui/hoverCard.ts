import { config } from "../../../package.json";
import { getString } from "../../utils/locale";
import { dispatchVtEvent } from "../core/events";
import { getItemInfo } from "../render/uiRenderer";
import {
  getContextMenuColors,
  isDarkMode,
  watchDarkMode,
} from "../render/colorUtils";
import { getItemTypeImageSrc } from "../render/itemInfoCache";
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
  moveCardToTarget,
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

function createField(
  doc: Document,
  label: string,
  value: string,
  iconSrc?: string,
  iconFilter = "",
): HTMLElement {
  const row = createEl(doc, "div");
  row.style.cssText =
    "margin-top: 6px; display: flex; gap: 6px; align-items: center;";

  const labelEl = createEl(doc, "span");
  labelEl.style.cssText =
    "font-weight: 600; color: var(--material-text-muted, #666); flex-shrink: 0;";
  if (iconSrc) {
    labelEl.setAttribute("aria-label", label);
    labelEl.setAttribute("title", label);
    labelEl.style.cssText +=
      "display: inline-flex; align-items: center; width: 16px; height: 16px;";
    const image = createEl(doc, "img") as HTMLImageElement;
    image.src = iconSrc;
    image.alt = "";
    image.setAttribute("aria-hidden", "true");
    image.style.cssText = `display:block;width:16px;height:16px;object-fit:contain;${iconFilter ? `filter:${iconFilter};` : ""}`;
    image.addEventListener(
      "error",
      () => {
        image.remove();
        labelEl.textContent = `${label}:`;
        labelEl.style.cssText =
          "font-weight: 600; color: var(--material-text-muted, #666); flex-shrink: 0;";
      },
      { once: true },
    );
    labelEl.appendChild(image);
  } else {
    labelEl.textContent = `${label}:`;
  }
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
  const separator = createEl(doc, "div");
  separator.style.cssText = `width:100%;height:1px;margin:6px auto 0;background:${isDarkMode(doc) ? "#555" : "#d9d9d9"};`;
  card.appendChild(separator);

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
    const shellStyle =
      shell && doc.defaultView
        ? (doc.defaultView as Window).getComputedStyle(shell)
        : null;
    const blurEnabled =
      shellStyle != null && shellStyle.backdropFilter !== "none";
    const solidColors = getContextMenuColors(doc);
    const figureBackground = blurEnabled
      ? solidColors.solidBackground
      : cardBackground;
    const titleGradientColor = blurEnabled
      ? solidColors.solidBackground
      : cardBackground;
    // A figure card must be fully opaque: disable the blur on the outer card,
    // not only on the metadata below the image.
    if (shell) {
      shell.style.background = solidColors.solidBackground;
      shell.style.border = solidColors.solidBorder;
      shell.style.backdropFilter = "none";
      (shell.style as any).webkitBackdropFilter = "none";
    }
    const figure = createEl(doc, "div");
    const bleed = CARD_PADDING_X / 2;
    figure.style.cssText = `position:relative;display:block;box-sizing:border-box;width:calc(100% + ${CARD_PADDING_X}px);height:auto;margin:${-bleed}px ${-bleed}px 0;background:${figureBackground};`;
    const image = createEl(doc, "img") as HTMLImageElement;
    image.alt = "";
    image.style.cssText =
      "display:block;width:100%;height:auto;object-fit:cover;";
    figure.appendChild(image);

    const figureTitle = createEl(doc, "div");
    figureTitle.style.cssText = `position:relative;box-sizing:border-box;margin-top:0;padding:22px ${bleed}px 10px;font-weight:700;line-height:1.35;color:inherit;white-space:normal;overflow-wrap:anywhere;`;
    const figureTitleText = createEl(doc, "span");
    figureTitleText.dataset.vtItemTitle = "true";
    figureTitleText.textContent = info.title;
    figureTitle.appendChild(figureTitleText);
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
      applyCardTheme(doc);
    } else {
      // The overlaid title is the only title when a figure is present.
      title.remove();
      separator.style.marginTop = "0";
      const figureWidth = figure.getBoundingClientRect().width;
      const naturalHeight =
        (figureWidth * image.naturalHeight) / image.naturalWidth;
      const imageHeight = Math.min(CARD_FIGURE_MAX_HEIGHT, naturalHeight);
      image.style.height = `${imageHeight}px`;
      const titleRect = figureTitle.getBoundingClientRect();
      const titleRange = doc.createRange();
      titleRange.selectNodeContents(figureTitleText);
      const lineRects = Array.from(titleRange.getClientRects() ?? []);
      const anchorLine = lineRects[Math.min(1, lineRects.length - 1)];
      const h = anchorLine ? Math.max(0, anchorLine.top - titleRect.top) : 0;
      const fadeHeight = h * 0.7;
      figureTitle.style.marginTop = `${-fadeHeight}px`;
      figureTitle.style.background = `linear-gradient(to bottom, transparent 0, ${titleGradientColor} ${fadeHeight}px, ${titleGradientColor} 100%)`;
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
      createField(
        doc,
        getString("vertical-tabs-authors"),
        info.authors,
        `chrome://${config.addonRef}/content/icons/author.svg`,
        isDarkMode(doc) ? "brightness(0) invert(1)" : "",
      ),
    );
  }

  // Date
  if (info.year) {
    card.appendChild(
      createField(
        doc,
        getString("vertical-tabs-year"),
        info.year,
        `chrome://${config.addonRef}/content/icons/time.svg`,
        isDarkMode(doc) ? "brightness(0) invert(1)" : "",
      ),
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
      const itemTypeIcon = metaItem
        ? getItemTypeImageSrc((metaItem as Zotero.Item).itemType)
        : "";
      const whiteItemTypeIcon = itemTypeIcon.replace(
        /\/(?:light|dark)\//,
        "/white/",
      );
      card.appendChild(
        createField(
          doc,
          pubLabel,
          pubValue,
          whiteItemTypeIcon || undefined,
          isDarkMode(doc) ? "" : "brightness(0) saturate(100%) invert(40%)",
        ),
      );
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
const _sidebarHoverRows = new WeakMap<Document, HTMLElement>();
const _sidebarHoverLocks = new WeakMap<Document, "menu">();

function activateSidebarHoverRow(
  doc: Document,
  row: HTMLElement,
  clientY?: number,
): void {
  const previous = _sidebarHoverRows.get(doc);
  if (previous === row) return;
  if (previous) previous.classList.remove("vt-sidebar-row-hover");
  _sidebarHoverRows.set(doc, row);
  row.classList.add("vt-sidebar-row-hover");
  dispatchVtEvent(row, "vertical-tabs:item-hover", {
    itemId: Number(row.dataset.itemId),
    tabId: row.dataset.tabId || "",
    clientY,
  });
}

function clearSidebarHoverRow(doc: Document, dispatchEnd: boolean): void {
  doc.getElementById(SIDEBAR_ID)?.classList.remove("vt-sidebar-row-band-hover");
  const row = _sidebarHoverRows.get(doc);
  if (!row) return;
  row.classList.remove("vt-sidebar-row-hover");
  _sidebarHoverRows.delete(doc);
  if (dispatchEnd) {
    dispatchVtEvent(row, "vertical-tabs:item-hover-end", {
      itemId: Number(row.dataset.itemId),
      tabId: row.dataset.tabId || "",
    });
  }
}

function handleSidebarItemMouseMove(event: MouseEvent): void {
  const doc = event.currentTarget as Document;
  if (_sidebarHoverLocks.has(doc)) return;
  const sidebar = doc.getElementById(SIDEBAR_ID);
  const target = event.target as Element | null;

  if (!sidebar || !target || !sidebar.contains(target)) {
    clearSidebarHoverRow(doc, true);
    return;
  }

  const rowSelector = ".vertical-tabs-item[data-item-id]";
  const hitRow = target.closest(rowSelector) as HTMLElement | null;
  if (hitRow) {
    sidebar.classList.remove("vt-sidebar-row-band-hover");
    activateSidebarHoverRow(doc, hitRow, event.clientY);
    return;
  }

  const sidebarRect = sidebar.getBoundingClientRect();
  if (event.clientX < sidebarRect.left || event.clientX > sidebarRect.right) {
    clearSidebarHoverRow(doc, true);
    return;
  }

  const rows = Array.from(
    sidebar.querySelectorAll(rowSelector),
  ) as HTMLElement[];
  const row = rows.find((candidate) => {
    const rect = candidate.getBoundingClientRect();
    return event.clientY >= rect.top && event.clientY <= rect.bottom;
  });
  if (!row) {
    clearSidebarHoverRow(doc, true);
    return;
  }

  sidebar.classList.add("vt-sidebar-row-band-hover");
  activateSidebarHoverRow(doc, row, event.clientY);
}

function handleSidebarHoverClick(event: MouseEvent): void {
  const doc = event.currentTarget as Document;
  const lock = _sidebarHoverLocks.get(doc);
  if (!lock) return;

  const target = event.target as Element | null;
  const menuAction = target?.closest(
    "#vertical-tabs-item-menu [data-vt-context-menu-action]",
  );
  const menu = doc.getElementById("vertical-tabs-item-menu");
  if (menu && menu.contains(target) && !menuAction) return;

  _sidebarHoverLocks.delete(doc);
  doc.getElementById(SIDEBAR_ID)?.classList.remove("vt-hover-locked");
  clearSidebarHoverRow(doc, true);
  _suppressed = false;
}

export function lockSidebarHoverForContextMenu(
  doc: Document,
  row: HTMLElement,
): void {
  const previous = _sidebarHoverRows.get(doc);
  if (previous && previous !== row) {
    previous.classList.remove("vt-sidebar-row-hover");
  }
  _sidebarHoverRows.set(doc, row);
  row.classList.add("vt-sidebar-row-hover");
  doc.getElementById(SIDEBAR_ID)?.classList.add("vt-hover-locked");
  _sidebarHoverLocks.set(doc, "menu");
}

function handleSidebarItemClick(event: MouseEvent): void {
  const doc = event.currentTarget as Document;
  const sidebar = doc.getElementById(SIDEBAR_ID);
  const target = event.target as Element | null;
  if (!sidebar || !target || !sidebar.contains(target)) return;
  if (target.closest(".vertical-tabs-item")) return;
  const rect = sidebar.getBoundingClientRect();
  if (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  ) {
    return;
  }
  const row = Array.from(
    sidebar.querySelectorAll(".vertical-tabs-item[data-item-id]"),
  ).find((candidate) => {
    const rowRect = (candidate as HTMLElement).getBoundingClientRect();
    return event.clientY >= rowRect.top && event.clientY <= rowRect.bottom;
  }) as HTMLElement | undefined;
  if (!row) return;
  event.preventDefault();
  event.stopPropagation();
  const forwarded = doc.createEvent("MouseEvents");
  forwarded.initMouseEvent(
    "click",
    true,
    true,
    doc.defaultView,
    event.detail,
    event.screenX,
    event.screenY,
    event.clientX,
    event.clientY,
    event.ctrlKey,
    event.altKey,
    event.shiftKey,
    event.metaKey,
    event.button,
    null,
  );
  row.dispatchEvent(forwarded);
}

function showHoverCard(
  doc: Document,
  target: HTMLElement,
  itemId: number,
  mouseY?: number,
): void {
  _currentItemId = itemId;
  const renderToken = ++_renderToken;
  const cardOptions = {
    width: ITEM_CARD_WIDTH,
    mouseY,
    alignTop: true,
    titleSelector: "[data-vt-item-title]",
  } as const;

  // Reposition synchronously on every hover. The content renderer may wait
  // for a preview image, but the shell must follow the pointer immediately.
  if (isCardShown(doc)) {
    moveCardToTarget(doc, target, cardOptions);
  }

  const doShow = async () => {
    if (_currentItemId !== itemId || _renderToken !== renderToken) return;
    try {
      await showCard(doc, "item", target, cardOptions, (card) =>
        renderCard(doc, card, itemId),
      );
      // A newer hover owns the shared shell now. The stale render must not
      // hide it after its own async content finishes.
      if (_currentItemId !== itemId || _renderToken !== renderToken) return;
    } catch (error) {
      ztoolkit.log("Failed to show hover card:", error);
    }
  };

  if (_showTimeout) clearTimeout(_showTimeout);
  _showTimeout = null;
  if (isCardShown(doc)) {
    void doShow();
  } else {
    _showTimeout = setTimeout(() => {
      _showTimeout = null;
      void doShow();
    }, SHOW_DELAY_MS);
  }
}

function handleItemHover(event: Event): void {
  const customEvent = event as CustomEvent;
  const { itemId, tabId, clientY } = customEvent.detail as {
    itemId: number;
    tabId: string;
    clientY?: number;
  };
  const target = event.target as HTMLElement;
  const doc = target.ownerDocument;
  if (!doc) return;

  const row = target.closest(
    ".vertical-tabs-item[data-item-id]",
  ) as HTMLElement | null;
  if (row) {
    const mouseY = clientY ?? undefined;
    activateSidebarHoverRow(doc, row, mouseY);
  }

  // Right-click suppression: user must leave and re-enter to show card again.
  if (_suppressed) {
    _suppressed = false;
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
      showHoverCard(doc, target, itemId, clientY);
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

  showHoverCard(doc, target, itemId, clientY);
}

function handleItemHoverEnd(event: Event): void {
  const target = event.target as HTMLElement;
  const doc = target.ownerDocument;
  if (!doc) return;

  _suppressed = false;

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
    await showCard(
      doc,
      "item",
      target,
      {
        width: ITEM_CARD_WIDTH,
        alignTop: true,
        titleSelector: "[data-vt-item-title]",
      },
      (card) => renderCard(doc, card, currentId),
    );
    if (_renderToken !== renderToken || _currentItemId !== currentId) {
      return;
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
    await showCard(
      doc,
      "item",
      target,
      {
        width: ITEM_CARD_WIDTH,
        alignTop: true,
        titleSelector: "[data-vt-item-title]",
      },
      (card) => renderCard(doc, card, itemId),
    );
    if (_renderToken !== renderToken) return;
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
  const doc = eventDocument(event);
  if (!doc) return;
  const rows = Array.from(
    doc.querySelectorAll(".vertical-tabs-item[data-item-id]"),
  ) as HTMLElement[];
  // A render replaces DOM nodes, not necessarily tabs. Keep the hover
  // coordinator on the fresh row without emitting another hover event.
  const findReplacement = (row: HTMLElement) =>
    rows.find((candidate) =>
      row.dataset.tabId
        ? candidate.dataset.tabId === row.dataset.tabId &&
          candidate.dataset.itemId === row.dataset.itemId
        : candidate.dataset.itemId === row.dataset.itemId,
    );
  const hoveredRow = _sidebarHoverRows.get(doc);
  if (hoveredRow && !hoveredRow.isConnected) {
    const replacement = findReplacement(hoveredRow);
    if (replacement) {
      _sidebarHoverRows.set(doc, replacement);
      replacement.classList.add("vt-sidebar-row-hover");
    } else {
      clearSidebarHoverRow(doc, true);
    }
  }
  if (getCardOwner() !== "item") return;
  const currentTarget = getCardTarget();
  if (!currentTarget || currentTarget.isConnected) return;

  const replacement = findReplacement(currentTarget);
  if (replacement) {
    setCardTarget(replacement);
    return;
  }
  if (_showTimeout) {
    clearTimeout(_showTimeout);
    _showTimeout = null;
  }
  _currentItemId = null;
  _renderToken++;
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
  doc.addEventListener("mousemove", handleSidebarItemMouseMove);
  doc.addEventListener("click", handleSidebarHoverClick, true);
  doc.addEventListener("click", handleSidebarItemClick, true);
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
  doc.removeEventListener("mousemove", handleSidebarItemMouseMove);
  doc.removeEventListener("click", handleSidebarHoverClick, true);
  doc.removeEventListener("click", handleSidebarItemClick, true);
  _sidebarHoverLocks.delete(doc);
  doc.getElementById(SIDEBAR_ID)?.classList.remove("vt-hover-locked");
  clearSidebarHoverRow(doc, false);
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
  destroyCardEl(doc);
}
