import { assert } from "chai";
import {
  getContainerPreviewDelta,
  getDefaultRowHeight,
  getLayoutRows,
  getPlaceholderHeight,
  getRowHeight,
  getRowsContentHeight,
  getRowsMetrics,
  invalidateRowHeightCache,
} from "../src/modules/drag/dragRowMetrics";
import { applyDropPreview } from "../src/modules/drag/dropPreview";
import {
  setDraggedRowHeight,
  setDraggedTabId,
  setDragSourceCategoryId,
} from "../src/modules/drag/itemDragState";

/**
 * Drag-time row metrics.
 *
 * Measured layout facts (verified in a headless browser against the real CSS):
 * rows carry margin:4px but adjacent margins COLLAPSE, so two neighbouring
 * rows are 4px apart; a row adds `rect + 4` to the container. The insertion
 * placeholder must reserve `draggedRect + 4` (non-empty container) or
 * `draggedRect + 8` (empty container).
 */

const ROW_MARGIN = 4;
const ITEMS_PADDING = 2;

// dropPreview builds `[data-tab-id="…"]` selectors with CSS.escape, which the
// Node test runtime does not provide.
(globalThis as any).CSS = { escape: (value: string) => value };

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
  const properties = new Map<string, string>();
  return {
    height: "",
    setProperty(key: string, value: string) {
      properties.set(key, value);
    },
    getPropertyValue(key: string) {
      return properties.get(key) ?? "";
    },
    removeProperty(key: string) {
      properties.delete(key);
    },
  };
}

interface FakeRow {
  [key: string]: any;
}

function fakeRow(height: number, opts: { collapsed?: boolean } = {}): FakeRow {
  const classList = new FakeClassList(["vertical-tabs-item"]);
  if (opts.collapsed) classList.add("vt-drag-source-collapsed");
  return {
    __kind: "row",
    __height: height,
    __collapsed: !!opts.collapsed,
    __nextSibling: null,
    classList,
    dataset: {},
    style: fakeStyle(),
    matches: () => false,
    getBoundingClientRect: () => ({
      height: opts.collapsed ? 0 : height,
    }),
    get nextElementSibling(): any {
      return this.__nextSibling;
    },
  };
}

