/**
 * Resolve the LIVE element for a hover-card target.
 *
 * Card shows are delayed (150ms) and every VT re-render replaces the row DOM.
 * A delayed show therefore can run with an element that has already been
 * detached: `getBoundingClientRect()` on it is all zeros, which used to pin the
 * card to the window's top-left corner. Before positioning, swap such a target
 * for the fresh row with the same identity (`data-tab-id`, then `data-item-id`).
 * Category headers carry no identity — for them a detached target means "no
 * live target" and the caller skips/hides the card.
 */

/** Cards are positioned against this element, so it must be laid out. */
export function hasUsableCardRect(target: HTMLElement): boolean {
  const rect = target.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0 || rect.left !== 0 || rect.top !== 0;
}

function queryRowByIdentity(
  doc: Document,
  attribute: "data-tab-id" | "data-item-id",
  value: string,
): HTMLElement | null {
  const escape = (globalThis as any).CSS?.escape ?? ((v: string) => v);
  return doc.querySelector(
    `.vertical-tabs-item[${attribute}="${escape(value)}"]`,
  ) as HTMLElement | null;
}

/**
 * The target itself when it is still in the document, otherwise the freshly
 * rendered row with the same tab id (fallback: item id); null when the element
 * cannot be matched or has no usable layout box.
 */
export function resolveLiveCardTarget(
  target: HTMLElement | null,
): HTMLElement | null {
  if (!target) return null;
  let live: HTMLElement | null = target;
  if (!live.isConnected) {
    const doc = target.ownerDocument;
    if (!doc) return null;
    const tabId = target.dataset?.tabId;
    const itemId = target.dataset?.itemId;
    live =
      (tabId ? queryRowByIdentity(doc, "data-tab-id", tabId) : null) ??
      (itemId ? queryRowByIdentity(doc, "data-item-id", itemId) : null);
    if (!live) return null;
  }
  return hasUsableCardRect(live) ? live : null;
}
