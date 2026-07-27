import { config } from "../../../package.json";
import { dispatchVtEvent } from "../core/events";
import { getItemDisplayTitle } from "../utils/itemTitle";
import {
  clearReleasedReaderState,
  dispatchReaderLoadingEvent,
  markReaderRestored,
  restoreReaderForTab,
  waitForReaderLoaded,
} from "./readerRelease";
import {
  isReaderRestoreInProgress,
  markPendingSyncTabOrder,
} from "./orderSyncControl";
import { saveLastReadTimes, type VerticalTabsData } from "./dataStore";
import type { ItemTabEntry } from "./dataStore";
import {
  clearItemInfoCache,
  invalidateItemInfo,
} from "../render/itemInfoCache";

export interface OpenedPDF {
  itemId: number;
  parentItemId?: number;
  parentItemType?: string;
  tabId: string;
  type: string;
  title: string;
  openedAt: number;
  /**
   * True for tabs opened after startup restoration has completed. These tabs
   * must never be auto-matched to previous categories by itemId.
   */
  isNew?: boolean;
  /**
   * True when the PDF reader resources for this tab have been released
   * to free memory, but the native Zotero tab is still open.
   */
  readerReleased?: boolean;
}

function vtLog(msg: string): void {
  Zotero.logError(new Error("[BVT-tracker] " + msg));
}

let _notifierID: string | null = null;
let _itemNotifierID: string | null = null;
let _openedPDFs: OpenedPDF[] = [];
let _selectedTabId = "";
let _startupRestoreDone = false;
let _lastReadTimes: Record<string, number> = {};
let _saveLastReadTimesTimer: ReturnType<typeof setTimeout> | null = null;
const SAVE_LAST_READ_TIMES_DELAY_MS = 1000;

/** Tab IDs that received a "close" notifier but may be transiently recreated. */
const _pendingClosedTabIds = new Set<string>();
let _pendingClosedFlushTimer: ReturnType<typeof setTimeout> | null = null;
const PENDING_CLOSED_FLUSH_DELAY_MS = 100;

export function getMainWindows(): Window[] {
  return Zotero.getMainWindows();
}

export function markStartupRestoreDone(): void {
  _startupRestoreDone = true;
}

export function isStartupRestoreDone(): boolean {
  return _startupRestoreDone;
}

/**
 * Merge persisted times into memory, keeping the NEWEST timestamp per tabId.
 *
 * This used to be a wholesale replace of the in-memory map. The startup
 * retry loop re-invokes it with the `_data.lastReadTimes` field, which lags
 * behind memory — a replace wiped times that tab selections had written
 * between two restore passes (one of the "times reset to just now after
 * restart" failure modes). Merge-max is safe for the old→new tabId
 * migration because startup-restored tabs never get a fresh timestamp
 * written before the migration runs (see handleTabAdded).
 */
export function loadLastReadTimes(times: Record<string, number>): void {
  for (const [tabId, time] of Object.entries(times)) {
    if (typeof time !== "number") continue;
    const existing = _lastReadTimes[tabId];
    if (existing === undefined || time > existing) {
      _lastReadTimes[tabId] = time;
    }
  }
}

export function getLastReadTimes(): Record<string, number> {
  return { ..._lastReadTimes };
}

function debouncedSaveLastReadTimes(): void {
  if (_saveLastReadTimesTimer) {
    clearTimeout(_saveLastReadTimesTimer);
  }
  _saveLastReadTimesTimer = setTimeout(() => {
    _saveLastReadTimesTimer = null;
    void saveLastReadTimes({ ..._lastReadTimes });
  }, SAVE_LAST_READ_TIMES_DELAY_MS);
}

export function setLastReadTime(tabId: string, time: number): void {
  _lastReadTimes[tabId] = time;
  debouncedSaveLastReadTimes();
}

export function removeLastReadTime(tabId: string): void {
  delete _lastReadTimes[tabId];
  void saveLastReadTimes({ ..._lastReadTimes });
}

/**
 * Synchronously stop tracking the given tabs WITHOUT dispatching
 * tab-closed events.
 *
 * Used by category deletion and by every VT-internal close commit (×,
 * middle-click, context menu, close-others): the exit animation has already
 * finished when this runs, so the closed rows must not come back. Dispatching
 * pdfs-changed here is safe — the tabs are already out of _openedPDFs, so the
 * re-render cannot resurrect them (the flash-back this silence was designed
 * to prevent came from re-rendering BEFORE removal). The re-render is also
 * what refreshes category header counts: tab selection no longer triggers
 * full re-renders (active-changed targeted update), so without this dispatch
 * nothing would update the count. Category data itself is left untouched;
 * the next normal persist writes the cleaned state, and the 100ms
 * close-flush finds nothing to remove and skips its own dispatches.
 * lastReadTimes are cleaned here with a single disk write for the batch.
 */
