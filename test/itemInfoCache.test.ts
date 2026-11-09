import { assert } from "chai";
import {
  clearItemInfoCache,
  clearItemTypeImageSrc,
  computeItemInfo,
  getItemInfo,
  getItemTypeImageSrc,
  invalidateItemInfo,
} from "../src/modules/render/itemInfoCache";

interface FakeItem {
  item: Zotero.Item;
  getFieldCallCount: () => number;
}

function fakeItem(
  id: number,
  fields: Record<string, string>,
  creators: Array<{
    lastName: string;
    firstName: string;
    fieldMode?: number;
  }> = [],
  tags: string[] = [],
  itemType?: string,
): FakeItem {
  let getFieldCalls = 0;
  const item = {
    id,
    itemType,
    getField: (name: string) => {
      getFieldCalls++;
      return fields[name] ?? "";
    },
    getCreators: () => creators,
    getTags: () => tags.map((tag) => ({ tag })),
  } as unknown as Zotero.Item;
  return { item, getFieldCallCount: () => getFieldCalls };
}

describe("itemInfoCache", function () {
  afterEach(function () {
    clearItemInfoCache();
  });

  describe("computeItemInfo", function () {
    it("reads title/date/journal/extra/tags from the item", function () {
      const { item } = fakeItem(
        1,
        {
          title: "Deep Learning",
          date: "2020-05-01",
          publicationTitle: "Nature",
          extra: "note",
        },
        [],
        ["ml", "ai"],
      );
      const info = computeItemInfo(item);
      assert.equal(info.title, "Deep Learning");
      // year 保持既有 YYYY-MM 语义（纯年份用 yearOnly）。
      assert.equal(info.year, "2020-05");
      assert.equal(info.journal, "Nature");
      assert.equal(info.extra, "note");
      assert.deepEqual(info.tags, ["ml", "ai"]);
    });

    it("falls back: Untitled, proceedingsTitle, institution", function () {
      const { item } = fakeItem(2, {
        proceedingsTitle: "CVPR",
        institution: "MIT",
      });
      const info = computeItemInfo(item);
      assert.equal(info.title, "Untitled");
      assert.equal(info.journal, "CVPR");
      assert.equal(info.university, "MIT");
      assert.equal(info.year, "");
    });

    it("formats up to 3 creators and appends et al. beyond that", function () {
      const creators = [
        { lastName: "A", firstName: "a" },
        { lastName: "B", firstName: "b" },
        { lastName: "C", firstName: "c" },
        { lastName: "D", firstName: "d" },
      ];
      const { item } = fakeItem(3, {}, creators);
      const info = computeItemInfo(item);
      assert.equal(info.authors, "A a, B b, C c et al.");
    });

    it("uses lastName only for single-field (fieldMode 1) creators", function () {
      const { item } = fakeItem(4, {}, [
        { lastName: "Plato", firstName: "", fieldMode: 1 },
      ]);
      const info = computeItemInfo(item);
      assert.equal(info.authors, "Plato");
      // 副标题字段复用同一套 creator 显示名规则。
      assert.equal(info.firstAuthorLastName, "Plato");
      assert.equal(info.firstAuthor, "Plato");
      assert.equal(info.allAuthors, "Plato");
    });

    it("computes the custom subtitle fields", function () {
      const { item } = fakeItem(
        5,
        {
          date: "2020-05-01",
          publicationTitle: "Nature",
          journalAbbreviation: "Nat.",
          shortTitle: "DL",
        },
        [
          { lastName: "Zhang", firstName: "San" },
          { lastName: "Li", firstName: "Si" },
        ],
      );
      const info = computeItemInfo(item);
      assert.equal(info.firstAuthorLastName, "Zhang");
      assert.equal(info.firstAuthor, "Zhang San");
      assert.equal(info.allAuthors, "Zhang San, Li Si");
      assert.equal(info.venue, "Nature");
      assert.equal(info.journalShort, "Nat.");
      assert.equal(info.shortTitle, "DL");
      assert.equal(info.dateRaw, "2020-05-01");
      assert.equal(info.yearOnly, "2020");
    });

    it("uses conferenceName as venue for conference papers", function () {
      const { item } = fakeItem(
        6,
        { conferenceName: "CVPR", proceedingsTitle: "Proc. CVPR" },
        [],
        [],
        "conferencePaper",
      );
      const info = computeItemInfo(item);
      assert.equal(info.venue, "CVPR");
      // 会议论文没有 journalAbbreviation：刊名简称回落到 venue。
      assert.equal(info.journalShort, "CVPR");
    });

    it("uses university as venue for theses", function () {
      const { item } = fakeItem(7, { university: "MIT" }, [], [], "thesis");
      const info = computeItemInfo(item);
      assert.equal(info.venue, "MIT");
      assert.equal(info.journalShort, "MIT");
    });
  });

  describe("getItemInfo cache", function () {
    it("serves the second call from cache without touching the item", function () {
      const { item, getFieldCallCount } = fakeItem(10, { title: "Cached" });
      const first = getItemInfo(item);
      const callsAfterFirst = getFieldCallCount();
      const second = getItemInfo(item);
      assert.strictEqual(first, second);
      assert.equal(getFieldCallCount(), callsAfterFirst);
    });

    it("recomputes after invalidateItemInfo", function () {
      const fields: Record<string, string> = { title: "Old" };
      const { item } = fakeItem(11, fields);
      assert.equal(getItemInfo(item).title, "Old");
      fields.title = "New";
      // Still cached before invalidation.
      assert.equal(getItemInfo(item).title, "Old");
      invalidateItemInfo(11);
      assert.equal(getItemInfo(item).title, "New");
    });

    it("recomputes after clearItemInfoCache", function () {
      const fields: Record<string, string> = { title: "One" };
      const { item } = fakeItem(12, fields);
      getItemInfo(item);
      fields.title = "Two";
      clearItemInfoCache();
      assert.equal(getItemInfo(item).title, "Two");
    });

    it("caches per itemId independently", function () {
      const a = fakeItem(20, { title: "A" });
      const b = fakeItem(21, { title: "B" });
      assert.equal(getItemInfo(a.item).title, "A");
      assert.equal(getItemInfo(b.item).title, "B");
      invalidateItemInfo(20);
      a.item = fakeItem(20, { title: "A2" }).item;
      assert.equal(getItemInfo(a.item).title, "A2");
      assert.equal(getItemInfo(b.item).title, "B");
    });
  });

  describe("getItemTypeImageSrc cache", function () {
    afterEach(function () {
      clearItemTypeImageSrc();
      delete (globalThis as any).Zotero;
    });

    it("caches per type and refreshes after clearItemTypeImageSrc", function () {
      // Zotero's getImageSrc returns theme-aware icons; the cache must be
      // clearable on theme switch or dark-mode icons stay frozen.
      let theme = "light";
      let calls = 0;
      (globalThis as any).Zotero = {
        ItemTypes: {
          getImageSrc: (t: string) => {
            calls++;
            return `src://${theme}/${t}`;
          },
        },
      };
      assert.equal(
        getItemTypeImageSrc("journalArticle"),
        "src://light/journalArticle",
      );
      theme = "dark";
      // Without a clear, the cached (old-theme) src is served.
      assert.equal(
        getItemTypeImageSrc("journalArticle"),
        "src://light/journalArticle",
      );
      clearItemTypeImageSrc();
      assert.equal(
        getItemTypeImageSrc("journalArticle"),
        "src://dark/journalArticle",
      );
      assert.equal(calls, 2);
    });

    it("returns empty string when the lookup throws", function () {
      (globalThis as any).Zotero = {
        ItemTypes: {
          getImageSrc: () => {
            throw new Error("unknown type");
          },
        },
      };
      assert.equal(getItemTypeImageSrc("bogusType"), "");
    });
  });
});
