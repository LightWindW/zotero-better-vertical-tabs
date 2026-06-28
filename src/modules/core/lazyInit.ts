/**
 * Lazy initializer for vertical tabs.
 */
import { config } from "../../../package.json";
import {
  destroyCategoryManager,
  getData,
  initCategoryManager,
  populateCategoryTabIds,
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
  restoreDormantItems,
  scanOpenedTabs,
  startTracking,
  stopTracking,
} from "../track/itemTracker";
import {
  subscribeToRenderEvents,
  unsubscribeFromRenderEvents,
  setupCategoryDarkMode,
  teardownCategoryDarkMode,
} from "../render/uiRenderer";
import { destroyAutoClose, initAutoClose } from "../track/autoClose";
import { dispatchVtEvent } from "./events";
import { destroyReaderSidebars } from "../sidebar/readerSidebar";
import { preloadZoteroIcons } from "../render/itemIcons";

function vtLog(msg: string): void {
  Zotero.logError(new Error("[BVT] " + msg));
}

const WINDOW_STATE_KEY = Symbol.for(`${config.addonRef}-vertical-tabs-state`);
const PREF_NAMESPACE = config.prefsPrefix;

let _prefsObserverID: symbol | null = null;
let _showExtraObserverID: symbol | null = null;
let _mainPageObserverID: symbol | null = null;
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
  const mainPageEnabled = Zotero.Prefs.get(
    `${PREF_NAMESPACE}.verticalTabs.mainPageEnabled`,
    true,
  ) as boolean;
  const visible = enabled && mainPageEnabled;

  // Pre-load Zotero native icons in background (for reader sidebar)
  void preloadZoteroIcons();

  startTracking();
  await initCategoryManager(win.document);

  // Restore items from persistent JSON so sidebar shows content immediately
  restoreDormantItems();

  // Populate category tabIds from loaded itemIds
  populateCategoryTabIds(getOpenedPDFs);

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
            Zotero.Prefs.set(
              `${PREF_NAMESPACE}.verticalTabs.mainPageEnabled`,
              true,
              false,
            );
            setSidebarVisibility(w.document, true);
            ws.visible = true;
            // Re-scan existing tabs to re-inject reader VT
            scanOpenedTabs();
            dispatchVtEvent(w.document, "vertical-tabs:visibility-changed", {
              visible: true,
            });
          } else {
            stopTracking();
            destroySidebar(w.document);
            destroyReaderSidebars();
            ws.visible = false;
            Zotero.Prefs.set(
              `${PREF_NAMESPACE}.verticalTabs.mainPageEnabled`,
              false,
              false,
            );
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

  // Register preference observer for mainPageEnabled toggle
  if (!_mainPageObserverID) {
    _mainPageObserverID = Zotero.Prefs.registerObserver(
      `${PREF_NAMESPACE}.verticalTabs.mainPageEnabled`,
      (value: boolean) => {
        for (const w of Zotero.getMainWindows()) {
          const ws = getWindowState(w);
          if (!ws.initialized) continue;
          const globallyEnabled = Zotero.Prefs.get(
            `${PREF_NAMESPACE}.verticalTabs.enabled`,
            true,
          ) as boolean;
          if (globallyEnabled && value) {
            setSidebarVisibility(w.document, true);
            ws.visible = true;
            dispatchVtEvent(w.document, "vertical-tabs:visibility-changed", {
              visible: true,
            });
          } else {
            // mainPageEnabled off or global off → no sidebar, no N icon
            destroySidebar(w.document);
            ws.visible = false;
          }
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
          const mainPageEnabled = Zotero.Prefs.get(
            `${PREF_NAMESPACE}.verticalTabs.mainPageEnabled`,
            true,
          ) as boolean;
          if (globallyEnabled && mainPageEnabled) {
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
  refreshOpenedPDFs();

  // Exponential backoff retry — Zotero session restore may not have completed yet.
  const RETRY_DELAYS = [1000, 2500, 5000];
  for (const delay of RETRY_DELAYS) {
    setTimeout(() => {
      const before = getOpenedPDFs().length;
      scanOpenedTabs();
      const after = getOpenedPDFs().length;
      if (after > before) {
        populateCategoryTabIds(getOpenedPDFs);
        dispatchVtEvent(win.document, "vertical-tabs:pdfs-changed");
      }
    }, delay);
  }

  // Start auto-close timer if enabled
  initAutoClose();

  // Trigger initial render
  dispatchVtEvent(win.document, "vertical-tabs:visibility-changed", {
    visible,
  });
}

export function destroyVerticalTabs(win: Window): void {
  const state = getWindowState(win);
  if (!state.initialized) return;

  destroyAutoClose();
  destroyReaderSidebars();

  unsubscribeFromRenderEvents(win.document);
  destroyHoverCard(win.document);
  teardownCategoryDarkMode(win.document);
  destroyCategoryManager(win.document);
  destroySidebar(win.document);
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
    if (_mainPageObserverID) {
      Zotero.Prefs.unregisterObserver(_mainPageObserverID);
      _mainPageObserverID = null;
    }
    if (_pinnedObserverID) {
      Zotero.Prefs.unregisterObserver(_pinnedObserverID);
      _pinnedObserverID = null;
    }
  }

  state.initialized = false;
  state.visible = false;
}
