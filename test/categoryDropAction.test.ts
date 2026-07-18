import { assert } from "chai";
import { decideCategoryDropAction } from "../src/modules/drag/categoryDropAction";

describe("category drop action", function () {
  it("inserts before the first row when dropped at the first position", function () {
    // Regression: dropping at the first position used to bubble up to the
    // wrapper's assign-item handler and append the tab to the END instead.
    const action = decideCategoryDropAction(0, ["tab-a", "tab-b"]);
    assert.deepEqual(action, { type: "insert-before", targetTabId: "tab-a" });
  });

  it("inserts before the row at the hit index", function () {
    const action = decideCategoryDropAction(1, ["tab-a", "tab-b", "tab-c"]);
    assert.deepEqual(action, { type: "insert-before", targetTabId: "tab-b" });
  });

  it("appends to the end when dropped below the last row", function () {
    const action = decideCategoryDropAction(3, ["tab-a", "tab-b", "tab-c"]);
    assert.deepEqual(action, { type: "append-end" });
  });

  it("drops on the category header as the first position (index 0)", function () {
    const action = decideCategoryDropAction(0, ["tab-a", "tab-b"]);
    assert.deepEqual(action, { type: "insert-before", targetTabId: "tab-a" });
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
