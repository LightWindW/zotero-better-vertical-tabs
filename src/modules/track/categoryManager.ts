import { config } from "../../../package.json";
import { getString } from "../../utils/locale";
import {
  addCategory,
  assignItemToCategory,
  deleteCategory,
  loadData,
  removeItemFromAllCategories,
  removeTrackedItem,
  renameCategory,
  reorderCategories,
  reorderItemInCategory,
  reorderUncategorized,
  saveData,
  saveTrackedItem,
  TrackedItemInfo,
  VerticalTabsData,
} from "./dataStore";
import { dispatchVtEvent } from "../core/events";
import {
  getContextMenuColors,
  lightToDark,
  isDarkMode,
} from "../render/colorUtils";
import { getOpenedPDFs, syncTabOrderToNative } from "./itemTracker";
import {
  HOVER_STRIP_CLASS,
  scheduleCollapse,
  setContextMenuOpen,
  SIDEBAR_ID,
} from "../sidebar/sidebar";

const PREF_NAMESPACE_CAT = config.prefsPrefix;

let _data: VerticalTabsData | null = null;
let _lastAddCatTime = 0;
let _syncingFromNative = false;

interface CategoryHandlers {
  add: EventListener;
  assign: EventListener;
  context: EventListener;
  reorder: EventListener;
  reorderCat: EventListener;
  rename: EventListener;
  delete: EventListener;
  color: EventListener;
}

const HANDLERS_KEY = "__vtCategoryHandlers";

function dispatchDataChanged(doc: Document): void {
  dispatchVtEvent(doc, "vertical-tabs:data-changed");
}

async function persist(doc: Document): Promise<void> {
  if (!_data) return;
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
    background: ${mc.background};
    border: ${mc.border};
    border-radius: 6px;
    box-shadow: ${mc.shadow};
    backdrop-filter: ${mc.backdropFilter};
    -webkit-backdrop-filter: ${mc.backdropFilter};
    z-index: 100000;
    padding: 4px 0;
    font-size: 13px;
    color: ${mc.text};
    min-width: 120px;
    font-family: message-box;
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
      menu.remove();
      setContextMenuOpen(doc, false);
      scheduleCollapse(doc);
      const cat = _data?.categories.find((cat) => cat.id === categoryId);
      if (cat && _data) {
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
    menu.remove();
    setContextMenuOpen(doc, false);
    scheduleCollapse(doc);
    const cat = _data?.categories.find((c) => c.id === categoryId);
    const dialogData: { [key: string]: any } = {
      inputValue: cat?.name ?? "",
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

    await dialogData.unloadLock.promise;

    if (dialogData._lastButtonId === "confirm") {
      const newName = (dialogData.inputValue as string) || "";
      if (newName.trim()) {
        _data = renameCategory(_data!, categoryId, newName.trim());
        void persist(doc);
      }
    }
  });
  menu.appendChild(renameItem);

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
    menu.remove();
    setContextMenuOpen(doc, false);
    scheduleCollapse(doc);
    _data = deleteCategory(_data!, categoryId);
    void persist(doc);
  });
  menu.appendChild(deleteItem);

  doc.documentElement?.appendChild(menu);
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
  setTimeout(() => doc.addEventListener("mousedown", closeMenu, true), 150);
}

