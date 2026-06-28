/**
 * Injects vertical tabs into the PDF reader's left sidebar.
 * The reader content (including #sidebarContainer) lives inside
 * a XUL <browser> element in the main document.
 */
import { config } from "../../../package.json";
import { getString } from "../../utils/locale";
import { injectStyles, removeStyles, SIDEBAR_ID } from "../render/styles";
import {
  getContextMenuColors,
  lightToDark,
  isDarkMode,
} from "../render/colorUtils";
import { getOpenedPDFs, syncSelectedTabId } from "../track/itemTracker";
import {
  getData,
  getCategoryColors,
  persistTrackedItem,
} from "../track/categoryManager";
import {
  renderCategories,
  getItemInfo,
  showItemContextMenu,
  setupCategoryDarkMode,
  teardownCategoryDarkMode,
} from "../render/uiRenderer";
import { dispatchVtEvent } from "../core/events";
import {
  destroyReaderDragSystem,
  initReaderDragSystem,
} from "../drag/readerDrag";

const RT_ID = `${config.addonRef}-reader-vt-tab`;

/** Get ALL reader browser content documents */
function getAllReaderDocs(): Document[] {
  const mainDoc = Zotero.getMainWindows()[0]?.document;
  if (!mainDoc) return [];
  const browsers = mainDoc.querySelectorAll("browser");
  const docs: Document[] = [];
  for (let i = 0; i < browsers.length; i++) {
    const b = browsers[i] as any;
    const d = b.contentDocument || b.contentWindow?.document;
    if (d) docs.push(d);
  }
  return docs;
}

interface BridgeHandlers {
  addCategory: EventListener;
  assignItem: EventListener;
  reorderItem: EventListener;
  categoryContext: EventListener;
  categoryRename: EventListener;
  categoryDelete: EventListener;
  categoryColor: EventListener;
  rightClick: (e: MouseEvent) => void;
  refresh: EventListener;
  refreshTargets: Window[];
}

/** Clean up a reader document before re-injection (toolbar recreated, etc.) */
function cleanupReaderDoc(doc: Document): void {
  const bridge = (doc as any).__vtBridgeHandlers as BridgeHandlers | undefined;
  if (bridge) {
    doc.removeEventListener("vertical-tabs:add-category", bridge.addCategory);
    doc.removeEventListener("vertical-tabs:assign-item", bridge.assignItem);
    doc.removeEventListener("vertical-tabs:reorder-item", bridge.reorderItem);
    doc.removeEventListener(
      "vertical-tabs:category-context",
      bridge.categoryContext,
    );
    doc.removeEventListener(
      "vertical-tabs:category-context-rename",
      bridge.categoryRename,
    );
    doc.removeEventListener(
      "vertical-tabs:category-context-delete",
      bridge.categoryDelete,
    );
    doc.removeEventListener(
      "vertical-tabs:category-context-color",
      bridge.categoryColor,
    );

    doc.removeEventListener("contextmenu", bridge.rightClick, true);
    doc.removeEventListener("auxclick", bridge.rightClick);
    doc.removeEventListener("mousedown", bridge.rightClick, true);
    doc.removeEventListener("mouseup", bridge.rightClick, true);

    for (const win of bridge.refreshTargets) {
      win.document.removeEventListener(
        "vertical-tabs:pdfs-changed",
        bridge.refresh,
      );
      win.document.removeEventListener(
        "vertical-tabs:data-changed",
        bridge.refresh,
      );
    }
  }

  const sidebarObserver = (doc as any).__vtSidebarObserver as
    | MutationObserver
    | undefined;
  if (sidebarObserver) {
    sidebarObserver.disconnect();
  }

  try {
    destroyReaderDragSystem(doc);
  } catch {
    // ignore
  }

  doc.getElementById(RT_ID)?.remove();
  doc.getElementById(SIDEBAR_ID)?.remove();
  doc.getElementById("vt-reader-cat-menu")?.remove();
  doc.getElementById("vertical-tabs-item-menu")?.remove();
  removeStyles(doc);
  teardownCategoryDarkMode(doc);

  delete (doc as any).__vtBridgeDone;
  delete (doc as any).__vtBridgeHandlers;
  delete (doc as any).__vtSidebarObserver;
  // NOTE: __vtReaderPinned is intentionally preserved
}

