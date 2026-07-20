import { config } from "../../../package.json";
import { getString } from "../../utils/locale";
import {
  addCategory,
  addCategoryAtTop,
  assignItemToCategory,
  cleanStaleTabIds,
  createCategorySnapshot,
  deleteCategory,
  insertItemsIntoCategoryAt,
  insertUncategorizedItemsAt,
  loadData,
  removeItemFromAllCategories,
  renameCategory,
  reorderCategories,
  reorderItemInCategory,
  reorderUncategorized,
  saveData,
  ItemSnapshot,
  ItemTabEntry,
  VerticalTabsData,
  restoreCategoryTabIdsAndOrder,
} from "./dataStore";
import { dispatchVtEvent } from "../core/events";
import {
  getContextMenuColors,
  lightToDark,
  isDarkMode,
} from "../render/colorUtils";
import { getItemDisplayTitle } from "../utils/itemTitle";
import { getPopupStyleSheet } from "../render/popupStyleUtils";
import {
  getLiveOpenTabIds,
  getMainWindows,
  getNonNewLiveEntries,
  getOpenedPDFs,
  getZoteroTabs,
  syncTabOrderToNative,
  removeTabsFromTrackingSilently,
  loadLastReadTimes,
  getLastReadTimes,
} from "./itemTracker";
import { isReaderRestoreInProgress } from "./orderSyncControl";
import {
  addSavedCategory,
  deleteSavedCategory,
  findSavedCategoryByName,
  loadSavedCategories,
  saveSavedCategories,
} from "../save/savedCategoryStore";
import { showMoreMenu } from "../save/moreMenu";
import { promptOverwriteSavedCategory } from "../save/saveCategoryDialog";
import { showImportCategoryDialog } from "../save/importCategoryDialog";
import { showHelpDialog } from "../save/helpDialog";
import {
  restoreCategory,
  showRestoreWarningDialog,
} from "../save/categoryRestore";
import { openPluginPreferences } from "../save/openPreferences";
import { promptCategoryName } from "../ui/categoryNameDialog";
import { animatePopupClose, animatePopupOpen } from "../ui/popupAnimation";
import { markNewCategoryEntrance } from "../render/categoryEntrance";
import { markCategoryColorFade } from "../render/categoryColorFade";
import { animateCategoryExit } from "../render/categoryExit";
import {
  scheduleCollapse,
  setContextMenuOpen,
  setDialogOpen,
  SIDEBAR_ID,
} from "../sidebar/sidebar";

const PREF_NAMESPACE_CAT = config.prefsPrefix;

let _data: VerticalTabsData | null = null;
let _lastAddCatTime = 0;
let _syncingFromNative = false;

interface CategoryHandlers {
  add: EventListener;
  createWithItem: EventListener;
  createWithItems: EventListener;
  moveItems: EventListener;
  assign: EventListener;
  context: EventListener;
  reorder: EventListener;
  reorderCat: EventListener;
  rename: EventListener;
  delete: EventListener;
  color: EventListener;
  toggleCollapse: EventListener;
  save: EventListener;
  externalDrop: EventListener;
  tabClosed: EventListener;
  requestSync: EventListener;
  showMoreMenu: EventListener;
  showImportDialog: EventListener;
  showHelpDialog: EventListener;
  importCategory: EventListener;
  openPreferences: EventListener;
}

const HANDLERS_KEY = "__vtCategoryHandlers";

function dispatchDataChanged(doc: Document): void {
  dispatchVtEvent(doc, "vertical-tabs:data-changed");
}

async function persist(doc: Document): Promise<void> {
  if (!_data) return;
  _data = { ..._data, lastReadTimes: getLastReadTimes() };
  ztoolkit.log(
    "[BVT-cat] persist categories=",
    _data.categories.map((c) => ({ id: c.id, tabIds: c.tabIds })),
    "uncategorizedOrder=",
    _data.uncategorizedOrder,
  );
  await saveData(_data);
  dispatchDataChanged(doc);
}

