import { config } from "../../../package.json";
import { dispatchVtEvent } from "../core/events";
import {
  persistTrackedItem,
  removePersistedItem,
  getTrackedItems,
} from "./categoryManager";
import type { TrackedItemInfo } from "./dataStore";
import { initReaderSidebar } from "../sidebar/readerSidebar";

export interface OpenedPDF {
  itemId: number;
  parentItemId?: number;
  parentItemType?: string;
  tabId: string;
  type: string;
  title: string;
  openedAt: number;
  vtPinned?: boolean;
}

function vtLog(msg: string): void {
  Zotero.logError(new Error("[BVT-tracker] " + msg));
}

let _notifierID: string | null = null;
let _itemNotifierID: string | null = null;
let _openedPDFs: OpenedPDF[] = [];
let _selectedTabId = "";

function getMainWindows(): Window[] {
  return Zotero.getMainWindows();
}

/**
 * Zotero_Tabs is a Window property in Zotero 8+, not a global.
 * Access through the first main window.
 */
export function getZoteroTabs(): _ZoteroTypes.Zotero_Tabs | undefined {
  const win = Zotero.getMainWindows()[0] as _ZoteroTypes.MainWindow | undefined;
  return win?.Zotero_Tabs;
}

function dispatchPDFsChanged(): void {
  for (const win of getMainWindows()) {
    dispatchVtEvent(win.document, "vertical-tabs:pdfs-changed");
  }
}

function getSelectedTabIdFromTabs(): string {
  const ztabs = getZoteroTabs();
  if (!ztabs) return "";
  const ztAny = ztabs as unknown as Record<string, unknown>;
  return typeof ztAny.selectedID === "string" ? ztAny.selectedID : "";
}

export function syncSelectedTabId(): boolean {
  const prev = _selectedTabId;
  const selected = getSelectedTabIdFromTabs();
  if (selected) {
    _selectedTabId = selected;
  }
  return _selectedTabId !== prev;
}

function updateOpenedAtForTab(tabId: string): void {
  const pdf = _openedPDFs.find((p) => p.tabId === tabId);
  if (!pdf) return;
  const now = Date.now();
  pdf.openedAt = now;
  if (isRememberCategoriesEnabled()) {
    void persistTrackedItem(pdf.itemId, {
      title: pdf.title,
      type: pdf.type,
      parentItemId: pdf.parentItemId,
      parentItemType: pdf.parentItemType,
      openedAt: now,
      vtPinned: pdf.vtPinned, // preserve across restart
    });
  }
}

async function handleTabAdded(tabId: string): Promise<void> {
  if (!tabId || tabId === "undefined") return;
  const ztabs = getZoteroTabs();
  const tabInfo = ztabs?.getTabInfo(tabId);
  if (!tabInfo) return;

  // Init reader sidebar injection for reader tabs (before any early return)
  if (tabInfo.type?.startsWith("reader")) {
    const vtEnabled = Zotero.Prefs.get(
      `${config.prefsPrefix}.verticalTabs.enabled`,
      true,
    ) as boolean;
    if (vtEnabled) {
      initReaderSidebar(tabId);
    }
  }

  // Track all tab types: reader (PDF), note, etc.
  // Try to get itemId from multiple sources
  let itemId = 0;
  // Source 1: reader._item
  try {
    const reader = Zotero.Reader.getByTabID(tabId);
    if (reader?._item) {
      itemId = reader._item.id;
    }
  } catch {
    // reader not ready yet
  }

  // Source 2: tabInfo.data
  if (!itemId && tabInfo.data?.itemID) {
    itemId = tabInfo.data.itemID;
  }

  if (!itemId) return;

  // Check for existing dormant entry (from persisted data, tabId="")
  const dormantIdx = _openedPDFs.findIndex(
    (pdf) => pdf.itemId === itemId && pdf.tabId === "",
  );
  if (dormantIdx >= 0) {
    _openedPDFs[dormantIdx].tabId = tabId;
    _openedPDFs[dormantIdx].type = tabInfo.type;
    _openedPDFs[dormantIdx].title =
      tabInfo.title || _openedPDFs[dormantIdx].title;
    dispatchPDFsChanged();
    return;
  }

  if (_openedPDFs.some((pdf) => pdf.tabId === tabId)) return;

  let parentItemId: number | undefined;
  let parentItemType: string | undefined;
  try {
    const item = Zotero.Items.get(itemId);
    if (item) {
      const pid = (item as Zotero.Item).parentItemID;
      parentItemId = typeof pid === "number" ? pid : undefined;
      // Also look up parent item type (cached for reader sandbox icon rendering)
      if (parentItemId !== undefined) {
        const parentItem = Zotero.Items.get(parentItemId);
        if (parentItem) {
          parentItemType = (parentItem as Zotero.Item).itemType;
        }
      }
    }
  } catch {
    // ignore
  }

  // Carry over vtPinned from persisted tracked data (if any)
  const tracked = getTrackedItems();
  const existingTracked = tracked[itemId];

  _openedPDFs.push({
    itemId,
    parentItemId,
    parentItemType,
    tabId,
    type: tabInfo.type,
    title: tabInfo.title || "",
    openedAt: Date.now(),
    vtPinned: existingTracked?.vtPinned,
  });

  // Persist to JSON for restart recovery (only if feature enabled)
  if (isRememberCategoriesEnabled()) {
    void persistTrackedItem(itemId, {
      title: tabInfo.title || "",
      type: tabInfo.type,
      parentItemId,
      parentItemType,
      openedAt: Date.now(),
      vtPinned: existingTracked?.vtPinned, // preserve from previous session
    });
  }

  dispatchPDFsChanged();
}

