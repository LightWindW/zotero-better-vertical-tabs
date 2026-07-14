/**
 * Periodically release PDF reader resources for tabs that haven't been read
 * recently, while keeping the native Zotero tab alive.
 */
import { config } from "../../../package.json";
import { getOpenedPDFs, getSelectedTabId } from "./itemTracker";
import {
  isReaderLoaded,
  isReaderReleased,
  releaseReaderForTab,
} from "./readerRelease";

const PREF_NAMESPACE = config.prefsPrefix;
const CHECK_INTERVAL_MS = 60 * 1000; // 1 minute

let _intervalId: ReturnType<typeof setInterval> | null = null;
let _enabledObserverID: symbol | null = null;
let _minutesObserverID: symbol | null = null;

function getPrefBool(name: string, defaultValue: boolean): boolean {
  return (
    (Zotero.Prefs.get(`${PREF_NAMESPACE}.${name}`, true) as
      | boolean
      | undefined) ?? defaultValue
  );
}

function getPrefInt(name: string, defaultValue: number): number {
  const raw = Zotero.Prefs.get(`${PREF_NAMESPACE}.${name}`, true);
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") {
    const parsed = parseInt(raw, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return defaultValue;
}

export function isReleaseReaderEnabled(): boolean {
  return getPrefBool("verticalTabs.releaseReaderEnabled", false);
}

export function getReleaseReaderMinutes(): number {
  const minutes = getPrefInt("verticalTabs.releaseReaderMinutes", 30);
  return Math.max(1, Math.min(1440, minutes));
}

export function runReaderRelease(): void {
  if (!isReleaseReaderEnabled()) return;

  const minutes = getReleaseReaderMinutes();
  const cutoff = Date.now() - minutes * 60 * 1000;
  const selectedTabId = getSelectedTabId();

  const pdfs = getOpenedPDFs();
  for (const pdf of pdfs) {
    if (!pdf.tabId) continue;
    if (pdf.tabId === selectedTabId) continue;
    if (!pdf.type?.startsWith("reader")) continue;
    if (isReaderReleased(pdf.tabId)) continue;
    if (!isReaderLoaded(pdf.tabId)) continue;
    if (pdf.openedAt >= cutoff) continue;

    releaseReaderForTab(pdf.tabId);
  }
}

function startTimer(): void {
  stopTimer();
  _intervalId = setInterval(() => {
    runReaderRelease();
  }, CHECK_INTERVAL_MS);
}

function stopTimer(): void {
  if (_intervalId !== null) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
}

function updateTimerState(): void {
  if (isReleaseReaderEnabled()) {
    startTimer();
  } else {
    stopTimer();
  }
}

export function initReaderReleaseTimer(): void {
  if (isReleaseReaderEnabled()) {
    runReaderRelease();
    startTimer();
  }

  if (!_enabledObserverID) {
    _enabledObserverID = Zotero.Prefs.registerObserver(
      `${PREF_NAMESPACE}.verticalTabs.releaseReaderEnabled`,
      () => {
        if (isReleaseReaderEnabled()) {
          runReaderRelease();
        }
        updateTimerState();
      },
    );
  }

  if (!_minutesObserverID) {
    _minutesObserverID = Zotero.Prefs.registerObserver(
      `${PREF_NAMESPACE}.verticalTabs.releaseReaderMinutes`,
      () => {
        if (isReleaseReaderEnabled()) {
          runReaderRelease();
        }
      },
    );
  }
}

export function destroyReaderReleaseTimer(): void {
  stopTimer();
  if (_enabledObserverID) {
    Zotero.Prefs.unregisterObserver(_enabledObserverID);
    _enabledObserverID = null;
  }
  if (_minutesObserverID) {
    Zotero.Prefs.unregisterObserver(_minutesObserverID);
    _minutesObserverID = null;
  }
}