function showContextMenu(
  doc: Document,
  categoryId: string,
  x: number,
  y: number,
): void {
  const existing = doc.getElementById("vertical-tabs-context-menu");
  existing?.remove();

  const mc = getContextMenuColors(doc);

  const menu = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as HTMLElement;
  menu.id = "vertical-tabs-context-menu";
  menu.style.cssText = `
    position: fixed;
    left: ${x}px;
    top: ${y}px;
    z-index: 100000;
    padding: 4px 0;
    min-width: 120px;
    font-family: message-box;
    ${getPopupStyleSheet(doc)}
  `;

  // ── Color picker row ──
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
    const currentColor = _data?.categories.find(
      (cat) => cat.id === categoryId,
    )?.color;
    // #F2F2F2 is "no color" — show #303030 in dark mode
    const displayColor = dark
      ? c.toUpperCase() === "#F2F2F2"
        ? "#303030"
        : lightToDark(c)
      : c;
    swatch.style.cssText = `
      width: 18px; height: 18px; border-radius: 3px; cursor: pointer;
      background: ${displayColor};
      border: ${currentColor === c ? mc.swatchBorderSelected : mc.swatchBorder};
    `;
    swatch.addEventListener("click", () => {
      animatePopupClose(menu, () => setContextMenuOpen(doc, false));
      scheduleCollapse(doc);
      const cat = _data?.categories.find((cat) => cat.id === categoryId);
      if (cat && _data) {
        // Mark before persist so the render post-processing can replay the
        // old→new color cross-fade on the freshly rendered wrapper.
        markCategoryColorFade(doc, {
          categoryId,
          oldColor: cat.color,
          newColor: c === "#F2F2F2" ? undefined : c,
        });
        _data = {
          ..._data,
          categories: _data.categories.map((cat) =>
            cat.id === categoryId
              ? { ...cat, color: c === "#F2F2F2" ? undefined : c }
              : cat,
          ),
        };
        void persist(doc);
      }
    });
    colorRow.appendChild(swatch);
  }
  menu.appendChild(colorRow);

  const renameItem = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as HTMLElement;
  renameItem.textContent = getString("vertical-tabs-rename");
  renameItem.style.cssText =
    "padding: 6px 16px; cursor: pointer; white-space: nowrap; font-family: message-box;";
  renameItem.addEventListener("mouseenter", () => {
    renameItem.style.background = mc.hoverBg;
  });
  renameItem.addEventListener("mouseleave", () => {
    renameItem.style.background = "";
  });
  renameItem.addEventListener("click", async () => {
    animatePopupClose(menu, () => setContextMenuOpen(doc, false));
    scheduleCollapse(doc);
    const cat = _data?.categories.find((c) => c.id === categoryId);
    const dialogData: { [key: string]: any } = {
      inputValue: cat?.name ?? "",
    };

    const dialog = new ztoolkit.Dialog(2, 1)
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
        id: "vt-rename-category-input",
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

    dialogData.loadCallback = () => {
      const input = dialog.window.document.getElementById(
        "vt-rename-category-input",
      ) as HTMLInputElement | null;
      if (!input) return;
      input.focus();
      input.select();
      input.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key === "Enter") {
          e.preventDefault();
          dialogData._lastButtonId = "confirm";
          dialog.window.close();
        }
      });
    };

    setDialogOpen(doc, true);
    try {
      await dialogData.unloadLock.promise;
    } finally {
      setDialogOpen(doc, false);
    }

    if (dialogData._lastButtonId === "confirm") {
      const newName = (dialogData.inputValue as string) || "";
      if (newName.trim()) {
        _data = renameCategory(_data!, categoryId, newName.trim());
        void persist(doc);
      }
    }
  });
  menu.appendChild(renameItem);

  const saveItem = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as HTMLElement;
  saveItem.textContent = getString("vertical-tabs-save-category");
  saveItem.style.cssText =
    "padding: 6px 16px; cursor: pointer; white-space: nowrap; font-family: message-box;";
  saveItem.addEventListener("mouseenter", () => {
    saveItem.style.background = mc.hoverBg;
  });
  saveItem.addEventListener("mouseleave", () => {
    saveItem.style.background = "";
  });
  saveItem.addEventListener("click", () => {
    animatePopupClose(menu, () => setContextMenuOpen(doc, false));
    scheduleCollapse(doc);
    dispatchVtEvent(doc, "vertical-tabs:save-category", { categoryId });
  });
  menu.appendChild(saveItem);

  const divider = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as HTMLElement;
  divider.style.cssText = `
    height: 1px;
    margin: 4px 12px;
    background: ${isDarkMode(doc) ? "#555" : "#DBDBDB"};
    pointer-events: none;
  `;
  menu.appendChild(divider);

  const deleteItem = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as HTMLElement;
  deleteItem.textContent = getString("vertical-tabs-delete");
  deleteItem.style.cssText =
    "padding: 6px 16px; cursor: pointer; white-space: nowrap; font-family: message-box;";
  deleteItem.addEventListener("mouseenter", () => {
    deleteItem.style.background = mc.hoverBg;
  });
  deleteItem.addEventListener("mouseleave", () => {
    deleteItem.style.background = "";
  });
  deleteItem.addEventListener("click", () => {
    animatePopupClose(menu, () => setContextMenuOpen(doc, false));
    scheduleCollapse(doc);
    dispatchVtEvent(doc, "vertical-tabs:category-context-delete", {
      categoryId,
    });
  });
  menu.appendChild(deleteItem);

  doc.documentElement?.appendChild(menu);
  animatePopupOpen(menu, "top left");
  setContextMenuOpen(doc, true);

  const cleanup = () => {
    doc.removeEventListener("mousedown", closeMenu, true);
  };
  const closeMenu = (e: MouseEvent) => {
    if (!menu.isConnected) {
      cleanup();
      return;
    }
    const target = e.target as HTMLElement;
    // Don't close if clicking inside the menu
    if (target.closest("#vertical-tabs-context-menu")) return;
    // Click inside VT (e.g. right-click another element) → close menu, keep VT open
    if (target.closest(`#${SIDEBAR_ID}`)) {
      animatePopupClose(menu, () => setContextMenuOpen(doc, false));
      cleanup();
      return;
    }
    animatePopupClose(menu, () => setContextMenuOpen(doc, false));
    scheduleCollapse(doc);
    cleanup();
  };
  setTimeout(() => doc.addEventListener("mousedown", closeMenu, true), 150);
}

