import { assert } from "chai";
import { waitForReaderLoaded } from "../src/modules/track/readerRelease";

/**
 * waitForReaderLoaded dedup: concurrent waits for the same tabId must share
 * ONE polling loop (one shared promise) instead of stacking a 100ms loop per
 * call. Different tabIds still get independent waits.
 */

let getByTabIDCalls = 0;

function installZoteroStubs(readerByTab: Record<string, unknown>): void {
  getByTabIDCalls = 0;
  (globalThis as any).Zotero = {
    Reader: {
      getByTabID: (tabId: string) => {
        getByTabIDCalls++;
        return readerByTab[tabId];
      },
    },
  };
  (globalThis as any).ztoolkit = { log: () => {} };
}

function uninstallZoteroStubs(): void {
  delete (globalThis as any).Zotero;
  delete (globalThis as any).ztoolkit;
}

describe("waitForReaderLoaded dedup", function () {
  afterEach(function () {
    uninstallZoteroStubs();
  });

  it("shares one in-flight wait per tabId", async function () {
    // Reader that never finishes initializing within the test: no _initPromise,
    // never _isReaderInitialized !== false → isReaderLoaded stays false.
    installZoteroStubs({ t1: { _isReaderInitialized: false } });

    const p1 = waitForReaderLoaded("t1", 250);
    const p2 = waitForReaderLoaded("t1", 250);
    assert.strictEqual(p1, p2, "second call must return the same promise");

    const [r1, r2] = await Promise.all([p1, p2]);
    assert.isFalse(r1);
    assert.isFalse(r2);
  });

  it("resolves true for all callers once the reader loads", async function () {
    const reader: any = { _isReaderInitialized: false };
    installZoteroStubs({ t2: reader });

    const p1 = waitForReaderLoaded("t2", 1000);
    const p2 = waitForReaderLoaded("t2", 1000);
    // Reader finishes initializing shortly after.
    setTimeout(() => {
      reader._isReaderInitialized = true;
    }, 120);

    const [r1, r2] = await Promise.all([p1, p2]);
    assert.isTrue(r1);
    assert.isTrue(r2);
  });

  it("tracks different tabIds independently", async function () {
    installZoteroStubs({
      a: { _isReaderInitialized: false },
      b: { _isReaderInitialized: true },
    });

    const pa = waitForReaderLoaded("a", 200);
    const pb = waitForReaderLoaded("b", 200);
    assert.notStrictEqual(pa, pb);
    assert.isFalse(await pa);
    assert.isTrue(await pb);
  });

  it("starts a fresh wait after the previous one settled", async function () {
    installZoteroStubs({ t3: { _isReaderInitialized: false } });

    const first = waitForReaderLoaded("t3", 150);
    assert.isFalse(await first);

    const second = waitForReaderLoaded("t3", 150);
    assert.notStrictEqual(first, second);
    assert.isFalse(await second);
  });
});
