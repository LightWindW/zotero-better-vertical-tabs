/** Apply the active sidebar-resize cursor inside Zotero's reader sandbox docs. */
const CURSOR_STYLE_ID = "vertical-tabs-reader-resize-cursor";
const activeDocuments = new Set<Document>();

function getReaderDocuments(): Document[] {
  const readers = (Zotero.Reader as any)?._readers as
    | Array<Record<string, any>>
    | undefined;
  const documents = new Set<Document>();
  for (const reader of readers || []) {
    try {
      const iframe = reader._iframe as
        | { contentDocument?: Document }
        | undefined;
      const primaryView = reader._internalReader?._primaryView as
        | Record<string, any>
        | undefined;
      for (const doc of [
        reader._window?.document,
        reader._iframeWindow?.document,
        primaryView?._iframeWindow?.document,
        iframe?.contentDocument,
      ]) {
        if (doc?.documentElement) documents.add(doc);
      }
    } catch {
      // A reader may be closing while its sandbox windows are enumerated.
    }
  }
  return [...documents];
}

export function setReaderResizeCursor(enabled: boolean): void {
  if (enabled) {
    for (const doc of getReaderDocuments()) activeDocuments.add(doc);
    for (const doc of activeDocuments) {
      if (!doc.documentElement || doc.getElementById(CURSOR_STYLE_ID)) continue;
      const style = doc.createElement("style");
      style.id = CURSOR_STYLE_ID;
      style.textContent = `html, html * { cursor: col-resize !important; }`;
      (doc.head || doc.documentElement).appendChild(style);
    }
    return;
  }

  for (const doc of activeDocuments) {
    doc.getElementById(CURSOR_STYLE_ID)?.remove();
  }
  activeDocuments.clear();
}