function showSaveSuccessAnimation(doc: Document, categoryId: string): void {
  const wrapper = doc.querySelector(
    `.vertical-tabs-category[data-category-id="${categoryId}"]`,
  ) as HTMLElement | null;
  const header = wrapper?.querySelector(
    ".vertical-tabs-category-header",
  ) as HTMLElement | null;
  if (!wrapper || !header) return;

  const existing = header.querySelector(".vt-save-success-overlay");
  existing?.remove();

  const overlay = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as HTMLElement;
  overlay.className = "vt-save-success-overlay";

  const bar = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as HTMLElement;
  bar.className = "vt-save-success-bar";
  const categoryColor = wrapper.style.background?.trim();
  const defaultColor = isDarkMode(doc) ? "#6C6C6C" : "#BDBDBD";
  bar.style.background = categoryColor || defaultColor;

  const text = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as HTMLElement;
  text.className = "vt-save-success-text";
  text.textContent = getString("vertical-tabs-save-success");

  overlay.appendChild(bar);
  overlay.appendChild(text);
  header.appendChild(overlay);

  const onAnimationEnd = () => {
    overlay.removeEventListener("animationend", onAnimationEnd);
    overlay.remove();
  };
  overlay.addEventListener("animationend", onAnimationEnd);
}

async function handleSaveCategory(event: Event): Promise<void> {
  const customEvent = event as CustomEvent;
  const { categoryId } = customEvent.detail as { categoryId: string };
  const doc =
    (event.target as Node).ownerDocument ?? (event.target as Document);

  const category = _data?.categories.find((c) => c.id === categoryId);
  if (!category || !_data) return;

  const ztabs = getZoteroTabs();
  const itemSnapshots: ItemSnapshot[] = [];
  for (let i = 0; i < category.itemIds.length; i++) {
    const itemId = category.itemIds[i];
    const item = Zotero.Items.get(itemId) as Zotero.Item | false;
    if (!item) continue;

    const tabId = category.tabIds[i];
    let type: string | undefined;
    let data: any | undefined;
    if (tabId) {
      const tabInfo = ztabs?.getTabInfo(tabId);
      if (tabInfo) {
        type = tabInfo.type;
        data = tabInfo.data;
      }
    }

    itemSnapshots.push({
      itemId,
      title: getItemDisplayTitle(item as Zotero.Item),
      type,
      data,
      parentItemId:
        typeof item.parentItemID === "number" ? item.parentItemID : undefined,
    });
  }

  const snapshot = createCategorySnapshot(_data, categoryId, itemSnapshots);
  if (!snapshot) return;

  const collection = await loadSavedCategories();
  const existing = findSavedCategoryByName(collection, category.name);

  if (existing) {
    const confirmed = await promptOverwriteSavedCategory(doc, category.name);
    if (!confirmed) return;
    collection.categories = collection.categories.filter(
      (c) => c.id !== existing.id,
    );
  }

  const newCollection = addSavedCategory(collection, {
    name: category.name,
    itemIds: snapshot.itemIds,
    color: snapshot.color,
    itemSnapshots,
  });

  await saveSavedCategories(newCollection);
  showSaveSuccessAnimation(doc, categoryId);
}

