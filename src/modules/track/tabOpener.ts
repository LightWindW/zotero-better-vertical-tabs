import { getZoteroTabs } from "./itemTracker";
import { getItemDisplayTitle } from "../utils/itemTitle";

function getMainWindow(): _ZoteroTypes.MainWindow | undefined {
  return Zotero.getMainWindows()[0] as _ZoteroTypes.MainWindow | undefined;
}

function getZoteroPane(): _ZoteroTypes.ZoteroPane | undefined {
  return getMainWindow()?.ZoteroPane_Local;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function inferTabType(item: Zotero.Item): string {
  const itemType = (item.itemType as string) || "";
  if (itemType === "attachment" || itemType === "attachment-pdf") {
    return "reader";
  }
  if (itemType === "note") {
    return "note";
  }
  return "item";
}

export interface OpenItemOptions {
  title?: string;
  type?: string;
  data?: any;
  openInBackground?: boolean;
  doc?: Document;
  /**
   * For reader attachments: create a `reader-unloaded` tab instead of immediately
   * loading the PDF. The reader will only be initialized when the user selects
   * the tab.
   */
  lazy?: boolean;
}

/**
 * Open a Zotero item/attachment/note as a new tab in the window associated with
 * the given document (or the first main window if no document is provided).
 * Returns the new tab ID, or undefined if the tab could not be created.
 */
export async function openItemAsNewTab(
  item: Zotero.Item,
  options: OpenItemOptions = {},
): Promise<string | undefined> {
  const ztabs = getZoteroTabs(options.doc);
  if (!ztabs) {
    ztoolkit.log("[vt-tab-opener] Zotero_Tabs not available");
    return undefined;
  }

  const title = options.title ?? getItemDisplayTitle(item, options.title);
  const type = options.type ?? inferTabType(item);
  const openInBackground = options.openInBackground ?? true;

  try {
    let tabId: string | undefined;

    if (type === "reader" && options.lazy) {
      // Create a lazy reader tab. Zotero_Tabs will automatically load the reader
      // when the tab is selected.
      const newTab = ztabs.add({
        type: "reader-unloaded",
        title,
        data: { itemID: item.id },
        select: false,
      });
      tabId = newTab.id;
    } else if (type === "reader") {
      const reader = (await Zotero.Reader.open(item.id, undefined, {
        title,
        openInBackground,
        allowDuplicate: true,
      })) as _ZoteroTypes.ReaderInstance | void;
      tabId = reader?.tabID;

      if (reader && tabId) {
        reader._title = title;
        reader.updateTitle();
      }
    } else if (type === "note") {
      const zp = getZoteroPane();
      if (!zp) {
        ztoolkit.log("[vt-tab-opener] ZoteroPane not available");
        return undefined;
      }
      zp.openNote(item.id);
      await delay(200);
      tabId = ztabs.getTabIDByItemID(item.id);
    } else {
      const newTab = ztabs.add({
        type,
        title,
        data: options.data ?? { itemID: item.id },
        select: false,
      });
      await delay(100);
      tabId = newTab.id;
    }

    if (tabId) {
      try {
        ztabs.rename(tabId, title);
      } catch (err) {
        ztoolkit.log("[vt-tab-opener] rename failed:", err);
      }
    }

    return tabId;
  } catch (error) {
    ztoolkit.log("[vt-tab-opener] Failed to add tab for item:", item.id, error);
    return undefined;
  }
}