/** If pinned and sidebar is visible, activate the VT tab by clicking its button. */
function getActiveTabId(doc: Document): string | null {
  const active = doc.querySelector(
    ".vertical-tabs-item.active",
  ) as HTMLElement | null;
  return active?.dataset.tabId ?? null;
}

/**
 * Find which OpenedPDF tabId corresponds to this reader document,
 * by matching the reader's iframe contentDocument.
 *
 * In Zotero 8+, the reader URL is resource://zotero/reader/reader.html
 * (no itemID in query params). The only reliable way to map doc→tabId
 * is to iterate all reader tabs and compare their contentDocument.
 */
function findTabIdForReaderDoc(doc: Document): string | null {
  try {
    const pdfs = getOpenedPDFs();
    for (const pdf of pdfs) {
      if (!pdf.tabId || pdf.tabId === "") continue;
      try {
        const reader = Zotero.Reader.getByTabID(pdf.tabId);
        const iframe = (reader as any)?._iframe as
          | HTMLIFrameElement
          | undefined;
        if (iframe?.contentDocument === doc) {
          return pdf.tabId;
        }
      } catch {
        // reader not ready
      }
    }
  } catch {
    // ignore
  }
  return null;
}

/** If pinned and sidebar is visible, activate the VT tab by clicking its button. */
function ensurePinnedVTActive(doc: Document): void {
  const btn = doc.getElementById(RT_ID) as HTMLElement | null;
  const sidebar = doc.getElementById("sidebarContainer") as HTMLElement | null;
  if (!btn || !sidebar) return;

  const isVisible =
    !sidebar.hasAttribute("hidden") &&
    sidebar.style.display !== "none" &&
    sidebar.offsetWidth > 0;
  const isActive = btn.classList.contains("active");
  if (!isVisible || isActive) return;

  const pdfs = getOpenedPDFs();
  const matchedTabId = findTabIdForReaderDoc(doc) || getActiveTabId(doc);

  // 1) Match by tabId (from reader iframe or rendered panel)
  if (matchedTabId) {
    const pdf = pdfs.find((p) => p.tabId === matchedTabId);
    if (pdf?.vtPinned) {
      btn.click();
      return;
    }
  }

  // 2) Fallback: in-session __vtReaderPinned (backward compat, same-session only)
  const pinned = (doc as any).__vtReaderPinned;
  if (pinned) {
    btn.click();
  }
}

