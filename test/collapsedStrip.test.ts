import { assert } from "chai";
import { resolveCollapsedStripWidth } from "../src/modules/sidebar/sidebar";

/**
 * Collapsed strip width: the minimal 20px bar (plugin icon only) applies
 * ONLY when all three hold — not pinned, auto-expand off, compact-strip
 * pref on. Any other combination keeps the regular 35px icon strip, so
 * toggling auto-expand back on instantly restores the icon strip even if
 * the compact pref is still set.
 */

describe("collapsed strip width", function () {
  it("defaults to the 35px icon strip", function () {
    assert.strictEqual(resolveCollapsedStripWidth(false, true, false), 35);
  });

  it("minimal 20px requires unpinned + auto-expand off + compact on", function () {
    assert.strictEqual(resolveCollapsedStripWidth(false, false, true), 20);
  });

  it("compact pref alone is not enough when auto-expand is on", function () {
    assert.strictEqual(resolveCollapsedStripWidth(false, true, true), 35);
  });

  it("auto-expand off alone keeps the 35px icon strip", function () {
    assert.strictEqual(resolveCollapsedStripWidth(false, false, false), 35);
  });

  it("pinned never resolves to the minimal strip", function () {
    assert.strictEqual(resolveCollapsedStripWidth(true, false, true), 35);
  });
});
