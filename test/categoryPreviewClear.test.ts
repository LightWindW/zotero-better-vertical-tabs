import { assert } from "chai";
import {
  applyCategoryPreview,
  clearCategoryPreview,
} from "../src/modules/drag/categoryPreview";

/**
 * Regression tests for the animated preview release.
 *
 * Two failure modes are covered:
 * 1. The release used to read the natural height recorded when the preview
 *    STARTED. That value can be stale (the drag source row collapses after the
 *    first dragover), so the container released to a wrong height and snapped
 *    when the cleanup removed the inline pin. It must re-measure instead.
 * 2. Only ONE pending cleanup was tracked: hopping across three or more
 *    containers orphaned the older timeouts, which later stripped a container
 *    that had been re-entered — its height snapped instead of animating.
 *
 * categoryPreview only touches a small DOM surface (classList / style /
 * querySelector(":scope > .vertical-tabs-items") / getBoundingClientRect), so
 * minimal fakes suffice; timeouts are captured (and can be fired manually) via
 * a fake defaultView.
 */

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
  let value = "";
  const writes: string[] = [];
  return {
    get height() {
      return value;
    },
    set height(next: string) {
      value = next;
      if (next) writes.push(next);
    },
    /** Non-empty height values written, in order (for animation regressions). */
    __writes: writes,
    setProperty(_key: string, _value: string) {},
    removeProperty(_key: string) {},
  };
}

const NATURAL_HEIGHT = 100;
// Empty container: preview = natural height + one placeholder slot.
// The placeholder falls back to the tab-height baseline (36) + both collapsed
// margins (8) = 44, so 100 + 44 = 144.
const PREVIEW_HEIGHT = 144;