function inject(doc: Document): void {
  if (doc.getElementById(RT_ID)) return;
  Zotero.logError(new Error("[BVT] inject reader sidebar on " + doc.URL));

  const sidebar = doc.getElementById("sidebarContainer");
  if (!sidebar) return;

  const tablist = doc.querySelector(
    ".sidebar-toolbar .start[role='tablist']",
  ) as HTMLElement | null;
  if (!tablist) return;

  cleanupReaderDoc(doc);

  injectStyles(doc);
  setupCategoryDarkMode(doc);

  // ── Tab button ──
  const btn = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "button",
  ) as HTMLElement;
  btn.id = RT_ID;
  btn.className = "toolbar-button";
  btn.setAttribute("role", "tab");
  btn.setAttribute("tabindex", "-1");
  btn.setAttribute("aria-selected", "false");
  btn.title = "垂直标签页 (Normalize)";
  btn.style.cssText = "display:flex;align-items:center;justify-content:center;";
  btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" fill="#6C6C6C"/><text x="8" y="12" text-anchor="middle" fill="#fff" font-size="11" font-weight="700" font-family="sans-serif">N</text></svg>`;

  // ── VT panel with header ──
  const panel = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as HTMLElement;
  panel.id = SIDEBAR_ID;
  panel.style.cssText =
    "display:none;flex-direction:column;height:100%;font-size:12px;pointer-events:auto;";

  // Header: search + add-category
  const header = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as HTMLElement;
  header.className = "vertical-tabs-header";
  header.style.cssText =
    "display:flex;align-items:center;gap:4px;padding:6px 8px;border-bottom:1px solid var(--material-border,#ccc);";

  const search = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "input",
  ) as HTMLInputElement;
  search.className = "vertical-tabs-search";
  search.type = "text";
  search.placeholder = getString("vertical-tabs-search-placeholder");
  search.style.cssText =
    "flex:1;min-width:0;height:22px;padding:2px 6px;border:1.5px solid transparent;border-radius:10px;background:var(--material-background,#fff);color:var(--material-text,#222);font-size:11px;outline:none;transition:border-color 0.2s ease;";
  search.addEventListener("focus", () => {
    const borderColor = isDarkMode(doc) ? "#6C6C6C" : "#DBDBDB";
    search.style.border = `1.5px solid ${borderColor}`;
  });
  search.addEventListener("blur", () => {
    search.style.border = "1.5px solid transparent";
  });
  let _q = "";
  search.addEventListener("input", () => {
    _q = search.value.trim().toLowerCase();
    refreshWithSearch(doc, _q);
  });
  // Blur search when clicking outside the VT panel
  doc.addEventListener("mousedown", (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest(`#${SIDEBAR_ID}`)) {
      search.blur();
    }
  });
  header.appendChild(search);

  const addBtn = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "button",
  ) as HTMLElement;
  addBtn.className = "vertical-tabs-add-btn";
  addBtn.textContent = "+";
  addBtn.style.cssText =
    "background:transparent;border:none;cursor:pointer;font-size:18px;color:#6C6C6C;padding:0 4px;line-height:1;";
  addBtn.addEventListener("mouseenter", () => {
    addBtn.style.background = "var(--material-button-hover, rgba(0,0,0,0.06))";
    addBtn.style.borderRadius = "4px";
    addBtn.style.color = "#999";
  });
  addBtn.addEventListener("mouseleave", () => {
    addBtn.style.background = "";
    addBtn.style.borderRadius = "";
    addBtn.style.color = "#6C6C6C";
  });
  addBtn.addEventListener("click", () =>
    dispatchVtEvent(doc, "vertical-tabs:add-category"),
  );
  header.appendChild(addBtn);

  panel.appendChild(header);

  const catContainer = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as HTMLElement;
  catContainer.className = "vertical-tabs-categories";
  catContainer.style.cssText = "flex:1;overflow-y:auto;padding:4px 0;";
  panel.appendChild(catContainer);

  const panelContainer =
    doc.getElementById("sidebarContent") ||
    (tablist.closest(".sidebar-toolbar")?.parentElement as HTMLElement) ||
    null;
  if (panelContainer) panelContainer.appendChild(panel);

  // ── Toggle logic ──
  let act = false;
  const orig = ["thumbnailsView", "annotationsView", "outlineView"];

  function applyVTActive(active: boolean): void {
    act = active;
    tablist!.querySelectorAll(".toolbar-button").forEach((b: Element) => {
      (b as HTMLElement).classList.remove("active");
      b.setAttribute("aria-selected", "false");
    });
    if (!active) {
      panel.style.display = "none";
      btn.classList.remove("active");
      btn.setAttribute("aria-selected", "false");
      orig.forEach((id) => {
        const p = doc.getElementById(id) as HTMLElement | null;
        if (p) p.style.display = "";
      });
    } else {
      panel.style.display = "flex";
      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");
      orig.forEach((id) => {
        const p = doc.getElementById(id) as HTMLElement | null;
        if (p) p.style.display = "none";
      });
      refresh(doc);
    }
  }

  btn.addEventListener("click", () => {
    (doc as any).__vtReaderPinned = true;
    applyVTActive(true);

    // Persist vtPinned so it survives Zotero restart
    const tabId = getActiveTabId(doc) || findTabIdForReaderDoc(doc);
    if (tabId) {
      const pdf = getOpenedPDFs().find((p) => p.tabId === tabId);
      if (pdf) {
        pdf.vtPinned = true;
        void persistTrackedItem(pdf.itemId, {
          title: pdf.title,
          type: pdf.type,
          parentItemId: pdf.parentItemId,
          parentItemType: pdf.parentItemType,
          openedAt: pdf.openedAt,
          vtPinned: true,
        });
      }
    }
  });

  tablist.appendChild(btn);

  // Close/switch away from VT panel when original tabs are clicked
  orig.forEach((id, i) => {
    const btnId = ["viewThumbnail", "viewAnnotations", "viewOutline"][i];
    const ob = doc.getElementById(btnId);
    if (ob) {
      ob.addEventListener("click", () => {
        (doc as any).__vtReaderPinned = false;

        // Clear vtPinned — user switched away from VT manually
        const tabId = getActiveTabId(doc) || findTabIdForReaderDoc(doc);
        if (tabId) {
          const pdf = getOpenedPDFs().find((p) => p.tabId === tabId);
          if (pdf) {
            pdf.vtPinned = false;
            void persistTrackedItem(pdf.itemId, {
              title: pdf.title,
              type: pdf.type,
              parentItemId: pdf.parentItemId,
              parentItemType: pdf.parentItemType,
              openedAt: pdf.openedAt,
              vtPinned: false,
            });
          }
        }

        if (act) applyVTActive(false);
      });
    }
  });

  // ── Pin: restore VT when sidebar is reopened ──
  // Use polling instead of MutationObserver, which is not available in the
  // reader sandbox.
  ensurePinnedVTActive(doc);

  // ── Event bridging (once) ──
  const bridge: BridgeHandlers = {
    addCategory: (e: Event) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
      const wins = Zotero.getMainWindows();
      for (const win of wins) {
        dispatchVtEvent(
          win.document,
          "vertical-tabs:add-category",
          (e as CustomEvent).detail,
        );
      }
    },
    assignItem: (e: Event) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
      const wins = Zotero.getMainWindows();
      for (const win of wins) {
        dispatchVtEvent(
          win.document,
          "vertical-tabs:assign-item",
          (e as CustomEvent).detail,
        );
      }
    },
    reorderItem: (e: Event) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
      const wins = Zotero.getMainWindows();
      for (const win of wins) {
        dispatchVtEvent(
          win.document,
          "vertical-tabs:reorder-item",
          (e as CustomEvent).detail,
        );
      }
    },
    categoryContext: (e: Event) => {
      const { categoryId, x, y } = (e as CustomEvent).detail as {
        categoryId: string;
        x: number;
        y: number;
      };
      showCategoryMenu(doc, categoryId, x, y);
    },
    categoryRename: (e: Event) => {
      const wins = Zotero.getMainWindows();
      for (const win of wins) {
        dispatchVtEvent(
          win.document,
          "vertical-tabs:category-context-rename",
          (e as CustomEvent).detail,
        );
      }
    },
    categoryDelete: (e: Event) => {
      const wins = Zotero.getMainWindows();
      for (const win of wins) {
        dispatchVtEvent(
          win.document,
          "vertical-tabs:category-context-delete",
          (e as CustomEvent).detail,
        );
      }
    },
    categoryColor: (e: Event) => {
      const wins = Zotero.getMainWindows();
      for (const win of wins) {
        dispatchVtEvent(
          win.document,
          "vertical-tabs:category-context-color",
          (e as CustomEvent).detail,
        );
      }
    },
    rightClick: (e: MouseEvent) => {
      if (e.type === "auxclick" && e.button !== 2) return;
      if (e.type !== "auxclick" && e.button !== 2) return;
      const target = e.target as HTMLElement;
      if (!target.closest(`#${SIDEBAR_ID}`)) return;
      e.preventDefault();
      e.stopPropagation();
      const itemRow = target.closest(
        ".vertical-tabs-item",
      ) as HTMLElement | null;
      if (itemRow) {
        const tabId = itemRow.dataset.tabId || "";
        const itemId = itemRow.dataset.itemId
          ? Number(itemRow.dataset.itemId)
          : 0;
        const pdf = getOpenedPDFs().find(
          (p) => p.tabId === tabId || p.itemId === itemId,
        );
        if (pdf) showItemContextMenu(doc, pdf, e.clientX, e.clientY);
        return;
      }
      const catHeader = target.closest(
        ".vertical-tabs-category-header",
      ) as HTMLElement | null;
      if (catHeader) {
        const catWrapper = catHeader.closest(
          ".vertical-tabs-category",
        ) as HTMLElement | null;
        if (catWrapper?.dataset.categoryId) {
          showCategoryMenu(
            doc,
            catWrapper.dataset.categoryId,
            e.clientX,
            e.clientY,
          );
        }
      }
    },
    refresh: () => {
      if (act) refresh(doc);
    },
    refreshTargets: [],
  };

  doc.addEventListener("vertical-tabs:add-category", bridge.addCategory);
  doc.addEventListener("vertical-tabs:assign-item", bridge.assignItem);
  doc.addEventListener("vertical-tabs:reorder-item", bridge.reorderItem);
  doc.addEventListener(
    "vertical-tabs:category-context",
    bridge.categoryContext,
  );
  doc.addEventListener(
    "vertical-tabs:category-context-rename",
    bridge.categoryRename,
  );
  doc.addEventListener(
    "vertical-tabs:category-context-delete",
    bridge.categoryDelete,
  );
  doc.addEventListener(
    "vertical-tabs:category-context-color",
    bridge.categoryColor,
  );

  doc.addEventListener("contextmenu", bridge.rightClick, true);
  doc.addEventListener("auxclick", bridge.rightClick);
  doc.addEventListener("mousedown", bridge.rightClick, true);
  doc.addEventListener("mouseup", bridge.rightClick, true);

  for (const win of Zotero.getMainWindows()) {
    win.document.addEventListener("vertical-tabs:pdfs-changed", bridge.refresh);
    win.document.addEventListener("vertical-tabs:data-changed", bridge.refresh);
    bridge.refreshTargets.push(win);
  }

  (doc as any).__vtBridgeHandlers = bridge;
  (doc as any).__vtBridgeDone = true;

  // ── Manual drag-and-drop (HTML5 DnD blocked in reader sandbox) ──
  try {
    initReaderDragSystem(doc, SIDEBAR_ID);
  } catch (err) {
    Zotero.logError(
      new Error("[BVT] initReaderDragSystem failed: " + String(err)),
    );
  }
}

