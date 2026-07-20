import { config } from "../../../package.json";
import { getString } from "../../utils/locale";
import {
  collapseFloatingSidebar,
  getCategoriesContainer,
  scheduleCollapse,
  setContextMenuOpen,
  SIDEBAR_ID,
} from "../sidebar/sidebar";
import type { Category, VerticalTabsData } from "../track/dataStore";
import type { OpenedPDF } from "../track/itemTracker";
import {
  getOpenedPDFs,
  getZoteroTabs,
  getSelectedTabId,
  removeTabsFromTrackingSilently,
} from "../track/itemTracker";
import {
  isReaderLoaded,
  isShowReaderLoadedIndicatorEnabled,
} from "../track/readerRelease";
import { openItemAsNewTab } from "../track/tabOpener";
import { dispatchVtEvent } from "../core/events";
import {
  HIGHLIGHT_CLASS,
  updateActiveCategoryHighlight,
} from "./categoryHighlight";
import {
  cancelCategoryCollapseAnimation,
  COLLAPSE_ANIMATION_MS,
  toggleCategoryCollapseAnimated,
} from "./categoryCollapse";
import { isInternalVtDrag, VT_DRAG_MIME_TYPE } from "../drag/dropTarget";
import {
  computeCategoryReorderInsertBefore,
  decideCategoryDropAction,
} from "../drag/categoryDropAction";
import { arrowIcon } from "../ui/iconSvgs";
import {
  applyDropPreview,
  clearDropPreview,
  clearItemShiftPreview,
} from "../drag/dropPreview";
import { applyCategoryPreview } from "../drag/categoryPreview";
import { getDraggedTabId, setDraggedTabId } from "../drag/itemDragState";
import {
  clearDropOutlineFade,
  consumeDropOutlineFade,
  dropOutlineFadeTargetForElement,
  markDropOutlineFade,
  playDropOutlineFade,
} from "../drag/dropOutlineFade";
import { isNewCategoryZonePointer } from "../drag/newCategoryDrop";
import {
  consumeNewCategoryEntrance,
  playNewCategoryEntrance,
} from "./categoryEntrance";
import {
  consumeCategoryColorFade,
  playCategoryColorFade,
} from "./categoryColorFade";
import { animatePopupClose, animatePopupOpen } from "../ui/popupAnimation";
import { animateTabsExit } from "./tabExit";
import {
  consumeMultiTabRelease,
  markMultiTabRelease,
  playMultiTabRelease,
} from "./multiTabRelease";
import {
  clearTabSelection,
  consumeSelectionFadeOut,
  getOrderedSelectedTabIds,
  getSelectedTabCount,
  getSelectedTabIds,
  isTabSelected,
  replaySelectionFadeOut,
  selectTabRange,
  toggleTabSelection,
} from "../drag/multiSelect";
import {
  collapseMultiDragSource,
  dispatchMultiDrop,
  endMultiDrag,
  getMultiDragSourceCounts,
  getMultiDragTabIds,
  startMultiDrag,
} from "../drag/multiDrag";
import {
  endCategoryDragSource,
  getCategoryDragSource,
  isCategoryDragDropped,
  markCategoryDragDropped,
  startCategoryDragSource,
} from "../drag/categoryDragSource";
import {
  applyCategoryGapPreview,
  clearCategoryGapPreview,
  getCategoryGapInsertBefore,
} from "../drag/categoryGapPreview";
import {
  consumeCategoryRelease,
  markCategoryRelease,
  playCategoryRelease,
} from "../drag/categoryRelease";
import {
  clearAllItemDropIndicators,
  clearItemDropIndicator,
  getDefaultItemHeight,
  setEmptyDropZoneIndicator,
  setItemDropIndicator,
  setTopGapIndicator,
} from "../drag/dropZoneIndicator";
import {
  lightToDark,
  isDarkMode,
  watchDarkMode,
  getContextMenuColors,
} from "./colorUtils";
import { getPopupStyleSheet } from "./popupStyleUtils";

interface ItemInfo {
  title: string;
  authors: string;
  year: string;
  journal: string;
  university: string;
  extra: string;
  tags: string[];
}

const DRAG_SOURCE_CATEGORY_ID_KEY = "__vtDragSourceCategoryId";

function setDragSourceCategoryId(
  doc: Document,
  categoryId: string | null,
): void {
  (doc as any)[DRAG_SOURCE_CATEGORY_ID_KEY] = categoryId;
}

function getDragSourceCategoryId(doc: Document): string | null {
  return (doc as any)[DRAG_SOURCE_CATEGORY_ID_KEY] || null;
}

const DROP_RENDER_PENDING_KEY = "__vtDropRenderPending";
const DROP_RENDER_TIMEOUT_KEY = "__vtDropRenderPendingTimeout";
const DROP_RENDER_FALLBACK_MS = 500;
const SMOOTH_COLLAPSE_KEY = "__vtSmoothCollapseCategoryId";

function setDropRenderPending(doc: Document, pending: boolean): void {
  const win = doc.defaultView;
  const existing = (doc as any)[DROP_RENDER_TIMEOUT_KEY] as number | undefined;
  if (existing && win) {
    win.clearTimeout(existing);
  }
  delete (doc as any)[DROP_RENDER_TIMEOUT_KEY];
  (doc as any)[DROP_RENDER_PENDING_KEY] = pending;
  if (pending && win) {
    const timeout = win.setTimeout(() => {
      delete (doc as any)[DROP_RENDER_TIMEOUT_KEY];
      if ((doc as any)[DROP_RENDER_PENDING_KEY]) {
        clearDropPreview(doc);
        (doc as any)[DROP_RENDER_PENDING_KEY] = false;
        delete (doc as any)[SMOOTH_COLLAPSE_KEY];
        clearDropOutlineFade(doc);
      }
    }, DROP_RENDER_FALLBACK_MS);
    (doc as any)[DROP_RENDER_TIMEOUT_KEY] = timeout;
  }
}

function isDropRenderPending(doc: Document): boolean {
  return !!(doc as any)[DROP_RENDER_PENDING_KEY];
}

/**
 * Remember that a drop landed in a collapsed (but preview-expanded) category.
 * The next drop-triggered re-render consumes the id and plays the standard
 * collapse animation instead of snapping shut.
 */
function markSmoothCollapseAfterDrop(
  doc: Document,
  wrapper: Element | null,
): void {
  if (!wrapper || !wrapper.classList.contains("collapsed")) return;
  const id = (wrapper as HTMLElement).dataset.categoryId;
  if (id) (doc as any)[SMOOTH_COLLAPSE_KEY] = id;
}

function consumeSmoothCollapseAfterDrop(doc: Document): string | null {
  const id = (doc as any)[SMOOTH_COLLAPSE_KEY] as string | undefined;
  delete (doc as any)[SMOOTH_COLLAPSE_KEY];
  return id || null;
}

function setWrapperDragOver(wrapper: HTMLElement | null, doc: Document): void {
  if (!wrapper) return;
  doc
    .querySelectorAll(
      ".vertical-tabs-category.drag-over, .vertical-tabs-drop-zone.drag-over",
    )
    .forEach((el: Element) => {
      if (el !== wrapper) el.classList.remove("drag-over");
    });
  wrapper.classList.add("drag-over");
}

function getContainerVisibleItems(container: HTMLElement): HTMLElement[] {
  const allItems = Array.from(
    container.querySelectorAll(":scope > .vertical-tabs-item"),
  ) as HTMLElement[];
  return allItems.filter(
    (el) =>
      !el.classList.contains("vt-drag-source-collapsed") &&
      !el.classList.contains("vt-multi-source-collapse"),
  );
}

function computeDropZoneInsertIndex(
  dropZone: HTMLElement,
  clientY: number,
): number {
  const visibleItems = getContainerVisibleItems(dropZone);
  let insertIndex = 0;
  for (let i = 0; i < visibleItems.length; i++) {
    const rect = visibleItems[i].getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    if (clientY < midY) {
      return i;
    }
    insertIndex = i + 1;
  }
  return insertIndex;
}

function computeCategoryReorderBoundary(wrapper: HTMLElement): number {
  const wrapperRect = wrapper.getBoundingClientRect();
  const header = wrapper.querySelector(
    ":scope > .vertical-tabs-category-header",
  ) as HTMLElement | null;
  if (!header) {
    return wrapperRect.top + wrapperRect.height / 2;
  }
  const headerRect = header.getBoundingClientRect();
  // The header itself counts as the "before" region. Split only the area
  // below the header (items / preview blank space) in half.
  return headerRect.bottom + (wrapperRect.bottom - headerRect.bottom) / 2;
}

function getOrderedCategoryIds(doc: Document): string[] {
  const container = getCategoriesContainer(doc);
  if (!container) return [];
  return Array.from(
    container.querySelectorAll(":scope > .vertical-tabs-category"),
  )
    .map((el) => (el as HTMLElement).dataset.categoryId || "")
    .filter(Boolean);
}

function getLastCategoryWrapper(container: HTMLElement): HTMLElement | null {
  const wrappers = container.querySelectorAll(
    ":scope > .vertical-tabs-category",
  );
  return wrappers.length
    ? (wrappers[wrappers.length - 1] as HTMLElement)
    : null;
}

function getFirstCategoryWrapper(doc: Document): HTMLElement | null {
  const container = getCategoriesContainer(doc);
  return (
    (container?.querySelector(
      ":scope > .vertical-tabs-category",
    ) as HTMLElement | null) ?? null
  );
}

/** Visual-order tabIds of every row in the VT (for shift-range selection). */
function getOrderedVisibleTabIds(doc: Document): string[] {
  const container = getCategoriesContainer(doc);
  if (!container) return [];
  return Array.from(container.querySelectorAll(".vertical-tabs-item"))
    .map((el) => (el as HTMLElement).dataset.tabId || "")
    .filter(Boolean);
}

