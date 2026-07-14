/**
 * Lazy initializer for vertical tabs.
 */
import { config } from "../../../package.json";
import {
  destroyCategoryManager,
  getData,
  initCategoryManager,
  cleanupStaleTabIds,
  restoreCategoriesAtStartup,
} from "../track/categoryManager";
import { destroyHoverCard, initHoverCard } from "../ui/hoverCard";
import {
  destroySidebar,
  setSidebarVisibility,
  renderSidebarMode,
  expandFloatingSidebar,
  collapseFloatingSidebar,
  isPinned,
} from "../sidebar/sidebar";
import {
  getOpenedPDFs,
  refreshOpenedPDFs,
  scanOpenedTabs,
  startTracking,
  stopTracking,
  markStartupRestoreDone,
  applyLastReadTimesToOpenedPDFs,
  loadLastReadTimes,
} from "../track/itemTracker";
import {
  subscribeToRenderEvents,
  unsubscribeFromRenderEvents,
  setupCategoryDarkMode,
  teardownCategoryDarkMode,
} from "../render/uiRenderer";
import { destroyAutoClose, initAutoClose } from "../track/autoClose";
import {
  destroyReaderReleaseTimer,
  initReaderReleaseTimer,
} from "../track/readerReleaseTimer";
import { dispatchVtEvent } from "./events";
import { initMainPaneDrop, destroyMainPaneDrop } from "../drag/mainPaneDrop";

function vtLog(msg: string): void {
  Zotero.logError(new Error("[BVT] " + msg));
}

const WINDOW_STATE_KEY = Symbol.for(`${config.addonRef}-vertical-tabs-state`);
const PREF_NAMESPACE = config.prefsPrefix;

let _prefsObserverID: symbol | null = null;
let _showExtraObserverID: symbol | null = null;
let _pinnedObserverID: symbol | null = null;

interface WindowState {
  initialized: boolean;
  visible: boolean;
}

function getWindowState(win: Window): WindowState {
  const existing = (win as any)[WINDOW_STATE_KEY] as WindowState | undefined;
  if (existing) return existing;
  const state: WindowState = { initialized: false, visible: false };
  (win as any)[WINDOW_STATE_KEY] = state;
  return state;
}

