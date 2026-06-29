import { getString } from "../../utils/locale";
import { setDialogOpen } from "../sidebar/sidebar";
import { markTabAsImported } from "../track/itemTracker";
import {
  Category,
  importCategoryFromSnapshot,
  VerticalTabsData,
} from "../track/dataStore";
import type { SavedCategory } from "./savedCategoryStore";

export interface RestoreResult {
  success: boolean;
  missingItemIds: number[];
  updatedItemIds: number[];
}

function getMainWindow(): _ZoteroTypes.MainWindow | undefined {
  return Zotero.getMainWindows()[0] as _ZoteroTypes.MainWindow | undefined;
}

function getZoteroTabs(): _ZoteroTypes.Zotero_Tabs | undefined {
  return getMainWindow()?.Zotero_Tabs;
}

function getZoteroPane(): _ZoteroTypes.ZoteroPane | undefined {
  return getMainWindow()?.ZoteroPane_Local;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getItemDisplayTitle(item: Zotero.Item, savedTitle?: string): string {
  const itemType = (item.itemType as string) || "";
  // For attachments, always prefer the parent item title so tabs don't show "PDF"
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

async function openItemAsNewTab(
  item: Zotero.Item,
  type?: string,
  data?: any,
  savedTitle?: string,
): Promise<string | undefined> {
  const ztabs = getZoteroTabs();
  if (!ztabs) {
    ztoolkit.log("[vt-restore] Zotero_Tabs not available");
    return undefined;
  }

  const title = getItemDisplayTitle(item, savedTitle);
  const effectiveType = type || "reader";

  try {
    let tabId: string | undefined;

    if (effectiveType === "reader") {
      // Use Zotero.Reader.open to properly initialize the reader and load PDF content
      const reader = (await Zotero.Reader.open(item.id, undefined, {
        title,
        openInBackground: true,
        allowDuplicate: true,
      })) as _ZoteroTypes.ReaderInstance | void;
      tabId = reader?.tabID;

      if (reader && tabId) {
        // Override the reader-managed title so it shows the parent item title
        reader._title = title;
        reader.updateTitle();
      }
    } else if (effectiveType === "note") {
      // Notes need to be opened via ZoteroPane to initialize the note editor
      const zp = getZoteroPane();
      if (!zp) {
        ztoolkit.log("[vt-restore] ZoteroPane not available");
        return undefined;
      }
      zp.openNote(item.id);
      // Give Zotero a moment to create the tab before looking it up
      await delay(200);
      tabId = ztabs.getTabIDByItemID(item.id);
    } else {
      const newTab = ztabs.add({
        type: effectiveType,
        title,
        data: data || { itemID: item.id },
        select: false,
      });

      // Give non-reader tabs a moment to initialize
      await delay(100);
      tabId = newTab.id;
    }

    if (tabId) {
      markTabAsImported(tabId);
    }

    return tabId;
  } catch (error) {
    ztoolkit.log("[vt-restore] Failed to add tab for item:", item.id, error);
    return undefined;
  }
}

export async function restoreCategory(
  data: VerticalTabsData,
  savedCategory: SavedCategory,
): Promise<{ data: VerticalTabsData; result: RestoreResult }> {
  const missingItemIds: number[] = [];
  const updatedItemIds: number[] = [];
  const validItemIds: number[] = [];
  const tabIds: string[] = [];

  const snapshotMap = new Map<
    number,
    { title: string; type?: string; data?: any }
  >();
  if (savedCategory.itemSnapshots) {
    for (const snap of savedCategory.itemSnapshots) {
      snapshotMap.set(snap.itemId, {
        title: snap.title,
        type: snap.type,
        data: snap.data,
      });
    }
  }

  for (let index = 0; index < savedCategory.itemIds.length; index++) {
    const itemId = savedCategory.itemIds[index];

    let item: Zotero.Item | undefined;
    try {
      item = await Zotero.Items.getAsync(itemId);
    } catch {
      item = undefined;
    }

    if (!item) {
      missingItemIds.push(itemId);
      continue;
    }

    const snap = snapshotMap.get(itemId);
    const currentTitle = (item.getField("title") as string) || "";
    if (snap && snap.title !== currentTitle) {
      updatedItemIds.push(itemId);
    }

    validItemIds.push(itemId);

    const tabId = await openItemAsNewTab(
      item,
      snap?.type,
      snap?.data,
      snap?.title,
    );
    if (tabId) {
      tabIds.push(tabId);
    }
  }

  const snapshot = {
    name: savedCategory.name,
    itemIds: validItemIds,
    color: savedCategory.color,
    itemSnapshots: savedCategory.itemSnapshots,
  };

  const newData = importCategoryFromSnapshot(data, snapshot, tabIds);

  return {
    data: newData,
    result: {
      success: validItemIds.length > 0,
      missingItemIds,
      updatedItemIds,
    },
  };
}

export async function showRestoreWarningDialog(
  doc: Document,
  result: RestoreResult,
): Promise<void> {
  setDialogOpen(doc, true);
  const messages: string[] = [];

  if (result.missingItemIds.length > 0) {
    messages.push(
      getString("vertical-tabs-restore-missing", {
        args: { count: result.missingItemIds.length },
      }),
    );
  }

  if (result.updatedItemIds.length > 0) {
    messages.push(
      getString("vertical-tabs-restore-updated", {
        args: { count: result.updatedItemIds.length },
      }),
    );
  }

  if (messages.length === 0) {
    setDialogOpen(doc, false);
    return;
  }

  const dialogData: { [key: string]: any } = {};

  new ztoolkit.Dialog(2, 1)
    .addCell(0, 0, {
      tag: "div",
      namespace: "html",
      properties: {
        innerHTML: messages.join("<br><br>"),
      },
      styles: {
        padding: "8px 0",
        fontSize: "13px",
        lineHeight: "1.5",
      },
    })
    .addCell(1, 0, {
      tag: "div",
      namespace: "html",
      properties: {
        textContent: getString("vertical-tabs-restore-confirm-hint"),
      },
      styles: {
        fontSize: "12px",
        color: "#888",
        marginTop: "8px",
      },
    })
    .addButton(getString("vertical-tabs-confirm"), "confirm")
    .setDialogData(dialogData)
    .open(getString("vertical-tabs-restore-warning-title"));

  try {
    await dialogData.unloadLock.promise;
  } finally {
    setDialogOpen(doc, false);
  }
}