/**
 * Preview parameters for the current drag: the gap stays ONE row tall even
 * for multi drags (per the confirmed behavior). Multi drags use the
 * per-category source count map (accurate tNew accounting across source
 * categories) and the selection set to exclude dragged rows from shifts.
 */
function getDragPreviewParams(doc: Document): {
  source: string | null | Map<string, number>;
  exclude?: ReadonlySet<string>;
} {
  const multiIds = getMultiDragTabIds(doc);
  if (multiIds) {
    return {
      source: getMultiDragSourceCounts(doc),
      exclude: getSelectedTabIds(doc),
    };
  }
  return { source: getDragSourceCategoryId(doc), exclude: undefined };
}

/**
 * Document-level click-to-clear for the multi selection: any click that does
 * not land on a VT tab row clears the selection (per the confirmed
 * edge-case behavior — "any other position", including outside the sidebar).
 * Bound once per document, in the CAPTURE phase on BOTH mousedown and click:
 * Zotero's own handlers (and some VT buttons) stopPropagation on click,
 * which would otherwise prevent the event from ever reaching a bubble-phase
 * document listener.
 *
 * Rebind-safety across plugin hot reloads: expando flags on the document
 * SURVIVE a reload while the old JS compartment (and its listeners) dies.
 * A boolean "bound" flag left by a previous load would permanently block
 * re-binding, so we key off a per-load token object instead, and remove the
 * previous handler best-effort (it may be a dead object — never throw).
 */
const SELECTION_LISTENER_TOKEN = {};

function attachSelectionEvents(doc: Document): void {
  if ((doc as any).__vtSelectionToken === SELECTION_LISTENER_TOKEN) return;
  (doc as any).__vtSelectionToken = SELECTION_LISTENER_TOKEN;
  try {
    const old = (doc as any).__vtSelectionHandler as
      | ((e: MouseEvent) => void)
      | undefined;
    if (old) {
      doc.removeEventListener("mousedown", old, true);
      doc.removeEventListener("click", old, true);
    }
  } catch {
    // Previous handler is a dead object from a nuked compartment — the
    // browser drops it with the compartment, nothing to remove.
  }
  const handler = (e: MouseEvent) => {
    const target = e.target as Element | null;
    if (target?.closest?.(".vertical-tabs-item")) return;
    clearTabSelection(doc);
  };
  doc.addEventListener("mousedown", handler, true);
  doc.addEventListener("click", handler, true);
  (doc as any).__vtSelectionHandler = handler;
}

/** Remove the document-level selection listeners (destroy/disable flow). */
export function destroySelectionEvents(doc: Document): void {
  try {
    const handler = (doc as any).__vtSelectionHandler as
      | ((e: MouseEvent) => void)
      | undefined;
    if (handler) {
      doc.removeEventListener("mousedown", handler, true);
      doc.removeEventListener("click", handler, true);
    }
  } catch {
    // dead object — already gone with its compartment
  }
  delete (doc as any).__vtSelectionHandler;
  delete (doc as any).__vtSelectionToken;
}

/**
 * Dispatch a category reorder drop at the CURRENT gap position, so the moved
 * category lands exactly where the green bar is shown (not where the cursor
 * happens to be at the drop instant). `fallbackInsertBefore` is used only
 * when no gap state is available. Skips the three no-op cases (gap right
 * before itself / right after itself / at the end while already last),
 * returning false so dragend plays the cancel-restore animation instead.
 */
function dispatchCategoryReorderAtGap(
  doc: Document,
  draggedCatId: string,
  fallbackInsertBefore: string | null,
): boolean {
  const gapInsertBefore = getCategoryGapInsertBefore(doc);
  const insertBeforeId =
    gapInsertBefore !== undefined ? gapInsertBefore : fallbackInsertBefore;

  const orderedIds = getOrderedCategoryIds(doc);
  const draggedIdx = orderedIds.indexOf(draggedCatId);
  const isNoOp =
    insertBeforeId === draggedCatId ||
    (insertBeforeId !== null &&
      draggedIdx >= 0 &&
      insertBeforeId === orderedIds[draggedIdx + 1]) ||
    (insertBeforeId === null &&
      draggedIdx >= 0 &&
      draggedIdx === orderedIds.length - 1);
  if (isNoOp) return false;

  const src = getCategoryDragSource(doc);
  markCategoryDragDropped(doc);
  if (src) {
    markCategoryRelease(doc, {
      categoryId: draggedCatId,
      wasCollapsed: src.wasCollapsed,
    });
  }
  dispatchVtEvent(doc, "vertical-tabs:reorder-categories", {
    categoryId: draggedCatId,
    insertBeforeCategoryId: insertBeforeId,
  });
  return true;
}

/**
 * Container-level handlers for the "move to END" position of category
 * reorder drags: the area below the last category wrapper shows the gap
 * after it and accepts the drop (gaps between categories are handled by the
 * per-wrapper listeners). Attached once per container (it persists across
 * re-renders).
 *
 * Also binds SIDEBAR-level handlers (once): the area above the first
 * category (header / home button) is a valid "before first" position — no
 * forbidden cursor, the green bar sits at the very top.
 */
function attachCategoryContainerDragEvents(
  doc: Document,
  container: HTMLElement,
): void {
  if (container.dataset.vtCatReorderBound) return;
  container.dataset.vtCatReorderBound = "1";

  container.addEventListener("dragover", (e: DragEvent) => {
    if (!isInternalVtDrag(e.dataTransfer)) return;
    const data = e.dataTransfer?.getData("text/plain");
    if (!data?.startsWith("cat:")) return;
    const last = getLastCategoryWrapper(container);
    if (!last) return;
    // Always allow the drop over the container — the visual gap hits the
    // container directly (shifted elements' hit areas move with them), and
    // the rule is: wherever the green bar shows, dropping must work.
    e.preventDefault();
    // Below the last wrapper's (visual) bottom the target is the end gap;
    // everywhere else the per-wrapper handlers are in charge.
    if (e.clientY > last.getBoundingClientRect().bottom) {
      applyCategoryGapPreview(doc, last, "after");
    }
  });

  container.addEventListener("drop", (e: DragEvent) => {
    if (!isInternalVtDrag(e.dataTransfer)) return;
    const data = e.dataTransfer?.getData("text/plain");
    if (!data?.startsWith("cat:")) return;
    const last = getLastCategoryWrapper(container);
    if (!last) return;
    e.preventDefault();
    // Gap intentionally left in place (see the wrapper's cat: drop).
    dispatchCategoryReorderAtGap(doc, data.slice(4), null);
  });

  container.addEventListener("dragleave", (e: DragEvent) => {
    // Moving into the header/home area keeps the drag alive — the
    // sidebar-level handler re-targets the gap to "before first" instead.
    const sidebar = doc.getElementById(SIDEBAR_ID);
    const related = e.relatedTarget as Node | null;
    if (sidebar && related && sidebar.contains(related)) return;
    clearCategoryGapPreview(doc, true);
  });

  const sidebar = doc.getElementById(SIDEBAR_ID) as HTMLElement | null;
  if (!sidebar || sidebar.dataset.vtCatReorderBound) return;
  sidebar.dataset.vtCatReorderBound = "1";

  sidebar.addEventListener("dragover", (e: DragEvent) => {
    if (!isInternalVtDrag(e.dataTransfer)) return;
    const data = e.dataTransfer?.getData("text/plain");
    if (!data?.startsWith("cat:")) return;
    const first = getFirstCategoryWrapper(doc);
    if (!first) return;
    // Only the area ABOVE the first category; elsewhere the wrapper and
    // container handlers are in charge.
    if (e.clientY >= first.getBoundingClientRect().top) return;
    e.preventDefault();
    applyCategoryGapPreview(doc, first, "before");
  });

  sidebar.addEventListener("drop", (e: DragEvent) => {
    if (!isInternalVtDrag(e.dataTransfer)) return;
    const data = e.dataTransfer?.getData("text/plain");
    if (!data?.startsWith("cat:")) return;
    const first = getFirstCategoryWrapper(doc);
    if (!first) return;
    if (e.clientY >= first.getBoundingClientRect().top) return;
    e.preventDefault();
    dispatchCategoryReorderAtGap(
      doc,
      data.slice(4),
      first.dataset.categoryId ?? null,
    );
  });

  sidebar.addEventListener("dragleave", (e: DragEvent) => {
    if (sidebar.contains(e.relatedTarget as Node)) return;
    clearCategoryGapPreview(doc, true);
  });
}

