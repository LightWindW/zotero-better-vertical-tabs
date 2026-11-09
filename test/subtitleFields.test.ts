import { assert } from "chai";
import { createEmptyItemInfo } from "../src/modules/render/itemInfoCache";
import {
  buildSubtitleValues,
  DEFAULT_SUBTITLE_FIELDS,
  MAX_SUBTITLE_FIELDS,
  parseSubtitleFields,
  resolveSubtitleValue,
  serializeSubtitleFields,
  SUBTITLE_FIELD_IDS,
  type SubtitleFieldId,
} from "../src/modules/render/subtitleFields";

function ctx(overrides: Partial<ReturnType<typeof createEmptyItemInfo>> = {}) {
  return {
    info: { ...createEmptyItemInfo(), ...overrides },
    lastReadText: "5 分钟前",
  };
}

describe("subtitleFields", function () {
  describe("parseSubtitleFields", function () {
    it("falls back to the default trio when the pref key is missing", function () {
      assert.deepEqual(parseSubtitleFields(undefined), DEFAULT_SUBTITLE_FIELDS);
      assert.deepEqual(parseSubtitleFields(null), DEFAULT_SUBTITLE_FIELDS);
    });

    it("treats an empty string as a user-cleared subtitle (0 fields)", function () {
      assert.deepEqual(parseSubtitleFields(""), []);
      assert.deepEqual(parseSubtitleFields("   "), []);
    });

    it("keeps a valid order and drops unknown ids / duplicates", function () {
      assert.deepEqual(
        parseSubtitleFields("shortTitle,bogus,journal,shortTitle,lastRead"),
        ["shortTitle", "journal", "lastRead"],
      );
    });

    it("caps the list at MAX fields", function () {
      const all = SUBTITLE_FIELD_IDS.join(",");
      const parsed = parseSubtitleFields(all);
      assert.equal(parsed.length, MAX_SUBTITLE_FIELDS);
      assert.deepEqual(
        parsed,
        SUBTITLE_FIELD_IDS.slice(0, MAX_SUBTITLE_FIELDS),
      );
    });

    it("returns an empty list when every id is unknown", function () {
      assert.deepEqual(parseSubtitleFields("foo,bar"), []);
    });

    it("round-trips through serialize", function () {
      const fields: SubtitleFieldId[] = [
        "journal",
        "firstAuthorLastName",
        "shortTitle",
      ];
      assert.deepEqual(
        parseSubtitleFields(serializeSubtitleFields(fields)),
        fields,
      );
    });
  });

  describe("resolveSubtitleValue", function () {
    it("uses the caller-provided read-time text for the lastRead field", function () {
      assert.equal(resolveSubtitleValue("lastRead", ctx()), "5 分钟前");
    });

    it("maps each metadata field to its dedicated ItemInfo field", function () {
      const context = ctx({
        firstAuthorLastName: "Zhang",
        firstAuthor: "Zhang San",
        allAuthors: "Zhang San, Li Si",
        yearOnly: "2020",
        dateRaw: "2020-05-01",
        journalShort: "Nat. Mach. Intell.",
        venue: "Nature Machine Intelligence",
        shortTitle: "DL review",
      });
      assert.equal(
        resolveSubtitleValue("firstAuthorLastName", context),
        "Zhang",
      );
      assert.equal(resolveSubtitleValue("firstAuthor", context), "Zhang San");
      assert.equal(
        resolveSubtitleValue("allAuthors", context),
        "Zhang San, Li Si",
      );
      assert.equal(resolveSubtitleValue("year", context), "2020");
      assert.equal(resolveSubtitleValue("date", context), "2020-05-01");
      assert.equal(
        resolveSubtitleValue("journalShort", context),
        "Nat. Mach. Intell.",
      );
      assert.equal(
        resolveSubtitleValue("journal", context),
        "Nature Machine Intelligence",
      );
      assert.equal(resolveSubtitleValue("shortTitle", context), "DL review");
    });

    it("returns an empty string for metadata the item does not have", function () {
      assert.equal(resolveSubtitleValue("journalShort", ctx()), "");
      assert.equal(resolveSubtitleValue("shortTitle", ctx()), "");
    });
  });

  describe("buildSubtitleValues", function () {
    it("skips empty values so no orphan separators are rendered", function () {
      const values = buildSubtitleValues(
        ["lastRead", "firstAuthorLastName", "journalShort"],
        ctx({ firstAuthorLastName: "Zhang", journalShort: "" }),
      );
      assert.deepEqual(
        values.map((entry) => entry.field),
        ["lastRead", "firstAuthorLastName"],
      );
    });

    it("keeps the configured order", function () {
      const values = buildSubtitleValues(
        ["journalShort", "lastRead"],
        ctx({ journalShort: "Nature" }),
      );
      assert.deepEqual(values, [
        { field: "journalShort", text: "Nature" },
        { field: "lastRead", text: "5 分钟前" },
      ]);
    });

    it("yields nothing when the user cleared the subtitle", function () {
      assert.deepEqual(buildSubtitleValues([], ctx()), []);
    });
  });
});
