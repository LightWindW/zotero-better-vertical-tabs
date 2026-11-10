import { assert } from "chai";
import {
  isDragRenderLocked,
  markRenderDeferred,
  takeDeferredRender,
} from "../src/modules/render/dragRenderGate";
import { setDraggedTabId } from "../src/modules/drag/itemDragState";

/**
 * A re-render during a drag rebuilds the rows from data, dropping the collapsed
 * drag-source class — the dragged row pops back at its original position. This
 * was visible on the FIRST drag after Zotero starts (a startup render coalesced
 * into a rAF fired mid-drag). The gate must lock rendering for the whole drag
 * and park (not drop) the render for replay afterwards.
 */

function fakeDoc(): Document {
  return {} as Document;
}

describe("drag render gate", function () {
  it("locks rendering while an item drag is active", function () {
    const doc = fakeDoc();
    assert.isFalse(isDragRenderLocked(doc));
    setDraggedTabId(doc, "tab-1");
    assert.isTrue(isDragRenderLocked(doc));
    setDraggedTabId(doc, null);
    assert.isFalse(isDragRenderLocked(doc));
  });

  it("parks a deferred render and hands it back exactly once", function () {
    const doc = fakeDoc();
    assert.isFalse(takeDeferredRender(doc));

    markRenderDeferred(doc);
    markRenderDeferred(doc);
    assert.isTrue(takeDeferredRender(doc));
    // One-shot: the dragend flush must not start another render loop.
    assert.isFalse(takeDeferredRender(doc));
  });
});
