import { assert } from "chai";
import {
  hasUsableCardRect,
  resolveLiveCardTarget,
} from "../src/modules/ui/cardTargetResolver";

/**
 * A hover card show is delayed (150ms) and a re-render can replace the row DOM
 * in between — most commonly right after a drag-drop re-render. Positioning the
 * card against such a detached element gave an all-zero rect, pinning the card
 * to the window's top-left corner. The resolver must map the stale row to the
 * live one with the same identity (and reject targets that cannot be laid out).
 */

(globalThis as any).CSS = { escape: (value: string) => value };

function fakeRow(opts: {
  connected: boolean;
  rect?: { width: number; height: number; left: number; top: number };
  tabId?: string;
  itemId?: string;
  doc?: any;
}): any {
  const rect = opts.rect ?? { width: 0, height: 0, left: 0, top: 0 };
  return {
    isConnected: opts.connected,
    ownerDocument: opts.doc ?? null,
    dataset: {
      ...(opts.tabId ? { tabId: opts.tabId } : {}),
      ...(opts.itemId ? { itemId: opts.itemId } : {}),
    },
    getBoundingClientRect: () => rect,
  };
}

const LAYOUT = { width: 280, height: 47, left: 12, top: 120 };

function fakeDoc(replacements: Record<string, any>): any {
  return {
    querySelector: (selector: string) => {
      const match =
        /^\.vertical-tabs-item\[(data-tab-id|data-item-id)="(.+)"\]$/.exec(
          selector,
        );
      if (!match) return null;
      return replacements[`${match[1]}:${match[2]}`] ?? null;
    },
  };
}

describe("hover card target resolution", function () {
  it("keeps a connected target with a usable layout box", function () {
    const target = fakeRow({ connected: true, rect: LAYOUT, tabId: "t1" });
    assert.equal(resolveLiveCardTarget(target), target);
  });

  it("maps a detached row to the live row with the same tab id", function () {
    const live = fakeRow({ connected: true, rect: LAYOUT, tabId: "t1" });
    const doc = fakeDoc({ "data-tab-id:t1": live });
    const stale = fakeRow({ connected: false, tabId: "t1", doc });
    assert.equal(resolveLiveCardTarget(stale), live);
  });

  it("falls back to the item id when no tab id is present", function () {
    const live = fakeRow({ connected: true, rect: LAYOUT, itemId: "42" });
    const doc = fakeDoc({ "data-item-id:42": live });
    const stale = fakeRow({ connected: false, itemId: "42", doc });
    assert.equal(resolveLiveCardTarget(stale), live);
  });

  it("returns null when a detached target has no identity to match", function () {
    const doc = fakeDoc({});
    const stale = fakeRow({ connected: false, doc });
    assert.isNull(resolveLiveCardTarget(stale));
  });

  it("returns null when the live row cannot be matched", function () {
    const doc = fakeDoc({});
    const stale = fakeRow({ connected: false, tabId: "gone", doc });
    assert.isNull(resolveLiveCardTarget(stale));
  });

  it("rejects a connected element with an all-zero box (no layout yet)", function () {
    const target = fakeRow({ connected: true });
    assert.isFalse(hasUsableCardRect(target));
    assert.isNull(resolveLiveCardTarget(target));
  });

  it("returns null for a null target", function () {
    assert.isNull(resolveLiveCardTarget(null));
  });
});