function attachDropZoneDragEvents(doc: Document, dropZone: HTMLElement): void {
  dropZone.addEventListener("dragover", (e: DragEvent) => {
    if (!isInternalVtDrag(e.dataTransfer)) return;
    e.preventDefault();
    // The top strip is claimed by the quick-create-category drop zone.
    if (isNewCategoryZonePointer(doc, e.clientY)) return;
    // Category reorder drags get no dashed outline (the gap preview is the
    // only indicator for them).
    if (!getDraggedTabId(doc)) return;
    doc
      .querySelectorAll(".vertical-tabs-category.drag-over")
      .forEach((el: Element) => el.classList.remove("drag-over"));
    dropZone.classList.add("drag-over");

    const targetItem = (e.target as Element).closest(".vertical-tabs-item");
    if (targetItem) return;

    const preview = getDragPreviewParams(doc);
    applyCategoryPreview(doc, dropZone, preview.source, 1);
    clearAllItemDropIndicators(doc);

    const visibleItems = getContainerVisibleItems(dropZone);
    const draggedTabId = getDraggedTabId(doc);
    if (!draggedTabId) return;

    if (visibleItems.length === 0) {
      setEmptyDropZoneIndicator(dropZone);
      clearItemShiftPreview(doc);
      return;
    }

    const insertIndex = computeDropZoneInsertIndex(dropZone, e.clientY);
    if (insertIndex >= visibleItems.length) {
      // Blank append area below the last tag: no item shift, indicator centered
      // in the one-tag-height blank space.
      clearItemShiftPreview(doc);
      const lastItem = visibleItems[visibleItems.length - 1];
      const shiftHeight = lastItem.offsetHeight || 0;
      setItemDropIndicator(lastItem, false, shiftHeight);
      return;
    }

    // The cursor is inside a gap opened between visible items (target drag
    // area). Shift items below downward and center the green bar in the gap
    // on the item *above* the gap so the bar does not move with the shifted
    // items.
    const targetRow = visibleItems[insertIndex];
    const shiftHeight = applyDropPreview(
      doc,
      {
        type: "item",
        container: dropZone,
        targetRow,
        before: true,
        draggedTabId,
      },
      preview.exclude,
    );
    if (insertIndex === 0) {
      setTopGapIndicator(dropZone, shiftHeight);
    } else {
      const prevItem = visibleItems[insertIndex - 1];
      setItemDropIndicator(prevItem, false, shiftHeight);
    }
  });

  dropZone.addEventListener("dragleave", (e: DragEvent) => {
    const related = e.relatedTarget as Node | null;
    if (!dropZone.contains(related)) {
      dropZone.classList.remove("drag-over");
      clearItemShiftPreview(doc);
      clearAllItemDropIndicators(doc);
      // Only tear down category preview when we really leave the sidebar.
      // Moving from the drop-zone into a category should let the next
      // dragover smoothly transition the height instead of jumping.
      const sidebar = doc.getElementById(SIDEBAR_ID);
      if (!sidebar?.contains(related) && !isDropRenderPending(doc)) {
        clearDropPreview(doc);
      }
    }
  });

  dropZone.addEventListener("drop", (e: DragEvent) => {
    if (!isInternalVtDrag(e.dataTransfer)) return;
    e.preventDefault();
    dropZone.classList.remove("drag-over");
    clearAllItemDropIndicators(doc);
    const dragData = e.dataTransfer?.getData("text/plain");
    if (!dragData) return;
    // Category reorder drags bubble up to the container-level end-drop
    // handler; they are not item drops.
    if (dragData.startsWith("cat:")) return;

    // Multi-tab drop: contiguous block into the uncategorized list.
    const multiIds = getMultiDragTabIds(doc);
    if (multiIds?.length) {
      const visibleItems = getContainerVisibleItems(dropZone);
      const insertIndex = computeDropZoneInsertIndex(dropZone, e.clientY);
      const action = decideCategoryDropAction(
        insertIndex,
        visibleItems.map((el) => el.dataset.tabId || ""),
      );
      dispatchMultiDrop(doc, {
        categoryId: "__uncategorized__",
        insertBeforeTabId:
          action.type === "insert-before" ? action.targetTabId : undefined,
        releaseTabIds: multiIds,
      });
      setDropRenderPending(doc, true);
      return;
    }

    const visibleItems = getContainerVisibleItems(dropZone);
    if (visibleItems.length === 0) {
      // Empty drop-zone: move the item into uncategorized at the end.
      dispatchVtEvent(dropZone, "vertical-tabs:reorder-item", {
        categoryId: "__uncategorized__",
        tabId: dragData,
        targetTabId: "",
        before: false,
      });
      // Single-tab drop: same release fade-in as the multi cascade.
      markMultiTabRelease(doc, [dragData]);
      markDropOutlineFade(doc, { type: "drop-zone" });
      setDropRenderPending(doc, true);
      return;
    }

    const insertIndex = computeDropZoneInsertIndex(dropZone, e.clientY);
    if (insertIndex >= visibleItems.length) {
      const lastItem = visibleItems[visibleItems.length - 1];
      const targetTabId = lastItem.dataset.tabId;
      if (targetTabId && targetTabId !== dragData) {
        dispatchVtEvent(dropZone, "vertical-tabs:reorder-item", {
          categoryId: "__uncategorized__",
          tabId: dragData,
          targetTabId,
          before: false,
        });
        markMultiTabRelease(doc, [dragData]);
        markDropOutlineFade(doc, { type: "drop-zone" });
        setDropRenderPending(doc, true);
      }
      return;
    }

    const targetTabId = visibleItems[insertIndex].dataset.tabId;
    if (targetTabId && targetTabId !== dragData) {
      dispatchVtEvent(dropZone, "vertical-tabs:reorder-item", {
        categoryId: "__uncategorized__",
        tabId: dragData,
        targetTabId,
        before: true,
      });
      markMultiTabRelease(doc, [dragData]);
      markDropOutlineFade(doc, { type: "drop-zone" });
      setDropRenderPending(doc, true);
    }
  });
}

function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return getString("vertical-tabs-just-now");
  if (diffHours < 1) {
    return getString("vertical-tabs-minutes-ago", {
      args: { count: diffMins },
    });
  }
  if (diffDays < 1) {
    return getString("vertical-tabs-hours-ago", { args: { count: diffHours } });
  }
  return getString("vertical-tabs-days-ago", { args: { count: diffDays } });
}

export function createEl(doc: Document, tag: string): HTMLElement {
  return doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    tag,
  ) as HTMLElement;
}

function getItemInfo(item: Zotero.Item): ItemInfo {
  const title = (item.getField("title") as string) || "Untitled";

  const creators = item.getCreators();
  const authors = creators
    .slice(0, 3)
    .map((creator) => {
      if (creator.fieldMode === 1) return creator.lastName;
      return `${creator.lastName} ${creator.firstName}`.trim();
    })
    .join(", ");
  const authorsLabel = creators.length > 3 ? `${authors} et al.` : authors;

  const date = (item.getField("date") as string) || "";
  const year = date ? date.slice(0, 4) : "";
  const journal =
    (item.getField("publicationTitle") as string) ||
    (item.getField("proceedingsTitle") as string) ||
    "";
  const university =
    (item.getField("university") as string) ||
    (item.getField("institution") as string) ||
    "";

  const tags = item.getTags().map((tag) => tag.tag);
  const extra = (item.getField("extra") as string) || "";

  return {
    title,
    authors: authorsLabel,
    year,
    journal,
    university,
    extra,
    tags,
  };
}

function renderIconWithFallback(
  doc: Document,
  row: HTMLElement,
  iconItemId: number,
  isNote: boolean,
): void {
  const iconEl = createEl(doc, "img") as HTMLImageElement;
  iconEl.className = "vertical-tabs-item-icon";
  try {
    const iconItem = Zotero.Items.get(iconItemId);
    if (iconItem) {
      const src = Zotero.ItemTypes.getImageSrc(
        (iconItem as Zotero.Item).itemType,
      );
      if (src) {
        iconEl.src = src;
        iconEl.addEventListener(
          "error",
          () => {
            iconEl.style.display = "none";
            const fb = createEl(doc, "div");
            fb.className = "vertical-tabs-item-icon-fallback";
            fb.textContent = isNote ? "N" : "P";
            fb.style.cssText =
              "width:16px;height:16px;border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff;background:" +
              (isNote ? "#f39c12" : "#e74c3c");
            iconEl.parentNode?.insertBefore(fb, iconEl);
          },
          { once: true },
        );
      }
    }
  } catch {
    // ignore
  }
  row.appendChild(iconEl);
}