function handleExternalDrop(event: Event): void {
  const customEvent = event as CustomEvent;
  const { data, pendingTabIds } = customEvent.detail as {
    data: VerticalTabsData;
    pendingTabIds?: string[];
  };
  const doc =
    (event.target as Node).ownerDocument ?? (event.target as Document);

  _data = data;

  syncTabOrderToNative(
    _data.categories.map((c) => ({ order: c.order, tabIds: c.tabIds })),
    _data.uncategorizedOrder,
    { doc, pendingTabIds },
  );

  void persist(doc);
}

/**
 * Prune a closed tabId from in-memory _data. Does not persist to disk;
 * the next normal persist will write the cleaned state.
 */
function cleanupClosedTabId(tabId: string): void {
  if (!_data) return;
  const liveTabIds = new Set(
    getLiveOpenTabIds().filter((id) => id && id !== tabId),
  );
  const cleaned = cleanStaleTabIds(_data, liveTabIds);
  ztoolkit.log(
    "[BVT-cat] cleanupClosedTabId:",
    tabId,
    "changed=",
    cleaned !== _data,
    "categories=",
    cleaned.categories.map((c) => ({ id: c.id, tabIds: c.tabIds })),
    "uncategorizedOrder=",
    cleaned.uncategorizedOrder,
  );
  _data = cleaned;
}

function handleShowMoreMenu(event: Event): void {
  const doc =
    (event.target as Node).ownerDocument ?? (event.target as Document);
  const btn = doc.querySelector(
    "#" + SIDEBAR_ID + " .vertical-tabs-more-btn",
  ) as HTMLElement | null;
  if (!btn) return;
  showMoreMenu(doc, btn);
}

function handleShowImportDialog(event: Event): void {
  const doc =
    (event.target as Node).ownerDocument ?? (event.target as Document);
  void showImportCategoryDialog(doc);
}

function handleShowHelpDialog(event: Event): void {
  const doc =
    (event.target as Node).ownerDocument ?? (event.target as Document);
  showHelpDialog(doc);
}

async function handleImportCategory(event: Event): Promise<void> {
  const customEvent = event as CustomEvent;
  const { savedCategoryId } = customEvent.detail as { savedCategoryId: string };
  const doc =
    (event.target as Node).ownerDocument ?? (event.target as Document);

  if (!_data) return;
  const collection = await loadSavedCategories();
  const savedCategory = collection.categories.find(
    (c) => c.id === savedCategoryId,
  );
  if (!savedCategory) return;

  const { data: newData, result } = await restoreCategory(_data, savedCategory);

  if (!result.success) {
    await showRestoreWarningDialog(doc, result);
    return;
  }

  _data = newData;
  void persist(doc);

  syncTabOrderToNative(
    _data.categories.map((c) => ({ order: c.order, tabIds: c.tabIds })),
    _data.uncategorizedOrder,
  );

  if (result.missingItemIds.length > 0 || result.updatedItemIds.length > 0) {
    await showRestoreWarningDialog(doc, result);
  }
}

function handleOpenPreferences(): void {
  openPluginPreferences();
}

async function handleAddCategory(event: Event): Promise<void> {
  // Debounce: prevent double-firing from bridged reader events
  const now = Date.now();
  if (now - _lastAddCatTime < 500) return;
  _lastAddCatTime = now;
  const doc =
    (event.target as Node).ownerDocument ?? (event.target as Document);

  const name = await promptCategoryName(doc, {
    title: getString("vertical-tabs-add-category"),
    initial: getString("vertical-tabs-category-new"),
    inputId: "vt-add-category-input",
  });
  if (name) {
    _data = addCategory(_data!, name);
    void persist(doc);
  }
}

/**
 * Quick-create flow from the top drop zone: create a category with the given
 * name, move the dragged tab into it, and place it at the TOP of the list.
 */
function handleCreateCategoryWithItem(event: Event): void {
  const customEvent = event as CustomEvent;
  const { name, itemId, tabId } = customEvent.detail as {
    name: string;
    itemId: number;
    tabId?: string;
  };
  const doc =
    (event.target as Node).ownerDocument ?? (event.target as Document);
  if (!_data || !name || !name.trim()) return;

  const created = addCategoryAtTop(_data, name);
  _data = assignItemToCategory(created.data, itemId, created.categoryId, tabId);

  // The persist below triggers a re-render; mark the new category so the
  // render post-processing plays its slide-down + fade-in entrance.
  markNewCategoryEntrance(doc, created.categoryId);

  syncTabOrderToNative(
    _data.categories.map((c) => ({ order: c.order, tabIds: c.tabIds })),
    _data.uncategorizedOrder,
  );
  void persist(doc);
}

/**
 * Multi-select quick-create: same as the single-tab flow but inserts the
 * whole ordered block of selected tabs into the new top category.
 */