function isRememberCategoriesEnabled(): boolean {
  return (
    (Zotero.Prefs.get(
      `${config.prefsPrefix}.verticalTabs.rememberCategories`,
      true,
    ) as boolean | undefined) ?? true
  );
}

function handleTabClosed(tabId: string): void {
  const beforeLength = _openedPDFs.length;
  const closed = _openedPDFs.find((pdf) => pdf.tabId === tabId);
  _openedPDFs = _openedPDFs.filter((pdf) => pdf.tabId !== tabId);
  if (_openedPDFs.length !== beforeLength) {
    // Clean up persisted item if no longer in a category
    if (closed && closed.itemId > 0) {
      void removePersistedItem(closed.itemId);
    }
    dispatchPDFsChanged();
  }
}

export function startTracking(): void {
  if (_notifierID) return;

  _notifierID = Zotero.Notifier.registerObserver(
    {
      notify: async (event, type, ids) => {
        if (type !== "tab") return;
        if (event === "add" || event === "open") {
          for (const id of ids) {
            setTimeout(() => {
              void handleTabAdded(id as string);
            }, 200);
          }
        } else if (event === "select") {
          for (const id of ids) {
            const tabId = String(id);
            _selectedTabId = tabId;
            updateOpenedAtForTab(tabId);
            dispatchPDFsChanged(); // re-render to update active highlight
            setTimeout(() => {
              const vtEnabled = Zotero.Prefs.get(
                `${config.prefsPrefix}.verticalTabs.enabled`,
                true,
              ) as boolean;
              if (!vtEnabled) return;
              const ti = getZoteroTabs()?.getTabInfo(tabId);
              if (ti?.type?.startsWith("reader")) {
                initReaderSidebar(tabId);
              }
            }, 500);
          }
        } else if (event === "close") {
          for (const id of ids) {
            handleTabClosed(id as string);
          }
        }
      },
    },
    ["tab"],
    `${config.addonRef}-vertical-tabs-tracker`,
    100,
  );

  // Also listen for item modifications to update tab titles in sidebar
  _itemNotifierID = Zotero.Notifier.registerObserver(
    {
      notify: async (event, type, ids) => {
        if (type !== "item" || event !== "modify") return;
        const itemIds = new Set(ids as number[]);
        let changed = false;
        for (const pdf of _openedPDFs) {
          // Check both the item itself and its parent
          const matches =
            itemIds.has(pdf.itemId) ||
            (pdf.parentItemId !== undefined && itemIds.has(pdf.parentItemId));
          if (matches) {
            const ztabs = getZoteroTabs();
            const tabInfo = ztabs?.getTabInfo(pdf.tabId);
            if (tabInfo?.title && tabInfo.title !== pdf.title) {
              pdf.title = tabInfo.title;
            }
            changed = true;
          }
        }
        if (changed) {
          dispatchPDFsChanged();
        }
      },
    },
    ["item"],
    `${config.addonRef}-vertical-tabs-item-tracker`,
    100,
  );

  // Sync active tab immediately in case startup restored a reader tab
  // before any select event was observed.
  if (syncSelectedTabId()) {
    dispatchPDFsChanged();
  }
}

export function stopTracking(): void {
  if (_notifierID) {
    Zotero.Notifier.unregisterObserver(_notifierID);
    _notifierID = null;
  }
  if (_itemNotifierID) {
    Zotero.Notifier.unregisterObserver(_itemNotifierID);
    _itemNotifierID = null;
  }
  _openedPDFs = [];
  _selectedTabId = "";
}

export function getOpenedPDFs(): OpenedPDF[] {
  return [..._openedPDFs];
}

export function getSelectedTabId(): string {
  return _selectedTabId;
}

export function getOpenedPDFByItemId(itemId: number): OpenedPDF | undefined {
  return _openedPDFs.find((pdf) => pdf.itemId === itemId);
}

export function getOpenedPDFByTabId(tabId: string): OpenedPDF | undefined {
  return _openedPDFs.find((pdf) => pdf.tabId === tabId);
}