function refresh(doc: Document): void {
  refreshWithSearch(doc, "");
}

function refreshWithSearch(doc: Document, query: string): void {
  const c = doc.querySelector(
    `#${SIDEBAR_ID} .vertical-tabs-categories`,
  ) as HTMLElement | null;
  if (!c) return;
  if (!query) {
    syncSelectedTabId();
  }
  let pdfs = getOpenedPDFs();
  if (query) {
    pdfs = pdfs.filter((p) => {
      const item = Zotero.Items.get(p.parentItemId ?? p.itemId);
      const info = item ? getItemInfo(item as Zotero.Item) : null;
      return [p.title, info?.title, info?.journal, info?.university]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }
  renderCategories(doc, c, getData(), pdfs);
}

// ── Rapid polling for sidebar appearance ──
let _pollTimer: ReturnType<typeof setInterval> | null = null;

export function initReaderSidebar(_tabId: string): void {
  // Guard: don't inject if VT is globally disabled
  const vtEnabled = Zotero.Prefs.get(
    `${config.prefsPrefix}.verticalTabs.enabled`,
    true,
  ) as boolean;
  if (!vtEnabled) return;

  if (!_pollTimer) {
    _pollTimer = setInterval(() => {
      const docs = getAllReaderDocs();
      for (const doc of docs) {
        tryInject(doc);
        ensurePinnedVTActive(doc);
      }
    }, 500);
  }
  // Immediate attempt
  const docs = getAllReaderDocs();
  for (const doc of docs) {
    tryInject(doc);
    ensurePinnedVTActive(doc);
  }
}

export function destroyReaderSidebars(): void {
  if (_pollTimer) {
    clearInterval(_pollTimer);
    _pollTimer = null;
  }

  const docs = getAllReaderDocs();
  for (const doc of docs) {
    const bridge = (doc as any).__vtBridgeHandlers as
      | {
          addCategory: EventListener;
          assignItem: EventListener;
          reorderItem: EventListener;
          categoryContext: EventListener;
          categoryRename: EventListener;
          categoryDelete: EventListener;
          categoryColor: EventListener;
          rightClick: (e: MouseEvent) => void;
          refresh: EventListener;
          refreshTargets: Window[];
        }
      | undefined;

    if (bridge) {
      doc.removeEventListener("vertical-tabs:add-category", bridge.addCategory);
      doc.removeEventListener("vertical-tabs:assign-item", bridge.assignItem);
      doc.removeEventListener("vertical-tabs:reorder-item", bridge.reorderItem);
      doc.removeEventListener(
        "vertical-tabs:category-context",
        bridge.categoryContext,
      );
      doc.removeEventListener(
        "vertical-tabs:category-context-rename",
        bridge.categoryRename,
      );
      doc.removeEventListener(
        "vertical-tabs:category-context-delete",
        bridge.categoryDelete,
      );
      doc.removeEventListener(
        "vertical-tabs:category-context-color",
        bridge.categoryColor,
      );

      doc.removeEventListener("contextmenu", bridge.rightClick, true);
      doc.removeEventListener("auxclick", bridge.rightClick);
      doc.removeEventListener("mousedown", bridge.rightClick, true);
      doc.removeEventListener("mouseup", bridge.rightClick, true);

      for (const win of bridge.refreshTargets) {
        win.document.removeEventListener(
          "vertical-tabs:pdfs-changed",
          bridge.refresh,
        );
        win.document.removeEventListener(
          "vertical-tabs:data-changed",
          bridge.refresh,
        );
      }
      delete (doc as any).__vtBridgeHandlers;
    }

    delete (doc as any).__vtBridgeDone;

    const sidebarObserver = (doc as any).__vtSidebarObserver as
      | MutationObserver
      | undefined;
    if (sidebarObserver) {
      sidebarObserver.disconnect();
      delete (doc as any).__vtSidebarObserver;
    }
    delete (doc as any).__vtReaderPinned;

    try {
      destroyReaderDragSystem(doc);
    } catch (err) {
      Zotero.logError(
        new Error("[BVT] destroyReaderDragSystem failed: " + String(err)),
      );
    }

    doc.getElementById(RT_ID)?.remove();
    doc.getElementById(SIDEBAR_ID)?.remove();
    doc.getElementById("vt-reader-cat-menu")?.remove();
    doc.getElementById("vertical-tabs-item-menu")?.remove();
    removeStyles(doc);
  }
}

// ── Category context menu (local to reader document) ──

function showCategoryMenu(
  doc: Document,
  categoryId: string,
  x: number,
  y: number,
): void {
  const existing = doc.getElementById("vt-reader-cat-menu");
  existing?.remove();

  const data = getData();
  const cat = data.categories.find((c) => c.id === categoryId);
  if (!cat) return;

  // Close any open item context menu
  doc.getElementById("vertical-tabs-item-menu")?.remove();

  const mc = getContextMenuColors(doc);

  const menu = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as HTMLElement;
  menu.id = "vt-reader-cat-menu";
  menu.style.cssText = `
    position: fixed; left: ${x}px; top: ${y}px;
    background: ${mc.background}; border: ${mc.border}; border-radius: 6px;
    box-shadow: ${mc.shadow};
    backdrop-filter: ${mc.backdropFilter};
    -webkit-backdrop-filter: ${mc.backdropFilter};
    z-index: 100000;
    padding: 4px 0; font-size: 13px; color: ${mc.text}; min-width: 120px;
    font-family: message-box;
  `;

  // ── Color picker row (matches main page) ──
  const prefColors = getCategoryColors();
  const colorRow = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as HTMLElement;
  colorRow.style.cssText =
    "display: flex; gap: 4px; padding: 4px 8px 6px; justify-content: center;";
  const dark = isDarkMode(doc);
  for (const c of prefColors) {
    const swatch = doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    ) as HTMLElement;
    const isSelected = cat.color === c || (!cat.color && c === "#F2F2F2");
    // #F2F2F2 is "no color" — show #303030 in dark mode
    const displayColor = dark
      ? c.toUpperCase() === "#F2F2F2"
        ? "#303030"
        : lightToDark(c)
      : c;
    swatch.style.cssText = `
      width: 18px; height: 18px; border-radius: 3px; cursor: pointer;
      background: ${displayColor};
      border: ${isSelected ? mc.swatchBorderSelected : mc.swatchBorder};
    `;
    swatch.addEventListener("click", () => {
      menu.remove();
      dispatchVtEvent(doc, "vertical-tabs:category-context-color", {
        categoryId,
        color: c,
      });
    });
    colorRow.appendChild(swatch);
  }
  menu.appendChild(colorRow);

  const addItem = (label: string, action: () => void) => {
    const el = doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    ) as HTMLElement;
    el.textContent = label;
    el.style.cssText =
      "padding:6px 16px;cursor:pointer;white-space:nowrap;font-family:message-box;";
    el.addEventListener("mouseenter", () => {
      el.style.background = mc.hoverBg;
    });
    el.addEventListener("mouseleave", () => {
      el.style.background = "";
    });
    el.addEventListener("click", () => {
      menu.remove();
      action();
    });
    menu.appendChild(el);
  };

  addItem(getString("vertical-tabs-rename"), async () => {
    const dialogData: { [key: string]: any } = {
      inputValue: cat.name,
    };

    new ztoolkit.Dialog(2, 1)
      .addCell(0, 0, {
        tag: "label",
        namespace: "html",
        properties: {
          innerHTML: getString("vertical-tabs-rename"),
        },
      })
      .addCell(1, 0, {
        tag: "input",
        namespace: "html",
        id: "vt-reader-rename-category-input",
        attributes: {
          "data-bind": "inputValue",
          "data-prop": "value",
          type: "text",
        },
      })
      .addButton(getString("vertical-tabs-confirm"), "confirm")
      .addButton(getString("vertical-tabs-cancel"), "cancel")
      .setDialogData(dialogData)
      .open(getString("vertical-tabs-rename"));

    await dialogData.unloadLock.promise;

    if (dialogData._lastButtonId === "confirm") {
      const newName = (dialogData.inputValue as string) || "";
      if (newName.trim()) {
        dispatchVtEvent(doc, "vertical-tabs:category-context-rename", {
          categoryId,
          newName: newName.trim(),
        });
      }
    }
  });

  addItem(getString("vertical-tabs-delete"), () => {
    dispatchVtEvent(doc, "vertical-tabs:category-context-delete", {
      categoryId,
    });
  });

  doc.documentElement?.appendChild(menu);
  const menuId = menu.id;
  const close = (e: MouseEvent) => {
    if (!menu.isConnected) {
      doc.removeEventListener("mousedown", close, true);
      for (const w of Zotero.getMainWindows())
        w.document.removeEventListener("mousedown", close, true);
      return;
    }
    // Don't close if clicking inside the menu
    if ((e.target as HTMLElement).closest(`#${menuId}`)) return;
    menu.remove();
    doc.removeEventListener("mousedown", close, true);
    for (const w of Zotero.getMainWindows())
      w.document.removeEventListener("mousedown", close, true);
  };
  setTimeout(() => {
    doc.addEventListener("mousedown", close, true);
    for (const w of Zotero.getMainWindows())
      w.document.addEventListener("mousedown", close, true);
  }, 150);
}

function tryInject(doc: Document): void {
  const vtEnabled = Zotero.Prefs.get(
    `${config.prefsPrefix}.verticalTabs.enabled`,
    true,
  ) as boolean;
  if (!vtEnabled) return;

  const sidebar = doc.getElementById("sidebarContainer");
  const tablist = doc.querySelector(".sidebar-toolbar .start[role='tablist']");
  if (!sidebar || !tablist) return;

  const existing = doc.getElementById(RT_ID);
  if (!existing || !doc.contains(existing)) {
    if (existing) existing.remove();
    inject(doc);
  }
}