export function removeTabsFromTrackingSilently(tabIds: string[]): void {
  let removedAny = false;
  for (const tabId of tabIds) {
    _pendingClosedTabIds.delete(tabId);
    const beforeLength = _openedPDFs.length;
    _openedPDFs = _openedPDFs.filter((pdf) => pdf.tabId !== tabId);
    if (_openedPDFs.length !== beforeLength) {
      delete _lastReadTimes[tabId];
      removedAny = true;
    }
  }
  if (removedAny) {
    // One disk write for the whole batch (close-others can be many tabs).
    void saveLastReadTimes({ ..._lastReadTimes });
    dispatchPDFsChanged();
  }
}

export function applyLastReadTimesToOpenedPDFs(): void {
  let changed = false;
  for (const pdf of _openedPDFs) {
    const time = _lastReadTimes[pdf.tabId];
    if (time !== undefined && time !== pdf.openedAt) {
      pdf.openedAt = time;
      changed = true;
    }
  }
  if (changed) {
    dispatchPDFsChanged();
  }
}

/**
 * Return live tabId/itemId entries that were present before startup restoration
 * completed. These are the only tabs eligible for category/order restore on
 * Zotero restart.
 */
export function getNonNewLiveEntries(): ItemTabEntry[] {
  return _openedPDFs
    .filter((pdf) => !pdf.isNew)
    .map((pdf) => ({ itemId: pdf.itemId, tabId: pdf.tabId }));
}

/**
 * Zotero_Tabs is a Window property in Zotero 8+, not a global.
 * Access through the provided document's window, or the first main window.
 */
export function getZoteroTabs(
  doc?: Document,
): _ZoteroTypes.Zotero_Tabs | undefined {
  const winFromDoc = doc?.defaultView as _ZoteroTypes.MainWindow | undefined;
  if (winFromDoc && winFromDoc.Zotero_Tabs) {
    return winFromDoc.Zotero_Tabs;
  }
  const win = Zotero.getMainWindows()[0] as _ZoteroTypes.MainWindow | undefined;
  return win?.Zotero_Tabs;
}

/**
 * Return all tab ids currently present in Zotero_Tabs._tabs for the given
 * document's window (or the first main window).
 */
export function getLiveOpenTabIds(doc?: Document): string[] {
  const ztabs = getZoteroTabs(doc);
  const internalTabs = (ztabs as any)?._tabs as any[] | undefined;
  return (internalTabs ?? []).map((t) => String(t.id ?? "")).filter((id) => id);
}

/**
 * Return entries for tabs that are currently open and not assigned to any
 * category. Tabs without a known itemId (e.g. the library tab) are skipped.
 */
export function getLiveUncategorizedEntries(
  data: VerticalTabsData,
  doc?: Document,
): ItemTabEntry[] {
  const ztabs = getZoteroTabs(doc);
  const internalTabs = (ztabs as any)?._tabs as any[] | undefined;
  if (!internalTabs) return [];

  const assignedTabIds = new Set(
    data.categories.flatMap((c) => c.tabIds).filter(Boolean),
  );

  const result: ItemTabEntry[] = [];
  for (const tab of internalTabs) {
    const tabId = String(tab.id ?? "");
    if (!tabId || assignedTabIds.has(tabId)) continue;

    let itemId = 0;
    try {
      const tabInfo = ztabs?.getTabInfo(tabId);
      if (tabInfo?.data?.itemID) {
        itemId = tabInfo.data.itemID;
      }
    } catch {
      // ignore
    }
    if (!itemId) {
      const pdf = _openedPDFs.find((p) => p.tabId === tabId);
      itemId = pdf?.itemId ?? 0;
    }

    if (itemId) {
      result.push({ itemId, tabId });
    }
  }
  return result;
}

export function dispatchPDFsChanged(): void {
  for (const win of getMainWindows()) {
    dispatchVtEvent(win.document, "vertical-tabs:pdfs-changed");
  }
}

/**
 * Lightweight tab-selection event: only the active-row highlight (and the
 * selected row's relative-time label) need updating — no full list rebuild.
 */
