import { assert } from "chai";
import {
  clearTabSelection,
  getSelectedTabCount,
  toggleTabSelection,
} from "../src/modules/drag/multiSelect";

// Node has no CSS global; the module only uses CSS.escape on tab ids.
(globalThis as any).CSS ??= { escape: (s: string) => s };

/**
 * clearTabSelection fast path: with an empty selection it must return
 * without touching the DOM (the document-level capture listener calls it on
 * every mousedown/click in the window — it used to run a full
 * querySelectorAll each time). With a live selection it must still clear
 * state, anchor and row classes.
 */

function fakeRow(): any {
  const classes = new Set<string>(["vertical-tabs-item"]);
  return {
    classList: {
      add: (...cs: string[]) => cs.forEach((c) => classes.add(c)),
      remove: (...cs: string[]) => cs.forEach((c) => classes.delete(c)),
      contains: (c: string) => classes.has(c),
      toggle: (c: string, on?: boolean) => {
        const has = on === undefined ? !classes.has(c) : on;
        if (has) classes.add(c);
        else classes.delete(c);
        return has;
      },
    },
    dataset: { tabId: "" },
  };
}

function fakeDoc(rows: any[]): { doc: Document; scanCount: () => number } {
  let scans = 0;
  const doc = {
    querySelectorAll: (sel: string) => {
      scans++;
      if (sel.includes("vt-selected")) {
        return rows.filter((r) => r.classList.contains("vt-selected"));
      }
      return [];
    },
    querySelector: () => null,
    defaultView: null,
  } as unknown as Document;
  return { doc, scanCount: () => scans };
}

describe("clearTabSelection fast path", function () {
  it("does NOT scan the document when nothing is selected", function () {
    const { doc, scanCount } = fakeDoc([]);
    clearTabSelection(doc);
    clearTabSelection(doc, { forRender: true });
    assert.equal(scanCount(), 0);
  });

  it("clears a live selection (state + row classes) and resets the anchor", function () {
    const row = fakeRow();
    row.dataset.tabId = "t1";
    const { doc, scanCount } = fakeDoc([row]);

    toggleTabSelection(doc, "t1");
    assert.equal(getSelectedTabCount(doc), 1);
    // Simulate the row visual that setRowVisual applied via the (fake) DOM.
    row.classList.add("vt-selected");

    clearTabSelection(doc);
    assert.equal(getSelectedTabCount(doc), 0);
    assert.isFalse(row.classList.contains("vt-selected"));
    assert.isAtLeast(scanCount(), 1);

    // Second clear is a no-op again (no scan).
    const scansAfterClear = scanCount();
    clearTabSelection(doc);
    assert.equal(scanCount(), scansAfterClear);
  });
});
