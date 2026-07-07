import { assert } from "chai";
import {
  insertItemsIntoCategoryAt,
  insertUncategorizedItemsAt,
  cleanStaleTabIds,
  compactCategoryTabIds,
  reconcileUncategorizedOrder,
  type ItemTabEntry,
  type VerticalTabsData,
} from "../src/modules/track/dataStore";

function makeData(): VerticalTabsData {
  return {
    version: 2,
    categories: [
      {
        id: "cat1",
        name: "Category 1",
        order: 0,
        itemIds: [101, 102, 103],
        tabIds: ["tA", "tB", "tC"],
      },
      {
        id: "cat2",
        name: "Category 2",
        order: 1,
        itemIds: [201],
        tabIds: ["tD"],
      },
    ],
    trackedItems: {},
    uncategorizedOrder: ["tU1", "tU2"],
  };
}

function makeStaleData(): VerticalTabsData {
  return {
    version: 2,
    categories: [
      {
        id: "cat1",
        name: "Category 1",
        order: 0,
        itemIds: [101, 102, 103, 104],
        tabIds: ["stale", "tA", "tB", ""],
      },
      {
        id: "cat2",
        name: "Category 2",
        order: 1,
        itemIds: [201],
        tabIds: ["tD"],
      },
    ],
    trackedItems: {},
    uncategorizedOrder: ["staleU", "tU1"],
  };
}

describe("dataStore insertion helpers", function () {
  describe("insertItemsIntoCategoryAt", function () {
    it("should insert before the first tab", function () {
      const data = makeData();
      const entries: ItemTabEntry[] = [{ itemId: 999, tabId: "tNew" }];
      const result = insertItemsIntoCategoryAt(data, "cat1", entries, "tA");
      const cat = result.categories.find((c) => c.id === "cat1")!;
      assert.deepEqual(cat.tabIds, ["tNew", "tA", "tB", "tC"]);
      assert.deepEqual(cat.itemIds, [999, 101, 102, 103]);
    });

    it("should insert between two tabs", function () {
      const data = makeData();
      const entries: ItemTabEntry[] = [{ itemId: 999, tabId: "tNew" }];
      const result = insertItemsIntoCategoryAt(data, "cat1", entries, "tB");
      const cat = result.categories.find((c) => c.id === "cat1")!;
      assert.deepEqual(cat.tabIds, ["tA", "tNew", "tB", "tC"]);
      assert.deepEqual(cat.itemIds, [101, 999, 102, 103]);
    });

    it("should append when insertBeforeTabId is undefined", function () {
      const data = makeData();
      const entries: ItemTabEntry[] = [{ itemId: 999, tabId: "tNew" }];
      const result = insertItemsIntoCategoryAt(
        data,
        "cat1",
        entries,
        undefined,
      );
      const cat = result.categories.find((c) => c.id === "cat1")!;
      assert.deepEqual(cat.tabIds, ["tA", "tB", "tC", "tNew"]);
      assert.deepEqual(cat.itemIds, [101, 102, 103, 999]);
    });

    it("should insert multiple entries as a contiguous block", function () {
      const data = makeData();
      const entries: ItemTabEntry[] = [
        { itemId: 991, tabId: "tN1" },
        { itemId: 992, tabId: "tN2" },
      ];
      const result = insertItemsIntoCategoryAt(data, "cat1", entries, "tC");
      const cat = result.categories.find((c) => c.id === "cat1")!;
      assert.deepEqual(cat.tabIds, ["tA", "tB", "tN1", "tN2", "tC"]);
      assert.deepEqual(cat.itemIds, [101, 102, 991, 992, 103]);
    });
  });

  describe("insertUncategorizedItemsAt", function () {
    it("should insert before the first uncategorized tab", function () {
      const data = makeData();
      const entries: ItemTabEntry[] = [{ itemId: 999, tabId: "tNew" }];
      const result = insertUncategorizedItemsAt(data, entries, "tU1");
      assert.deepEqual(result.uncategorizedOrder, ["tNew", "tU1", "tU2"]);
    });

    it("should insert between uncategorized tabs", function () {
      const data = makeData();
      const entries: ItemTabEntry[] = [{ itemId: 999, tabId: "tNew" }];
      const result = insertUncategorizedItemsAt(data, entries, "tU2");
      assert.deepEqual(result.uncategorizedOrder, ["tU1", "tNew", "tU2"]);
    });

    it("should append when insertBeforeTabId is undefined", function () {
      const data = makeData();
      const entries: ItemTabEntry[] = [{ itemId: 999, tabId: "tNew" }];
      const result = insertUncategorizedItemsAt(data, entries, undefined);
      assert.deepEqual(result.uncategorizedOrder, ["tU1", "tU2", "tNew"]);
    });
  });

  describe("cleanStaleTabIds", function () {
    it("replaces closed category tabIds with empty strings and keeps itemIds", function () {
      const data = makeStaleData();
      const result = cleanStaleTabIds(data, new Set(["tA", "tB", "tD", "tU1"]));
      const cat1 = result.categories.find((c) => c.id === "cat1")!;
      assert.deepEqual(cat1.tabIds, ["", "tA", "tB", ""]);
      assert.deepEqual(cat1.itemIds, [101, 102, 103, 104]);
    });

    it("removes stale tabIds from uncategorizedOrder", function () {
      const data = makeStaleData();
      const result = cleanStaleTabIds(data, new Set(["tA", "tB", "tD", "tU1"]));
      assert.deepEqual(result.uncategorizedOrder, ["tU1"]);
    });
  });

  describe("compactCategoryTabIds", function () {
    it("moves live tabId/itemId pairs to the front", function () {
      const data = makeStaleData();
      data.categories[0].tabIds = ["", "tA", "tB", ""];
      const result = compactCategoryTabIds(data, "cat1");
      const cat1 = result.categories.find((c) => c.id === "cat1")!;
      assert.deepEqual(cat1.tabIds, ["tA", "tB", "", ""]);
      assert.deepEqual(cat1.itemIds, [102, 103, 101, 104]);
    });
  });

  describe("reconcileUncategorizedOrder", function () {
    it("appends missing live uncategorized tabs", function () {
      const data = makeStaleData();
      data.uncategorizedOrder = ["tU1"];
      const result = reconcileUncategorizedOrder(data, ["tU1", "tU2"]);
      assert.deepEqual(result.uncategorizedOrder, ["tU1", "tU2"]);
    });

    it("returns same data when nothing is missing", function () {
      const data = makeStaleData();
      data.uncategorizedOrder = ["tU1", "tU2"];
      const result = reconcileUncategorizedOrder(data, ["tU1", "tU2"]);
      assert.strictEqual(result, data);
    });
  });

  describe("insertItemsIntoCategoryAt after cleanup", function () {
    it("inserts before the first live tab after compaction", function () {
      let data = makeStaleData();
      data.categories[0].tabIds = ["", "tA", "tB", ""];
      data = cleanStaleTabIds(data, new Set(["tA", "tB", "tD", "tU1"]));
      data = compactCategoryTabIds(data, "cat1");
      const entries: ItemTabEntry[] = [{ itemId: 999, tabId: "tNew" }];
      const result = insertItemsIntoCategoryAt(data, "cat1", entries, "tA");
      const cat1 = result.categories.find((c) => c.id === "cat1")!;
      assert.deepEqual(cat1.tabIds, ["tNew", "tA", "tB", "", ""]);
      assert.deepEqual(cat1.itemIds, [999, 102, 103, 101, 104]);
    });
  });
});