function createItemElement(
  doc: Document,
  pdf: OpenedPDF,
  categoryId: string | null,
  categoryColors?: { light: string; dark: string },
): HTMLElement {
  // Use parent item for metadata (attachments don't have journal etc.)
  const metadataItemId = pdf.parentItemId ?? pdf.itemId;
  const item = Zotero.Items.get(metadataItemId);
  const info = item
    ? getItemInfo(item)
    : {
        title: `Item ${pdf.itemId}`,
        authors: "",
        year: "",
        journal: "",
        university: "",
        extra: "",
        tags: [],
      };

  const row = createEl(doc, "div");
  row.className =
    "vertical-tabs-item" +
    (pdf.tabId && pdf.tabId === getSelectedTabId() ? " active" : "");
  row.draggable = true;
  row.dataset.itemId = String(pdf.itemId);
  row.dataset.tabId = pdf.tabId;
  row.dataset.tabType = pdf.type;
  if (categoryId) row.dataset.categoryId = categoryId;

  // Multi-select overlay + restored selection state (freshly created rows
  // commit the visible overlay without playing the fade).
  const selectionOverlay = createEl(doc, "div");
  selectionOverlay.className = "vertical-tabs-item-selection-overlay";
  row.appendChild(selectionOverlay);
  if (pdf.tabId && isTabSelected(doc, pdf.tabId)) {
    row.classList.add("vt-selected");
  }

  // ── Reader-loaded indicator (leftmost 4px bar) ──
  const isReader = pdf.type?.startsWith("reader");
  const showIndicator =
    isReader &&
    isShowReaderLoadedIndicatorEnabled() &&
    isReaderLoaded(pdf.tabId);
  if (showIndicator) {
    row.classList.add("reader-loaded");
  }
  const indicator = createEl(doc, "div");
  indicator.className = "vertical-tabs-item-reader-loaded-indicator";
  row.insertBefore(indicator, row.firstChild);

  // ── Left: Zotero item type icon ──
  const isNote = pdf.type === "note" || pdf.type?.startsWith("note");
  const iconItemId = isNote ? pdf.itemId : (pdf.parentItemId ?? pdf.itemId);

  if (!isNote && !pdf.parentItemId) {
    // Standalone PDF attachment without a parent item → red "P" fallback
    const fb = createEl(doc, "div");
    fb.className = "vertical-tabs-item-icon-fallback";
    fb.textContent = "P";
    fb.style.cssText =
      "width:16px;height:16px;border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff;background:#e74c3c";
    row.appendChild(fb);
  } else {
    renderIconWithFallback(doc, row, iconItemId, isNote);
  }

  // ── Right: content block ──
  const contentEl = createEl(doc, "div");
  contentEl.className = "vertical-tabs-item-content";

  // Title (top line)
  const displayTitle = pdf.title || info.title;
  const titleEl = createEl(doc, "div");
  titleEl.className = "vertical-tabs-item-title";
  titleEl.textContent = displayTitle;
  contentEl.appendChild(titleEl);

  // PDF reader tabs: show extra ("其他") + separator when pref enabled AND extra non-empty
  const showExtra = Zotero.Prefs.get(
    `${config.prefsPrefix}.verticalTabs.showExtra`,
    true,
  ) as boolean;
  if (isReader && showExtra && info.extra) {
    const extraEl = createEl(doc, "div");
    extraEl.className = "vertical-tabs-item-extra";
    extraEl.textContent = info.extra;
    contentEl.appendChild(extraEl);
    const extraSep = createEl(doc, "div");
    extraSep.className = "vertical-tabs-extra-separator";
    contentEl.appendChild(extraSep);
  }

  // Meta (bottom line): time · publication
  const metaEl = createEl(doc, "div");
  metaEl.className = "vertical-tabs-item-meta";
  const timeSpan = createEl(doc, "span");
  timeSpan.className = "vertical-tabs-item-time";
  timeSpan.textContent = formatRelativeTime(pdf.openedAt);
  metaEl.appendChild(timeSpan);

  // Publication info
  if (!isNote) {
    const pubInfo = info.journal || info.university || "";
    if (pubInfo) {
      const dot = createEl(doc, "span");
      dot.className = "vertical-tabs-item-dot";
      dot.textContent = "·";
      metaEl.appendChild(dot);
      const pubSpan = createEl(doc, "span");
      pubSpan.className = "vertical-tabs-item-pub";
      pubSpan.textContent = pubInfo;
      metaEl.appendChild(pubSpan);
    }
  } else if (pdf.parentItemId) {
    // Note with parent: show parent item title
    const parentItem = Zotero.Items.get(pdf.parentItemId);
    if (parentItem) {
      const parentTitle =
        ((parentItem as Zotero.Item).getField("title") as string) || "";
      if (parentTitle) {
        const dot = createEl(doc, "span");
        dot.className = "vertical-tabs-item-dot";
        dot.textContent = "·";
        metaEl.appendChild(dot);
        const pubSpan = createEl(doc, "span");
        pubSpan.className = "vertical-tabs-item-pub";
        pubSpan.textContent = parentTitle;
        metaEl.appendChild(pubSpan);
      }
    }
  }
  contentEl.appendChild(metaEl);

  row.appendChild(contentEl);

  // ── Close button (right edge, gradient background) ──
  const closeBtn = createEl(doc, "div");
  closeBtn.className = "vertical-tabs-item-close";
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", (e: MouseEvent) => {
    e.stopPropagation();
    // Closing a tab via its × clears the selection (the button swallows the
    // click, so the document-level clear listener never sees it).
    if (getSelectedTabCount(doc) > 0) clearTabSelection(doc);
    // Hide hover card immediately so it doesn't linger after the tab is gone
    const hc = doc.getElementById(
      "vertical-tabs-hover-card",
    ) as HTMLElement | null;
    if (hc) {
      hc.style.opacity = "0";
      hc.style.display = "none";
    }
    // Play the fade+collapse exit first; the actual close commits when the
    // row is already zero-sized and transparent.
    if (pdf.tabId) {
      const tabId = pdf.tabId;
      animateTabsExit(doc, [tabId], () => {
        const tabs = getZoteroTabs();
        if (tabs) {
          try {
            tabs.close(tabId);
          } catch {
            // ignore
          }
        }
        // Stop tracking the closing tab right away (silently): any re-render
        // before the 100ms close-flush would otherwise resurrect the row at
        // full height — the "flash back" — before the flush removed it again.
        removeTabsFromTrackingSilently([tabId]);
      });
    }
  });
  row.appendChild(closeBtn);

  // If this item belongs to a colored category, make the close button
  // gradient use the category color (with dark-mode variant).
  if (categoryColors) {
    closeBtn.dataset.vtColorLight = categoryColors.light;
    closeBtn.dataset.vtColorDark = categoryColors.dark;
    closeBtn.style.setProperty(
      "--vt-close-bg",
      isDarkMode(doc) ? categoryColors.dark : categoryColors.light,
    );
  }

  // Middle-click to close tab
  row.addEventListener("mousedown", (e: MouseEvent) => {
    if (e.button !== 1 || !pdf.tabId) return;
    e.preventDefault();
    e.stopPropagation();
    // Closing a tab clears the selection (same as the × button).
    if (getSelectedTabCount(doc) > 0) clearTabSelection(doc);
    const hc = doc.getElementById(
      "vertical-tabs-hover-card",
    ) as HTMLElement | null;
    if (hc) {
      hc.style.opacity = "0";
      hc.style.display = "none";
    }
    const tabId = pdf.tabId;
    animateTabsExit(doc, [tabId], () => {
      const tabs = getZoteroTabs();
      if (tabs) {
        try {
          tabs.close(tabId);
        } catch {
          // ignore
        }
      }
      // See the × button for why the silent untracking matters (flash back).
      removeTabsFromTrackingSilently([tabId]);
    });
  });

  // ── Drag reorder (within category or uncategorized) ──
  const reorderCatId = categoryId || "__uncategorized__";
  {
    row.addEventListener("dragover", (e: DragEvent) => {
      if (!isInternalVtDrag(e.dataTransfer)) return;
      e.preventDefault();
      // The top strip is claimed by the quick-create-category drop zone.
      if (isNewCategoryZonePointer(doc, e.clientY)) return;
      const rect = row.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      const before = e.clientY < midY;

      const container =
        row.closest(".vertical-tabs-items") ||
        row.closest(".vertical-tabs-drop-zone");
      if (!container) return;

      const draggedTabId = getDraggedTabId(doc);
      if (!draggedTabId) return;

      const targetWrapper =
        row.closest(".vertical-tabs-category") ||
        row.closest(".vertical-tabs-drop-zone");
      const preview = getDragPreviewParams(doc);
      if (targetWrapper) {
        applyCategoryPreview(doc, targetWrapper, preview.source, 1);
        setWrapperDragOver(targetWrapper as HTMLElement, doc);
      }

      const shiftHeight = applyDropPreview(
        doc,
        {
          type: "item",
          container,
          targetRow: row,
          before,
          draggedTabId,
        },
        preview.exclude,
      );

      // Use the same centered-gap indicator model for both categories and the
      // uncategorized drop-zone. The green bar is attached to the element above
      // the gap (or the container top edge) so it stays put while items below
      // animate downward.
      clearAllItemDropIndicators(doc);
      const itemsContainer = container as HTMLElement;
      const visibleItems = getContainerVisibleItems(itemsContainer);
      const rowIndex = visibleItems.indexOf(row);
      if (before) {
        if (rowIndex <= 0) {
          setTopGapIndicator(itemsContainer, shiftHeight);
        } else {
          const prevItem = visibleItems[rowIndex - 1];
          setItemDropIndicator(prevItem, false, shiftHeight);
        }
      } else {
        setItemDropIndicator(row, false, shiftHeight);
      }
    });

    row.addEventListener("dragleave", (e: DragEvent) => {
      clearItemDropIndicator(row);
      const sidebar = doc.getElementById(SIDEBAR_ID);
      if (!sidebar?.contains(e.relatedTarget as Node)) {
        if (!isDropRenderPending(doc)) {
          clearAllItemDropIndicators(doc);
          clearDropPreview(doc);
        }
      }
    });

    row.addEventListener("drop", (e: DragEvent) => {
      if (!isInternalVtDrag(e.dataTransfer)) return;
      e.preventDefault();
      const dragData = e.dataTransfer?.getData("text/plain");
      // Category drags bubble up to the wrapper's category-reorder listener;
      // treating "cat:x" as a tabId here would corrupt the category data.
      if (dragData?.startsWith("cat:")) return;
      e.stopPropagation();
      clearItemDropIndicator(row);
      clearAllItemDropIndicators(doc);
      if (!dragData) return;
      const rect = row.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      const insertBefore = e.clientY < midY;

      // Multi-tab drop: contiguous block before/after the target row.
      const multiIds = getMultiDragTabIds(doc);
      if (multiIds?.length) {
        const rowContainer = (row.closest(".vertical-tabs-items") ||
          row.closest(".vertical-tabs-drop-zone")) as HTMLElement | null;
        const visibleItems = rowContainer
          ? getContainerVisibleItems(rowContainer)
          : [];
        const rowIndex = visibleItems.indexOf(row);
        const action = decideCategoryDropAction(
          insertBefore ? rowIndex : rowIndex + 1,
          visibleItems.map((el) => el.dataset.tabId || ""),
        );
        dispatchMultiDrop(doc, {
          categoryId: reorderCatId,
          insertBeforeTabId:
            action.type === "insert-before" ? action.targetTabId : undefined,
          releaseTabIds: multiIds,
        });
        setDropRenderPending(doc, true);
        return;
      }

      dispatchVtEvent(row, "vertical-tabs:reorder-item", {
        categoryId: reorderCatId,
        tabId: dragData,
        targetTabId: pdf.tabId,
        before: insertBefore,
      });
      // Single-tab drop plays the same release fade-in as the multi cascade
      // (N=1: the row fades in at full height).
      markMultiTabRelease(doc, [dragData]);
      markSmoothCollapseAfterDrop(doc, row.closest(".vertical-tabs-category"));
      markDropOutlineFade(
        doc,
        dropOutlineFadeTargetForElement(
          row.closest(".vertical-tabs-category") ??
            row.closest(".vertical-tabs-drop-zone"),
        ),
      );
      setDropRenderPending(doc, true);
    });
  }

  // ── Right-click context menu ──
  row.addEventListener("contextmenu", (e: MouseEvent) => {
    e.preventDefault();
    showItemContextMenu(doc, pdf, e.clientX, e.clientY);
  });

  row.addEventListener("dragstart", (event: DragEvent) => {
    setDropRenderPending(doc, false);
    row.classList.add("dragging");
    const draggedId = pdf.tabId || String(pdf.itemId);
    setDraggedTabId(doc, draggedId);
    setDragSourceCategoryId(doc, categoryId || "__uncategorized__");

    // Multi mode: dragging a SELECTED tab while the selection has 2+ entries.
    const multiIds =
      pdf.tabId && isTabSelected(doc, pdf.tabId) && getSelectedTabCount(doc) > 1
        ? getOrderedSelectedTabIds(doc)
        : null;
    if (multiIds) {
      startMultiDrag(doc, multiIds);
    } else if (getSelectedTabCount(doc) > 0) {
      // Edge case: dragging an UNSELECTED tab clears the selection (0.2s
      // fade) and proceeds with the normal single-tab drag.
      clearTabSelection(doc);
    }

    // Collapse the source row(s) after the drag image has been generated so
    // the original slot disappears visually, but the drag image still shows
    // content. Multi mode fades+collapses every selected row instead.
    const raf = doc.defaultView?.requestAnimationFrame;
    const collapseSource = () => {
      if (multiIds) {
        collapseMultiDragSource(doc);
      } else {
        row.classList.add("vt-drag-source-collapsed");
      }
    };
    if (raf) {
      raf(collapseSource);
    } else {
      collapseSource();
    }
    // Hide hover card when dragging
    const hoverCard = doc.getElementById(
      "vertical-tabs-hover-card",
    ) as HTMLElement | null;
    if (hoverCard) {
      hoverCard.style.opacity = "0";
      setTimeout(() => {
        if (hoverCard.style.opacity === "0") hoverCard.style.display = "none";
      }, 200);
    }
    const dataTransfer = event.dataTransfer;
    if (dataTransfer) {
      dataTransfer.setData("text/plain", draggedId);
      dataTransfer.setData(VT_DRAG_MIME_TYPE, "1");
      dataTransfer.effectAllowed = "move";
    }
    dispatchVtEvent(row, "vertical-tabs:item-dragstart", {
      itemId: pdf.itemId,
      tabId: pdf.tabId,
      categoryId,
    });
  });

  row.addEventListener("dragend", () => {
    row.classList.remove("dragging");
    setDraggedTabId(doc, null);
    setDragSourceCategoryId(doc, null);
    // Multi mode: clear the drag keys; on cancel the selected rows
    // fade/expand back. No-op for single drags.
    endMultiDrag(doc, isDropRenderPending(doc));
    if (!isDropRenderPending(doc)) {
      row.classList.remove("vt-drag-source-collapsed");
      clearAllItemDropIndicators(doc);
      clearDropPreview(doc);
    }
  });

  row.addEventListener("mouseenter", () => {
    dispatchVtEvent(row, "vertical-tabs:item-hover", {
      itemId: pdf.itemId,
      tabId: pdf.tabId,
    });
  });

  row.addEventListener("mouseleave", () => {
    dispatchVtEvent(row, "vertical-tabs:item-hover-end", {
      itemId: pdf.itemId,
      tabId: pdf.tabId,
    });
  });

  // Click to switch to this tab — unless a selection modifier is held:
  // Ctrl toggles the selection (no navigation), Shift selects the range from
  // the anchor. A plain click always clears the selection (0.2s fade) and,
  // on a selected row, still navigates to the tab.
  row.addEventListener("click", (e: MouseEvent) => {
    if (!pdf.tabId) return; // dormant item, no active tab
    // Don't switch if user was dragging
    if ((e.target as HTMLElement).closest(".vertical-tabs-resize-handle"))
      return;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      toggleTabSelection(doc, pdf.tabId);
      return;
    }
    if (e.shiftKey) {
      e.preventDefault();
      selectTabRange(doc, pdf.tabId, getOrderedVisibleTabIds(doc));
      return;
    }
    // Plain click: the selection clears (0.2s fade, replayed after the
    // navigation-triggered re-render) along with the range anchor, and
    // navigation proceeds.
    if (getSelectedTabCount(doc) > 0) {
      clearTabSelection(doc, { forRender: true });
    }
    // Hide hover card before switching tabs
    const hc = doc.getElementById(
      "vertical-tabs-hover-card",
    ) as HTMLElement | null;
    if (hc) {
      hc.style.opacity = "0";
      hc.style.display = "none";
    }
    const tabs = getZoteroTabs();
    if (tabs) {
      try {
        tabs.select(pdf.tabId);
      } catch {
        // select may fail if tab no longer exists
      }
    }
  });

  return row;
}