export function dispatchActiveTabChanged(tabId: string): void {
  for (const win of getMainWindows()) {
    dispatchVtEvent(win.document, "vertical-tabs:active-changed", { tabId });
  }
}

/**
 * Periodic lightweight tick for the display timers: rows update their
 * relative-time labels in place ("1 分钟前" → "2 分钟前"). Used instead of
 * a full re-render so the DOM — and any in-progress drag/hover state — is
 * left untouched.
 */
export function dispatchTimeTick(): void {
  for (const win of getMainWindows()) {
    dispatchVtEvent(win.document, "vertical-tabs:time-tick");
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
  setLastReadTime(tabId, now);
}

async function handleTabAdded(tabId: string): Promise<void> {
  if (!tabId || tabId === "undefined") return;
  const ztabs = getZoteroTabs();
  const tabInfo = ztabs?.getTabInfo(tabId);
  if (!tabInfo) return;

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

  if (_openedPDFs.some((pdf) => pdf.tabId === tabId)) return;

  let parentItemId: number | undefined;
  let parentItemType: string | undefined;
  let item: Zotero.Item | undefined;
  try {
    item = Zotero.Items.get(itemId) as Zotero.Item | undefined;
    if (item) {
      const pid = item.parentItemID;
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

  const title = item
    ? getItemDisplayTitle(item, tabInfo.title || "")
    : tabInfo.title || "";

  const time = _lastReadTimes[tabId];
  const openedAt = time ?? Date.now();
  _openedPDFs.push({
    itemId,
    parentItemId,
    parentItemType,
    tabId,
    type: tabInfo.type,
    title,
    openedAt,
    isNew: _startupRestoreDone,
    readerReleased: false,
  });
  // Genuinely new tab (opened after startup restore completed): persist its
  // initial time right away. Otherwise a tab the user never selects again
  // has nothing stored, and the next restart shows "just now" instead of its
  // real age. Startup-restored tabs are deliberately skipped: their
  // timestamps come from the old→new tabId migration, and a fresh "now"
  // entry would win the merge against the migrated old time.
  if (time === undefined && _startupRestoreDone) {
    setLastReadTime(tabId, openedAt);
  }

  dispatchPDFsChanged();

  // For reader tabs, the reader loads asynchronously. Show the loaded
  // indicator immediately when initialization starts, and re-render once it
  // is ready so the indicator reflects the final loaded state.
  // Lazy reader tabs (type === "reader-unloaded") are not loaded yet, so do
  // not show the indicator until the user selects the tab.
  if (
    tabInfo.type?.startsWith("reader") &&
    tabInfo.type !== "reader-unloaded"
  ) {
    dispatchReaderLoadingEvent(tabId);
    waitForReaderLoaded(tabId, 15000).then((loaded) => {
      if (loaded) {
        for (const win of getMainWindows()) {
          dispatchVtEvent(win.document, "vertical-tabs:reader-restored", {
            tabId,
          });
        }
      }
    });
  }
}

function handleTabClosed(tabId: string): void {
  // A released reader that is closed must not stay in the released set,
  // otherwise its tabId could be matched by isReaderLoaded later.
  markReaderRestored(tabId);

  if (!tabId) return;

  // Defer the actual removal to filter out transient close/add cycles
  // produced by Zotero.Reader.open() or internal tab rebuilds.
  _pendingClosedTabIds.add(tabId);
  schedulePendingClosedFlush();
}

function schedulePendingClosedFlush(): void {
  if (_pendingClosedFlushTimer) return;
  _pendingClosedFlushTimer = setTimeout(() => {
    _pendingClosedFlushTimer = null;
    flushPendingClosedTabs();
  }, PENDING_CLOSED_FLUSH_DELAY_MS);
}

function flushPendingClosedTabs(): void {
  if (_pendingClosedTabIds.size === 0) return;
  const liveTabIds = new Set(getLiveOpenTabIds());
  for (const tabId of Array.from(_pendingClosedTabIds)) {
    if (liveTabIds.has(tabId)) {
      // The tab was recreated; keep tracking it.
      _pendingClosedTabIds.delete(tabId);
    } else {
      actuallyRemoveClosedTab(tabId);
    }
  }
}

function actuallyRemoveClosedTab(tabId: string): void {
  const beforeLength = _openedPDFs.length;
  _openedPDFs = _openedPDFs.filter((pdf) => pdf.tabId !== tabId);
  _pendingClosedTabIds.delete(tabId);
  if (_openedPDFs.length !== beforeLength) {
    // Notify categoryManager to remove this closed tabId from categories.
    for (const win of getMainWindows()) {
      dispatchVtEvent(win.document, "vertical-tabs:tab-closed", { tabId });
    }
    removeLastReadTime(tabId);
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
            // The reading clock starts when a tab is LEFT: stamp the
            // previously selected tab now so its "last read" aging begins at
            // the moment the user switched away (while a tab is active its
            // row time stays "刚刚" — see uiRenderer formatRowTime).
            // Guarded to AFTER startup restore: session restore may emit
            // selects (possibly batched ids) for tabs nobody is reading, and
            // stamping them would reset every restored "last read" time to
            // just-now — merge-max then lets now beat the migrated old time.
            const prevTabId = _selectedTabId;
            if (
              prevTabId &&
              prevTabId !== tabId &&
              _startupRestoreDone
            ) {
              updateOpenedAtForTab(prevTabId);
            }
            _selectedTabId = tabId;
            const pdf = _openedPDFs.find((p) => p.tabId === tabId);
            if (pdf?.readerReleased) {
              void restoreReaderForTab(tabId).then(() => {
                dispatchPDFsChanged();
              });
            } else {
              // For lazy reader tabs, selecting the tab triggers Zotero to load
              // the reader. Show the loaded indicator immediately and refresh it
              // once loading completes.
              const tabInfo = getZoteroTabs()?.getTabInfo(tabId);
              if (tabInfo?.type?.startsWith("reader")) {
                dispatchReaderLoadingEvent(tabId);
                waitForReaderLoaded(tabId, 15000).then((loaded) => {
                  if (loaded) {
                    if (pdf?.type === "reader-unloaded") {
                      pdf.type = "reader";
                    }
                    for (const win of getMainWindows()) {
                      dispatchVtEvent(
                        win.document,
                        "vertical-tabs:reader-restored",
                        { tabId },
                      );
                    }
                  }
                });
              }
              // NOTE: no "entry" timestamp is written on select. The display
              // layer forces the ACTIVE row to "刚刚" regardless of the stored
              // time (formatRowTime), and the stored time only advances when
              // the tab is LEFT (above). Writing now on entry was what reset
              // startup-restored tabs to "刚刚" on every Zotero restart.
              // Targeted highlight update instead of a full re-render: tab
              // selection only moves the .active class and refreshes that
              // row's relative-time label. (Previously dispatchPDFsChanged()
              // rebuilt every row on every tab switch — O(N) Zotero API
              // calls + DOM churn on the main thread, the main source of
              // jank with many tabs open.)
              dispatchActiveTabChanged(tabId);
            }
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
            // Drop the cached display fields so the next render recomputes
            // them (journal/date/extra changes don't alter the title, but
            // must not go stale in the cache either).
            invalidateItemInfo(pdf.itemId);
            if (pdf.parentItemId !== undefined) {
              invalidateItemInfo(pdf.parentItemId);
            }
            const tabItem = Zotero.Items.get(pdf.itemId) as Zotero.Item | false;
            if (tabItem) {
              const newTitle = getItemDisplayTitle(tabItem);
              if (newTitle && newTitle !== pdf.title) {
                pdf.title = newTitle;
                changed = true;
              }
            }
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
  if (_saveLastReadTimesTimer) {
    clearTimeout(_saveLastReadTimesTimer);
    _saveLastReadTimesTimer = null;
  }
  if (_pendingClosedFlushTimer) {
    clearTimeout(_pendingClosedFlushTimer);
    _pendingClosedFlushTimer = null;
  }
  _pendingClosedTabIds.clear();
  _openedPDFs = [];
  _selectedTabId = "";
  _lastReadTimes = {};
  // Full state reset: a later re-init must run the startup restore flow
  // again (isNew flags, category/order migration) instead of treating every
  // existing tab as new.
  _startupRestoreDone = false;
  clearReleasedReaderState();
  clearItemInfoCache();
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

export function setReaderReleased(tabId: string, released: boolean): void {
  const pdf = _openedPDFs.find((p) => p.tabId === tabId);
  if (pdf) {
    pdf.readerReleased = released;
    // Keep memory state aligned with the native tab type. When releasing we
    // flip to "reader-unloaded" so Zotero's lazy-load path is used on next
    // select. When restoring, the type is flipped back to "reader" after the
    // reader finishes loading.
    if (released && pdf.type === "reader") {
      pdf.type = "reader-unloaded";
    }
  }
}

export async function refreshOpenedPDFs(): Promise<void> {
  clearReleasedReaderState();
  _openedPDFs = [];
  try {
    const ztabs = getZoteroTabs();
    if (!ztabs) return;
    const ztAny = ztabs as unknown as Record<string, unknown>;

    // Use _tabs internal array (has correct id fields in Zotero 8+)
    const internalTabs = ztAny._tabs as any[] | undefined;
    const promises: Promise<void>[] = [];
    if (internalTabs && internalTabs.length > 0) {
      for (const tab of internalTabs) {
        const tabId = String(tab.id ?? "");
        if (tabId) promises.push(handleTabAdded(tabId));
      }
      await Promise.all(promises);
      if (syncSelectedTabId()) {
        dispatchPDFsChanged();
      }
      return;
    }

    // Fallback: getState()
    const state = (ztabs.getState?.() ?? []) as any[];
    for (const tab of state) {
      const tabId = String(tab.id ?? "");
      if (tabId) promises.push(handleTabAdded(tabId));
    }
    await Promise.all(promises);
    if (syncSelectedTabId()) {
      dispatchPDFsChanged();
    }
  } catch (error) {
    vtLog("refreshOpenedPDFs: FAILED " + String(error));
  }
}

export async function scanOpenedTabs(): Promise<void> {
  clearReleasedReaderState();
  try {
    const ztabs = getZoteroTabs();
    if (!ztabs) return;
    const ztAny = ztabs as unknown as Record<string, unknown>;

    const internalTabs = ztAny._tabs as any[] | undefined;
    const promises: Promise<void>[] = [];
    if (internalTabs && internalTabs.length > 0) {
      for (const tab of internalTabs) {
        const tabId = String(tab.id ?? "");
        if (tabId) promises.push(handleTabAdded(tabId));
      }
      await Promise.all(promises);
      if (syncSelectedTabId()) {
        dispatchPDFsChanged();
      }
      return;
    }

    const state = (ztabs.getState?.() ?? []) as any[];
    for (const tab of state) {
      const tabId = String(tab.id ?? "");
      if (tabId) promises.push(handleTabAdded(tabId));
    }
    await Promise.all(promises);
    if (syncSelectedTabId()) {
      dispatchPDFsChanged();
    }
  } catch (error) {
    vtLog("scanOpenedTabs: FAILED " + String(error));
  }
}

// ── Tab order sync with Zotero's native tab bar ──

let _syncTabOrderTimer: ReturnType<typeof setTimeout> | null = null;
const MAX_SYNC_RETRIES = 5;

function buildDesiredTabOrder(
  categories: { order: number; tabIds: string[] }[],
  uncategorizedOrder: string[],
  internalTabs: any[],
): string[] {
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

  // Add remaining tabs not in VT order at the end
  for (const tab of internalTabs) {
    const tid = String(tab.id ?? "");
    if (tid && !seen.has(tid)) {
      desired.push(tid);
      seen.add(tid);
    }
  }

  // Build final order: library tab (index 0) stays first
  const finalOrder: string[] = [];
  const seenFinal = new Set<string>();
  const libraryTabId = String(internalTabs[0]?.id ?? "");
  if (libraryTabId) {
    finalOrder.push(libraryTabId);
    seenFinal.add(libraryTabId);
  }
  for (const tid of desired) {
    if (!seenFinal.has(tid)) {
      finalOrder.push(tid);
      seenFinal.add(tid);
    }
  }

  return finalOrder;
}

function getTabIds(tabs: any[] | undefined): string[] {
  return (tabs ?? []).map((t) => String(t.id ?? ""));
}

function doSyncTabOrderToNative(
  categories: { order: number; tabIds: string[] }[],
  uncategorizedOrder: string[],
  attempt: number,
  options?: { doc?: Document; pendingTabIds?: string[] },
): void {
  const ztabs = getZoteroTabs(options?.doc);
  if (!ztabs) return;

  let internalTabs = (ztabs as any)?._tabs as any[] | undefined;
  if (!internalTabs || internalTabs.length < 2) return;

  let currentIds = getTabIds(internalTabs);
  const currentIdSet = new Set(currentIds);

  // Build the full desired order from VT data, then restrict it to tabs that
  // are actually open in this window. Closed/stale tabIds must not push open
  // tabs to the wrong positions.
  const fullDesiredOrder = buildDesiredTabOrder(
    categories,
    uncategorizedOrder,
    internalTabs,
  );
  const desiredOpenOrder: string[] = [];
  const seen = new Set<string>();
  for (const id of fullDesiredOrder) {
    if (id && currentIdSet.has(id) && !seen.has(id)) {
      desiredOpenOrder.push(id);
      seen.add(id);
    }
  }
  // Append any open tabs not in the VT order at the end, so nothing is lost.
  for (const id of currentIds) {
    if (id && !seen.has(id)) {
      desiredOpenOrder.push(id);
      seen.add(id);
    }
  }

  const pendingTabIds = options?.pendingTabIds ?? [];
  const missingPending = pendingTabIds.filter((id) => !currentIdSet.has(id));

  // If newly opened tabs haven't been added yet, schedule a retry.
  if (missingPending.length > 0) {
    if (attempt < MAX_SYNC_RETRIES) {
      _syncTabOrderTimer = setTimeout(() => {
        doSyncTabOrderToNative(
          categories,
          uncategorizedOrder,
          attempt + 1,
          options,
        );
      }, 200);
      return;
    }
  }

  // Skip if already correct
  if (arraysEqual(desiredOpenOrder, currentIds)) {
    return;
  }

  // Try the public move() API first. Re-fetch _tabs each time in case move()
  // replaces the internal array rather than mutating it in place.
  if (typeof ztabs.move === "function") {
    try {
      for (
        let targetIdx = 0;
        targetIdx < desiredOpenOrder.length;
        targetIdx++
      ) {
        internalTabs = (ztabs as any)?._tabs as any[] | undefined;
        if (!internalTabs) break;
        const tabId = desiredOpenOrder[targetIdx];
        const currentIdx = internalTabs.findIndex(
          (t) => String(t.id ?? "") === tabId,
        );
        if (currentIdx < 0) continue;
        const safeTargetIdx = Math.min(targetIdx, internalTabs.length - 1);
        if (currentIdx !== safeTargetIdx) {
          ztabs.move(tabId, safeTargetIdx);
        }
      }
    } catch (err) {
      ztoolkit.log("[vt-sync] move() failed:", err);
    }
  }

  // Re-fetch _tabs after move() in case it swapped the array.
  internalTabs = (ztabs as any)?._tabs as any[] | undefined;
  currentIds = getTabIds(internalTabs);

  // Fallback / ensure: rebuild the current _tabs array in the desired order.
  if (
    internalTabs &&
    internalTabs.length >= 2 &&
    !arraysEqual(desiredOpenOrder, currentIds)
  ) {
    try {
      const tabById = new Map<string, any>();
      for (const tab of internalTabs) {
        const id = String(tab.id ?? "");
        if (id) tabById.set(id, tab);
      }
      const orderedTabs: any[] = [];
      for (const id of desiredOpenOrder) {
        const tab = tabById.get(id);
        if (tab) orderedTabs.push(tab);
      }
      for (const tab of internalTabs) {
        const id = String(tab.id ?? "");
        if (id && !seen.has(id)) {
          orderedTabs.push(tab);
        }
      }
      internalTabs.splice(0, internalTabs.length, ...orderedTabs);
    } catch (err) {
      ztoolkit.log("[vt-sync] rebuild failed:", err);
    }
  }

  // Refresh both internal state and the visible tab bar.
  try {
    (ztabs as any)?._update?.();
  } catch (err) {
    ztoolkit.log("[vt-sync] _update() failed:", err);
  }
  try {
    (ztabs as any)?._updateTabBar?.();
  } catch (err) {
    ztoolkit.log("[vt-sync] _updateTabBar() failed:", err);
  }
}

/**
 * Reorder Zotero's native horizontal tabs to match VT's vertical order.
 * Debounced — multiple rapid calls only trigger one actual reorder.
 * Retries briefly if newly opened tabs have not yet appeared in _tabs.
 */
export function syncTabOrderToNative(
  categories: { order: number; tabIds: string[] }[],
  uncategorizedOrder: string[],
  options?: { doc?: Document; pendingTabIds?: string[] },
): void {
  if (isReaderRestoreInProgress()) {
    markPendingSyncTabOrder();
    return;
  }

  if (_syncTabOrderTimer) clearTimeout(_syncTabOrderTimer);
  _syncTabOrderTimer = setTimeout(() => {
    _syncTabOrderTimer = null;
    doSyncTabOrderToNative(categories, uncategorizedOrder, 0, options);
  }, 50);
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
