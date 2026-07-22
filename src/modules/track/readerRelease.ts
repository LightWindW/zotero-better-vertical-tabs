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
 * Snapshot of every tabId whose reader is currently loaded and initialized
 * (released readers excluded). Building this once per render and testing
 * with Set.has is O(N+R) — calling isReaderLoaded per row is O(N×R) because
 * each Zotero.Reader.getByTabID scans the _readers array.
 */
export function getLoadedReaderTabIds(): Set<string> {
  const ids = new Set<string>();
  try {
    const readers = (Zotero.Reader as any)._readers as
      | _ZoteroTypes.ReaderInstance[]
      | undefined;
    for (const reader of readers ?? []) {
      const tabId = (reader as any).tabID as string | undefined;
      if (!tabId || _releasedReaderTabIds.has(tabId)) continue;
      if ((reader as any)._isReaderInitialized === false) continue;
      ids.add(tabId);
    }
  } catch {
    // ignore — return whatever was collected
  }
  return ids;
}

/**
 * In-flight load waits, keyed by tabId. Selecting a reader tab used to start
 * a fresh 100ms-polling loop on EVERY select (up to 15s each), so flipping
 * back and forth between readers stacked duplicate loops that each fired a
 * full indicator rescan on completion. First caller wins; late callers share
 * the same promise (and its original timeout).
 */
const _pendingReaderWaits = new Map<string, Promise<boolean>>();

/**
 * Wait until the reader for the given tab has finished initializing.
 * Returns immediately if the reader is already loaded. Concurrent calls for
 * the same tab share one polling loop (see _pendingReaderWaits). NOT async:
 * an async wrapper would return a fresh promise each call and break the
 * identity-based dedup.
 */
export function waitForReaderLoaded(
  tabId: string,
  timeoutMs = 30000,
): Promise<boolean> {
  const pending = _pendingReaderWaits.get(tabId);
  if (pending) return pending;
  const promise = doWaitForReaderLoaded(tabId, timeoutMs).finally(() => {
    _pendingReaderWaits.delete(tabId);
  });
  _pendingReaderWaits.set(tabId, promise);
  return promise;
}

async function doWaitForReaderLoaded(
  tabId: string,
  timeoutMs: number,
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
      tab.type = "reader-unloaded";
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
  if (!pdf || !pdf.type?.startsWith("reader")) return false;

  try {
    const reader = Zotero.Reader.getByTabID(tabId);
    if (!reader) {
      // Reader is already gone; nothing to release.
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
 * Load the PDF reader for a tab WITHOUT switching to it (the context-menu
 * "Open Reader" action). Mirrors what Zotero_Tabs.select() does for an
 * unloaded tab — flip to `reader-loading`, call Zotero.Reader.open into the
 * SAME tab slot, then markAsLoaded — but passes `openInBackground: true` so
 * ReaderTab does not select the tab, and skips the white #zotero-tab-cover
 * loading mask entirely. Works for lazy (never loaded) and released tabs.
 */
export async function openReaderInBackground(tabId: string): Promise<boolean> {
  const pdf = getOpenedPDFByTabId(tabId);
  if (!pdf || !pdf.type?.startsWith("reader")) return false;
  if (isReaderLoaded(tabId)) return true;

  const ztabs = getZoteroTabs();
  const internalTabs = (ztabs as any)?._tabs as
    | Array<{ id: string; type: string; title?: string; data?: any }>
    | undefined;
  const tabIndex = internalTabs?.findIndex((t) => t.id === tabId) ?? -1;
  const tab = tabIndex >= 0 ? internalTabs![tabIndex] : undefined;
  if (!ztabs || !tab) return false;
  // reader-loading/reader means Zotero is already handling it.
  if (tab.type !== "reader-unloaded") return false;

  try {
    // Show the indicator immediately so the user sees feedback.
    dispatchReaderLoadingEvent(tabId);
    // Do not let VT order sync fight Zotero's internal tab layout while the
    // reader is being created (same guard as restoreReaderForTab).
    pauseNativeOrderSync();
    // Clear released flags up front (same rationale as restoreReaderForTab:
    // even if loading later fails, the next attempt simply retries).
    markReaderRestored(tabId);
    setReaderReleased(tabId, false);

    tab.type = "reader-loading";
    const reader = (await (Zotero.Reader as any).open(pdf.itemId, undefined, {
      tabID: tabId,
      title: pdf.title || tab.title,
      tabIndex,
      allowDuplicate: true,
      openInBackground: true,
      secondViewState: tab.data?.secondViewState,
      preventJumpback: true,
    })) as _ZoteroTypes.ReaderInstance | void;
    await (reader as any)?._initPromise;
    // Flips type back to "reader" and fires the native 'load' notifier.
    (ztabs as any).markAsLoaded?.(tabId);
    if (pdf.type === "reader-unloaded") {
      pdf.type = "reader";
    }
    for (const win of getMainWindows()) {
      dispatchVtEvent(win.document, "vertical-tabs:reader-restored", {
        tabId,
      });
    }
    return true;
  } catch (err) {
    vtLog("openReaderInBackground failed: " + String(err));
    return false;
  } finally {
    resumeNativeOrderSync();
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

    return true;
  } catch (err) {
    vtLog("restoreReaderForTab failed: " + String(err));
    resumeNativeOrderSync();
    // Clear the flag so the next click can try again.
    markReaderRestored(tabId);
    return false;
  }
}
