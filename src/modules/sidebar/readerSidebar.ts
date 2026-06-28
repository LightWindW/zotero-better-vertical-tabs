/**
 * Reader sidebar injection is no longer used.
 *
 * The vertical tabs panel now lives in a single <vbox> inside
 * <hbox id="browser">, before <deck id="tabs-deck">. This makes it
 * visible above both the main page and reader pages, so per-reader sandbox
 * injection is unnecessary.
 *
 * Empty exports are kept for backward compatibility until all imports are
 * removed.
 */

export function initReaderSidebar(_tabId: string): void {
  // no-op: global sidebar covers reader pages
}

export function destroyReaderSidebars(): void {
  // no-op: global sidebar cleanup is handled by destroySidebar()
}
