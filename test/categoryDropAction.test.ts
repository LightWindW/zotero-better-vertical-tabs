import { assert } from "chai";
import {
  computeCategoryReorderInsertBefore,
  decideCategoryDropAction,
  resolveAfterInsertBefore,
} from "../src/modules/drag/categoryDropAction";

describe("category drop rules", function () {
  describe("category drop action", function () {
    it("inserts before the first row when dropped at the first position", function () {
      // Regression: dropping at the first position used to bubble up to the
      // wrapper's assign-item handler and append the tab to the END instead.
      const action = decideCategoryDropAction(0, ["tab-a", "tab-b"]);
      assert.deepEqual(action, {
        type: "insert-before",
        targetTabId: "tab-a",
      });
    });

    it("inserts before the row at the hit index", function () {
      const action = decideCategoryDropAction(1, ["tab-a", "tab-b", "tab-c"]);
      assert.deepEqual(action, {
        type: "insert-before",
        targetTabId: "tab-b",
      });
    });

    it("appends to the end when dropped below the last row", function () {
      const action = decideCategoryDropAction(3, ["tab-a", "tab-b", "tab-c"]);
      assert.deepEqual(action, { type: "append-end" });
    });

    it("drops on the category header as the first position (index 0)", function () {
      const action = decideCategoryDropAction(0, ["tab-a", "tab-b"]);
      assert.deepEqual(action, {
        type: "insert-before",
        targetTabId: "tab-a",
      });
    });

    it("appends to the end for an empty category (header or body drop)", function () {
      const action = decideCategoryDropAction(0, []);
      assert.deepEqual(action, { type: "append-end" });
    });

    it("never inserts before a negative index", function () {
      const action = decideCategoryDropAction(-1, ["tab-a"]);
      assert.deepEqual(action, { type: "append-end" });
    });
  });

  describe("category reorder insert-before rule", function () {
    const ORDER = ["cat-a", "cat-b", "cat-c"];

    it("before a category targets that category itself", function () {
      assert.equal(
        computeCategoryReorderInsertBefore("before", "cat-b", ORDER),
        "cat-b",
      );
    });

    it("after a category targets the NEXT category (not the list end)", function () {
      // Regression: the old drop handler passed null for "after", which
      // appended to the END and contradicted the gap indicator.
      assert.equal(
        computeCategoryReorderInsertBefore("after", "cat-b", ORDER),
        "cat-c",
      );
    });

    it("after the last category returns null (append to end)", function () {
      assert.isNull(
        computeCategoryReorderInsertBefore("after", "cat-c", ORDER),
      );
    });

    it("after an unknown category falls back to append", function () {
      assert.isNull(
        computeCategoryReorderInsertBefore("after", "cat-x", ORDER),
      );
    });
  });

  describe("resolveAfterInsertBefore", function () {
    const ORDER = ["t1", "t2", "t3"];

    it("resolves after a middle row to the row right after it", function () {
      // Regression: the uncategorized reorder branch used to pass null for
      // "after", dumping the tab at the very END while the green bar showed
      // the middle position.
      assert.equal(resolveAfterInsertBefore(ORDER, "t1"), "t2");
      assert.equal(resolveAfterInsertBefore(ORDER, "t2"), "t3");
    });

    it("after the last row returns null (append to end)", function () {
      assert.isNull(resolveAfterInsertBefore(ORDER, "t3"));
    });

    it("unknown target returns null (append to end)", function () {
      assert.isNull(resolveAfterInsertBefore(ORDER, "tX"));
      assert.isNull(resolveAfterInsertBefore([], "t1"));
    });
  });
});