function fakeItems(rows: FakeRow[]): any {
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
    dataset: {},
    offsetHeight: 0,
    getBoundingClientRect: () => ({ height: 0 }),
    querySelector: (sel: string) =>
      sel.includes("vt-drag-source-collapsed") ||
      sel.includes("vt-multi-source-collapse")
        ? findCollapsed()
        : null,
    querySelectorAll: (sel: string) =>
      sel.includes("vertical-tabs-item") ? rows : [],
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

describe("drag preview metrics", function () {
  describe("drag row metrics", function () {
    it("measures the rendered row height", function () {
      const row = fakeRow(47);
      assert.equal(getRowHeight(row), 47);
    });

    it("sums rows with COLLAPSED margins, excluding drag sources", function () {
      const doc = fakeDoc();
      const rows = [fakeRow(47), fakeRow(55), fakeRow(47)];
      const items = fakeItems(rows);

      const metrics = getRowsMetrics(doc, items);
      assert.equal(metrics.count, 3);
      assert.equal(metrics.gap, ROW_MARGIN);
      assert.equal(metrics.firstRowHeight, 47);
      // 149 rows + 4 above + 4 below + 2 × 4 between = 165 (NOT 149 + 24).
      assert.equal(metrics.contentHeight, 165);
      assert.equal(getRowsContentHeight(doc, items), 165);

      const collapsed = fakeItems([
        fakeRow(47),
        fakeRow(55, { collapsed: true }),
      ]);
      assert.lengthOf(getLayoutRows(collapsed), 1);
      assert.equal(getRowsContentHeight(doc, collapsed), 55);
    });

    it("caches the measurements until the drag session invalidates them", function () {
      const doc = fakeDoc();
      const tall = fakeRow(47);
      const items = fakeItems([tall, fakeRow(47)]);

      assert.equal(getRowsContentHeight(doc, items), 106);
      // Mid-drag height animations must not churn the preview height.
      tall.getBoundingClientRect = () => ({ height: 200 });
      assert.equal(getRowsContentHeight(doc, items), 106);

      invalidateRowHeightCache();
      assert.equal(getRowsContentHeight(doc, items), 259);
    });

    it("re-measures after a canceled drag uncollapses its source rows", function () {
      const doc = fakeDoc();
      // A multi drag has collapsed its rows, so the cached sum excludes them.
      const collapsedRow = fakeRow(47, { collapsed: true });
      const items = fakeItems([fakeRow(47), collapsedRow, fakeRow(47)]);
      assert.equal(getRowsContentHeight(doc, items), 106);

      // Cancel: the rows expand back without a re-render, then a following
      // EXTERNAL library drag must not reuse the short sum.
      collapsedRow.classList.remove("vt-drag-source-collapsed");
      collapsedRow.__collapsed = false;
      collapsedRow.getBoundingClientRect = () => ({ height: 47 });
      invalidateRowHeightCache();
      assert.equal(getRowsContentHeight(doc, items), 157);
    });

    it("builds the placeholder from dragged → first row → baseline", function () {
      const doc = fakeDoc();
      const items = fakeItems([fakeRow(47), fakeRow(55)]);

      // 1. The dragged row was registered at dragstart: rect + one 4px gap.
      setDraggedRowHeight(doc, 55);
      assert.equal(getPlaceholderHeight(doc, items), 59);

      // 2. No dragged row (external library drag) → first row + one gap.
      setDraggedRowHeight(doc, null);
      assert.equal(getPlaceholderHeight(doc, items), 51);

      // 3. Empty container → baseline + both margins (8).
      const empty = fakeItems([]);
      assert.equal(getDefaultRowHeight(doc, empty), 36);
      assert.equal(getPlaceholderHeight(doc, empty), 44);
    });

    it("drops the extra inter-row gap for the drag's OWN container", function () {
      const doc = fakeDoc();
      // Same container: the collapsed source row sits inside it. Collapsing
      // keeps the margins around it apart, so re-inserting only adds the row.
      const own = fakeItems([
        fakeRow(47),
        fakeRow(55, { collapsed: true }),
        fakeRow(47),
      ]);
      own.dataset.categoryId = "cat-1";
      setDraggedRowHeight(doc, 55);
      setDragSourceCategoryId(doc, "cat-1");
      assert.equal(getPlaceholderHeight(doc, own), 55);

      // Another container: the dropped row brings one new collapsed gap.
      const other = fakeItems([fakeRow(47), fakeRow(47)]);
      other.dataset.categoryId = "cat-2";
      assert.equal(getPlaceholderHeight(doc, other), 59);
    });

    it("adds the placeholder delta only once the source row collapsed", function () {
      const doc = fakeDoc();
      // Source container, source row NOT collapsed yet: the measured height
      // still contains the row, so the preview must not grow.
      const before = fakeItems([fakeRow(47), fakeRow(55), fakeRow(47)]);
      before.dataset.categoryId = "cat-1";
      setDraggedRowHeight(doc, 55);
      setDragSourceCategoryId(doc, "cat-1");
      assert.equal(getContainerPreviewDelta(doc, before), 0);

      // Source row collapsed: the layout lost the row, add it back.
      const after = fakeItems([
        fakeRow(47),
        fakeRow(55, { collapsed: true }),
        fakeRow(47),
      ]);
      after.dataset.categoryId = "cat-1";
      assert.equal(getContainerPreviewDelta(doc, after), 55);

      // Other container: full placeholder (row + inter-row gap).
      const other = fakeItems([fakeRow(47), fakeRow(47)]);
      other.dataset.categoryId = "cat-2";
      assert.equal(getContainerPreviewDelta(doc, other), 59);
    });
  });

  describe("insertion gap height", function () {
    /** Two plain rows: rect 47 → placeholder 51 with the collapsed margin. */
    function setup(options: { draggedHeight?: number } = {}) {
      const doc = fakeDoc();
      const first = fakeRow(47);
      const second = fakeRow(47);
      first.__nextSibling = second;
      const rows = [first, second];
      const items = fakeItems(rows);
      setDraggedTabId(doc, "tab-2");
      if (options.draggedHeight !== undefined) {
        setDraggedRowHeight(doc, options.draggedHeight);
      }
      return { doc, rows, items, first, second };
    }

    it("uses the DRAGGED row's real height, not the target row's", function () {
      const { doc, items, second } = setup({ draggedHeight: 55 });

      // The target row is a plain 47px slot, but the dragged row is taller
      // (extra line): the placeholder must match the dragged row.
      const height = applyDropPreview(doc, {
        type: "item",
        container: items,
        targetRow: second,
        before: true,
        draggedTabId: "tab-2",
      });

      assert.equal(height, 59);
    });

    it("falls back to the target's first shifted row without a dragged height", function () {
      const { doc, items, second } = setup();

      const height = applyDropPreview(doc, {
        type: "item",
        container: items,
        targetRow: second,
        before: true,
        draggedTabId: "tab-2",
      });

      assert.equal(height, 51);
    });

    it("uses the placeholder height for the append-to-end branch", function () {
      const { doc, items, second } = setup({ draggedHeight: 71 });

      const height = applyDropPreview(doc, {
        type: "item",
        container: items,
        targetRow: second,
        before: false,
        draggedTabId: "tab-2",
      });

      assert.equal(height, 75);
    });
  });
});