function createCategoryElement(
  doc: Document,
  category: Category,
  items: OpenedPDF[],
  collapsed: boolean,
): HTMLElement {
  const wrapper = createEl(doc, "div");
  wrapper.className = `vertical-tabs-category${collapsed ? " collapsed" : ""}`;
  wrapper.dataset.categoryId = category.id;
  // Color: #F2F2F2 is the "no color" default — skip it entirely
  const effectiveColor =
    category.color && category.color.toUpperCase() !== "#F2F2F2"
      ? category.color
      : undefined;
  const categoryColors = effectiveColor
    ? { light: effectiveColor, dark: lightToDark(effectiveColor) }
    : undefined;

  if (categoryColors) {
    wrapper.dataset.vtColorLight = categoryColors.light;
    wrapper.dataset.vtColorDark = categoryColors.dark;
    if (isDarkMode(doc)) {
      wrapper.style.background = categoryColors.dark;
    } else {
      wrapper.style.background = categoryColors.light;
    }
    wrapper.style.borderRadius = "4px";
  }

  const header = createEl(doc, "div");
  header.className = "vertical-tabs-category-header";
  header.draggable = true;

  // ── Category drag reorder ──
  header.addEventListener("dragstart", (e: DragEvent) => {
    const dt = e.dataTransfer;
    if (dt) {
      dt.setData("text/plain", `cat:${category.id}`);
      dt.setData(VT_DRAG_MIME_TYPE, "1");
      dt.effectAllowed = "move";
    }
    // Edge case: dragging a category header clears any tab selection (0.2s
    // fade) and proceeds with the normal category-reorder drag.
    if (getSelectedTabCount(doc) > 0) clearTabSelection(doc);
    // Smoothly collapse the source category (if expanded), then fade its
    // wrapper out so the original slot disappears. Persisted state is left
    // untouched; the pre-drag collapsed flag drives the release animation.
    startCategoryDragSource(doc, wrapper, category.id);
  });

  header.addEventListener("dragend", () => {
    // Cancel path (no successful drop): fade the source wrapper back in and
    // re-expand if needed, and slide the gap preview closed. Drop path: only
    // clears state; the gap stays put (its shifted geometry matches the
    // fresh DOM), the re-render destroys it, and the release animation takes
    // over with the bar handoff.
    const dropped = isCategoryDragDropped(doc);
    endCategoryDragSource(doc);
    if (!dropped) clearCategoryGapPreview(doc, true);
  });

  wrapper.addEventListener("dragover", (e: DragEvent) => {
    if (!isInternalVtDrag(e.dataTransfer)) return;
    const dt = e.dataTransfer;
    if (!dt || !dt.types.includes("text/plain")) return;
    // Only handle category drags
    const data = dt.getData("text/plain");
    if (!data?.startsWith("cat:")) return;
    e.preventDefault();

    const boundaryY = computeCategoryReorderBoundary(wrapper);
    applyCategoryGapPreview(
      doc,
      wrapper,
      e.clientY < boundaryY ? "before" : "after",
    );
  });

  wrapper.addEventListener("drop", (e: DragEvent) => {
    if (!isInternalVtDrag(e.dataTransfer)) return;
    const dt = e.dataTransfer;
    if (!dt) return;
    const data = dt.getData("text/plain");
    if (!data?.startsWith("cat:")) return;
    e.preventDefault();
    e.stopPropagation();
    // Do NOT clear the gap here: the shifted geometry of the old DOM matches
    // the fresh DOM exactly, so leaving it in place avoids a list flicker.
    // The release animation destroys it via the re-render and fades the bar.
    const boundaryY = computeCategoryReorderBoundary(wrapper);
    const fallback = computeCategoryReorderInsertBefore(
      e.clientY < boundaryY ? "before" : "after",
      category.id,
      getOrderedCategoryIds(doc),
    );
    dispatchCategoryReorderAtGap(doc, data.slice(4), fallback);
  });

  const chevron = createEl(doc, "span");
  chevron.className = "vertical-tabs-chevron";
  chevron.innerHTML = arrowIcon();
  header.appendChild(chevron);

  const name = createEl(doc, "span");
  name.className = "vertical-tabs-category-name";
  name.textContent = category.name;
  header.appendChild(name);

  const count = createEl(doc, "span");
  count.className = "vertical-tabs-count";
  count.textContent = String(items.length);
  header.appendChild(count);

  header.addEventListener("click", () => {
    const collapsed = toggleCategoryCollapseAnimated(doc, wrapper);
    dispatchVtEvent(wrapper, "vertical-tabs:category-toggle-collapsed", {
      categoryId: category.id,
      collapsed,
    });
    // Sync the folded-category highlight without rebuilding DOM.
    updateActiveCategoryHighlight(doc);
  });

  header.addEventListener("contextmenu", (event: MouseEvent) => {
    event.preventDefault();
    dispatchVtEvent(header, "vertical-tabs:category-context", {
      categoryId: category.id,
      x: (event as MouseEvent).clientX,
      y: (event as MouseEvent).clientY,
    });
  });

  wrapper.appendChild(header);

  const itemsContainer = createEl(doc, "div");
  itemsContainer.className = "vertical-tabs-items";
  for (const pdf of items) {
    itemsContainer.appendChild(
      createItemElement(doc, pdf, category.id, categoryColors),
    );
  }

  // Handle gaps / empty space inside the item list. When the cursor is between
  // items (or below the last item inside the expanded container) the event
  // target is `.vertical-tabs-items`, not an item. We compute the insert index
  // and use the same local shift preview as item rows, so the preview does not
  // jump between item-level and category-level shifts.
  itemsContainer.addEventListener("dragover", (e: DragEvent) => {
    if (!isInternalVtDrag(e.dataTransfer)) return;
    // Directly over an item: let the item's own listener handle it.
    if ((e.target as Element).closest(".vertical-tabs-item")) return;
    e.preventDefault();
    // The top strip is claimed by the quick-create-category drop zone.
    if (isNewCategoryZonePointer(doc, e.clientY)) return;

    const draggedTabId = getDraggedTabId(doc);
    if (!draggedTabId) return;

    const preview = getDragPreviewParams(doc);
    applyCategoryPreview(doc, wrapper, preview.source, 1);
    setWrapperDragOver(wrapper, doc);

    const visibleItems = getContainerVisibleItems(itemsContainer);
    if (visibleItems.length === 0) {
      clearItemShiftPreview(doc);
      clearAllItemDropIndicators(doc);
      setTopGapIndicator(itemsContainer, getDefaultItemHeight(itemsContainer));
      return;
    }

    const insertIndex = computeDropZoneInsertIndex(itemsContainer, e.clientY);
    if (insertIndex >= visibleItems.length) {
      // Append-to-end: no item shift, indicator centered below the last item.
      clearItemShiftPreview(doc);
      const lastItem = visibleItems[visibleItems.length - 1];
      const shiftHeight = lastItem.offsetHeight || 0;
      clearAllItemDropIndicators(doc);
      setItemDropIndicator(lastItem, false, shiftHeight);
      return;
    }

    const targetRow = visibleItems[insertIndex];
    const shiftHeight = applyDropPreview(
      doc,
      {
        type: "item",
        container: itemsContainer,
        targetRow,
        before: true,
        draggedTabId,
      },
      preview.exclude,
    );

    clearAllItemDropIndicators(doc);
    if (insertIndex === 0) {
      setTopGapIndicator(itemsContainer, shiftHeight);
    } else {
      const prevItem = visibleItems[insertIndex - 1];
      setItemDropIndicator(prevItem, false, shiftHeight);
    }
  });

  // Drop counterpart of the dragover above. Without it, drops on the gaps
  // (including the top gap shown for the FIRST position) bubble to the
  // wrapper's onDrop and the tab lands at the category END instead of where
  // the indicator showed. The insert index is computed exactly like the
  // dragover preview so the drop result matches what the user saw.
  itemsContainer.addEventListener("drop", (e: DragEvent) => {
    if (!isInternalVtDrag(e.dataTransfer)) return;
    const dragData = e.dataTransfer?.getData("text/plain");
    if (!dragData) return;
    // Category drags are handled by the wrapper's reorder-categories listener.
    if (dragData.startsWith("cat:")) return;
    e.preventDefault();
    e.stopPropagation();
    wrapper.classList.remove("drag-over");
    clearAllItemDropIndicators(doc);

    const visibleItems = getContainerVisibleItems(itemsContainer);
    const insertIndex = computeDropZoneInsertIndex(itemsContainer, e.clientY);
    const action = decideCategoryDropAction(
      insertIndex,
      visibleItems.map((el) => el.dataset.tabId || ""),
    );

    // Multi-tab drop: contiguous block at the computed index.
    const multiIds = getMultiDragTabIds(doc);
    if (multiIds?.length) {
      dispatchMultiDrop(doc, {
        categoryId: category.id,
        insertBeforeTabId:
          action.type === "insert-before" ? action.targetTabId : undefined,
        releaseTabIds: multiIds,
      });
      setDropRenderPending(doc, true);
      return;
    }

    if (action.type === "insert-before") {
      dispatchVtEvent(itemsContainer, "vertical-tabs:reorder-item", {
        categoryId: category.id,
        tabId: dragData,
        targetTabId: action.targetTabId,
        before: true,
      });
    } else {
      const byTab = getOpenedPDFs().find((p) => p.tabId === dragData);
      dispatchVtEvent(wrapper, "vertical-tabs:assign-item", {
        itemId: byTab ? byTab.itemId : Number(dragData),
        tabId: byTab ? dragData : undefined,
        categoryId: category.id,
      });
    }
    // Single-tab drop: same release fade-in as the multi cascade.
    markMultiTabRelease(doc, [dragData]);
    markSmoothCollapseAfterDrop(doc, wrapper);
    markDropOutlineFade(doc, dropOutlineFadeTargetForElement(wrapper));
    setDropRenderPending(doc, true);
  });

  // Make the remaining category area (header / truly empty wrapper space) a
  // drop target. When the cursor is over an item or inside the items container,
  // the dedicated listeners above handle the preview.
  const onDragOver = (e: DragEvent) => {
    if (!isInternalVtDrag(e.dataTransfer)) return;
    e.preventDefault();
    // The top strip is claimed by the quick-create-category drop zone.
    if (isNewCategoryZonePointer(doc, e.clientY)) return;

    // If the cursor is over an item or inside the items container, dedicated
    // listeners handle the local shift preview; do not fall back to
    // category-level preview here.
    const targetItem = (e.target as Element).closest(".vertical-tabs-item");
    if (targetItem) return;
    if (itemsContainer.contains(e.target as Node)) return;

    // Item drops only: category reorder drags get no dashed outline or
    // category preview (their indicator is the reorder gap).
    const dt = e.dataTransfer;
    const data = dt?.getData("text/plain");
    if (!data || data.startsWith("cat:")) return;

    // Highlight this category header / empty area.
    doc
      .querySelectorAll(".vertical-tabs-category.drag-over")
      .forEach((el: Element) => {
        if (el !== wrapper) el.classList.remove("drag-over");
      });
    wrapper.classList.add("drag-over");

    const draggedTabId = getDraggedTabId(doc) || data;
    const preview = getDragPreviewParams(doc);
    applyCategoryPreview(doc, wrapper, preview.source, 1);
    applyDropPreview(
      doc,
      {
        type: "category",
        categoryWrapper: wrapper,
        draggedTabId,
      },
      preview.exclude,
    );
  };
  const onDragLeave = (e: DragEvent) => {
    const related = e.relatedTarget as Node | null;
    // Only remove if we're actually leaving the wrapper.
    if (!wrapper.contains(related)) {
      wrapper.classList.remove("drag-over");
      clearItemShiftPreview(doc);
      clearAllItemDropIndicators(doc);
      // Only tear down category preview when we really leave the sidebar.
      // Moving from this category into another category/drop-zone inside the
      // sidebar should let applyCategoryPreview smoothly release the old
      // container, instead of clearing it instantly and causing a height jump.
      const sidebar = doc.getElementById(SIDEBAR_ID);
      if (!sidebar?.contains(related) && !isDropRenderPending(doc)) {
        clearDropPreview(doc);
      }
    }
  };
  const onDrop = (e: DragEvent) => {
    if (!isInternalVtDrag(e.dataTransfer)) return;
    e.preventDefault();
    wrapper.classList.remove("drag-over");
    clearAllItemDropIndicators(doc);
    const dragData = e.dataTransfer?.getData("text/plain");
    if (!dragData) return;
    // Category drags are handled by the reorder-categories listener above.
    if (dragData.startsWith("cat:")) return;

    // Dropping on the header / wrapper area places the tab at the FIRST
    // position of the category, matching the shift-all-rows preview shown
    // during dragover. An empty category falls back to append (its only
    // position).
    const visibleItems = getContainerVisibleItems(itemsContainer);
    const action = decideCategoryDropAction(
      0,
      visibleItems.map((el) => el.dataset.tabId || ""),
    );

    // Multi-tab drop: contiguous block at the first position.
    const multiIds = getMultiDragTabIds(doc);
    if (multiIds?.length) {
      dispatchMultiDrop(doc, {
        categoryId: category.id,
        insertBeforeTabId:
          action.type === "insert-before" ? action.targetTabId : undefined,
        releaseTabIds: multiIds,
      });
      setDropRenderPending(doc, true);
      return;
    }

    if (action.type === "insert-before") {
      dispatchVtEvent(wrapper, "vertical-tabs:reorder-item", {
        categoryId: category.id,
        tabId: dragData,
        targetTabId: action.targetTabId,
        before: true,
      });
    } else {
      // dragData is tabId (string) or itemId (number) for backward compat
      const byTab = getOpenedPDFs().find((p) => p.tabId === dragData);
      dispatchVtEvent(wrapper, "vertical-tabs:assign-item", {
        itemId: byTab ? byTab.itemId : Number(dragData),
        tabId: byTab ? dragData : undefined,
        categoryId: category.id,
      });
    }
    // Single-tab drop: same release fade-in as the multi cascade.
    markMultiTabRelease(doc, [dragData]);
    markSmoothCollapseAfterDrop(doc, wrapper);
    markDropOutlineFade(doc, dropOutlineFadeTargetForElement(wrapper));
    setDropRenderPending(doc, true);
  };

  wrapper.addEventListener("dragover", onDragOver);
  wrapper.addEventListener("dragleave", onDragLeave);
  wrapper.addEventListener("drop", onDrop);

  wrapper.appendChild(itemsContainer);

  return wrapper;
}

