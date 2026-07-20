import { assert } from "chai";
import { computeRangeSelection } from "../src/modules/drag/multiSelect";
import {
  insertItemsIntoCategoryAt,
  insertUncategorizedItemsAt,
  type ItemTabEntry,
  type VerticalTabsData,
} from "../src/modules/track/dataStore";

describe("multi-tab selection and drop", function () {
  describe("computeRangeSelection (shift-click range)", function () {
    const ORDER = ["t1", "t2", "t3", "t4", "t5"];

    it("selects forward from anchor to target (inclusive)", function () {
      assert.deepEqual(computeRangeSelection("t2", "t4", ORDER), [
        "t2",
        "t3",
        "t4",
      ]);
    });

    it("selects backward from anchor to target (inclusive)", function () {
      assert.deepEqual(computeRangeSelection("t4", "t2", ORDER), [
        "t2",
        "t3",
        "t4",
      ]);
    });

    it("anchor equals target selects just that tab", function () {
      assert.deepEqual(computeRangeSelection("t3", "t3", ORDER), ["t3"]);
    });

    it("returns empty when an endpoint is not in the order", function () {
      assert.deepEqual(computeRangeSelection("tX", "t3", ORDER), []);
      assert.deepEqual(computeRangeSelection("t3", "tX", ORDER), []);
    });

    it("spans the whole list", function () {
      assert.deepEqual(computeRangeSelection("t1", "t5", ORDER), ORDER);
    });
  });

  describe("move-items data flow (contiguous block insert)", function () {
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
        uncategorizedOrder: ["tU1"],
        uncategorizedItemIds: [301],
        lastReadTimes: {},
      };
    }

    it("moves an ordered block into a category before a target tab", function () {
      const entries: ItemTabEntry[] = [
        { itemId: 102, tabId: "tB" },
        { itemId: 301, tabId: "tU1" },
      ];
      const data = insertItemsIntoCategoryAt(makeData(), "cat2", entries, "tD");
      assert.deepEqual(data.categories[1].tabIds, ["tB", "tU1", "tD"]);
      assert.deepEqual(data.categories[1].itemIds, [102, 301, 201]);
      // Removed from previous locations.
      assert.deepEqual(data.categories[0].tabIds, ["tA", "tC"]);
      assert.deepEqual(data.uncategorizedOrder, []);
    });

    it("moves an ordered block into the uncategorized list at the end", function () {
      const entries: ItemTabEntry[] = [
        { itemId: 102, tabId: "tB" },
        { itemId: 103, tabId: "tC" },
      ];
      const data = insertUncategorizedItemsAt(makeData(), entries, undefined);
      assert.deepEqual(data.uncategorizedOrder, ["tU1", "tB", "tC"]);
      assert.deepEqual(data.uncategorizedItemIds, [301, 102, 103]);
      assert.deepEqual(data.categories[0].tabIds, ["tA"]);
    });

    it("keeps the dragged block contiguous and in visual order", function () {
      // Dragging tA + tC (non-adjacent in cat1) to cat2 preserves their
      // visual relative order and dedups by tabId.
      const entries: ItemTabEntry[] = [
        { itemId: 101, tabId: "tA" },
        { itemId: 103, tabId: "tC" },
      ];
      const data = insertItemsIntoCategoryAt(
        makeData(),
        "cat2",
        entries,
        undefined,
      );
      assert.deepEqual(data.categories[1].tabIds, ["tD", "tA", "tC"]);
      assert.deepEqual(data.categories[0].tabIds, ["tB"]);
    });
  });
});
