import { assert } from "chai";
import {
  getLastReadTimes,
  getOpenedPDFs,
  loadLastReadTimes,
  markStartupRestoreDone,
  refreshOpenedPDFs,
  scanOpenedTabs,
  setLastReadTime,
  applyLastReadTimesToOpenedPDFs,
  getNonNewLiveEntries,
  stopTracking,
} from "../src/modules/track/itemTracker";
import {
  loadData,
  restoreCategoryTabIdsAndOrder,
} from "../src/modules/track/dataStore";

/**
 * Regression tests: "last read" times must survive a Zotero restart.
 *
 * Two failure modes reproduced here:
 * 1. RETRY-CLOBBER: the startup retry loop re-runs loadLastReadTimes with the
 *    (stale) _data field; a whole-map REPLACE wipes times the user produced
 *    by selecting tabs after the first restore pass. Merge-max semantics keep
 *    the newest timestamp per tabId.
 * 2. NEW-TAB-NEVER-STORED: a tab opened during a session only got a
 *    lastReadTime when it was selected. If it was never selected again
 *    before quitting, nothing was stored and the next restart showed
 *    "just now". handleTabAdded must persist the initial time for genuinely
 *    new tabs (after startup restore) — but NOT for startup-restored tabs,
 *    whose timestamps come from the old→new tabId migration.
 */

const T1 = 1700000000000; // fixed old timestamps
const T2 = 1700001000000;
const NOW = 1700002000000;

const dispatched: string[] = [];

const fakeDoc = {
  createEvent: () => {
    const evt: any = {};
    evt.initCustomEvent = (
      type: string,
      _b: boolean,
      _c: boolean,
      detail: unknown,
    ) => {
      evt.type = type;
      evt.detail = detail;
    };
    return evt;
  },
  dispatchEvent(e: { type: string }) {
    dispatched.push(e.type);
    return true;
  },
  defaultView: null,
} as unknown as Document;

let fileContent = "";

function fakeItem(id: number): Zotero.Item {
  return {
    id,
    itemType: "note",
    parentItemID: undefined,
    getField: () => "",
    getCreators: () => [],
    getTags: () => [],
  } as unknown as Zotero.Item;
}

/** Live Zotero_Tabs rows; tests push more to simulate late-appearing tabs. */
const liveTabs: Array<{ id: string; itemID: number }> = [];

function installZoteroStubs(): void {
  const ztabs = {
    // Live view — tests push into liveTabs between scans.
    get _tabs() {
      return liveTabs.map((t) => ({ id: t.id }));
    },
    selectedID: "",
    getTabInfo: (id: string) => {
      const row = liveTabs.find((t) => t.id === id);
      if (!row) return undefined;
      return { type: "note", title: `T-${id}`, data: { itemID: row.itemID } };
    },
  };
  (globalThis as any).Zotero = {
    getMainWindows: () => [{ document: fakeDoc, Zotero_Tabs: ztabs }],
    getStorageDirectory: () => ({ path: "/tmp" }),
    Items: { get: (id: number) => fakeItem(id) },
    Reader: { getByTabID: () => undefined },
    Prefs: { get: () => undefined, set: () => {} },
  };
  (globalThis as any).PathUtils = {
    join: (...parts: string[]) => parts.join("/"),
  };
  (globalThis as any).IOUtils = {
    exists: async () => true,
    readUTF8: async () => fileContent,
    writeUTF8: async (_path: string, content: string) => {
      fileContent = content;
    },
  };
  (globalThis as any).ztoolkit = { log: () => {} };
}

function seedFile(): void {
  fileContent = JSON.stringify({
    version: 3,
    categories: [],
    uncategorizedOrder: ["oldT1", "oldT2"],
    uncategorizedItemIds: [1, 2],
    lastReadTimes: { oldT1: T1, oldT2: T2 },
  });
}

function openedAtOf(tabId: string): number | undefined {
  return getOpenedPDFs().find((p) => p.tabId === tabId)?.openedAt;
}

describe("lastReadTimes restart survival", function () {
  before(function () {
    installZoteroStubs();
  });

  after(function () {
    delete (globalThis as any).Zotero;
    delete (globalThis as any).PathUtils;
    delete (globalThis as any).IOUtils;
    delete (globalThis as any).ztoolkit;
  });

  afterEach(function () {
    stopTracking();
    liveTabs.length = 0;
    dispatched.length = 0;
  });

  /**
   * Mirrors the lazyInit startup sequence (minus the parts that need
   * categoryManager): load file → scan live tabs → migrate old→new tabIds →
   * load merged times → apply to tracked tabs.
   */
  async function runStartupFlow(): Promise<void> {
    let data = await loadData();
    loadLastReadTimes(data.lastReadTimes);
    await refreshOpenedPDFs();
    data = restoreCategoryTabIdsAndOrder(data, getNonNewLiveEntries());
    loadLastReadTimes(data.lastReadTimes);
    applyLastReadTimesToOpenedPDFs();
  }

  it("migration restores stored times onto session-restored (new) tabIds", async function () {
    seedFile();
    liveTabs.push({ id: "newT1", itemID: 1 }, { id: "newT2", itemID: 2 });
    await runStartupFlow();
    assert.equal(openedAtOf("newT1"), T1);
    assert.equal(openedAtOf("newT2"), T2);
  });

  it("RETRY-CLOBBER: a select-write before a retry restore must survive", async function () {
    seedFile();
    liveTabs.push({ id: "newT1", itemID: 1 }, { id: "newT2", itemID: 2 });
    let data = await loadData();
    loadLastReadTimes(data.lastReadTimes);
    await refreshOpenedPDFs();
    // User selects newT1 between two restore passes (startup retry window).
    setLastReadTime("newT1", NOW);
    data = restoreCategoryTabIdsAndOrder(data, getNonNewLiveEntries());
    loadLastReadTimes(data.lastReadTimes);
    // Merge-max: the fresh NOW write must NOT be clobbered by the migrated T1.
    assert.equal(getLastReadTimes()["newT1"], NOW);
    assert.equal(getLastReadTimes()["newT2"], T2);
  });

  it("genuinely new tabs get their initial time persisted right away", async function () {
    seedFile();
    liveTabs.push({ id: "newT1", itemID: 1 }, { id: "newT2", itemID: 2 });
    await runStartupFlow();
    markStartupRestoreDone();
    // A tab opened after startup restore must be remembered even if the user
    // never selects it again before quitting.
    liveTabs.push({ id: "newT3", itemID: 3 });
    await scanOpenedTabs();
    assert.ok(
      getLastReadTimes()["newT3"] !== undefined,
      "new tab's initial openedAt must be written to lastReadTimes",
    );
  });

  it("startup-restored tabs do NOT persist a fresh timestamp (migration owns them)", async function () {
    seedFile();
    liveTabs.push({ id: "newT1", itemID: 1 }, { id: "newT2", itemID: 2 });
    let data = await loadData();
    loadLastReadTimes(data.lastReadTimes);
    await refreshOpenedPDFs();
    // Before migration, no fresh "now" entries may leak into the map —
    // with merge-max semantics they would beat the migrated old times.
    assert.notProperty(getLastReadTimes(), "newT1");
    assert.notProperty(getLastReadTimes(), "newT2");
    data = restoreCategoryTabIdsAndOrder(data, getNonNewLiveEntries());
    loadLastReadTimes(data.lastReadTimes);
    assert.equal(getLastReadTimes()["newT1"], T1);
    assert.equal(getLastReadTimes()["newT2"], T2);
  });
});