// ── Item right-click context menu ──

export function showItemContextMenu(
  doc: Document,
  pdf: OpenedPDF,
  x: number,
  y: number,
): void {
  // Close any open category context menu
  doc.getElementById("vt-reader-cat-menu")?.remove();
  // Close own menu if already open
  doc.getElementById("vertical-tabs-item-menu")?.remove();

  const mc = getContextMenuColors(doc);

  const menu = createEl(doc, "div");
  menu.id = "vertical-tabs-item-menu";
  menu.style.cssText = `
    position: fixed;
    left: ${x}px;
    top: ${y}px;
    z-index: 100002;
    padding: 4px 0;
    min-width: 140px;
    font-family: message-box;
    ${getPopupStyleSheet(doc)}
  `;

  const addItem = (label: string, action: () => void): void => {
    const el = createEl(doc, "div");
    el.textContent = label;
    el.style.cssText =
      "padding: 6px 16px; cursor: pointer; white-space: nowrap; font-family: message-box;";
    el.addEventListener("mouseenter", () => {
      el.style.background = mc.hoverBg;
    });
    el.addEventListener("mouseleave", () => {
      el.style.background = "";
    });
    el.addEventListener("click", () => {
      animatePopupClose(menu, () => setContextMenuOpen(doc, false));
      scheduleCollapse(doc);
      action();
    });
    menu.appendChild(el);
  };

  addItem(getString("vertical-tabs-show-in-library"), () => {
    const win = Zotero.getMainWindows()[0] as
      | _ZoteroTypes.MainWindow
      | undefined;
    const itemId = pdf.parentItemId ?? pdf.itemId;
    win?.ZoteroPane.selectItem(itemId);
  });

  addItem(getString("vertical-tabs-duplicate-tab"), () => {
    if (!pdf.tabId) return;
    // Reader tabs must be opened through Zotero.Reader so the PDF actually
    // loads; duplicating via Zotero_Tabs.add leaves a blank tab.
    if (pdf.type?.startsWith("reader")) {
      const item = Zotero.Items.get(pdf.itemId) as Zotero.Item | false;
      if (item) {
        void openItemAsNewTab(item, { doc, openInBackground: true });
      }
      return;
    }
    const ztabs = getZoteroTabs();
    const tabInfo = ztabs?.getTabInfo(pdf.tabId);
    if (ztabs && tabInfo) {
      try {
        ztabs.add({
          type: tabInfo.type,
          title: tabInfo.title,
          data: tabInfo.data,
          select: false,
        });
      } catch {
        // ignore
      }
    }
  });

  addItem(getString("vertical-tabs-close-tab"), () => {
    if (!pdf.tabId) return;
    const tabId = pdf.tabId;
    animateTabsExit(doc, [tabId], () => {
      const ztabs = getZoteroTabs();
      if (ztabs) {
        try {
          ztabs.close(tabId);
        } catch {
          // ignore
        }
      }
      // See the × button for why the silent untracking matters (flash back).
      removeTabsFromTrackingSilently([tabId]);
    });
  });

  addItem(getString("vertical-tabs-close-other-tabs"), () => {
    const tabIds = getOpenedPDFs()
      .map((t) => t.tabId)
      .filter((id): id is string => !!id && id !== pdf.tabId);
    if (!tabIds.length) return;
    // All rows collapse together, then one commit closes them all.
    animateTabsExit(doc, tabIds, () => {
      const ztabs = getZoteroTabs();
      if (!ztabs) return;
      for (const id of tabIds) {
        try {
          ztabs.close(id);
        } catch {
          // ignore
        }
      }
      // See the × button for why the silent untracking matters (flash back).
      removeTabsFromTrackingSilently(tabIds);
    });
  });

  doc.documentElement?.appendChild(menu);
  animatePopupOpen(menu, "top left");
  setContextMenuOpen(doc, true);

  const menuId = menu.id;
  const cleanup = () => {
    doc.removeEventListener("mousedown", closeMenu, true);
    for (const w of Zotero.getMainWindows())
      w.document.removeEventListener("mousedown", closeMenu, true);
  };
  const closeMenu = (e: MouseEvent) => {
    if (!menu.isConnected) {
      cleanup();
      return;
    }
    const target = e.target as HTMLElement;
    // Don't close if clicking inside the menu
    if (target.closest(`#${menuId}`)) return;
    // Click inside VT → close menu, keep VT open
    if (target.closest(`#${SIDEBAR_ID}`)) {
      animatePopupClose(menu, () => setContextMenuOpen(doc, false));
      cleanup();
      return;
    }
    animatePopupClose(menu, () => setContextMenuOpen(doc, false));
    scheduleCollapse(doc);
    cleanup();
  };
  setTimeout(() => {
    doc.addEventListener("mousedown", closeMenu, true);
    for (const w of Zotero.getMainWindows())
      w.document.addEventListener("mousedown", closeMenu, true);
  }, 150);
}