function handleCreateCategoryWithItems(event: Event): void {
  const customEvent = event as CustomEvent;
  const { name, entries } = customEvent.detail as {
    name: string;
    entries: ItemTabEntry[];
  };
  const doc =
    (event.target as Node).ownerDocument ?? (event.target as Document);
  if (!_data || !name || !name.trim() || !entries?.length) return;

  const created = addCategoryAtTop(_data, name);
  _data = insertItemsIntoCategoryAt(
    created.data,
    created.categoryId,
    entries,
    undefined,
  );

  markNewCategoryEntrance(doc, created.categoryId);

  syncTabOrderToNative(
    _data.categories.map((c) => ({ order: c.order, tabIds: c.tabIds })),
    _data.uncategorizedOrder,
  );
  void persist(doc);
}

/**
 * Multi-tab move: insert the ordered block of dragged tabs at the target
 * position (category or uncategorized). insertItemsIntoCategoryAt /
 * insertUncategorizedItemsAt already handle the contiguous block, tabId
 * dedup and removal from previous locations.
 */
function handleMoveItems(event: Event): void {
  const customEvent = event as CustomEvent;
  const { categoryId, entries, insertBeforeTabId } = customEvent.detail as {
    categoryId: string;
    entries: ItemTabEntry[];
    insertBeforeTabId?: string;
  };
  const doc =
    (event.target as Node).ownerDocument ?? (event.target as Document);
  if (!_data || !entries?.length) return;

  if (categoryId && categoryId !== "__uncategorized__") {
    _data = insertItemsIntoCategoryAt(
      _data,
      categoryId,
      entries,
      insertBeforeTabId,
    );
  } else {
    _data = insertUncategorizedItemsAt(_data, entries, insertBeforeTabId);
  }

  syncTabOrderToNative(
    _data.categories.map((c) => ({ order: c.order, tabIds: c.tabIds })),
    _data.uncategorizedOrder,
  );
  void persist(doc);
}

function handleAssignItem(event: Event): void {
  const customEvent = event as CustomEvent;
  const { itemId, categoryId, tabId } = customEvent.detail as {
    itemId: number;
    categoryId: string;
    tabId?: string;
  };
  const doc =
    (event.target as Node).ownerDocument ?? (event.target as Document);

  if (categoryId === "__uncategorized__") {
    _data = removeItemFromAllCategories(_data!, itemId, tabId);
  } else {
    _data = assignItemToCategory(_data!, itemId, categoryId, tabId);
  }

  if (_data) {
    syncTabOrderToNative(
      _data.categories.map((c) => ({ order: c.order, tabIds: c.tabIds })),
      _data.uncategorizedOrder,
    );
  }

  void persist(doc);
}

function handleCategoryContext(event: Event): void {
  const customEvent = event as CustomEvent;
  const { categoryId, x, y } = customEvent.detail as {
    categoryId: string;
    x: number;
    y: number;
  };
  const doc =
    (event.target as Node).ownerDocument ?? (event.target as Document);
  showContextMenu(doc, categoryId, x, y);
}

function handleReorderItem(event: Event): void {
  const customEvent = event as CustomEvent;
  const { categoryId, tabId, targetTabId, before } = customEvent.detail as {
    categoryId: string;
    tabId: string;
    targetTabId: string;
    before: boolean;
  };

  // Find itemId: first from categories, fallback to OpenedPDFs (uncategorized)
  let movedItemId = _data?.categories.find((c) => c.tabIds.includes(tabId))
    ?.itemIds[0];
  if (!movedItemId) {
    const pdf = getOpenedPDFs().find((p) => p.tabId === tabId);
    movedItemId = pdf?.itemId;
  }

  // Use assignItemToCategory to properly move the item (handles itemIds + tabIds)
  if (categoryId && categoryId !== "__uncategorized__") {
    _data = assignItemToCategory(_data!, movedItemId || 0, categoryId, tabId);
  } else {
    _data = removeItemFromAllCategories(_data!, movedItemId || 0, tabId);
  }

  // Then reorder within the target
  if (categoryId && categoryId !== "__uncategorized__") {
    const cat = _data?.categories.find((c) => c.id === categoryId);
    let beforeTabId: string | null = null;
    if (cat && before) {
      beforeTabId = targetTabId;
    } else if (cat && targetTabId) {
      const targetIdx = cat.tabIds.indexOf(targetTabId);
      beforeTabId =
        targetIdx >= 0 && targetIdx < cat.tabIds.length - 1
          ? cat.tabIds[targetIdx + 1]
          : null;
    }
    _data = reorderItemInCategory(_data!, categoryId, tabId, beforeTabId);
  } else {
    _data = reorderUncategorized(
      _data!,
      tabId,
      movedItemId || 0,
      before ? targetTabId : null,
    );
  }

  const doc =
    (event.target as Node).ownerDocument ?? (event.target as Document);

  if (_data) {
    syncTabOrderToNative(
      _data.categories.map((c) => ({ order: c.order, tabIds: c.tabIds })),
      _data.uncategorizedOrder,
    );
  }

  void persist(doc);
}

