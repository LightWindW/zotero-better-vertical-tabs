/**
 * Shared preparation phase of an external library-item drop: resolve the
 * selected items' PDF attachments, open them as lazy reader tabs, wait for
 * them to register in Zotero_Tabs, and return the cleaned VT data to insert
 * into. Used by mainPaneDrop's drop handler and by the new-category drop
 * zone's external path (drag/newCategoryDrop.ts).
 */

import { getData } from "../track/categoryManager";
import {
  cleanStaleTabIds,
  reconcileUncategorizedOrder,
  type ItemTabEntry,
  type VerticalTabsData,
} from "../track/dataStore";
import { openItemAsNewTab } from "../track/tabOpener";
import { getString } from "../../utils/locale";
import { showToast } from "../ui/toast";
import {
  getZoteroTabs,
  getLiveUncategorizedEntries,
} from "../track/itemTracker";

export interface PreparedExternalDrop {
  entries: ItemTabEntry[];
  openedTabIds: string[];
  currentData: VerticalTabsData;
  missingLabels: string[];
}

function getSelectedItems(doc: Document): Zotero.Item[] {
  const win = doc.defaultView as _ZoteroTypes.MainWindow | undefined;
  const pane = win?.ZoteroPane_Local;
  if (!pane) return [];
  try {
    return (pane.getSelectedItems() as Zotero.Item[] | undefined) ?? [];
  } catch {
    return [];
  }
}

function isPDFAttachment(item: Zotero.Item): boolean {
  const contentType =
    ((item.getField("contentType") as string | undefined) ||
      (item as any).attachmentContentType) ??
    "";
  return contentType === "application/pdf";
}

function getItemAttachments(item: Zotero.Item): number[] {
  try {
    return ((item as any).getAttachments() as number[] | undefined) ?? [];
  } catch {
    return [];
  }
}

/**
 * Resolve the first PDF attachment for a given item.
 * - If the item itself is a PDF attachment, return it.
 * - Otherwise, scan all attachments in order and return the first PDF.
 */
function resolveFirstPDFAttachment(item: Zotero.Item): Zotero.Item | undefined {
  const itemType = (item.itemType as string) || "";
  if (itemType === "attachment" || itemType === "attachment-pdf") {
    return isPDFAttachment(item) ? item : undefined;
  }

  for (const attachmentId of getItemAttachments(item)) {
    const attachment = Zotero.Items.get(attachmentId) as Zotero.Item | false;
    if (attachment && isPDFAttachment(attachment)) {
      return attachment;
    }
  }
  return undefined;
}

function getItemDisplayLabel(item: Zotero.Item): string {
  return (item.getField("title") as string | undefined) || `item ${item.id}`;
}

/**
 * Open each resolved PDF attachment as a new tab.
 * Existing tabs are intentionally NOT reused — each drop creates independent tabs.
 */
async function openPDFAttachmentsAsTabs(
  attachments: Zotero.Item[],
  doc: Document,
): Promise<ItemTabEntry[]> {
  const entries: ItemTabEntry[] = [];
  for (const attachment of attachments) {
    const tabId = await openItemAsNewTab(attachment, {
      openInBackground: true,
      lazy: true,
      doc,
    });
    if (tabId) {
      entries.push({ itemId: attachment.id, tabId });
    }
  }
  return entries;
}

async function waitForTabIds(
  doc: Document,
  tabIds: string[],
  timeout = 3000,
  interval = 100,
): Promise<void> {
  if (tabIds.length === 0) return;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const ztabs = getZoteroTabs(doc);
    const currentIds = new Set(
      ((ztabs as any)?._tabs as any[] | undefined)?.map((t) =>
        String(t.id ?? ""),
      ) ?? [],
    );
    if (tabIds.every((id) => currentIds.has(id))) return;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

/**
 * Resolve the dragged library items and prepare clean data to insert into.
 * Returns null when nothing can be opened (showing the missing-PDF toast when
 * there were items but no PDFs).
 */
export async function prepareExternalDropData(
  doc: Document,
): Promise<PreparedExternalDrop | null> {
  const items = getSelectedItems(doc);
  if (items.length === 0) {
    return null;
  }

  const attachments: Zotero.Item[] = [];
  const missingLabels: string[] = [];
  for (const item of items) {
    const pdf = resolveFirstPDFAttachment(item);
    if (pdf) {
      attachments.push(pdf);
    } else {
      missingLabels.push(getItemDisplayLabel(item));
    }
  }

  if (attachments.length === 0) {
    if (missingLabels.length > 0) {
      showToast(doc, getString("vertical-tabs-drop-missing-pdf"));
    }
    return null;
  }

  const entries = await openPDFAttachmentsAsTabs(attachments, doc);
  const openedTabIds = entries.map((e) => e.tabId);
  if (entries.length === 0) {
    if (missingLabels.length > 0) {
      showToast(doc, getString("vertical-tabs-drop-missing-pdf"));
    }
    return null;
  }

  // Wait until the newly opened tabs have actually entered Zotero_Tabs._tabs
  // before persisting data and syncing native tab order.
  await waitForTabIds(doc, openedTabIds);

  const ztabs = getZoteroTabs(doc);
  const internalTabs = (ztabs as any)?._tabs as any[] | undefined;
  const liveTabIds = new Set(
    (internalTabs ?? []).map((t) => String(t.id ?? "")).filter((id) => id),
  );

  let currentData = getData();
  currentData = cleanStaleTabIds(currentData, liveTabIds);
  currentData = reconcileUncategorizedOrder(
    currentData,
    getLiveUncategorizedEntries(currentData, doc),
  );

  return { entries, openedTabIds, currentData, missingLabels };
}