export function renderCategories(
  doc: Document,
  container: HTMLElement,
  data: VerticalTabsData,
  pdfs: OpenedPDF[],
): void {
  // Categories are rendered from persisted data, including collapsed state.
  // This avoids losing manual fold/unfold state when VT collapses/expands.
  container.innerHTML = "";

  // Container-level category-reorder handlers (end-of-list gap + drop), bound
  // once — the container element itself persists across re-renders.
  attachCategoryContainerDragEvents(doc, container);
  // Sidebar-level click-to-clear for the multi selection, bound once per doc.
  attachSelectionEvents(doc);

  // Categories only contain currently open tabs, so match purely by tabId.
  const assignedTabIds = new Set(
    data.categories.flatMap((c) => c.tabIds).filter(Boolean),
  );

  const categorizedPdfs = data.categories.map((category) => {
    const items = pdfs.filter((pdf) => category.tabIds.includes(pdf.tabId));
    // Sort items by category tabIds order
    const orderMap = new Map(category.tabIds.map((id, i) => [id, i]));
    items.sort((a, b) => {
      const ai = orderMap.get(a.tabId) ?? 9999;
      const bi = orderMap.get(b.tabId) ?? 9999;
      return ai - bi;
    });
    return { category, items };
  });
  const uncategorizedPdfs = pdfs.filter(
    (pdf) => !assignedTabIds.has(pdf.tabId),
  );

  // Sort uncategorized by persisted order, new items go to end
  const orderMap = new Map(data.uncategorizedOrder.map((id, i) => [id, i]));
  uncategorizedPdfs.sort((a, b) => {
    const ai = orderMap.get(a.tabId) ?? 9999;
    const bi = orderMap.get(b.tabId) ?? 9999;
    return ai - bi;
  });

  // Only show empty state when there are no categories AND no opened tabs.
  // Render it as a full-height drop zone so external/internal drags still have
  // a target and the uncategorized drop-zone border is visible.
  if (data.categories.length === 0 && pdfs.length === 0) {
    const dropZone = createEl(doc, "div");
    dropZone.className =
      "vertical-tabs-drop-zone vertical-tabs-drop-zone-empty";

    const empty = createEl(doc, "div");
    empty.className = "vertical-tabs-empty";
    empty.textContent = getString("vertical-tabs-empty");
    dropZone.appendChild(empty);

    attachDropZoneDragEvents(doc, dropZone);

    container.appendChild(dropZone);
    return;
  }

  const sortedCategories = [...data.categories].sort(
    (a, b) => a.order - b.order,
  );

  for (const category of sortedCategories) {
    const items =
      categorizedPdfs.find((entry) => entry.category.id === category.id)
        ?.items || [];
    const collapsed = category.collapsed ?? false;
    container.appendChild(
      createCategoryElement(doc, category, items, collapsed),
    );
  }

  if (uncategorizedPdfs.length > 0) {
    // Separator line between categories and uncategorized items
    if (sortedCategories.length > 0) {
      const sep = createEl(doc, "div");
      sep.className = "vertical-tabs-separator";
      container.appendChild(sep);
    }

    // Drop zone: dropping here removes item from all categories
    const dropZone = createEl(doc, "div");
    dropZone.className = "vertical-tabs-drop-zone";
    attachDropZoneDragEvents(doc, dropZone);

    // Render uncategorized items in the drop zone
    for (const pdf of uncategorizedPdfs) {
      dropZone.appendChild(createItemElement(doc, pdf, null));
    }
    container.appendChild(dropZone);
  } else if (sortedCategories.length > 0) {
    // Show drop zone even when empty, so items can be removed from categories
    const dropZone = createEl(doc, "div");
    dropZone.className = "vertical-tabs-drop-zone";
    attachDropZoneDragEvents(doc, dropZone);

    const sep = createEl(doc, "div");
    sep.className = "vertical-tabs-separator";
    container.appendChild(sep);
    container.appendChild(dropZone);
  }

  // Sync the reader-tab folded-category highlight after rebuilding DOM.
  updateActiveCategoryHighlight(doc);
}

let _searchQuery = "";

/**
 * Update the reader-loaded indicator class on existing tab rows without
 * rebuilding the whole categories DOM, so opacity transitions play smoothly.
 */
function updateReaderLoadedIndicators(doc: Document): void {
  doc.querySelectorAll(".vertical-tabs-item").forEach((el: Element) => {
    const row = el as HTMLElement;
    const tabId = row.dataset.tabId;
    const tabType = row.dataset.tabType;
    if (!tabId || !tabType?.startsWith("reader")) return;
    if (isShowReaderLoadedIndicatorEnabled() && isReaderLoaded(tabId)) {
      row.classList.add("reader-loaded");
    } else {
      row.classList.remove("reader-loaded");
    }
  });
}

/**
 * Show or hide the reader-loaded indicator for a specific tab row without
 * rebuilding the whole categories DOM, so opacity transitions play smoothly.
 */
function setReaderLoadedIndicatorForTab(
  doc: Document,
  tabId: string,
  show: boolean,
): void {
  const row = doc.querySelector(
    `.vertical-tabs-item[data-tab-id="${CSS.escape(tabId)}"]`,
  ) as HTMLElement | null;
  if (!row) return;
  if (!isShowReaderLoadedIndicatorEnabled()) {
    row.classList.remove("reader-loaded");
    return;
  }
  if (show) {
    row.classList.add("reader-loaded");
  } else {
    row.classList.remove("reader-loaded");
  }
}