function handleToggleCollapsed(event: Event): void {
  const { categoryId, collapsed } = (event as CustomEvent).detail as {
    categoryId: string;
    collapsed: boolean;
  };
  if (!_data) return;
  _data = {
    ..._data,
    categories: _data.categories.map((cat) =>
      cat.id === categoryId ? { ...cat, collapsed } : cat,
    ),
  };
  // Persist without dispatching data-changed: the UI already toggled the
  // collapsed class in place, and re-rendering the whole container would
  // destroy the DOM element and kill the CSS transition.
  void saveData(_data);
}

function cleanupOldCategoryHandlers(doc: Document): void {
  const old = (doc as any)[HANDLERS_KEY] as CategoryHandlers | undefined;
  if (!old) return;
  doc.removeEventListener("vertical-tabs:add-category", old.add);
  doc.removeEventListener(
    "vertical-tabs:create-category-with-item",
    old.createWithItem,
  );
  doc.removeEventListener(
    "vertical-tabs:create-category-with-items",
    old.createWithItems,
  );
  doc.removeEventListener("vertical-tabs:move-items", old.moveItems);
  doc.removeEventListener("vertical-tabs:assign-item", old.assign);
  doc.removeEventListener("vertical-tabs:category-context", old.context);
  doc.removeEventListener("vertical-tabs:reorder-item", old.reorder);
  doc.removeEventListener("vertical-tabs:category-context-rename", old.rename);
  doc.removeEventListener("vertical-tabs:category-context-delete", old.delete);
  doc.removeEventListener("vertical-tabs:category-context-color", old.color);
  doc.removeEventListener("vertical-tabs:reorder-categories", old.reorderCat);
  doc.removeEventListener(
    "vertical-tabs:category-toggle-collapsed",
    old.toggleCollapse,
  );
  doc.removeEventListener("vertical-tabs:save-category", old.save);
  doc.removeEventListener(
    "vertical-tabs:external-items-dropped",
    old.externalDrop,
  );
  doc.removeEventListener("vertical-tabs:tab-closed", old.tabClosed);
  doc.removeEventListener("vertical-tabs:request-sync-order", old.requestSync);
  doc.removeEventListener("vertical-tabs:show-more-menu", old.showMoreMenu);
  doc.removeEventListener(
    "vertical-tabs:show-import-dialog",
    old.showImportDialog,
  );
  doc.removeEventListener("vertical-tabs:show-help-dialog", old.showHelpDialog);
  doc.removeEventListener("vertical-tabs:import-category", old.importCategory);
  doc.removeEventListener(
    "vertical-tabs:open-preferences",
    old.openPreferences,
  );
  delete (doc as any)[HANDLERS_KEY];
}

