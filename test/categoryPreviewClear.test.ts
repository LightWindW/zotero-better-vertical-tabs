import { assert } from "chai";
import {
  applyCategoryPreview,
  clearCategoryPreview,
} from "../src/modules/drag/categoryPreview";

/**
 * Regression test for the animated preview release used by the quick-create
 * drop zone: clearCategoryPreview(doc, true) must transition the items height
 * back to the recorded natural height. The buggy version deleted the recorded
 * natural height BEFORE schedulePreviewClear read it, so the container stayed
 * frozen at the preview height and then snapped when the cleanup timeout
 * removed the inline style.
 *
 * categoryPreview only touches a small DOM surface (classList / style /
 * querySelector(":scope > .vertical-tabs-items") / getBoundingClientRect),
 * so minimal fakes suffice; timeouts are captured via a fake defaultView.
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
  return {
    height: "",
    setProperty(_key: string, _value: string) {},
    removeProperty(_key: string) {},
  };
}

const NATURAL_HEIGHT = 100;
const PREVIEW_HEIGHT = 55; // DEFAULT_ITEM_HEIGHT fallback inside categoryPreview

function fakeItems(): any {
  return {
    classList: new FakeClassList(["vertical-tabs-items"]),
    style: fakeStyle(),
    offsetHeight: 0,
    getBoundingClientRect: () => ({ height: NATURAL_HEIGHT }),
    querySelector: () => null,
    querySelectorAll: () => [],
  };
}

function fakeCategoryWrapper(items: any): any {
  return {
    classList: new FakeClassList(["vertical-tabs-category"]),
    style: fakeStyle(),
    dataset: { categoryId: "cat-1" },
    offsetHeight: 0,
    querySelector: (sel: string) =>
      sel.includes("vertical-tabs-items") ? items : null,
    querySelectorAll: () => [],
  };
}

function fakeDoc(): Document {
  let nextId = 1;
  const timeouts = new Map<number, () => void>();
  return {
    defaultView: {
      setTimeout: (cb: () => void, _ms: number) => {
        const id = nextId++;
        timeouts.set(id, cb);
        return id;
      },
      clearTimeout: (id: number) => {
        timeouts.delete(id);
      },
      getComputedStyle: () => ({ getPropertyValue: () => "" }),
    },
  } as unknown as Document;
}

describe("clearCategoryPreview animated release", function () {
  it("re-targets the recorded natural height so the transition can play", function () {
    const doc = fakeDoc();
    const items = fakeItems();
    const wrapper = fakeCategoryWrapper(items);

    applyCategoryPreview(doc, wrapper, null, 1);
    // Entering preview moved the items height from natural to preview height.
    assert.equal(items.style.height, `${PREVIEW_HEIGHT}px`);

    clearCategoryPreview(doc, true);

    // The animated release must set the height back to the recorded natural
    // height immediately (the CSS transition then interpolates over 450ms).
    assert.equal(items.style.height, `${NATURAL_HEIGHT}px`);
  });

  it("immediate clear keeps the old instant behavior", function () {
    const doc = fakeDoc();
    const items = fakeItems();
    const wrapper = fakeCategoryWrapper(items);

    applyCategoryPreview(doc, wrapper, null, 1);
    clearCategoryPreview(doc, false);

    // Instant cleanup: inline height removed, preview class gone.
    assert.equal(items.style.height, "");
    assert.isFalse(wrapper.classList.contains("vt-category-preview"));
  });
});
