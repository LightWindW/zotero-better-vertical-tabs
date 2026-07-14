/**
 * Pause/resume controller for VT -> native tab order synchronization.
 *
 * Reader restore uses Zotero's native lazy-load path, during which Zotero may
 * reorder or rebuild internal tabs. We must not sync VT order into native
 * _tabs while a restore is in progress, otherwise we fight Zotero's own
 * layout and cause visible tab jumps.
 */
import { dispatchVtEvent } from "../core/events";

let _readerRestoreCount = 0;
let _pendingSyncTabOrder = false;

function getMainWindows(): Window[] {
  return Zotero.getMainWindows ? Zotero.getMainWindows() : [];
}

export function pauseNativeOrderSync(): void {
  _readerRestoreCount++;
  ztoolkit.log(
    "[BVT-orderSync] pauseNativeOrderSync count=",
    _readerRestoreCount,
  );
}

export function resumeNativeOrderSync(): void {
  _readerRestoreCount = Math.max(0, _readerRestoreCount - 1);
  ztoolkit.log(
    "[BVT-orderSync] resumeNativeOrderSync count=",
    _readerRestoreCount,
    "pending=",
    _pendingSyncTabOrder,
  );
  if (_readerRestoreCount === 0 && _pendingSyncTabOrder) {
    _pendingSyncTabOrder = false;
    for (const win of getMainWindows()) {
      dispatchVtEvent(win.document, "vertical-tabs:request-sync-order");
    }
  }
}

export function isReaderRestoreInProgress(): boolean {
  return _readerRestoreCount > 0;
}

export function markPendingSyncTabOrder(): void {
  _pendingSyncTabOrder = true;
}
