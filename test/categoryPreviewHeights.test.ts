import { assert } from "chai";
import { applyCategoryPreview } from "../src/modules/drag/categoryPreview";
import {
  setDraggedRowHeight,
  setDragSourceCategoryId,
} from "../src/modules/drag/itemDragState";

/**
 * Reproducing tests for the "show extra" drag-height bug.
 *
 * With `verticalTabs.showExtra` enabled, reader-tab rows carrying an extra
 * field render one line taller than the tab-height baseline, so the container
 * preview must not be derived from a row count. It is:
 *   current rendered height (already contains the taller rows)
 * + ONE placeholder slot (the dragged row's real height, plus one collapsed
 *   inter-row gap only when the row is inserted into ANOTHER container)
 *
 * Measured real layout (headless browser + the real CSS):
 * - 3 rows 47/55/47 in `.vertical-tabs-items` → 169px:
 *   padding 4 + rows 149 + margins 16 (4 above, 4 below, 4 between neighbours;
 *   adjacent 4px margins COLLAPSE). The old "count × (rect + 8)" formula gave
 *   256px — ~28px of blank strip under the last row.
 * - Collapsing the dragged row (overflow:hidden) keeps the two 4px margins
 *   around it apart, so removing a middle row takes exactly the row height
 *   away: the after-collapse container is 114px and re-inserting adds 55px.
 * - Inserting into another 3-row container adds row + one gap: 169 + 59 = 228.
 */

const ROW_MARGIN = 4;
const ITEMS_PADDING = 2;

class FakeClassList {
  private classes: Set<string>;
  constructor(initial: string[]) {
    this.classes = new Set(initial);
  }
  contains(c: string): boolean {
    return this.classes.has(c);
  }
  add(...cs: string[]): void {
    cs.forEach((c) => this.classes.add(c));
  }
  remove(...cs: string[]): void {
    cs.forEach((c) => this.classes.delete(c));
  }
}

function fakeStyle() {
  return {
    height: "",
    setProperty(_key: string, _value: string) {},
    removeProperty(_key: string) {},
  };
}

interface FakeRowInit {
  /** Rendered (border-box) height of the row, as getBoundingClientRect reports. */
  height: number;
  /** Collapsed as a drag source: no layout box, no margins. */
  collapsed?: boolean;
}

function fakeRow(init: FakeRowInit): any {
  const classList = new FakeClassList(["vertical-tabs-item"]);
  if (init.collapsed) classList.add("vt-drag-source-collapsed");
  return {
    __kind: "row",
    __collapsed: !!init.collapsed,
    classList,
    dataset: {},
    style: fakeStyle(),
    getBoundingClientRect: () => ({
      height: init.collapsed ? 0 : init.height,
    }),
  };
}

/**
 * The items wrapper is faked with EXPLICIT rendered/scroll heights measured
 * from the real CSS, so the tests assert the preview formula itself rather
 * than re-deriving the browser's margin collapsing in the fake.
 */
function fakeItems(
  rows: any[],
  sizes: { naturalHeight?: number; scrollHeight?: number } = {},
): any {
  const findCollapsed = () =>
    rows.find(
      (row) =>
        row.classList.contains("vt-drag-source-collapsed") ||
        row.classList.contains("vt-multi-source-collapse"),
    ) ?? null;
  return {
    __kind: "items",
    classList: new FakeClassList(["vertical-tabs-items"]),
    style: fakeStyle(),
    offsetHeight: 0,
    get scrollHeight() {
      return sizes.scrollHeight ?? 0;
    },
    getBoundingClientRect: () => ({ height: sizes.naturalHeight ?? 0 }),
    querySelector: (sel: string) =>
      sel.includes("vt-drag-source-collapsed") ||
      sel.includes("vt-multi-source-collapse")
        ? findCollapsed()
        : null,
    querySelectorAll: (sel: string) =>
      sel.includes("vertical-tabs-item") ? rows : [],
  };
}

function fakeCategoryWrapper(items: any): any {
  return {
    __kind: "wrapper",
    classList: new FakeClassList(["vertical-tabs-category"]),
    style: fakeStyle(),
    dataset: { categoryId: "cat-1" },
    offsetHeight: 0,
    getBoundingClientRect: () => ({ height: 0 }),
    querySelector: (sel: string) =>
      sel.includes("vertical-tabs-items") ? items : items.querySelector(sel),
    querySelectorAll: () => [],
  };
}

function fakeComputed(el: any) {
  if (el.__kind === "row") {
    const margin = el.__collapsed ? "0px" : `${ROW_MARGIN}px`;
    return {
      boxSizing: "border-box",
      marginTop: margin,
      marginBottom: margin,
      paddingTop: "0px",
      paddingBottom: "0px",
      getPropertyValue: () => "",
    };
  }
  return {
    boxSizing: "border-box",
    marginTop: "0px",
    marginBottom: "0px",
    paddingTop: `${ITEMS_PADDING}px`,
    paddingBottom: `${ITEMS_PADDING}px`,
    getPropertyValue: (property: string) =>
      property === "--vt-item-min-height" ? "36px" : "",
  };
}

function fakeDoc(): Document {
  return {
    defaultView: {
      setTimeout: () => 0,
      clearTimeout: () => {},
      getComputedStyle: (el: any) => fakeComputed(el),
    },
  } as unknown as Document;
}