export async function initVerticalTabs(
  win: _ZoteroTypes.MainWindow,
): Promise<void> {
  const state = getWindowState(win);
  if (state.initialized) return;

  const enabled = Zotero.Prefs.get(
    `${PREF_NAMESPACE}.verticalTabs.enabled`,
    true,
  ) as boolean;
  const visible = enabled;

  startTracking();
  await initCategoryManager(win.document);

  // Categories only track currently open tabs; dormant/remembered slots have
  // been removed. Any leftover stale tabIds are cleaned up after Zotero finishes
  // restoring tabs (see retry loop below).

  initHoverCard(win.document);
  setupCategoryDarkMode(win.document);

  // Subscribe to render events BEFORE creating sidebar
  subscribeToRenderEvents(
    win.document,
    () => Promise.resolve(getData()),
    getOpenedPDFs,
  );

  if (visible) {
    setSidebarVisibility(win.document, true);
  }

  state.initialized = true;
  state.visible = visible;

  // Register preference observer for enable/disable toggle
  if (!_prefsObserverID) {
    _prefsObserverID = Zotero.Prefs.registerObserver(
      `${PREF_NAMESPACE}.verticalTabs.enabled`,
      (value: boolean) => {
        for (const w of Zotero.getMainWindows()) {
          const ws = getWindowState(w);
          if (!ws.initialized) continue;
          if (value) {
            startTracking();
            setSidebarVisibility(w.document, true);
            initMainPaneDrop(w.document);
            ws.visible = true;
            // Re-scan existing tabs to re-inject reader VT
            scanOpenedTabs();
            dispatchVtEvent(w.document, "vertical-tabs:visibility-changed", {
              visible: true,
            });
          } else {
            destroyMainPaneDrop(w.document);
            stopTracking();
            destroySidebar(w.document);
            ws.visible = false;
          }
        }
      },
    );
  }

  // Register preference observer for showExtra toggle
  if (!_showExtraObserverID) {
    _showExtraObserverID = Zotero.Prefs.registerObserver(
      `${PREF_NAMESPACE}.verticalTabs.showExtra`,
      () => {
        for (const w of Zotero.getMainWindows()) {
          const ws = getWindowState(w);
          if (!ws.initialized) continue;
          dispatchVtEvent(w.document, "vertical-tabs:data-changed");
        }
      },
    );
  }

  // Register preference observer for pinned toggle
  if (!_pinnedObserverID) {
    _pinnedObserverID = Zotero.Prefs.registerObserver(
      `${PREF_NAMESPACE}.verticalTabs.pinned`,
      () => {
        for (const w of Zotero.getMainWindows()) {
          const ws = getWindowState(w);
          if (!ws.initialized) continue;
          const globallyEnabled = Zotero.Prefs.get(
            `${PREF_NAMESPACE}.verticalTabs.enabled`,
            true,
          ) as boolean;
          if (globallyEnabled) {
            setSidebarVisibility(w.document, true);
            dispatchVtEvent(w.document, "vertical-tabs:visibility-changed", {
              visible: true,
            });
          }
        }
      },
    );
  }

  // Bind collapse / expand events on the document
  win.document.addEventListener("vertical-tabs:collapse", () => {
    if (isPinned()) {
      // In pinned mode, collapse is not used; treat as hide for compatibility
      destroySidebar(win.document);
      state.visible = false;
    } else {
      collapseFloatingSidebar(win.document);
    }
  });

  win.document.addEventListener("vertical-tabs:expand", () => {
    if (isPinned()) {
      setSidebarVisibility(win.document, true);
      state.visible = true;
    } else {
      expandFloatingSidebar(win.document);
    }
  });

  // Scan existing tabs (immediate attempt — clears and re-scans)
  await refreshOpenedPDFs();
  // Restore categories/order right away so the initial VT render already shows
  // the previous session's layout. Session restore may still be adding tabs, so
  // we run another restore on each retry and a final cleanup at the end.
  restoreCategoriesAtStartup(win.document);
  loadLastReadTimes(getData().lastReadTimes);
  applyLastReadTimesToOpenedPDFs();

  // Exponential backoff retry — Zotero session restore may not have completed yet.
  const RETRY_DELAYS = [1000, 2500, 5000];
  RETRY_DELAYS.forEach((delay, index) => {
    setTimeout(() => {
      const before = getOpenedPDFs().length;
      scanOpenedTabs();
      const after = getOpenedPDFs().length;
      if (after > before) {
        // New tabs appeared: restore them as well before the next render.
        restoreCategoriesAtStartup(win.document);
        loadLastReadTimes(getData().lastReadTimes);
        applyLastReadTimesToOpenedPDFs();
        dispatchVtEvent(win.document, "vertical-tabs:pdfs-changed");
      }

      if (index === RETRY_DELAYS.length - 1) {
        // Once session restore is likely complete, do a final restore and mark
        // all subsequently opened tabs as "new" so they are never auto-restored.
        restoreCategoriesAtStartup(win.document);
        loadLastReadTimes(getData().lastReadTimes);
        applyLastReadTimesToOpenedPDFs();
        markStartupRestoreDone();
        cleanupStaleTabIds(win.document);
      }
    }, delay);
  });

  // Start auto-close timer if enabled
  initAutoClose();

  // Start PDF reader release timer if enabled
  initReaderReleaseTimer();

  // Enable dragging items from the main Zotero item pane into the VT sidebar.
  initMainPaneDrop(win.document);

  // Trigger initial render
  dispatchVtEvent(win.document, "vertical-tabs:visibility-changed", {
    visible,
  });
}

export function destroyVerticalTabs(win: Window): void {
  const state = getWindowState(win);
  if (!state.initialized) return;

  destroyAutoClose();
  destroyReaderReleaseTimer();

  unsubscribeFromRenderEvents(win.document);
  destroyHoverCard(win.document);
  teardownCategoryDarkMode(win.document);
  destroyCategoryManager(win.document);
  destroySidebar(win.document);
  destroyMainPaneDrop(win.document);
  stopTracking();

  // Unregister prefs observers if no windows remain
  const remaining = Zotero.getMainWindows().filter(
    (w) => getWindowState(w).initialized,
  );
  if (remaining.length === 0) {
    if (_prefsObserverID) {
      Zotero.Prefs.unregisterObserver(_prefsObserverID);
      _prefsObserverID = null;
    }
    if (_showExtraObserverID) {
      Zotero.Prefs.unregisterObserver(_showExtraObserverID);
      _showExtraObserverID = null;
    }
    if (_pinnedObserverID) {
      Zotero.Prefs.unregisterObserver(_pinnedObserverID);
      _pinnedObserverID = null;
    }
  }

  state.initialized = false;
  state.visible = false;
}
