/**
 * Auto-close tabs that haven't been read for a configurable number of days.
 */
import { config } from "../../../package.json";
import { getOpenedPDFs, getSelectedTabId, getZoteroTabs } from "./itemTracker";

const PREF_NAMESPACE = config.prefsPrefix;
const CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

let _intervalId: ReturnType<typeof setInterval> | null = null;
let _enabledObserverID: symbol | null = null;
let _daysObserverID: symbol | null = null;

function vtLog(msg: string): void {
  Zotero.logError(new Error("[BVT-autoClose] " + msg));
}

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

function isEnabled(): boolean {
  return getPrefBool("verticalTabs.autoCloseEnabled", false);
}

function getDays(): number {
  const days = getPrefInt("verticalTabs.autoCloseDays", 7);
  return Math.max(1, Math.min(365, days));
}

function closeTab(tabId: string): void {
  const tabs = getZoteroTabs();
  if (!tabs) return;
  try {
    tabs.close(tabId);
  } catch (err) {
    vtLog("closeTab failed: " + String(err));
  }
}

function runAutoClose(): void {
  if (!isEnabled()) return;

  const days = getDays();
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const selectedTabId = getSelectedTabId();

  const pdfs = getOpenedPDFs();
  const toClose: string[] = [];
  for (const pdf of pdfs) {
    if (!pdf.tabId) continue;
    if (pdf.tabId === selectedTabId) continue;
    if (pdf.openedAt < cutoff) {
      toClose.push(pdf.tabId);
    }
  }

  if (toClose.length === 0) return;

  vtLog(`auto-closing ${toClose.length} tab(s) older than ${days} day(s)`);
  for (const tabId of toClose) {
    closeTab(tabId);
  }
}

function startTimer(): void {
  stopTimer();
  _intervalId = setInterval(() => {
    runAutoClose();
  }, CHECK_INTERVAL_MS);
}

function stopTimer(): void {
  if (_intervalId !== null) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
}

function updateTimerState(): void {
  if (isEnabled()) {
    startTimer();
  } else {
    stopTimer();
  }
}

export function initAutoClose(): void {
  // Initial cleanup on startup if enabled
  if (isEnabled()) {
    runAutoClose();
    startTimer();
  }

  if (!_enabledObserverID) {
    _enabledObserverID = Zotero.Prefs.registerObserver(
      `${PREF_NAMESPACE}.verticalTabs.autoCloseEnabled`,
      () => {
        if (isEnabled()) {
          runAutoClose();
        }
        updateTimerState();
      },
    );
  }

  if (!_daysObserverID) {
    _daysObserverID = Zotero.Prefs.registerObserver(
      `${PREF_NAMESPACE}.verticalTabs.autoCloseDays`,
      () => {
        if (isEnabled()) {
          runAutoClose();
        }
      },
    );
  }
}

export function destroyAutoClose(): void {
  stopTimer();
  if (_enabledObserverID) {
    Zotero.Prefs.unregisterObserver(_enabledObserverID);
    _enabledObserverID = null;
  }
  if (_daysObserverID) {
    Zotero.Prefs.unregisterObserver(_daysObserverID);
    _daysObserverID = null;
  }
}
