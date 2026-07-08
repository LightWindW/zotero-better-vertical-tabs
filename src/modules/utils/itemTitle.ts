/**
 * Return the title that should be shown for a tab.
 *
 * For attachments (PDF etc.), always prefer the parent item's title so tabs
 * don't show "PDF". For other item types, use the saved title if provided,
 * otherwise the item's own title.
 */
export function getItemDisplayTitle(
  item: Zotero.Item,
  savedTitle?: string,
): string {
  const itemType = (item.itemType as string) || "";
  if (itemType === "attachment" || itemType === "attachment-pdf") {
    const parentItemId = item.parentItemID;
    if (typeof parentItemId === "number") {
      const parentItem = Zotero.Items.get(parentItemId);
      if (parentItem) {
        const parentTitle = (parentItem.getField("title") as string) || "";
        if (parentTitle) return parentTitle;
      }
    }
  }
  if (savedTitle) return savedTitle;
  return (item.getField("title") as string) || "";
}