function fakeItems(): any {
  const items: any = {
    __natural: NATURAL_HEIGHT,
    scrollHeight: 0,
    classList: new FakeClassList(["vertical-tabs-items"]),
    style: fakeStyle(),
    offsetHeight: 0,
    // While the preview pins an inline height the rect reports it; with the pin
    // cleared (the synchronous measurement) it reports the natural height.
    getBoundingClientRect: () => ({
      height: items.style.height
        ? Number.parseFloat(items.style.height)
        : items.__natural,
    }),
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  return items;
}

function fakeCategoryWrapper(items: any, categoryId = "cat-1"): any {
  return {
    classList: new FakeClassList(["vertical-tabs-category"]),
    style: fakeStyle(),
    dataset: { categoryId },
    offsetHeight: 0,
    querySelector: (sel: string) =>
      sel.includes("vertical-tabs-items") ? items : null,
    querySelectorAll: () => [],
  };
}

interface FakeTimers {
  doc: Document;
  fireTimeouts: () => void;
}

function fakeDoc(): FakeTimers {
  let nextId = 1;
  const timeouts = new Map<number, () => void>();
  const doc = {
    defaultView: {
      setTimeout: (cb: () => void, _ms: number) => {
        const id = nextId++;
        timeouts.set(id, cb);
        return id;
      },
      clearTimeout: (id: number) => {
        timeouts.delete(id);
      },
      getComputedStyle: () => ({
        getPropertyValue: (property: string) =>
          property === "--vt-item-min-height" ? "36px" : "",
      }),
    },
  } as unknown as Document;
  return {
    doc,
    fireTimeouts: () => {
      const callbacks = Array.from(timeouts.values());
      timeouts.clear();
      callbacks.forEach((cb) => cb());
    },
  };
}

describe("category preview release", function () {
  it("re-targets the natural height so the transition can play", function () {
    const { doc } = fakeDoc();
    const items = fakeItems();
    const wrapper = fakeCategoryWrapper(items);

    applyCategoryPreview(doc, wrapper);
    // Entering preview moved the items height from natural to preview height.
    assert.equal(items.style.height, `${PREVIEW_HEIGHT}px`);

    clearCategoryPreview(doc, true);

    // The animated release must set the height back to the natural height
    // immediately (the CSS transition then interpolates over 450ms).
    assert.equal(items.style.height, `${NATURAL_HEIGHT}px`);
  });

  it("immediate clear keeps the old instant behavior", function () {
    const { doc } = fakeDoc();
    const items = fakeItems();
    const wrapper = fakeCategoryWrapper(items);

    applyCategoryPreview(doc, wrapper);
    clearCategoryPreview(doc, false);

    // Instant cleanup: inline height removed, preview class gone.
    assert.equal(items.style.height, "");
    assert.isFalse(wrapper.classList.contains("vt-category-preview"));
  });

  it("releases to a FRESHLY measured natural height, not the stale start value", function () {
    const { doc } = fakeDoc();
    const itemsA = fakeItems();
    const wrapperA = fakeCategoryWrapper(itemsA, "cat-a");
    const itemsB = fakeItems();
    const wrapperB = fakeCategoryWrapper(itemsB, "cat-b");

    // Enter A while it is 100px tall, then the layout shrinks (e.g. the drag
    // source row finally collapses) before the drag leaves A.
    applyCategoryPreview(doc, wrapperA);
    itemsA.__natural = 60;

    // Moving to B releases A: it must target the CURRENT natural height.
    applyCategoryPreview(doc, wrapperB);

    assert.equal(itemsA.style.height, "60px");
  });

  it("does not let an orphaned cleanup strip a re-entered container", function () {
    const { doc, fireTimeouts } = fakeDoc();
    const itemsA = fakeItems();
    const wrapperA = fakeCategoryWrapper(itemsA, "cat-a");
    const itemsB = fakeItems();
    const wrapperB = fakeCategoryWrapper(itemsB, "cat-b");
    const itemsC = fakeItems();
    const wrapperC = fakeCategoryWrapper(itemsC, "cat-c");

    // A -> B -> C -> A quickly (all inside one drag, before any timeout fires).
    applyCategoryPreview(doc, wrapperA);
    applyCategoryPreview(doc, wrapperB);
    applyCategoryPreview(doc, wrapperC);
    applyCategoryPreview(doc, wrapperA);

    const appliedToA = itemsA.style.height;
    fireTimeouts();

    // A is hovered again: its own cleanup was canceled, so it must survive the
    // (formerly orphaned) timers; B and C are released.
    assert.isTrue(wrapperA.classList.contains("vt-category-preview"));
    assert.equal(itemsA.style.height, appliedToA);
    assert.isFalse(wrapperB.classList.contains("vt-category-preview"));
    assert.isFalse(wrapperC.classList.contains("vt-category-preview"));
  });

  it("finishes pending releases when the preview is torn down", function () {
    const { doc } = fakeDoc();
    const itemsA = fakeItems();
    const wrapperA = fakeCategoryWrapper(itemsA, "cat-a");
    const itemsB = fakeItems();
    const wrapperB = fakeCategoryWrapper(itemsB, "cat-b");

    applyCategoryPreview(doc, wrapperA);
    applyCategoryPreview(doc, wrapperB); // A is now releasing

    clearCategoryPreview(doc, false);

    // No container may keep a preview class or an inline height pin.
    assert.isFalse(wrapperA.classList.contains("vt-category-preview"));
    assert.equal(itemsA.style.height, "");
    assert.isFalse(wrapperB.classList.contains("vt-category-preview"));
    assert.equal(itemsB.style.height, "");
  });

  it("opens a COLLAPSED category from 0 like the normal expand animation", function () {
    const { doc } = fakeDoc();
    const items = fakeItems();
    items.scrollHeight = 165; // content height of the collapsed category
    const wrapper = fakeCategoryWrapper(items);
    wrapper.classList.add("collapsed");

    applyCategoryPreview(doc, wrapper);

    // Placeholder for an empty container = baseline 36 + both margins 8 = 44.
    // The FIRST height written must be 0 (the collapsed resting height), so the
    // CSS transition plays from closed to open instead of popping open.
    assert.equal(items.style.__writes[0], "0px");
    assert.equal(items.style.height, `${165 + 44}px`);
  });

  it("folds a COLLAPSED category back to 0 on release", function () {
    const { doc } = fakeDoc();
    const items = fakeItems();
    items.scrollHeight = 165;
    const wrapper = fakeCategoryWrapper(items);
    wrapper.classList.add("collapsed");

    applyCategoryPreview(doc, wrapper);
    clearCategoryPreview(doc, true);

    // Release target must be the collapsed resting height (0), not the content
    // height — otherwise the fold only happens when the cleanup snaps it.
    assert.equal(items.style.height, "0px");
  });
});