/** A plain row: rect 47. */
const PLAIN = 47;
/** A row with the extra field: one line taller. */
const WITH_EXTRA = 55;

describe("category drag preview height with mixed row heights", function () {
  it("adds exactly one placeholder to the container's real height", function () {
    const doc = fakeDoc();
    // Plain / extra-tall / plain: the first row is NOT the tallest one, which
    // is exactly the case the old count × first-row formula under-allocated.
    const rows = [
      fakeRow({ height: PLAIN }),
      fakeRow({ height: WITH_EXTRA }),
      fakeRow({ height: PLAIN }),
    ];
    const items = fakeItems(rows, { naturalHeight: 169 });
    const wrapper = fakeCategoryWrapper(items);
    // Dragging the extra-tall row in from ANOTHER container.
    setDraggedRowHeight(doc, WITH_EXTRA);

    applyCategoryPreview(doc, wrapper);

    // 169 + (row 55 + one collapsed gap 4) = 228
    // (the old outer-sum formula produced 256 — 28px of blank strip).
    assert.equal(items.style.height, "228px");
  });

  it("keeps the ORIGINAL height when reordering inside the SAME category", function () {
    const doc = fakeDoc();
    const rows = [
      fakeRow({ height: PLAIN }),
      fakeRow({ height: WITH_EXTRA, collapsed: true }),
      fakeRow({ height: PLAIN }),
    ];
    // Real measurement after the middle row collapsed: 114px. Collapsing does
    // not merge the two margins around the row, so only the row height left.
    const items = fakeItems(rows, { naturalHeight: 114 });
    const wrapper = fakeCategoryWrapper(items);
    setDraggedRowHeight(doc, WITH_EXTRA);
    setDragSourceCategoryId(doc, "cat-1");

    applyCategoryPreview(doc, wrapper);

    // Same container → placeholder is just the row height: 114 + 55 = 169,
    // i.e. exactly the category's original height (no jump on drop, no blank).
    assert.equal(items.style.height, "169px");
  });

  it("does not grow when the first dragover beats the collapse rAF", function () {
    const doc = fakeDoc();
    // Browser timeline: dragstart → first dragover (same task) → rAF collapse.
    // Here the source row is NOT collapsed yet, so the measured height is the
    // ORIGINAL one (169) and the target must stay 169 — the old class-based
    // "is this my source?" check misfired here and reserved one extra row.
    const rows = [
      fakeRow({ height: PLAIN }),
      fakeRow({ height: WITH_EXTRA }),
      fakeRow({ height: PLAIN }),
    ];
    const items = fakeItems(rows, { naturalHeight: 169 });
    const wrapper = fakeCategoryWrapper(items);
    setDraggedRowHeight(doc, WITH_EXTRA);
    setDragSourceCategoryId(doc, "cat-1");

    applyCategoryPreview(doc, wrapper);

    assert.equal(items.style.height, "169px");
  });

  it("preview-expands a COLLAPSED category to the full content height", function () {
    const doc = fakeDoc();
    const rows = [
      fakeRow({ height: PLAIN }),
      fakeRow({ height: WITH_EXTRA }),
      fakeRow({ height: PLAIN }),
    ];
    // scrollHeight of the 3-row content (no padding): rows 149 + margins 16.
    const items = fakeItems(rows, { scrollHeight: 165 });
    const wrapper = fakeCategoryWrapper(items);
    wrapper.classList.add("collapsed");
    setDraggedRowHeight(doc, WITH_EXTRA);

    applyCategoryPreview(doc, wrapper);

    // 165 + (55 + 4) = 224. The 4px of expanded padding is not readable from a
    // collapsed container (same conservative shortfall as the old code — it
    // only trims the last row's bottom margin, never its content).
    assert.equal(items.style.height, "224px");
  });

  it("falls back to the first visible row for external library drags", function () {
    const doc = fakeDoc();
    const rows = [
      fakeRow({ height: PLAIN }),
      fakeRow({ height: WITH_EXTRA }),
      fakeRow({ height: PLAIN }),
    ];
    const items = fakeItems(rows, { naturalHeight: 169 });
    const wrapper = fakeCategoryWrapper(items);

    applyCategoryPreview(doc, wrapper);

    // 169 + (first row 47 + one gap 4) = 220.
    assert.equal(items.style.height, "220px");
  });

  it("reserves a full row slot when previewing an EMPTY category", function () {
    const doc = fakeDoc();
    const items = fakeItems([], { naturalHeight: 4 });
    const wrapper = fakeCategoryWrapper(items);

    applyCategoryPreview(doc, wrapper);

    // Empty container rect = padding only. Placeholder for a row with no
    // neighbours = baseline 36 + both margins 8 → 4 + 44 = 48.
    assert.equal(items.style.height, "48px");
  });

  it("restores the original height when a ONE-ROW category drags its only row", function () {
    const doc = fakeDoc();
    const rows = [fakeRow({ height: WITH_EXTRA, collapsed: true })];
    // The only row collapsed: the items wrapper is just its 4px padding.
    const items = fakeItems(rows, { naturalHeight: 4 });
    const wrapper = fakeCategoryWrapper(items);
    setDraggedRowHeight(doc, WITH_EXTRA);
    setDragSourceCategoryId(doc, "cat-1");

    applyCategoryPreview(doc, wrapper);

    // 4 + (55 + both margins 8) = 67 = the original one-row category height.
    assert.equal(items.style.height, "67px");
  });
});
