import { assert } from "chai";
import {
  getOpenedPDFs,
  refreshOpenedPDFs,
  removeTabsFromTrackingSilently,
  stopTracking,
} from "../src/modules/track/itemTracker";

/**
 * Regression test: closing a tab via the VT (×/middle-click/context menu)
 * commits with removeTabsFromTrackingSilently, which used to dispatch NO
 * events at all. After tab-select stopped triggering full re-renders
 * (active-changed targeted update), nothing refreshed the list anymore, so
 * the category header's item count went stale. The silent untrack must
 * dispatch pdfs-changed AFTER the rows are out of _openedPDFs (safe from
 * the flash-back the silence was designed to prevent).
 */

const dispatched: string[] = [];

const fakeDoc = {
  createEvent: () => {
    const evt: any = {};
    evt.initCustomEvent = (
      type: string,
      _bubbles: boolean,
      _cancelable: boolean,
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

function installZoteroStubs(): void {
  const ztabs = {
    _tabs: [{ id: "t1" }, { id: "t2" }],
    selectedID: "t1",
    getTabInfo: (id: string) => ({
      type: "note",
      title: `T-${id}`,
      data: { itemID: id === "t1" ? 1 : 2 },
    }),
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
    exists: async () => false,
    readUTF8: async () => "{}",
    writeUTF8: async () => "",
  };
  (globalThis as any).ztoolkit = { log: () => {} };
}

describe("removeTabsFromTrackingSilently", function () {
  before(async function () {
    installZoteroStubs();
    await refreshOpenedPDFs();
  });

  afterEach(function () {
    dispatched.length = 0;
  });

  after(function () {
    stopTracking();
    delete (globalThis as any).Zotero;
    delete (globalThis as any).PathUtils;
    delete (globalThis as any).IOUtils;
    delete (globalThis as any).ztoolkit;
  });

  it("seeds two tracked tabs from Zotero_Tabs", function () {
    assert.equal(getOpenedPDFs().length, 2);
  });

  it("dispatches pdfs-changed after silently removing a tab", function () {
    removeTabsFromTrackingSilently(["t1"]);
    assert.deepEqual(
      getOpenedPDFs().map((p) => p.tabId),
      ["t2"],
    );
    assert.include(
      dispatched,
      "vertical-tabs:pdfs-changed",
      "silent close must trigger a re-render so category counts refresh",
    );
  });

  it("does NOT dispatch when nothing was removed", function () {
    removeTabsFromTrackingSilently(["t-unknown"]);
    assert.notInclude(dispatched, "vertical-tabs:pdfs-changed");
  });
});
