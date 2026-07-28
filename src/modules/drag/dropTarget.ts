/**
 * Shared drag-and-drop classification and visual-feedback clearing.
 *
 * isInternalVtDrag distinguishes drags that originate inside the VT (they
 * carry a private MIME type) from external drags (e.g. library items from the
 * Zotero item pane), so the sidebar listeners can route them to the internal
 * per-element handlers or the external preview in externalDropPreview.ts.
 */

export const VT_DRAG_MIME_TYPE = "application/x-better-vertical-tabs";

export function isInternalVtDrag(dataTransfer: DataTransfer | null): boolean {
  return dataTransfer?.types.includes(VT_DRAG_MIME_TYPE) ?? false;
}

/**
 * Remove all drag visual feedback classes from the document.
 */
export function clearAllDropVisuals(doc: Document): void {
  doc
    .querySelectorAll(
      ".vertical-tabs-category.drag-over, .vertical-tabs-drop-zone.drag-over",
    )
    .forEach((el: Element) => el.classList.remove("drag-over"));
  doc
    .querySelectorAll(
      ".vertical-tabs-item.drop-before, .vertical-tabs-item.drop-after",
    )
    .forEach((el: Element) => el.classList.remove("drop-before", "drop-after"));
}
