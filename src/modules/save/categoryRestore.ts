import { getString } from "../../utils/locale";
import { getItemDisplayTitle } from "../utils/itemTitle";
import { setDialogOpen } from "../sidebar/sidebar";
import { openItemAsNewTab } from "../track/tabOpener";
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
      item = (await Zotero.Items.getAsync(itemId)) || undefined;
    } catch {
      item = undefined;
    }

    if (!item) {
      missingItemIds.push(itemId);
      continue;
    }

    const snap = snapshotMap.get(itemId);
    const currentTitle = getItemDisplayTitle(item);
    if (snap && snap.title !== currentTitle) {
      updatedItemIds.push(itemId);
    }

    validItemIds.push(itemId);

    const tabId = await openItemAsNewTab(item, {
      type: snap?.type,
      data: snap?.data,
      title: snap?.title,
    });
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