async function handleAddCategory(event: Event): Promise<void> {
  // Debounce: prevent double-firing from bridged reader events
  const now = Date.now();
  if (now - _lastAddCatTime < 500) return;
  _lastAddCatTime = now;
  const doc =
    (event.target as Node).ownerDocument ?? (event.target as Document);
  const defaultName = getString("vertical-tabs-category-new");

  const dialogData: { [key: string]: any } = {
    inputValue: defaultName,
  };

  new ztoolkit.Dialog(2, 1)
    .addCell(0, 0, {
      tag: "label",
      namespace: "html",
      properties: {
        innerHTML: getString("vertical-tabs-add-category"),
      },
    })
    .addCell(1, 0, {
      tag: "input",
      namespace: "html",
      id: "vt-add-category-input",
      attributes: {
        "data-bind": "inputValue",
        "data-prop": "value",
        type: "text",
      },
    })
    .addButton(getString("vertical-tabs-confirm"), "confirm")
    .addButton(getString("vertical-tabs-cancel"), "cancel")
    .setDialogData(dialogData)
    .open(getString("vertical-tabs-add-category"));

  await dialogData.unloadLock.promise;

  if (dialogData._lastButtonId === "confirm") {
    const name = (dialogData.inputValue as string) || "";
    if (name.trim()) {
      _data = addCategory(_data!, name.trim());
      void persist(doc);
    }
  }
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
    _data = reorderUncategorized(_data!, tabId, before ? targetTabId : null);
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

function cleanupOldCategoryHandlers(doc: Document): void {
  const old = (doc as any)[HANDLERS_KEY] as CategoryHandlers | undefined;
  if (!old) return;
  doc.removeEventListener("vertical-tabs:add-category", old.add);
  doc.removeEventListener("vertical-tabs:assign-item", old.assign);
  doc.removeEventListener("vertical-tabs:category-context", old.context);
  doc.removeEventListener("vertical-tabs:reorder-item", old.reorder);
  doc.removeEventListener("vertical-tabs:category-context-rename", old.rename);
  doc.removeEventListener("vertical-tabs:category-context-delete", old.delete);
  doc.removeEventListener("vertical-tabs:category-context-color", old.color);
  doc.removeEventListener("vertical-tabs:reorder-categories", old.reorderCat);
  delete (doc as any)[HANDLERS_KEY];
}

export async function initCategoryManager(doc: Document): Promise<void> {
  _data = await loadData();

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
    _data = deleteCategory(_data!, categoryId);
    void persist(doc);
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

  const handlers: CategoryHandlers = {
    add: handleAddCategory,
    assign: handleAssignItem,
    context: handleCategoryContext,
    reorder: handleReorderItem,
    reorderCat: reorderCategoriesHandler,
    rename: renameHandler,
    delete: deleteHandler,
    color: colorHandler,
  };

  doc.addEventListener("vertical-tabs:add-category", handlers.add);
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

  doc.addEventListener("vertical-tabs:native-order-changed", ((
    e: CustomEvent,
  ) => {
    if (_syncingFromNative) return;
    const { nativeOrder } = (e.detail || {}) as {
      nativeOrder?: string[];
    };
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

      void persist(doc);
    } finally {
      _syncingFromNative = false;
    }
  }) as EventListener);

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
      trackedItems: {},
      uncategorizedOrder: [],
    }
  );
}

export async function forceReload(): Promise<void> {
  _data = await loadData();
}

export async function persistTrackedItem(
  itemId: number,
  info: TrackedItemInfo,
): Promise<void> {
  if (!_data) return;
  _data = saveTrackedItem(_data, itemId, info);
  await saveData(_data);
}

export async function removePersistedItem(itemId: number): Promise<void> {
  if (!_data) return;
  // Keep the item if it's still assigned to a category (for restart restore)
  const inCategory = _data.categories.some((cat) =>
    cat.itemIds.includes(itemId),
  );
  if (inCategory) return;
  _data = removeTrackedItem(_data, itemId);
  await saveData(_data);
}

export function getTrackedItems(): Record<number, TrackedItemInfo> {
  return _data?.trackedItems ?? {};
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

/**
 * Sync category tabIds from itemIds using current _openedPDFs.
 * Needed after restore/load when tabIds may be empty (old data).
 */
export function populateCategoryTabIds(
  getOpenedPDFs: () => { tabId: string; itemId: number }[],
): void {
  if (!_data) return;
  const pdfs = getOpenedPDFs();
  const itemToTabs = new Map<number, string[]>();
  for (const pdf of pdfs) {
    if (!pdf.tabId) continue;
    const tabs = itemToTabs.get(pdf.itemId) || [];
    tabs.push(pdf.tabId);
    itemToTabs.set(pdf.itemId, tabs);
  }
  _data = {
    ..._data,
    categories: _data.categories.map((cat) => {
      if (cat.tabIds.length >= cat.itemIds.length) return cat;
      const populated = [...cat.tabIds];
      for (const itemId of cat.itemIds) {
        const tabs = itemToTabs.get(itemId) || [];
        for (const t of tabs) {
          if (!populated.includes(t)) populated.push(t);
        }
      }
      return { ...cat, tabIds: populated };
    }),
  };
}
