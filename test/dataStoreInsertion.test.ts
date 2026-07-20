import { assert } from "chai";
import {
  insertItemsIntoCategoryAt,
  insertUncategorizedItemsAt,
  cleanStaleTabIds,
  reconcileUncategorizedOrder,
  assignItemToCategory,
  removeItemFromAllCategories,
  reorderItemInCategory,
  reorderUncategorized,
  restoreCategoryTabIdsAndOrder,
  type ItemTabEntry,
  type VerticalTabsData,
} from "../src/modules/track/dataStore";

// Node-based runners have no Zotero toolkit global; keep the real one when
// running inside Zotero. Only the warn-log paths (e.g. assign without tabId)
// touch it.
(globalThis as any).ztoolkit ??= { log: () => {} };

function makeData(): VerticalTabsData {
  return {
    version: 3,
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
    uncategorizedOrder: ["tU1", "tU2"],
    uncategorizedItemIds: [301, 302],
    lastReadTimes: {},
  };
}

function makeStaleData(): VerticalTabsData {
  return {
    version: 3,
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
    uncategorizedOrder: ["staleU", "tU1"],
    uncategorizedItemIds: [401, 301],
    lastReadTimes: {},
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
    it("removes closed or empty category tabId/itemId pairs", function () {
      const data = makeStaleData();
      const result = cleanStaleTabIds(data, new Set(["tA", "tB", "tD", "tU1"]));
      const cat1 = result.categories.find((c) => c.id === "cat1")!;
      assert.deepEqual(cat1.tabIds, ["tA", "tB"]);
      assert.deepEqual(cat1.itemIds, [102, 103]);
    });

    it("removes stale tabIds from uncategorizedOrder", function () {
      const data = makeStaleData();
      const result = cleanStaleTabIds(data, new Set(["tA", "tB", "tD", "tU1"]));
      assert.deepEqual(result.uncategorizedOrder, ["tU1"]);
    });
  });

  describe("reconcileUncategorizedOrder", function () {
    it("appends missing live uncategorized tabs", function () {
      const data = makeStaleData();
      data.uncategorizedOrder = ["tU1"];
      data.uncategorizedItemIds = [301];
      const result = reconcileUncategorizedOrder(data, [
        { itemId: 301, tabId: "tU1" },
        { itemId: 302, tabId: "tU2" },
      ]);
      assert.deepEqual(result.uncategorizedOrder, ["tU1", "tU2"]);
      assert.deepEqual(result.uncategorizedItemIds, [301, 302]);
    });

    it("returns same data when nothing is missing", function () {
      const data = makeStaleData();
      data.uncategorizedOrder = ["tU1", "tU2"];
      data.uncategorizedItemIds = [301, 302];
      const result = reconcileUncategorizedOrder(data, [
        { itemId: 301, tabId: "tU1" },
        { itemId: 302, tabId: "tU2" },
      ]);
      assert.strictEqual(result, data);
    });
  });

  describe("assignItemToCategory", function () {
    it("moves only the matching tabId pair when tabId is provided", function () {
      const data = makeData();
      // Make cat1 contain two tabs for the same item (duplicate reader tabs)
      data.categories[0].itemIds = [101, 101, 102];
      data.categories[0].tabIds = ["tA1", "tA2", "tB"];

      const result = assignItemToCategory(data, 101, "cat2", "tA2");
      const cat1 = result.categories.find((c) => c.id === "cat1")!;
      const cat2 = result.categories.find((c) => c.id === "cat2")!;

      assert.deepEqual(cat1.itemIds, [101, 102]);
      assert.deepEqual(cat1.tabIds, ["tA1", "tB"]);
      assert.deepEqual(cat2.itemIds, [201, 101]);
      assert.deepEqual(cat2.tabIds, ["tD", "tA2"]);
    });

    it("leaves data unchanged when tabId is omitted", function () {
      const data = makeData();
      const result = assignItemToCategory(data, 101, "cat2");
      assert.strictEqual(result, data);
    });
  });

  describe("removeItemFromAllCategories", function () {
    it("removes only the matching tabId pair when tabId is provided", function () {
      const data = makeData();
      data.categories[0].itemIds = [101, 101, 102];
      data.categories[0].tabIds = ["tA1", "tA2", "tB"];

      const result = removeItemFromAllCategories(data, 101, "tA2");
      const cat1 = result.categories.find((c) => c.id === "cat1")!;

      assert.deepEqual(cat1.itemIds, [101, 102]);
      assert.deepEqual(cat1.tabIds, ["tA1", "tB"]);
    });

    it("removes all pairs for the item when tabId is omitted", function () {
      const data = makeData();
      data.categories[0].itemIds = [101, 101, 102];
      data.categories[0].tabIds = ["tA1", "tA2", "tB"];

      const result = removeItemFromAllCategories(data, 101);
      const cat1 = result.categories.find((c) => c.id === "cat1")!;

      assert.deepEqual(cat1.itemIds, [102]);
      assert.deepEqual(cat1.tabIds, ["tB"]);
    });
  });

  describe("reorderItemInCategory", function () {
    it("moves the paired itemId together with the tabId", function () {
      const data = makeData();
      const result = reorderItemInCategory(data, "cat1", "tC", "tA");
      const cat1 = result.categories.find((c) => c.id === "cat1")!;

      assert.deepEqual(cat1.tabIds, ["tC", "tA", "tB"]);
      assert.deepEqual(cat1.itemIds, [103, 101, 102]);
    });

    it("appends to the end when insertBeforeTabId is null", function () {
      const data = makeData();
      const result = reorderItemInCategory(data, "cat1", "tA", null);
      const cat1 = result.categories.find((c) => c.id === "cat1")!;

      assert.deepEqual(cat1.tabIds, ["tB", "tC", "tA"]);
      assert.deepEqual(cat1.itemIds, [102, 103, 101]);
    });
  });

  describe("insertItemsIntoCategoryAt duplicate item handling", function () {
    it("keeps the existing pair and adds a new pair for the same itemId", function () {
      const data = makeData();
      const entries: ItemTabEntry[] = [{ itemId: 101, tabId: "tNew" }];
      const result = insertItemsIntoCategoryAt(data, "cat1", entries, "tB");
      const cat1 = result.categories.find((c) => c.id === "cat1")!;

      assert.deepEqual(cat1.tabIds, ["tA", "tNew", "tB", "tC"]);
      assert.deepEqual(cat1.itemIds, [101, 101, 102, 103]);
    });
  });

  describe("reorderUncategorized", function () {
    it("moves the paired itemId together with the tabId", function () {
      const data = makeData();
      const result = reorderUncategorized(data, "tU2", 302, "tU1");

      assert.deepEqual(result.uncategorizedOrder, ["tU2", "tU1"]);
      assert.deepEqual(result.uncategorizedItemIds, [302, 301]);
    });
  });

  describe("restoreCategoryTabIdsAndOrder", function () {
    it("replaces stale tabIds with live tabs for the same itemId", function () {
      const data = makeData();
      // Simulate a restart: tA/tB changed to tA2/tB2, tC closed.
      data.categories[0].tabIds = ["oldA", "oldB", "oldC"];
      const liveEntries: ItemTabEntry[] = [
        { itemId: 101, tabId: "tA2" },
        { itemId: 102, tabId: "tB2" },
        { itemId: 201, tabId: "tD" },
      ];

      const result = restoreCategoryTabIdsAndOrder(data, liveEntries);
      const cat1 = result.categories.find((c) => c.id === "cat1")!;

      assert.deepEqual(cat1.tabIds, ["tA2", "tB2"]);
      assert.deepEqual(cat1.itemIds, [101, 102]);
    });

    it("restores uncategorized order using recorded itemIds", function () {
      const data = makeData();
      data.uncategorizedOrder = ["oldU1", "oldU2"];
      data.uncategorizedItemIds = [301, 302];
      const liveEntries: ItemTabEntry[] = [
        { itemId: 302, tabId: "tU2" },
        { itemId: 301, tabId: "tU1" },
      ];

      const result = restoreCategoryTabIdsAndOrder(data, liveEntries);
      assert.deepEqual(result.uncategorizedOrder, ["tU1", "tU2"]);
      assert.deepEqual(result.uncategorizedItemIds, [301, 302]);
    });
  });
});
