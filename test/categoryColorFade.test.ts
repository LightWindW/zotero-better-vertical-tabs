import { assert } from "chai";
import {
  consumeCategoryColorFade,
  markCategoryColorFade,
  playCategoryColorFade,
} from "../src/modules/render/categoryColorFade";

// Node has no CSS global; the module only uses CSS.escape on category ids.
(globalThis as any).CSS ??= { escape: (s: string) => s };

function fakeDoc(): Document {
  // The module stores keyed state on the document object and optionally uses
  // doc.defaultView for the stale-mark timeout; a plain object suffices.
  return {} as Document;
}

function fakeLightDoc(): Document {
  return {
    defaultView: {
      matchMedia: () => ({ matches: false }),
    },
  } as unknown as Document;
}

/** A wrapper whose style writes are recorded in assignment order. */
function trackableWrapper(): {
  wrapper: HTMLElement;
  style: Record<string, string>;
  history: Array<[string, string]>;
} {
  const history: Array<[string, string]> = [];
  const style = new Proxy({} as Record<string, string>, {
    set(target, prop, value) {
      history.push([String(prop), String(value)]);
      return Reflect.set(target, prop, value);
    },
  });
  const wrapper = { style, offsetHeight: 36 } as unknown as HTMLElement;
  return { wrapper, style, history };
}

function containerOf(wrapper: HTMLElement | null): Element {
  return { querySelector: () => wrapper } as unknown as Element;
}

describe("categoryColorFade", function () {
  describe("marker", function () {
    it("consumes a mark exactly once", function () {
      const doc = fakeDoc();
      markCategoryColorFade(doc, {
        categoryId: "cat-1",
        oldColor: "#FFD966",
        newColor: "#A9C7FA",
      });
      assert.deepEqual(consumeCategoryColorFade(doc), {
        categoryId: "cat-1",
        oldColor: "#FFD966",
        newColor: "#A9C7FA",
      });
      assert.isNull(consumeCategoryColorFade(doc));
    });

    it("returns null when nothing was marked", function () {
      assert.isNull(consumeCategoryColorFade(fakeDoc()));
    });

    it("a later mark overwrites an earlier one", function () {
      const doc = fakeDoc();
      markCategoryColorFade(doc, { categoryId: "cat-1", newColor: "#FFD966" });
      markCategoryColorFade(doc, { categoryId: "cat-2", newColor: "#A9C7FA" });
      const mark = consumeCategoryColorFade(doc);
      assert.equal(mark?.categoryId, "cat-2");
    });

    it("ignores a no-op change (old equals new)", function () {
      const doc = fakeDoc();
      markCategoryColorFade(doc, {
        categoryId: "cat-1",
        oldColor: "#FFD966",
        newColor: "#FFD966",
      });
      assert.isNull(consumeCategoryColorFade(doc));
    });

    it("normalizes the #F2F2F2 no-color sentinel to undefined", function () {
      const doc = fakeDoc();
      markCategoryColorFade(doc, {
        categoryId: "cat-1",
        oldColor: "#f2f2f2",
        newColor: "#FFD966",
      });
      assert.deepEqual(consumeCategoryColorFade(doc), {
        categoryId: "cat-1",
        oldColor: undefined,
        newColor: "#FFD966",
      });
    });

    it("clears a stale mark via the defaultView timeout when never consumed", function () {
      let callback: (() => void) | undefined;
      const doc = {
        defaultView: {
          setTimeout: (cb: () => void, _ms: number) => {
            callback = cb;
            return 1;
          },
          clearTimeout: (_id: number) => {},
        },
      } as unknown as Document;
      markCategoryColorFade(doc, { categoryId: "cat-1", newColor: "#FFD966" });
      assert.isDefined(callback);
      callback!();
      assert.isNull(consumeCategoryColorFade(doc));
    });
  });

  describe("playCategoryColorFade", function () {
    it("pins the old color with transitions off, then releases to the new color", function () {
      const { wrapper, style, history } = trackableWrapper();
      playCategoryColorFade(fakeLightDoc(), containerOf(wrapper), {
        categoryId: "cat-1",
        oldColor: "#FFD966",
        newColor: "#A9C7FA",
      });
      assert.deepEqual(history, [
        ["transition", "none"],
        ["background", "#FFD966"],
        ["transition", ""],
        ["background", "#A9C7FA"],
      ]);
      assert.equal(style.background, "#A9C7FA");
    });

    it("fades from transparent when there was no old color", function () {
      const { wrapper, history } = trackableWrapper();
      playCategoryColorFade(fakeLightDoc(), containerOf(wrapper), {
        categoryId: "cat-1",
        newColor: "#FFD966",
      });
      assert.deepEqual(history[1], ["background", "transparent"]);
      assert.deepEqual(history[3], ["background", "#FFD966"]);
    });

    it("fades to transparent when the color was removed", function () {
      const { wrapper, style } = trackableWrapper();
      playCategoryColorFade(fakeLightDoc(), containerOf(wrapper), {
        categoryId: "cat-1",
        oldColor: "#FFD966",
      });
      assert.equal(style.background, "transparent");
      assert.equal(style.transition, "");
    });

    it("is a no-op when the wrapper is missing", function () {
      // Must not throw.
      playCategoryColorFade(fakeLightDoc(), containerOf(null), {
        categoryId: "cat-1",
        oldColor: "#FFD966",
        newColor: "#A9C7FA",
      });
    });
  });
});
