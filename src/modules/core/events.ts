/**
 * Zotero sandbox-compatible custom event dispatcher.
 * The sandbox does not expose the CustomEvent constructor,
 * so we use document.createEvent() instead.
 */
export function dispatchVtEvent(
  target: EventTarget,
  type: string,
  detail?: unknown,
): void {
  const el = target as Node;
  const doc = el.ownerDocument ?? (target as Document);
  if (!doc) return;
  const event = doc.createEvent("CustomEvent");
  event.initCustomEvent(type, true, false, detail);
  target.dispatchEvent(event);
}
