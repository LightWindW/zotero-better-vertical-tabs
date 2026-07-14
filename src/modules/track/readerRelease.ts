/**
 * Track and control whether a PDF reader tab has been released (unloaded)
 * while keeping the native Zotero tab alive.
 */
import { config } from "../../../package.json";
import { dispatchVtEvent } from "../core/events";
import {
  getOpenedPDFByTabId,
  getZoteroTabs,
  setReaderReleased,
} from "./itemTracker";
import {
  pauseNativeOrderSync,
  resumeNativeOrderSync,
} from "./orderSyncControl";

const PREF_NAMESPACE = config.prefsPrefix;

/** Tab IDs whose reader instance has been released but native tab remains. */
const _releasedReaderTabIds = new Set<string>();

function vtLog(msg: string): void {
  Zotero.logError(new Error("[BVT-readerRelease] " + msg));
}

function getPrefBool(name: string, defaultValue: boolean): boolean {
  return (
    (Zotero.Prefs.get(`${PREF_NAMESPACE}.${name}`, true) as
      | boolean
      | undefined) ?? defaultValue
  );
}

export function isShowReaderLoadedIndicatorEnabled(): boolean {
  return getPrefBool("verticalTabs.showReaderLoadedIndicator", true);
}

export function isReaderReleased(tabId: string): boolean {
  return _releasedReaderTabIds.has(tabId);
}

export function markReaderReleased(tabId: string): void {
  _releasedReaderTabIds.add(tabId);
}

export function markReaderRestored(tabId: string): void {
  _releasedReaderTabIds.delete(tabId);
}

/** Clear all released-reader tracking state (e.g. after _openedPDFs rebuild). */
export function clearReleasedReaderState(): void {
  _releasedReaderTabIds.clear();
}

export function isReaderLoaded(tabId: string): boolean {
  if (_releasedReaderTabIds.has(tabId)) return false;
  try {
    const reader = Zotero.Reader.getByTabID(tabId);
    return !!reader && (reader as any)._isReaderInitialized !== false;
  } catch {
    return false;
  }
}

/**
 * Wait until the reader for the given tab has finished initializing.
 * Returns immediately if the reader is already loaded.
 */
export async function waitForReaderLoaded(
  tabId: string,
  timeoutMs = 30000,
): Promise<boolean> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (isReaderLoaded(tabId)) {
      return true;
    }

    try {
      const reader = Zotero.Reader.getByTabID(tabId);
      if (reader) {
        const initPromise = (reader as any)._initPromise as
          | Promise<unknown>
          | undefined;
        if (initPromise) {
          await Promise.race([
            initPromise,
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("timeout")), 500),
            ),
          ]).catch(() => {
            // Ignore timeout, loop will retry.
          });
          continue;
        }
      }
    } catch {
      // ignore
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return isReaderLoaded(tabId);
}

function getMainWindows(): Window[] {
  return Zotero.getMainWindows ? Zotero.getMainWindows() : [];
}

export function dispatchReaderLoadingEvent(tabId: string): void {
  for (const win of getMainWindows()) {
    dispatchVtEvent(win.document, "vertical-tabs:reader-loading", { tabId });
  }
}

function removeReaderFromZoteroRegistry(
  reader: _ZoteroTypes.ReaderInstance,
): void {
  try {
    const readers = (Zotero.Reader as any)._readers as
      | _ZoteroTypes.ReaderInstance[]
      | undefined;
    if (!readers) return;
    const idx = readers.indexOf(reader);
    if (idx >= 0) {
      readers.splice(idx, 1);
    }
  } catch (err) {
    vtLog("removeReaderFromZoteroRegistry failed: " + String(err));
  }
}

function removeReaderDOM(reader: _ZoteroTypes.ReaderInstance): void {
  try {
    const iframe = (reader as any)._iframe as XUL.Element | undefined;
    const popupset = (reader as any)._popupset as XUL.Element | undefined;
    if (iframe && iframe.parentNode) {
      iframe.parentNode.removeChild(iframe);
    }
    if (popupset && popupset.parentNode) {
      popupset.parentNode.removeChild(popupset);
    }
  } catch (err) {
    vtLog("removeReaderDOM failed: " + String(err));
  }
}

/**
 * ReaderTab adds several event listeners on _tabContainer after _open() completes
 * (tab-bottom-placeholder-resize, tab-context-pane-toggle, tab-selection-change).
 * uninit() does not remove them. If we leave them attached to the released tab,
 * switching back to that tab later fires them on the stale reader instance, which
 * then tries to access the already-destroyed _iframeWindow/_internalReader and
 * throws "can't access dead object". Replacing the container clears all listeners
 * while preserving the tab's DOM slot (Zotero_Tabs looks it up by id on demand).
 */
function clearTabContainerEventListeners(
  reader: _ZoteroTypes.ReaderInstance,
): void {
  try {
    const tabContainer = (reader as any)._tabContainer as
      | XUL.Element
      | undefined;
    if (!tabContainer || !tabContainer.parentNode) return;
    const replacement = tabContainer.cloneNode(false) as XUL.Element;
    tabContainer.parentNode.replaceChild(replacement, tabContainer);
    (reader as any)._tabContainer = replacement;
  } catch (err) {
    vtLog("clearTabContainerEventListeners failed: " + String(err));
  }
}

/**
 * Mark the native Zotero tab as reader-unloaded. This makes Zotero_Tabs.select
 * automatically load the reader when the tab is selected again, using the same
 * tab id and container. It also prevents Zotero's own unloadUnusedTabs from
 * treating this tab as a loaded reader.
 */
