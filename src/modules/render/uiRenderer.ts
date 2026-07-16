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
} from "../track/itemTracker";
import {
  isReaderLoaded,
  isShowReaderLoadedIndicatorEnabled,
} from "../track/readerRelease";
import { openItemAsNewTab } from "../track/tabOpener";
import { dispatchVtEvent } from "../core/events";
import { updateActiveCategoryHighlight } from "./categoryHighlight";
import { isInternalVtDrag, VT_DRAG_MIME_TYPE } from "../drag/dropTarget";
import { applyDropPreview, clearDropPreview } from "../drag/dropPreview";
import { applyCategoryPreview } from "../drag/categoryPreview";
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

const DRAGGED_TAB_ID_KEY = "__vtDraggedTabId";
const DRAG_SOURCE_CATEGORY_ID_KEY = "__vtDragSourceCategoryId";

function setDraggedTabId(doc: Document, tabId: string | null): void {
  (doc as any)[DRAGGED_TAB_ID_KEY] = tabId;
}

function getDraggedTabId(doc: Document): string | null {
  return (doc as any)[DRAGGED_TAB_ID_KEY] || null;
}

function setDragSourceCategoryId(
  doc: Document,
  categoryId: string | null,
): void {
  (doc as any)[DRAG_SOURCE_CATEGORY_ID_KEY] = categoryId;
}

