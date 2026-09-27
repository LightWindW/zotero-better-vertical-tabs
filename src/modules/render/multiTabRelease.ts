/**
 * Cascade release animation for the multi-tab drop.
 *
 * The multi drop triggers a data-changed re-render that rebuilds the rows,
 * so the moved block would normally pop in at the target position. The drop
 * handler marks the ordered tabIds; the render post-processing then plays:
 * the FIRST row fades in (0.2s) at full height, then each following row
 * expands (height 0 -> natural) and fades in with a stagger — the "徐徐展开"
 * cascade — while the content below slides down smoothly.
 *
 * Mirrors the mark/consume pattern of render/categoryEntrance.ts.
 */

import { measureRowGeometry } from "./boxMeasure";

const RELEASE_KEY = "__vtMultiTabRelease";
const STALE_TIMEOUT_KEY = "__vtMultiTabReleaseStaleTimeout";
const STALE_TIMEOUT_MS = 2000;
const FIRST_FADE_MS = 200;
const ROW_ANIMATION_MS = 250;
const STAGGER_MS = 70;
export const MULTI_RELEASE_CLASS = "vt-multi-release";

function clearStaleTimeout(doc: Document): void {
  const win = doc.defaultView;
  const existing = (doc as any)[STALE_TIMEOUT_KEY] as number | undefined;
  if (existing !== undefined && win) {
    win.clearTimeout(existing);
  }
  delete (doc as any)[STALE_TIMEOUT_KEY];
}

/** Mark the ordered tabIds whose rows should cascade on the next re-render. */
export function markMultiTabRelease(doc: Document, tabIds: string[]): void {
  if (!tabIds.length) return;
  clearStaleTimeout(doc);
  (doc as any)[RELEASE_KEY] = tabIds;
  const win = doc.defaultView;
  if (win) {
    (doc as any)[STALE_TIMEOUT_KEY] = win.setTimeout(() => {
      delete (doc as any)[RELEASE_KEY];
      delete (doc as any)[STALE_TIMEOUT_KEY];
    }, STALE_TIMEOUT_MS);
  }
}

/** Take the pending cascade tabIds (once). */
export function consumeMultiTabRelease(doc: Document): string[] | null {
  const ids = (doc as any)[RELEASE_KEY] as string[] | undefined;
  delete (doc as any)[RELEASE_KEY];
  clearStaleTimeout(doc);
  return ids && ids.length ? ids : null;
}

/**
 * Play the cascade on the freshly rendered rows. Must run synchronously
 * right after renderCategories, before the next paint.
 */
export function playMultiTabRelease(
  doc: Document,
  container: Element,
  tabIds: string[],
): void {
  const rows = tabIds
    .map(
      (id) =>
        container.querySelector(
          `.vertical-tabs-item[data-tab-id="${CSS.escape(id)}"]`,
        ) as HTMLElement | null,
    )
    .filter((r): r is HTMLElement => !!r);
  if (!rows.length) return;
  const win = doc.defaultView;

  // Measure natural geometry BEFORE pinning (content-box heights), then pin
  // the start state: first row transparent at full height, every following
  // row fully collapsed (height + padding + min-height all zeroed inline,
  // or the collapse stalls at 36px / leaves an 8px sliver).
  const geometries = rows.map((row, i) =>
    i === 0 ? null : measureRowGeometry(doc, row),
  );
  rows.forEach((row, i) => {
    row.classList.add(MULTI_RELEASE_CLASS);
    row.style.opacity = "0";
    if (i > 0) {
      row.style.minHeight = "0px";
      row.style.height = "0px";
      row.style.paddingTop = "0px";
      row.style.paddingBottom = "0px";
      row.style.marginTop = "0px";
      row.style.marginBottom = "0px";
    }
  });
  void rows[0].offsetHeight;

  // First row fades in immediately...
  rows[0].style.opacity = "1";
  // ...then the rest unfold one after another.
  rows.forEach((row, i) => {
    if (i === 0) return;
    const geometry = geometries[i]!;
    win?.setTimeout(
      () => {
        if (!row.isConnected) return;
        row.style.height = `${geometry.content}px`;
        row.style.paddingTop = `${geometry.padTop}px`;
        row.style.paddingBottom = `${geometry.padBottom}px`;
        row.style.marginTop = `${geometry.marginTop}px`;
        row.style.marginBottom = `${geometry.marginBottom}px`;
        row.style.opacity = "1";
      },
      FIRST_FADE_MS + (i - 1) * STAGGER_MS,
    );
  });

  const totalMs =
    FIRST_FADE_MS + (rows.length - 1) * STAGGER_MS + ROW_ANIMATION_MS;
  win?.setTimeout(() => {
    for (const row of rows) {
      if (!row.isConnected) continue;
      row.classList.remove(MULTI_RELEASE_CLASS);
      row.style.height = "";
      row.style.minHeight = "";
      row.style.paddingTop = "";
      row.style.paddingBottom = "";
      row.style.marginTop = "";
      row.style.marginBottom = "";
      row.style.opacity = "";
    }
  }, totalMs);
}