function setTabTypeUnloaded(tabId: string): void {
  try {
    const ztabs = getZoteroTabs();
    const internalTabs = (ztabs as any)?._tabs as
      | Array<{ id: string; type: string }>
      | undefined;
    if (!internalTabs) return;
    const tab = internalTabs.find((t) => t.id === tabId);
    if (tab && tab.type === "reader") {
      const beforeType = tab.type;
      tab.type = "reader-unloaded";
      ztoolkit.log(
        "[BVT-readerRelease] setTabTypeUnloaded:",
        tabId,
        "before=",
        beforeType,
        "after=",
        tab.type,
      );
    }
  } catch (err) {
    vtLog("setTabTypeUnloaded failed: " + String(err));
  }
}

/**
 * Release the PDF reader resources for a tab without closing the native tab.
 * This actually tears down the sandbox iframe and removes the reader instance
 * from Zotero.Reader._readers, so the PDF.js memory is freed.
 */
export function releaseReaderForTab(tabId: string): boolean {
  if (_releasedReaderTabIds.has(tabId)) return false;

  const pdf = getOpenedPDFByTabId(tabId);
  ztoolkit.log(
    "[BVT-readerRelease] releaseReaderForTab START:",
    tabId,
    "pdf.type=",
    pdf?.type,
    "pdf.readerReleased=",
    pdf?.readerReleased,
  );
  if (!pdf || !pdf.type?.startsWith("reader")) return false;

  try {
    const reader = Zotero.Reader.getByTabID(tabId);
    if (!reader) {
      // Reader is already gone; nothing to release.
      ztoolkit.log(
        "[BVT-readerRelease] releaseReaderForTab no reader instance:",
        tabId,
      );
      markReaderReleased(tabId);
      return true;
    }

    // Tell Zotero to flush state and unregister observers/listeners.
    reader.uninit();

    // Remove the sandbox iframe and popupset so PDF.js memory is actually freed.
    removeReaderDOM(reader);

    // Remove stale event listeners attached to the tab container. Otherwise they
    // fire on the released reader instance when the tab is selected again.
    clearTabContainerEventListeners(reader);

    // Mark the native tab as unloaded so Zotero will lazily reload it on select
    // and won't try to unload it again via unloadUnusedTabs.
    setTabTypeUnloaded(tabId);

    // Remove the reader instance from Zotero's registry. Otherwise the next
    // Zotero.Reader.open() for this item would just select the stale reader instance.
    removeReaderFromZoteroRegistry(reader);

    markReaderReleased(tabId);
    setReaderReleased(tabId, true);

    ztoolkit.log(
      "[BVT-readerRelease] releaseReaderForTab DONE:",
      tabId,
      "type after=",
      getOpenedPDFByTabId(tabId)?.type,
    );

    for (const win of getMainWindows()) {
      dispatchVtEvent(win.document, "vertical-tabs:reader-released", { tabId });
    }

    return true;
  } catch (err) {
    vtLog("releaseReaderForTab failed: " + String(err));
    return false;
  }
}

/**
 * Re-open the PDF reader for a tab that was previously released.
 *
 * Instead of manually rebuilding the ReaderTab via Zotero.Reader.open(), we let
 * Zotero's native lazy-load path do the work. The native tab is already typed as
 * "reader-unloaded"; Zotero_Tabs.select() will instantiate the reader. We just
 * pause VT -> native order sync during the transient phase, clear the released
 * state, and wait for the reader to report loaded.
 */
export async function restoreReaderForTab(tabId: string): Promise<boolean> {
  if (!_releasedReaderTabIds.has(tabId)) return false;

  const pdf = getOpenedPDFByTabId(tabId);
  ztoolkit.log(
    "[BVT-readerRelease] restoreReaderForTab START:",
    tabId,
    "pdf.type=",
    pdf?.type,
    "pdf.readerReleased=",
    pdf?.readerReleased,
  );
  if (!pdf || !pdf.type?.startsWith("reader")) {
    markReaderRestored(tabId);
    return false;
  }

  try {
    // Show the indicator immediately so the user sees feedback while Zotero
    // recreates the sandbox reader.
    dispatchReaderLoadingEvent(tabId);

    // Do not let VT order sync fight Zotero's internal tab layout while the
    // reader is being recreated.
    pauseNativeOrderSync();

    // Clear released flags up front. Even if loading later fails or times out,
    // the next user click will simply trigger another native lazy-load attempt.
    markReaderRestored(tabId);
    setReaderReleased(tabId, false);

    // The actual reader instantiation happens asynchronously inside Zotero.
    // Wait for it in the background and update the UI when it finishes.
    waitForReaderLoaded(tabId, 30000)
      .then((loaded) => {
        ztoolkit.log(
          "[BVT-readerRelease] restoreReaderForTab waitForReaderLoaded:",
          loaded,
          "tabId=",
          tabId,
        );
        if (loaded) {
          if (pdf.type === "reader-unloaded") {
            pdf.type = "reader";
          }
          for (const win of getMainWindows()) {
            dispatchVtEvent(win.document, "vertical-tabs:reader-restored", {
              tabId,
            });
          }
        }
      })
      .finally(() => {
        resumeNativeOrderSync();
      });

    ztoolkit.log(
      "[BVT-readerRelease] restoreReaderForTab DONE (async):",
      tabId,
    );

    return true;
  } catch (err) {
    vtLog("restoreReaderForTab failed: " + String(err));
    resumeNativeOrderSync();
    // Clear the flag so the next click can try again.
    markReaderRestored(tabId);
    return false;
  }
}
