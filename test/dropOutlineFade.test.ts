import { assert } from "chai";
import {
  clearDropOutlineFade,
  consumeDropOutlineFade,
  markDropOutlineFade,
} from "../src/modules/drag/dropOutlineFade";

function fakeDoc(): Document {
  // The module only stores keyed state on the document object and optionally
  // uses doc.defaultView for the stale-mark timeout; a plain object suffices.
  return {} as Document;
}

describe("drop outline fade marker", function () {
  it("consumes a mark exactly once", function () {
    const doc = fakeDoc();
    markDropOutlineFade(doc, { type: "category", categoryId: "cat-1" });
    assert.deepEqual(consumeDropOutlineFade(doc), {
      type: "category",
      categoryId: "cat-1",
    });
    assert.isNull(consumeDropOutlineFade(doc));
  });

  it("returns null when nothing was marked", function () {
    assert.isNull(consumeDropOutlineFade(fakeDoc()));
  });

  it("clear removes a pending mark (aborted drop)", function () {
    const doc = fakeDoc();
    markDropOutlineFade(doc, { type: "drop-zone" });
    clearDropOutlineFade(doc);
    assert.isNull(consumeDropOutlineFade(doc));
  });

  it("a later mark overwrites an earlier one", function () {
    const doc = fakeDoc();
    markDropOutlineFade(doc, { type: "category", categoryId: "cat-1" });
    markDropOutlineFade(doc, { type: "drop-zone" });
    assert.deepEqual(consumeDropOutlineFade(doc), { type: "drop-zone" });
  });

  it("ignores a null target (no dashed outline to fade)", function () {
    const doc = fakeDoc();
    markDropOutlineFade(doc, null);
    assert.isNull(consumeDropOutlineFade(doc));
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
    markDropOutlineFade(doc, { type: "drop-zone" });
    assert.isDefined(callback);
    callback!();
    assert.isNull(consumeDropOutlineFade(doc));
  });
});