export function refreshOpenedPDFs(): void {
  _openedPDFs = [];
  try {
    const ztabs = getZoteroTabs();
    if (!ztabs) return;
    const ztAny = ztabs as unknown as Record<string, unknown>;

    // Use _tabs internal array (has correct id fields in Zotero 8+)
    const internalTabs = ztAny._tabs as any[] | undefined;
    if (internalTabs && internalTabs.length > 0) {
      for (const tab of internalTabs) {
        const tabId = String(tab.id ?? "");
        if (tabId) void handleTabAdded(tabId);
      }
      if (syncSelectedTabId()) {
        dispatchPDFsChanged();
      }
      return;
    }

    // Fallback: getState()
    const state = (ztabs.getState?.() ?? []) as any[];
    for (const tab of state) {
      const tabId = String(tab.id ?? "");
      if (tabId) void handleTabAdded(tabId);
    }
    if (syncSelectedTabId()) {
      dispatchPDFsChanged();
    }
  } catch (error) {
    vtLog("refreshOpenedPDFs: FAILED " + String(error));
  }
}

export function scanOpenedTabs(): void {
  try {
    const ztabs = getZoteroTabs();
    if (!ztabs) return;
    const ztAny = ztabs as unknown as Record<string, unknown>;

    const internalTabs = ztAny._tabs as any[] | undefined;
    if (internalTabs && internalTabs.length > 0) {
      for (const tab of internalTabs) {
        const tabId = String(tab.id ?? "");
        if (tabId) void handleTabAdded(tabId);
      }
      if (syncSelectedTabId()) {
        dispatchPDFsChanged();
      }
      return;
    }

    const state = (ztabs.getState?.() ?? []) as any[];
    for (const tab of state) {
      const tabId = String(tab.id ?? "");
      if (tabId) void handleTabAdded(tabId);
    }
    if (syncSelectedTabId()) {
      dispatchPDFsChanged();
    }
  } catch (error) {
    vtLog("scanOpenedTabs: FAILED " + String(error));
  }
}

/**
 * Restore dormant items from persisted JSON.
 * Called at startup — creates OpenedPDF entries with tabId="" so the
 * sidebar shows categorized items immediately, before actual tabs are restored.
 * When real tabs open via notifier, dormant entries are updated with real tabIds.
 */
export function restoreDormantItems(): void {
  const tracked = getTrackedItems();
  for (const [itemIdStr, info] of Object.entries(tracked)) {
    const itemId = Number(itemIdStr);
    // Skip if already tracked (shouldn't happen at startup, but safe)
    if (_openedPDFs.some((pdf) => pdf.itemId === itemId)) continue;
    _openedPDFs.push({
      itemId,
      parentItemId: info.parentItemId,
      parentItemType: info.parentItemType,
      tabId: "", // dormant: no active tab yet
      type: info.type,
      title: info.title,
      openedAt: info.openedAt,
      vtPinned: info.vtPinned,
    });
  }
  if (Object.keys(tracked).length > 0) dispatchPDFsChanged();
}

// ── Tab order sync with Zotero's native tab bar ──

let _syncTabOrderTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Reorder Zotero's native horizontal tabs to match VT's vertical order.
 * Debounced — multiple rapid calls only trigger one actual reorder.
 */
export function syncTabOrderToNative(
  categories: { order: number; tabIds: string[] }[],
  uncategorizedOrder: string[],
): void {
  // Clear previous pending sync
  if (_syncTabOrderTimer) clearTimeout(_syncTabOrderTimer);

  // Build desired order
  const desired: string[] = [];
  const seen = new Set<string>();

  const sorted = [...categories].sort((a, b) => a.order - b.order);
  for (const cat of sorted) {
    for (const tabId of cat.tabIds) {
      if (tabId && !seen.has(tabId)) {
        desired.push(tabId);
        seen.add(tabId);
      }
    }
  }
  for (const tabId of uncategorizedOrder) {
    if (tabId && !seen.has(tabId)) {
      desired.push(tabId);
      seen.add(tabId);
    }
  }

  _syncTabOrderTimer = setTimeout(() => {
    _syncTabOrderTimer = null;
    try {
      const ztabs = getZoteroTabs();
      const internalTabs = (ztabs as any)?._tabs as any[] | undefined;
      if (!internalTabs || internalTabs.length < 2) return;

      // Add remaining tabs not in VT order at the end
      for (const tab of internalTabs) {
        const tid = String(tab.id ?? "");
        if (tid && !seen.has(tid)) {
          desired.push(tid);
          seen.add(tid);
        }
      }

      // Build final order: library tab (index 0) stays first
      const finalOrder = [String(internalTabs[0]?.id ?? "")];
      const seenFinal = new Set<string>(finalOrder);
      for (const tid of desired) {
        if (!seenFinal.has(tid)) {
          finalOrder.push(tid);
          seenFinal.add(tid);
        }
      }

      // Skip if already correct
      if (
        finalOrder.length === internalTabs.length &&
        finalOrder.every((id, i) => String(internalTabs[i]?.id ?? "") === id)
      )
        return;

      // Build new tab array in desired order, then replace entire _tabs content
      const newTabs = finalOrder
        .map((id) => internalTabs.find((t) => String(t.id) === id))
        .filter(Boolean);

      // Replace in place to trigger reactivity
      internalTabs.splice(0, internalTabs.length, ...newTabs);

      // Try to force visual update
      try {
        (ztabs as any)?._update?.();
      } catch {
        // ignore
      }
    } catch {
      // ignore
    }
  }, 100);
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