export async function initCategoryManager(doc: Document): Promise<void> {
  _data = await loadData();
  loadLastReadTimes(_data.lastReadTimes ?? {});

  cleanupOldCategoryHandlers(doc);

  const renameHandler: EventListener = ((e: CustomEvent) => {
    const { categoryId, newName } = e.detail as {
      categoryId: string;
      newName: string;
    };
    _data = renameCategory(_data!, categoryId, newName);
    void persist(doc);
  }) as EventListener;

  const deleteHandler: EventListener = ((e: CustomEvent) => {
    const { categoryId } = e.detail as { categoryId: string };
    // Play the collapse+fade exit first; the data commit (closing tabs,
    // deleting the category, persisting) runs only after the animation, so
    // the wrapper is already zero-sized when the re-render removes it.
    animateCategoryExit(doc, categoryId, () => {
      const category = _data?.categories.find((c) => c.id === categoryId);
      if (category && category.tabIds.length > 0) {
        const ztabs = getZoteroTabs();
        const tabIdsToClose = category.tabIds.filter((tabId) => {
          const tabInfo = ztabs?.getTabInfo(tabId);
          return tabInfo && tabInfo.type !== "library";
        });
        if (tabIdsToClose.length > 0) {
          ztabs?.close(tabIdsToClose);
          // Stop tracking the closing tabs right away (silently). Otherwise
          // the data-changed re-render below would still see them in
          // _openedPDFs (the 100ms close-flush has not run) and briefly
          // resurrect them in the uncategorized area — a visible flash back
          // to the pre-delete state.
          removeTabsFromTrackingSilently(tabIdsToClose);
        }
      }
      _data = deleteCategory(_data!, categoryId);
      void persist(doc);
    });
  }) as EventListener;

  const colorHandler: EventListener = ((e: CustomEvent) => {
    const { categoryId, color } = e.detail as {
      categoryId: string;
      color: string;
    };
    if (!_data) return;
    _data = {
      ..._data,
      categories: _data.categories.map((cat) =>
        cat.id === categoryId
          ? { ...cat, color: color === "#F2F2F2" ? undefined : color }
          : cat,
      ),
    };
    void persist(doc);
  }) as EventListener;

  const reorderCategoriesHandler: EventListener = ((e: CustomEvent) => {
    const { categoryId, insertBeforeCategoryId } = e.detail as {
      categoryId: string;
      insertBeforeCategoryId: string | null;
    };
    if (!_data) return;
    _data = reorderCategories(_data, categoryId, insertBeforeCategoryId);

    syncTabOrderToNative(
      _data.categories.map((c) => ({ order: c.order, tabIds: c.tabIds })),
      _data.uncategorizedOrder,
    );

    void persist(doc);
  }) as EventListener;

  const requestSyncOrderHandler: EventListener = (() => {
    if (!_data) return;
    ztoolkit.log(
      "[BVT-cat] request-sync-order received, syncing native order to VT",
    );
    syncTabOrderToNative(
      _data.categories.map((c) => ({ order: c.order, tabIds: c.tabIds })),
      _data.uncategorizedOrder,
      { doc },
    );
  }) as EventListener;

  const handlers: CategoryHandlers = {
    add: handleAddCategory,
    createWithItem: handleCreateCategoryWithItem,
    createWithItems: handleCreateCategoryWithItems,
    moveItems: handleMoveItems,
    assign: handleAssignItem,
    context: handleCategoryContext,
    reorder: handleReorderItem,
    reorderCat: reorderCategoriesHandler,
    rename: renameHandler,
    delete: deleteHandler,
    color: colorHandler,
    toggleCollapse: handleToggleCollapsed,
    save: handleSaveCategory,
    externalDrop: handleExternalDrop,
    tabClosed: ((e: CustomEvent) => {
      const { tabId } = e.detail as { tabId: string };
      cleanupClosedTabId(tabId);
    }) as EventListener,
    requestSync: requestSyncOrderHandler,
    showMoreMenu: handleShowMoreMenu,
    showImportDialog: handleShowImportDialog,
    showHelpDialog: handleShowHelpDialog,
    importCategory: handleImportCategory,
    openPreferences: handleOpenPreferences,
  };

  doc.addEventListener("vertical-tabs:add-category", handlers.add);
  doc.addEventListener(
    "vertical-tabs:create-category-with-item",
    handlers.createWithItem,
  );
  doc.addEventListener(
    "vertical-tabs:create-category-with-items",
    handlers.createWithItems,
  );
  doc.addEventListener("vertical-tabs:move-items", handlers.moveItems);
  doc.addEventListener("vertical-tabs:assign-item", handlers.assign);
  doc.addEventListener("vertical-tabs:category-context", handlers.context);
  doc.addEventListener("vertical-tabs:reorder-item", handlers.reorder);
  doc.addEventListener(
    "vertical-tabs:category-context-rename",
    handlers.rename,
  );
  doc.addEventListener(
    "vertical-tabs:category-context-delete",
    handlers.delete,
  );
  doc.addEventListener("vertical-tabs:category-context-color", handlers.color);
  doc.addEventListener("vertical-tabs:reorder-categories", handlers.reorderCat);
  doc.addEventListener(
    "vertical-tabs:category-toggle-collapsed",
    handlers.toggleCollapse,
  );
  doc.addEventListener("vertical-tabs:save-category", handlers.save);
  doc.addEventListener(
    "vertical-tabs:external-items-dropped",
    handlers.externalDrop,
  );
  doc.addEventListener("vertical-tabs:tab-closed", handlers.tabClosed);
  doc.addEventListener("vertical-tabs:show-more-menu", handlers.showMoreMenu);
  doc.addEventListener(
    "vertical-tabs:show-import-dialog",
    handlers.showImportDialog,
  );
  doc.addEventListener(
    "vertical-tabs:show-help-dialog",
    handlers.showHelpDialog,
  );
  doc.addEventListener(
    "vertical-tabs:import-category",
    handlers.importCategory,
  );
  doc.addEventListener(
    "vertical-tabs:open-preferences",
    handlers.openPreferences,
  );

  doc.addEventListener("vertical-tabs:native-order-changed", ((
    e: CustomEvent,
  ) => {
    if (_syncingFromNative || isReaderRestoreInProgress()) return;
    const { nativeOrder } = (e.detail || {}) as {
      nativeOrder?: string[];
    };
    ztoolkit.log(
      "[BVT-cat] native-order-changed received, nativeOrder=",
      nativeOrder,
      "current categories=",
      _data?.categories.map((c) => ({ id: c.id, tabIds: c.tabIds })),
      "uncategorizedOrder=",
      _data?.uncategorizedOrder,
    );
    if (!nativeOrder || !_data) return;

    const sorted = [..._data.categories].sort((a, b) => a.order - b.order);
    const expected: string[] = [];
    for (const cat of sorted) {
      for (const tabId of cat.tabIds) {
        if (tabId) expected.push(tabId);
      }
    }
    for (const tabId of _data.uncategorizedOrder) {
      if (tabId) expected.push(tabId);
    }

    if (
      nativeOrder.length === expected.length &&
      nativeOrder.every((id, i) => id === expected[i])
    )
      return;

    _syncingFromNative = true;
    try {
      const newOrder = nativeOrder.filter(
        (id) =>
          _data!.categories.some((c) => c.tabIds.includes(id)) ||
          _data!.uncategorizedOrder.includes(id),
      );

      _data = {
        ..._data!,
        categories: _data!.categories.map((cat) => ({
          ...cat,
          tabIds: newOrder.filter((id) => cat.tabIds.includes(id)),
        })),
        uncategorizedOrder: newOrder.filter((id) =>
          _data!.uncategorizedOrder.includes(id),
        ),
      };
      ztoolkit.log(
        "[BVT-cat] native-order-changed applied new _data categories=",
        _data.categories.map((c) => ({ id: c.id, tabIds: c.tabIds })),
        "uncategorizedOrder=",
        _data.uncategorizedOrder,
      );

      void persist(doc);
    } finally {
      _syncingFromNative = false;
    }
  }) as EventListener);

  doc.addEventListener(
    "vertical-tabs:request-sync-order",
    handlers.requestSync,
  );

  doc.addEventListener("vertical-tabs:force-reload", async () => {
    _data = await loadData();
    dispatchDataChanged(doc);
  });

  (doc as any)[HANDLERS_KEY] = handlers;

  dispatchDataChanged(doc);
}