function getDragSourceCategoryId(doc: Document): string | null {
  return (doc as any)[DRAG_SOURCE_CATEGORY_ID_KEY] || null;
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
    (el) => !el.classList.contains("vt-drag-source-collapsed"),
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

function attachDropZoneDragEvents(doc: Document, dropZone: HTMLElement): void {
  dropZone.addEventListener("dragover", (e: DragEvent) => {
    if (!isInternalVtDrag(e.dataTransfer)) return;
    e.preventDefault();
    doc
      .querySelectorAll(".vertical-tabs-category.drag-over")
      .forEach((el: Element) => el.classList.remove("drag-over"));
    dropZone.classList.add("drag-over");

    const targetItem = (e.target as Element).closest(".vertical-tabs-item");
    if (targetItem) return;

    applyCategoryPreview(doc, dropZone, getDragSourceCategoryId(doc), 1);
    clearAllItemDropIndicators(doc);

    const visibleItems = getContainerVisibleItems(dropZone);
    const draggedTabId = getDraggedTabId(doc);
    if (!draggedTabId) return;

    if (visibleItems.length === 0) {
      setEmptyDropZoneIndicator(dropZone);
      clearDropPreview(doc);
      return;
    }

    const insertIndex = computeDropZoneInsertIndex(dropZone, e.clientY);
    if (insertIndex >= visibleItems.length) {
      // Blank append area below the last tag: no item shift, indicator centered
      // in the one-tag-height blank space.
      clearDropPreview(doc);
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
    const shiftHeight = applyDropPreview(doc, {
      type: "item",
      container: dropZone,
      targetRow,
      before: true,
      draggedTabId,
    });
    if (insertIndex === 0) {
      setTopGapIndicator(dropZone, shiftHeight);
    } else {
      const prevItem = visibleItems[insertIndex - 1];
      setItemDropIndicator(prevItem, false, shiftHeight);
    }
  });

  dropZone.addEventListener("dragleave", (e: DragEvent) => {
    if (!dropZone.contains(e.relatedTarget as Node)) {
      dropZone.classList.remove("drag-over");
      clearAllItemDropIndicators(doc);
      clearDropPreview(doc);
    }
  });

  dropZone.addEventListener("drop", (e: DragEvent) => {
    if (!isInternalVtDrag(e.dataTransfer)) return;
    e.preventDefault();
    dropZone.classList.remove("drag-over");
    clearAllItemDropIndicators(doc);
    clearDropPreview(doc);
    const dragData = e.dataTransfer?.getData("text/plain");
    if (!dragData) return;

    const visibleItems = getContainerVisibleItems(dropZone);
    if (visibleItems.length === 0) {
      // Empty drop-zone: move the item into uncategorized at the end.
      dispatchVtEvent(dropZone, "vertical-tabs:reorder-item", {
        categoryId: "__uncategorized__",
        tabId: dragData,
        targetTabId: "",
        before: false,
      });
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
    const tabs = getZoteroTabs();
    if (tabs && pdf.tabId) {
      try {
        tabs.close(pdf.tabId);
      } catch {
        // ignore
      }
    }
    // Hide hover card immediately so it doesn't linger after the tab is gone
    const hc = doc.getElementById(
      "vertical-tabs-hover-card",
    ) as HTMLElement | null;
    if (hc) {
      hc.style.opacity = "0";
      hc.style.display = "none";
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
    const tabs = getZoteroTabs();
    if (tabs) {
      try {
        tabs.close(pdf.tabId);
      } catch {
        // ignore
      }
    }
    const hc = doc.getElementById(
      "vertical-tabs-hover-card",
    ) as HTMLElement | null;
    if (hc) {
      hc.style.opacity = "0";
      hc.style.display = "none";
    }
  });

  // ── Drag reorder (within category or uncategorized) ──
  const reorderCatId = categoryId || "__uncategorized__";
  {
    row.addEventListener("dragover", (e: DragEvent) => {
      if (!isInternalVtDrag(e.dataTransfer)) return;
      e.preventDefault();
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
      if (targetWrapper) {
        applyCategoryPreview(
          doc,
          targetWrapper,
          getDragSourceCategoryId(doc),
          1,
        );
        setWrapperDragOver(targetWrapper as HTMLElement, doc);
      }

      const shiftHeight = applyDropPreview(doc, {
        type: "item",
        container,
        targetRow: row,
        before,
        draggedTabId,
      });

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
        clearAllItemDropIndicators(doc);
        clearDropPreview(doc);
      }
    });

    row.addEventListener("drop", (e: DragEvent) => {
      if (!isInternalVtDrag(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      clearItemDropIndicator(row);
      clearAllItemDropIndicators(doc);
      clearDropPreview(doc);
      const dragData = e.dataTransfer?.getData("text/plain");
      if (!dragData) return;
      const rect = row.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      const insertBefore = e.clientY < midY;
      dispatchVtEvent(row, "vertical-tabs:reorder-item", {
        categoryId: reorderCatId,
        tabId: dragData,
        targetTabId: pdf.tabId,
        before: insertBefore,
      });
    });
  }

  // ── Right-click context menu ──
  row.addEventListener("contextmenu", (e: MouseEvent) => {
    e.preventDefault();
    showItemContextMenu(doc, pdf, e.clientX, e.clientY);
  });

  row.addEventListener("dragstart", (event: DragEvent) => {
    row.classList.add("dragging");
    const draggedId = pdf.tabId || String(pdf.itemId);
    setDraggedTabId(doc, draggedId);
    setDragSourceCategoryId(doc, categoryId || "__uncategorized__");
    // Collapse the source row after the drag image has been generated so the
    // original slot disappears visually, but the drag image still shows content.
    const raf = doc.defaultView?.requestAnimationFrame;
    if (raf) {
      raf(() => {
        row.classList.add("vt-drag-source-collapsed");
      });
    } else {
      row.classList.add("vt-drag-source-collapsed");
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
    row.classList.remove("dragging", "vt-drag-source-collapsed");
    setDraggedTabId(doc, null);
    setDragSourceCategoryId(doc, null);
    clearAllItemDropIndicators(doc);
    clearDropPreview(doc);
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

  // Click to switch to this tab
  row.addEventListener("click", (e: MouseEvent) => {
    if (!pdf.tabId) return; // dormant item, no active tab
    // Don't switch if user was dragging
    if ((e.target as HTMLElement).closest(".vertical-tabs-resize-handle"))
      return;
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
    // Auto-collapse on drag start
    wrapper.classList.add("collapsed");
    const dt = e.dataTransfer;
    if (dt) {
      dt.setData("text/plain", `cat:${category.id}`);
      dt.setData(VT_DRAG_MIME_TYPE, "1");
      dt.effectAllowed = "move";
    }
  });

  wrapper.addEventListener("dragover", (e: DragEvent) => {
    if (!isInternalVtDrag(e.dataTransfer)) return;
    const dt = e.dataTransfer;
    if (!dt || !dt.types.includes("text/plain")) return;
    // Only handle category drags
    const data = dt.getData("text/plain");
    if (!data?.startsWith("cat:")) return;
    e.preventDefault();

    // Clear indicators from all other categories
    doc
      .querySelectorAll(
        ".vertical-tabs-category.cat-drop-before, .vertical-tabs-category.cat-drop-after",
      )
      .forEach((el: Element) => {
        if (el !== wrapper) {
          el.classList.remove("cat-drop-before", "cat-drop-after");
        }
      });

    const rect = wrapper.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    wrapper.classList.remove("cat-drop-before", "cat-drop-after");
    wrapper.classList.add(
      e.clientY < midY ? "cat-drop-before" : "cat-drop-after",
    );
  });

  wrapper.addEventListener("dragleave", (e: DragEvent) => {
    if (!wrapper.contains(e.relatedTarget as Node)) {
      wrapper.classList.remove("cat-drop-before", "cat-drop-after");
    }
  });

  wrapper.addEventListener("drop", (e: DragEvent) => {
    if (!isInternalVtDrag(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    wrapper.classList.remove("cat-drop-before", "cat-drop-after");

    const dt = e.dataTransfer;
    if (!dt) return;
    const data = dt.getData("text/plain");
    if (!data?.startsWith("cat:")) return;
    const draggedCatId = data.slice(4);

    if (draggedCatId === category.id) return;

    const rect = wrapper.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    dispatchVtEvent(wrapper, "vertical-tabs:reorder-categories", {
      categoryId: draggedCatId,
      insertBeforeCategoryId: e.clientY < midY ? category.id : null,
    });
  });

  const chevron = createEl(doc, "span");
  chevron.className = "vertical-tabs-chevron";
  chevron.textContent = "<";
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
    const collapsed = !wrapper.classList.contains("collapsed");
    wrapper.classList.toggle("collapsed");
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

    const draggedTabId = getDraggedTabId(doc);
    if (!draggedTabId) return;

    applyCategoryPreview(doc, wrapper, getDragSourceCategoryId(doc), 1);
    setWrapperDragOver(wrapper, doc);

    const visibleItems = getContainerVisibleItems(itemsContainer);
    if (visibleItems.length === 0) {
      clearDropPreview(doc);
      clearAllItemDropIndicators(doc);
      setTopGapIndicator(itemsContainer, getDefaultItemHeight(itemsContainer));
      return;
    }

    const insertIndex = computeDropZoneInsertIndex(itemsContainer, e.clientY);
    if (insertIndex >= visibleItems.length) {
      // Append-to-end: no item shift, indicator centered below the last item.
      clearDropPreview(doc);
      const lastItem = visibleItems[visibleItems.length - 1];
      const shiftHeight = lastItem.offsetHeight || 0;
      clearAllItemDropIndicators(doc);
      setItemDropIndicator(lastItem, false, shiftHeight);
      return;
    }

    const targetRow = visibleItems[insertIndex];
    const shiftHeight = applyDropPreview(doc, {
      type: "item",
      container: itemsContainer,
      targetRow,
      before: true,
      draggedTabId,
    });

    clearAllItemDropIndicators(doc);
    if (insertIndex === 0) {
      setTopGapIndicator(itemsContainer, shiftHeight);
    } else {
      const prevItem = visibleItems[insertIndex - 1];
      setItemDropIndicator(prevItem, false, shiftHeight);
    }
  });

  // Make the remaining category area (header / truly empty wrapper space) a
  // drop target. When the cursor is over an item or inside the items container,
  // the dedicated listeners above handle the preview.
  const onDragOver = (e: DragEvent) => {
    if (!isInternalVtDrag(e.dataTransfer)) return;
    e.preventDefault();

    // If the cursor is over an item or inside the items container, dedicated
    // listeners handle the local shift preview; do not fall back to
    // category-level preview here.
    const targetItem = (e.target as Element).closest(".vertical-tabs-item");
    if (targetItem) return;
    if (itemsContainer.contains(e.target as Node)) return;

    // Highlight this category header / empty area.
    doc
      .querySelectorAll(".vertical-tabs-category.drag-over")
      .forEach((el: Element) => {
        if (el !== wrapper) el.classList.remove("drag-over");
      });
    wrapper.classList.add("drag-over");

    const dt = e.dataTransfer;
    const data = dt?.getData("text/plain");
    if (data && !data.startsWith("cat:")) {
      const draggedTabId = getDraggedTabId(doc) || data;
      applyCategoryPreview(doc, wrapper, getDragSourceCategoryId(doc), 1);
      applyDropPreview(doc, {
        type: "category",
        categoryWrapper: wrapper,
        draggedTabId,
      });
    }
  };
  const onDragLeave = (e: DragEvent) => {
    // Only remove if we're actually leaving the wrapper
    if (!wrapper.contains(e.relatedTarget as Node)) {
      wrapper.classList.remove("drag-over");
      clearAllItemDropIndicators(doc);
      clearDropPreview(doc);
    }
  };
  const onDrop = (e: DragEvent) => {
    if (!isInternalVtDrag(e.dataTransfer)) return;
    e.preventDefault();
    wrapper.classList.remove("drag-over");
    clearAllItemDropIndicators(doc);
    clearDropPreview(doc);
    const dragData = e.dataTransfer?.getData("text/plain");
    if (!dragData) return;
    // dragData is tabId (string) or itemId (number) for backward compat
    const byTab = getOpenedPDFs().find((p) => p.tabId === dragData);
    dispatchVtEvent(wrapper, "vertical-tabs:assign-item", {
      itemId: byTab ? byTab.itemId : Number(dragData),
      tabId: byTab ? dragData : undefined,
      categoryId: category.id,
    });
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
      menu.remove();
      setContextMenuOpen(doc, false);
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
    const ztabs = getZoteroTabs();
    if (ztabs) {
      try {
        ztabs.close(pdf.tabId);
      } catch {
        // ignore
      }
    }
  });

  addItem(getString("vertical-tabs-close-other-tabs"), () => {
    const ztabs = getZoteroTabs();
    if (!ztabs) return;
    const allTabs = getOpenedPDFs();
    for (const t of allTabs) {
      if (t.tabId && t.tabId !== pdf.tabId) {
        try {
          ztabs.close(t.tabId);
        } catch {
          // ignore
        }
      }
    }
  });

  doc.documentElement?.appendChild(menu);
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
      menu.remove();
      setContextMenuOpen(doc, false);
      cleanup();
      return;
    }
    menu.remove();
    setContextMenuOpen(doc, false);
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
