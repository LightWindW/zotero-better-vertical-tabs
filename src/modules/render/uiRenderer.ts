import { config } from "../../../package.json";
import { getString } from "../../utils/locale";
import {
  collapseFloatingSidebar,
  getCategoriesContainer,
  HOVER_STRIP_CLASS,
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
import { dispatchVtEvent } from "../core/events";
import { getReaderIconHtml, isDataUri } from "./itemIcons";
import { bindReaderItemDrag } from "../drag/readerDrag";
import {
  lightToDark,
  isDarkMode,
  watchDarkMode,
  getContextMenuColors,
} from "./colorUtils";

const _readerDocLogged = new WeakSet<Document>();

interface ItemInfo {
  title: string;
  authors: string;
  year: string;
  journal: string;
  university: string;
  extra: string;
  tags: string[];
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

function createEl(doc: Document, tag: string): HTMLElement {
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
  const isReaderDoc = doc.URL?.startsWith("resource://zotero/reader/");
  row.className =
    "vertical-tabs-item" +
    (pdf.tabId && pdf.tabId === getSelectedTabId() ? " active" : "");
  // Reader sandbox uses manual mouse drag; HTML5 DnD draggable would steal events.
  row.draggable = !isReaderDoc;
  if (isReaderDoc) {
    bindReaderItemDrag(row);
    if (!_readerDocLogged.has(doc)) {
      _readerDocLogged.add(doc);
      try {
        Zotero.logError(
          new Error(
            "[BVT] render reader item docURL=" +
              doc.URL +
              " draggable=" +
              row.draggable,
          ),
        );
      } catch {
        // ignore
      }
    }
  }
  row.dataset.itemId = String(pdf.itemId);
  row.dataset.tabId = pdf.tabId;
  row.dataset.tabType = pdf.type;
  if (categoryId) row.dataset.categoryId = categoryId;

  // ── Left: Zotero item type icon ──
  const isNote = pdf.type === "note" || pdf.type?.startsWith("note");
  const iconItemId = isNote ? pdf.itemId : (pdf.parentItemId ?? pdf.itemId);

  if (isReaderDoc) {
    // Reader sandbox: chrome://zotero/skin/ icons blocked by CSP
    // → use local inline SVG icons from itemIcons module.
    // Priority: pre-cached parentItemType → item already in memory → empty
    let itemType = isNote ? "note" : pdf.parentItemType || "";
    if (!itemType && item) {
      itemType = (item as Zotero.Item).itemType;
    }
    const iconHtml = getReaderIconHtml(itemType);
    if (iconHtml) {
      if (isDataUri(iconHtml)) {
        // Cached native Zotero icon → render as <img> (data: URI, CSP-safe)
        const imgEl = createEl(doc, "img") as HTMLImageElement;
        imgEl.className = "vertical-tabs-item-icon";
        imgEl.src = iconHtml;
        row.appendChild(imgEl);
      } else {
        // Inline SVG fallback → render as div.innerHTML
        const iconWrapper = createEl(doc, "div");
        iconWrapper.className = "vertical-tabs-item-icon";
        iconWrapper.innerHTML = iconHtml;
        row.appendChild(iconWrapper);
      }
    } else {
      // Unknown type: inline text fallback (never load chrome:// img)
      const fb = createEl(doc, "div");
      fb.className = "vertical-tabs-item-icon-fallback";
      fb.textContent = isNote ? "N" : "P";
      fb.style.cssText =
        "width:16px;height:16px;border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff;background:" +
        (isNote ? "#f39c12" : "#e74c3c");
      row.appendChild(fb);
    }
  } else {
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
  const isReader = pdf.type?.startsWith("reader");
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
  });
  row.appendChild(closeBtn);

  // ── Drag reorder (within category or uncategorized) ──
  const reorderCatId = categoryId || "__uncategorized__";
  {
    row.addEventListener("dragover", (e: DragEvent) => {
      e.preventDefault();
      const rect = row.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      const before = e.clientY < midY;
      const container =
        row.closest(".vertical-tabs-category") ||
        row.closest(".vertical-tabs-drop-zone");
      if (container) {
        container
          .querySelectorAll(
            ".vertical-tabs-item.drop-before, .vertical-tabs-item.drop-after",
          )
          .forEach((el: Element) => {
            el.classList.remove("drop-before", "drop-after");
          });
      }
      row.classList.add(before ? "drop-before" : "drop-after");
    });

    row.addEventListener("dragleave", () => {
      row.classList.remove("drop-before", "drop-after");
    });

    row.addEventListener("drop", (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      row.classList.remove("drop-before", "drop-after");
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
      dataTransfer.setData("text/plain", pdf.tabId || String(pdf.itemId));
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

  if (effectiveColor) {
    const dark = lightToDark(effectiveColor);
    wrapper.dataset.vtColorLight = effectiveColor;
    wrapper.dataset.vtColorDark = dark;
    if (isDarkMode(doc)) {
      wrapper.style.background = dark;
    } else {
      wrapper.style.background = effectiveColor;
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
      dt.effectAllowed = "move";
    }
  });

  wrapper.addEventListener("dragover", (e: DragEvent) => {
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
    wrapper.classList.toggle("collapsed");
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

  // Make the entire category area a drop target
  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    // Clear outlines from OTHER categories only
    doc
      .querySelectorAll(".vertical-tabs-category.drag-over")
      .forEach((el: Element) => {
        if (el !== wrapper) el.classList.remove("drag-over");
      });
    // Clear lines from OTHER categories only
    doc
      .querySelectorAll(
        ".vertical-tabs-item.drop-before, .vertical-tabs-item.drop-after",
      )
      .forEach((el: Element) => {
        if (!wrapper.contains(el))
          el.classList.remove("drop-before", "drop-after");
      });
    wrapper.classList.add("drag-over");
  };
  const onDragLeave = (e: DragEvent) => {
    // Only remove if we're actually leaving the wrapper
    if (!wrapper.contains(e.relatedTarget as Node)) {
      wrapper.classList.remove("drag-over");
      // Clear all insertion lines when leaving this category
      wrapper
        .querySelectorAll(
          ".vertical-tabs-item.drop-before, .vertical-tabs-item.drop-after",
        )
        .forEach((el: Element) =>
          el.classList.remove("drop-before", "drop-after"),
        );
    }
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    wrapper.classList.remove("drag-over");
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

  const itemsContainer = createEl(doc, "div");
  itemsContainer.className = "vertical-tabs-items";
  for (const pdf of items) {
    itemsContainer.appendChild(createItemElement(doc, pdf, category.id));
  }
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
    background: ${mc.background};
    border: ${mc.border};
    border-radius: 6px;
    box-shadow: ${mc.shadow};
    backdrop-filter: ${mc.backdropFilter};
    -webkit-backdrop-filter: ${mc.backdropFilter};
    z-index: 100002;
    padding: 4px 0;
    font-size: 13px;
    color: ${mc.text};
    min-width: 140px;
    font-family: message-box;
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
    // Click inside VT (e.g. right-click another item) → close menu, keep VT open
    if (
      target.closest(`#${SIDEBAR_ID}`) ||
      target.closest(`.${HOVER_STRIP_CLASS}`)
    ) {
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
  container.innerHTML = "";

  // Match by tabId (for independent cloned tabs), fallback to itemId
  const assignedTabIds = new Set(
    data.categories.flatMap((c) => c.tabIds.filter((id) => id !== "")),
  );
  const assignedItemIds = new Set(data.categories.flatMap((c) => c.itemIds));
  const isTabCategorized = (pdf: OpenedPDF, cat: Category): boolean => {
    if (cat.tabIds.includes(pdf.tabId)) return true;
    // Fallback: itemId matching (for dormant items or after tab id changes)
    if (pdf.itemId && cat.itemIds.includes(pdf.itemId)) return true;
    return false;
  };
  const categorizedPdfs = data.categories.map((category) => {
    const items = pdfs.filter((pdf) => isTabCategorized(pdf, category));
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
    (pdf) => !assignedTabIds.has(pdf.tabId) && !assignedItemIds.has(pdf.itemId),
  );

  // Sort uncategorized by persisted order, new items go to end
  const orderMap = new Map(data.uncategorizedOrder.map((id, i) => [id, i]));
  uncategorizedPdfs.sort((a, b) => {
    const ai = orderMap.get(a.tabId) ?? 9999;
    const bi = orderMap.get(b.tabId) ?? 9999;
    return ai - bi;
  });

  // Only show empty state when there are no categories AND no opened tabs
  if (data.categories.length === 0 && pdfs.length === 0) {
    const empty = createEl(doc, "div");
    empty.className = "vertical-tabs-empty";
    empty.textContent = getString("vertical-tabs-empty");
    container.appendChild(empty);
    return;
  }

  const sortedCategories = [...data.categories].sort(
    (a, b) => a.order - b.order,
  );

  for (const category of sortedCategories) {
    const items =
      categorizedPdfs.find((entry) => entry.category.id === category.id)
        ?.items || [];
    container.appendChild(createCategoryElement(doc, category, items, false));
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
    dropZone.addEventListener("dragover", (e: DragEvent) => {
      e.preventDefault();
      doc
        .querySelectorAll(".vertical-tabs-category.drag-over")
        .forEach((el: Element) => el.classList.remove("drag-over"));
      dropZone.classList.add("drag-over");
    });
    dropZone.addEventListener("dragleave", () => {
      dropZone.classList.remove("drag-over");
    });
    dropZone.addEventListener("drop", (e: DragEvent) => {
      e.preventDefault();
      dropZone.classList.remove("drag-over");
      const itemIdStr = e.dataTransfer?.getData("text/plain");
      if (!itemIdStr) return;
      const byTab = getOpenedPDFs().find((p) => p.tabId === itemIdStr);
      dispatchVtEvent(dropZone, "vertical-tabs:assign-item", {
        itemId: byTab ? byTab.itemId : Number(itemIdStr),
        tabId: byTab ? itemIdStr : undefined,
        categoryId: "__uncategorized__",
      });
    });

    // Render uncategorized items in the drop zone
    for (const pdf of uncategorizedPdfs) {
      dropZone.appendChild(createItemElement(doc, pdf, null));
    }
    container.appendChild(dropZone);
  } else if (sortedCategories.length > 0) {
    // Show drop zone even when empty, so items can be removed from categories
    const dropZone = createEl(doc, "div");
    dropZone.className = "vertical-tabs-drop-zone";
    dropZone.addEventListener("dragover", (e: DragEvent) => {
      e.preventDefault();
      doc
        .querySelectorAll(".vertical-tabs-category.drag-over")
        .forEach((el: Element) => el.classList.remove("drag-over"));
      dropZone.classList.add("drag-over");
    });
    dropZone.addEventListener("dragleave", () => {
      dropZone.classList.remove("drag-over");
    });
    dropZone.addEventListener("drop", (e: DragEvent) => {
      e.preventDefault();
      dropZone.classList.remove("drag-over");
      const dragData = e.dataTransfer?.getData("text/plain");
      if (!dragData) return;
      const byTab = getOpenedPDFs().find((p) => p.tabId === dragData);
      dispatchVtEvent(dropZone, "vertical-tabs:assign-item", {
        itemId: byTab ? byTab.itemId : Number(dragData),
        tabId: byTab ? dragData : undefined,
        categoryId: "__uncategorized__",
      });
    });

    const sep = createEl(doc, "div");
    sep.className = "vertical-tabs-separator";
    container.appendChild(sep);
    container.appendChild(dropZone);
  }
}

let _searchQuery = "";

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

  doc.addEventListener("vertical-tabs:pdfs-changed", handler);
  doc.addEventListener("vertical-tabs:data-changed", handler);
  doc.addEventListener("vertical-tabs:visibility-changed", handler);

  // Search event
  doc.addEventListener("vertical-tabs:search", ((e: CustomEvent) => {
    _searchQuery = (e.detail?.query as string) || "";
    void handler();
  }) as EventListener);

  (doc as any).__verticalTabsRenderHandler = handler;
}

export function unsubscribeFromRenderEvents(doc: Document): void {
  const handler = (doc as any).__verticalTabsRenderHandler;
  if (!handler) return;
  doc.removeEventListener("vertical-tabs:pdfs-changed", handler);
  doc.removeEventListener("vertical-tabs:data-changed", handler);
  doc.removeEventListener("vertical-tabs:visibility-changed", handler);
  doc.removeEventListener("vertical-tabs:search", handler);
  delete (doc as any).__verticalTabsRenderHandler;
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