export function subscribeToRenderEvents(
  doc: Document,
  getData: () => Promise<VerticalTabsData>,
  getPDFs: () => OpenedPDF[],
): void {
  const handler = async () => {
    const container = getCategoriesContainer(doc);
    if (!container) return;
    const data = await getData();
    let pdfs = getPDFs();
    // Filter by search query (matches title or publication info)
    if (_searchQuery) {
      pdfs = pdfs.filter((pdf) => {
        const item = Zotero.Items.get(pdf.parentItemId ?? pdf.itemId);
        const info = item ? getItemInfo(item as Zotero.Item) : null;
        const searchText = [
          pdf.title,
          info?.title,
          info?.journal,
          info?.university,
          info?.extra,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return searchText.includes(_searchQuery);
      });
    }
    renderCategories(doc, container, data, pdfs);
    // Replay the selection fade-out on the fresh rows: the plain-click
    // navigation just re-rendered and would otherwise have cut the 0.2s
    // fade short when the old rows were destroyed.
    const selectionFadeOut = consumeSelectionFadeOut(doc);
    if (selectionFadeOut) replaySelectionFadeOut(container, selectionFadeOut);
    // Replay the dashed-outline fade-out on the freshly rendered drop target:
    // the drop-triggered re-render destroys the outlined element, which would
    // otherwise make the outline vanish instantly. Consumed by the FIRST
    // render after the drop, for internal and external drops alike.
    const outlineFadeTarget = consumeDropOutlineFade(doc);
    if (outlineFadeTarget) playDropOutlineFade(container, outlineFadeTarget);
    // Quick-create flow: slide-down + fade-in entrance for the new category.
    const entranceId = consumeNewCategoryEntrance(doc);
    if (entranceId) playNewCategoryEntrance(doc, container, entranceId);
    // Color-change flow: cross-fade the category background from the old
    // color to the new one on the freshly rendered wrapper.
    const colorFade = consumeCategoryColorFade(doc);
    if (colorFade) playCategoryColorFade(doc, container, colorFade);
    // Category reorder flow: release animation for the moved category (fade
    // the header in at the gap position, then expand if it was expanded).
    const catRelease = consumeCategoryRelease(doc);
    if (catRelease) playCategoryRelease(doc, container, catRelease);
    // Multi-tab flow: cascade release — first row fades in, then the rest of
    // the moved block unfolds with a stagger.
    const multiRelease = consumeMultiTabRelease(doc);
    if (multiRelease) playMultiTabRelease(doc, container, multiRelease);
    if (isDropRenderPending(doc)) {
      clearDropPreview(doc);
      setDropRenderPending(doc, false);
      const smoothCollapseId = consumeSmoothCollapseAfterDrop(doc);
      if (smoothCollapseId) {
        const target = container.querySelector(
          `.vertical-tabs-category[data-category-id="${CSS.escape(smoothCollapseId)}"]`,
        ) as HTMLElement | null;
        if (target) {
          // The drop landed in a collapsed (preview-expanded) category.
          // Recreate the expanded state the user was looking at — chevron at
          // 90deg, items at natural height — and commit it with a reflow, then
          // play the standard collapse animation instead of snapping shut.
          // Everything runs synchronously before the next paint, so no
          // intermediate expanded frame is ever shown; the persisted
          // collapsed state stays untouched.
          target.classList.remove("collapsed");
          // The folded-header highlight bar should stay hidden while the
          // category is (temporarily) expanded: remove it before the first
          // paint and bring it back — fading in — once the collapse
          // animation completes. updateActiveCategoryHighlight recomputes
          // from the live DOM, so it stays correct if the user re-expands
          // or another render happens in between.
          target.classList.remove(HIGHLIGHT_CLASS);
          doc.defaultView?.setTimeout(() => {
            if (target.isConnected) updateActiveCategoryHighlight(doc);
          }, COLLAPSE_ANIMATION_MS);
          void target.offsetHeight;
          toggleCategoryCollapseAnimated(doc, target);
        }
      }
    }
  };

  const readerIndicatorHandler = () => updateReaderLoadedIndicators(doc);
  const readerLoadingHandler = ((e: CustomEvent) => {
    const tabId = (e.detail?.tabId as string) || "";
    if (tabId) {
      setReaderLoadedIndicatorForTab(doc, tabId, true);
    }
  }) as EventListener;
  const readerReleasedHandler = ((e: CustomEvent) => {
    const tabId = (e.detail?.tabId as string) || "";
    if (tabId) {
      setReaderLoadedIndicatorForTab(doc, tabId, false);
    }
  }) as EventListener;

  doc.addEventListener("vertical-tabs:pdfs-changed", handler);
  doc.addEventListener("vertical-tabs:data-changed", handler);
  doc.addEventListener("vertical-tabs:reader-loading", readerLoadingHandler);
  doc.addEventListener("vertical-tabs:reader-released", readerReleasedHandler);
  doc.addEventListener("vertical-tabs:reader-restored", readerIndicatorHandler);
  // Collapse/expand should not rebuild the categories DOM: we want the
  // existing content to be clipped by the width animation instead of
  // vanishing instantly. Only render when becoming visible (initial load).
  doc.addEventListener("vertical-tabs:visibility-changed", ((
    e: CustomEvent,
  ) => {
    if (e.detail?.visible === false) return;
    void handler();
  }) as EventListener);

  // Search event
  doc.addEventListener("vertical-tabs:search", ((e: CustomEvent) => {
    _searchQuery = (e.detail?.query as string) || "";
    void handler();
  }) as EventListener);

  (doc as any).__verticalTabsRenderHandler = handler;
  (doc as any).__verticalTabsReaderLoadingHandler = readerLoadingHandler;
  (doc as any).__verticalTabsReaderReleasedHandler = readerReleasedHandler;
  (doc as any).__verticalTabsReaderRestoredHandler = readerIndicatorHandler;
}

export function unsubscribeFromRenderEvents(doc: Document): void {
  const handler = (doc as any).__verticalTabsRenderHandler;
  const readerLoadingHandler = (doc as any).__verticalTabsReaderLoadingHandler;
  const readerReleasedHandler = (doc as any)
    .__verticalTabsReaderReleasedHandler;
  const readerRestoredHandler = (doc as any)
    .__verticalTabsReaderRestoredHandler;
  if (handler) {
    doc.removeEventListener("vertical-tabs:pdfs-changed", handler);
    doc.removeEventListener("vertical-tabs:data-changed", handler);
    doc.removeEventListener("vertical-tabs:visibility-changed", handler);
    doc.removeEventListener("vertical-tabs:search", handler);
    delete (doc as any).__verticalTabsRenderHandler;
  }
  if (readerLoadingHandler) {
    doc.removeEventListener(
      "vertical-tabs:reader-loading",
      readerLoadingHandler,
    );
    delete (doc as any).__verticalTabsReaderLoadingHandler;
  }
  if (readerReleasedHandler) {
    doc.removeEventListener(
      "vertical-tabs:reader-released",
      readerReleasedHandler,
    );
    delete (doc as any).__verticalTabsReaderReleasedHandler;
  }
  if (readerRestoredHandler) {
    doc.removeEventListener(
      "vertical-tabs:reader-restored",
      readerRestoredHandler,
    );
    delete (doc as any).__verticalTabsReaderRestoredHandler;
  }
  _searchQuery = "";
}

// ── Dark mode real-time category color update ──

/**
 * Update all category wrapper backgrounds based on current dark/light mode.
 * Safe to call on any document (main window or reader sandbox).
 */
export function applyCategoryColors(doc: Document, isDark: boolean): void {
  const wrappers = doc.querySelectorAll(".vertical-tabs-category");
  wrappers.forEach((wrapper: Element) => {
    const el = wrapper as HTMLElement;
    const light = el.dataset.vtColorLight;
    const dark = el.dataset.vtColorDark;
    if (isDark && dark) {
      el.style.background = dark;
      el.style.borderRadius = "4px";
    } else if (!isDark && light) {
      el.style.background = light;
      el.style.borderRadius = "4px";
    } else {
      el.style.background = "";
      el.style.borderRadius = "";
    }
  });

  // Sync close-button gradient backgrounds for colored categories.
  doc.querySelectorAll(".vertical-tabs-item-close").forEach((btn: Element) => {
    const el = btn as HTMLElement;
    const light = el.dataset.vtColorLight;
    const dark = el.dataset.vtColorDark;
    if (isDark && dark) {
      el.style.setProperty("--vt-close-bg", dark);
    } else if (!isDark && light) {
      el.style.setProperty("--vt-close-bg", light);
    } else {
      el.style.removeProperty("--vt-close-bg");
    }
  });
}

/**
 * Install a matchMedia listener that keeps category colors in sync with
 * the system dark/light mode. Stores cleanup on `doc.__vtDarkModeCleanup`.
 */
export function setupCategoryDarkMode(doc: Document): void {
  const existing = (doc as any).__vtDarkModeCleanup as (() => void) | undefined;
  if (existing) existing();

  const cleanup = watchDarkMode(doc, (isDark) => {
    applyCategoryColors(doc, isDark);
  });
  (doc as any).__vtDarkModeCleanup = cleanup;
}

/**
 * Remove the matchMedia listener installed by setupCategoryDarkMode.
 */
export function teardownCategoryDarkMode(doc: Document): void {
  const cleanup = (doc as any).__vtDarkModeCleanup as (() => void) | undefined;
  if (cleanup) {
    cleanup();
    delete (doc as any).__vtDarkModeCleanup;
  }
}

export { getItemInfo };
export type { ItemInfo };