export function destroyCategoryManager(doc: Document): void {
  cleanupOldCategoryHandlers(doc);
  const menu = doc.getElementById("vertical-tabs-context-menu");
  menu?.remove();
  _data = null;
}

export function getData(): VerticalTabsData {
  return (
    _data ?? {
      version: 1,
      categories: [],
      uncategorizedOrder: [],
      uncategorizedItemIds: [],
      lastReadTimes: {},
    }
  );
}

export function cleanupStaleTabIds(doc?: Document): void {
  if (!_data) return;
  const liveTabIds = new Set(getLiveOpenTabIds(doc).filter((id) => id));
  const cleaned = cleanStaleTabIds(_data, liveTabIds);
  if (cleaned !== _data) {
    _data = cleaned;
    void persist(doc ?? getMainWindows()[0]?.document);
  }
}

export function restoreCategoriesAtStartup(doc?: Document): void {
  if (!_data) return;
  const entries = getNonNewLiveEntries();
  if (entries.length === 0) return;
  const restored = restoreCategoryTabIdsAndOrder(_data, entries);
  if (restored === _data) return;
  _data = restored;
  // Persist() merges the latest _lastReadTimes over _data.lastReadTimes. We
  // must first load the migrated lastReadTimes into itemTracker so that
  // getLastReadTimes() returns the new tabId keys; otherwise the migrated keys
  // would be overwritten with the stale keys still in memory.
  loadLastReadTimes(_data.lastReadTimes);
  void persist(doc ?? getMainWindows()[0]?.document);
}

export async function forceReload(): Promise<void> {
  _data = await loadData();
}

const DEFAULT_COLORS = [
  "#F2F2F2",
  "#BCD5C7",
  "#C0D0D0",
  "#E0DBD7",
  "#DEBFAE",
  "#E3C1C5",
];

export function getCategoryColors(): string[] {
  const prefs = Zotero.Prefs.get(
    `${PREF_NAMESPACE_CAT}.verticalTabs.categoryColors`,
  ) as string | undefined;
  if (prefs) {
    const custom = prefs
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (custom.length === 5) {
      return [DEFAULT_COLORS[0], ...custom];
    }
  }
  return DEFAULT_COLORS;
}
