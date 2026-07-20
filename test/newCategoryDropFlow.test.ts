import { assert } from "chai";
import {
  addCategoryAtTop,
  assignItemToCategory,
  insertItemsIntoCategoryAt,
  type VerticalTabsData,
} from "../src/modules/track/dataStore";

function makeData(): VerticalTabsData {
  return {
    version: 3,
    categories: [
      {
        id: "cat1",
        name: "Category 1",
        order: 0,
        itemIds: [101],
        tabIds: ["tA"],
      },
      {
        id: "cat2",
        name: "Category 2",
        order: 1,
        itemIds: [201],
        tabIds: ["tB"],
      },
    ],
    uncategorizedOrder: ["tU1"],
    uncategorizedItemIds: [301],
  };
}

describe("quick-create category drop flow", function () {
  it("addCategoryAtTop places the new category first and returns its id", function () {
    const { data, categoryId } = addCategoryAtTop(makeData(), "My New");
    assert.equal(data.categories[0].id, categoryId);
    assert.equal(data.categories[0].name, "My New");
    assert.deepEqual(
      data.categories.map((c) => c.id),
      [categoryId, "cat1", "cat2"],
    );
    // order fields are re-indexed by position
    assert.deepEqual(
      data.categories.map((c) => c.order),
      [0, 1, 2],
    );
  });

  it("addCategoryAtTop works on an empty category list", function () {
    const empty: VerticalTabsData = {
      version: 3,
      categories: [],
      uncategorizedOrder: [],
      uncategorizedItemIds: [],
    };
    const { data, categoryId } = addCategoryAtTop(empty, "Solo");
    assert.equal(data.categories.length, 1);
    assert.equal(data.categories[0].id, categoryId);
  });

  it("internal path: dragged tab lands in the new top category (assign)", function () {
    const { data: created, categoryId } = addCategoryAtTop(makeData(), "Top");
    const data = assignItemToCategory(created, 101, categoryId, "tA");
    assert.deepEqual(data.categories[0].tabIds, ["tA"]);
    assert.deepEqual(data.categories[0].itemIds, [101]);
    // The tab is removed from its previous category.
    assert.deepEqual(data.categories[1].tabIds, []);
  });

  it("external path: opened entries land in the new top category (insert)", function () {
    const { data: created, categoryId } = addCategoryAtTop(makeData(), "Top");
    const data = insertItemsIntoCategoryAt(
      created,
      categoryId,
      [
        { itemId: 401, tabId: "tN1" },
        { itemId: 402, tabId: "tN2" },
      ],
      undefined,
    );
    assert.deepEqual(data.categories[0].tabIds, ["tN1", "tN2"]);
    assert.equal(data.categories[0].name, "Top");
    // Existing categories keep their content and relative order.
    assert.deepEqual(data.categories[1].tabIds, ["tA"]);
    assert.deepEqual(data.categories[2].tabIds, ["tB"]);
  });
});
