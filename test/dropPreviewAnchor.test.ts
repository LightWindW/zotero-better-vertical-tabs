import { assert } from "chai";
import {
  clearItemShiftPreview,
  isSameGapPreviewAnchor,
  isSameRowPreviewAnchor,
  setGapPreviewAnchor,
  setRowPreviewAnchor,
} from "../src/modules/drag/dropPreview";

/**
 * Preview anchors: the row anchor and gap anchor form ONE logical "last
 * applied preview position" cursor. Setting one kind must invalidate the
 * other — otherwise moving row A → gap → row A would skip the re-apply on
 * the way back (stale anchor, indicator never reappears). clearItemShiftPreview
 * drains both (every clear/drop/dragend path goes through it).
 */

function fakeDoc(): Document {
  return {} as Document;
}

describe("drop preview anchors", function () {
  it("row anchor matches only the exact (row, before)", function () {
    const doc = fakeDoc();
    const rowA = {} as Element;
    const rowB = {} as Element;
    setRowPreviewAnchor(doc, rowA, true);
    assert.isTrue(isSameRowPreviewAnchor(doc, rowA, true));
    assert.isFalse(isSameRowPreviewAnchor(doc, rowA, false));
    assert.isFalse(isSameRowPreviewAnchor(doc, rowB, true));
  });

  it("setting a gap anchor invalidates the row anchor (and vice versa)", function () {
    const doc = fakeDoc();
    const row = {} as Element;
    const container = {} as Element;

    setRowPreviewAnchor(doc, row, true);
    setGapPreviewAnchor(doc, container, 2);
    // row → gap: the row anchor must be gone.
    assert.isFalse(isSameRowPreviewAnchor(doc, row, true));
    assert.isTrue(isSameGapPreviewAnchor(doc, container, 2));

    // gap → row: the gap anchor must be gone.
    setRowPreviewAnchor(doc, row, false);
    assert.isFalse(isSameGapPreviewAnchor(doc, container, 2));
    assert.isTrue(isSameRowPreviewAnchor(doc, row, false));
  });

  it("clearItemShiftPreview drains both anchors", function () {
    const doc = fakeDoc();
    const row = {} as Element;
    const container = {} as Element;
    setRowPreviewAnchor(doc, row, true);
    setGapPreviewAnchor(doc, container, 1);
    setRowPreviewAnchor(doc, row, false);

    clearItemShiftPreview(doc);
    assert.isFalse(isSameRowPreviewAnchor(doc, row, false));
    assert.isFalse(isSameGapPreviewAnchor(doc, container, 1));
  });
});
