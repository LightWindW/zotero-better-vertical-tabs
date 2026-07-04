import { dispatchVtEvent } from "../core/events";
import {
  computeDropTarget,
  applyDropVisuals,
  clearAllDropVisuals,
  dropTargetsEqual,
  type DropTarget,
  isInternalVtDrag,
} from "./dropTarget";
import {
  cancelPendingCollapse,
  expandFloatingSidebar,
  getFloatingExpanded,
  scheduleCollapse,
  SIDEBAR_ID,
} from "../sidebar/sidebar";
import { getData } from "../track/categoryManager";
import {
  insertItemsIntoCategoryAt,
  insertUncategorizedItemsAt,
  type ItemTabEntry,
  type VerticalTabsData,
} from "../track/dataStore";
import { openItemAsNewTab } from "../track/tabOpener";
import { getString } from "../../utils/locale";
import { showToast } from "../ui/toast";
import { getZoteroTabs } from "../track/itemTracker";

interface MainPaneDropState {
  isExternalDrag: boolean;
  lastTarget: DropTarget | null;
  dragEnterCount: number;
  onDragEnter: (e: DragEvent) => void;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
}

const STATE_KEY = "__vtMainPaneDropState";

function getState(doc: Document): MainPaneDropState | undefined {
  return (doc as any)[STATE_KEY] as MainPaneDropState | undefined;
}

function setState(doc: Document, state: MainPaneDropState): void {
  (doc as any)[STATE_KEY] = state;
}

function clearState(doc: Document): void {
  delete (doc as any)[STATE_KEY];
}

function getSidebar(doc: Document): HTMLElement | null {
  return doc.getElementById(SIDEBAR_ID) as HTMLElement | null;
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

function getInsertBeforeTabId(
  target: DropTarget,
  data: VerticalTabsData,
): string | undefined {
  if (target.type === "item-before") {
    return target.targetTabId;
  }

  if (target.type === "item-after") {
    const categoryId = target.categoryId;
    if (categoryId === "__uncategorized__") {
      const order = data.uncategorizedOrder;
      const idx = order.indexOf(target.targetTabId);
      return idx >= 0 ? order[idx + 1] : undefined;
    }
    const category = data.categories.find((c) => c.id === categoryId);
    if (!category) return undefined;
    const idx = category.tabIds.indexOf(target.targetTabId);
    return idx >= 0 ? category.tabIds[idx + 1] : undefined;
  }

  if (
    target.type === "drop-zone" &&
    target.targetTabId !== undefined &&
    target.before
  ) {
    return target.targetTabId;
  }

  return undefined;
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
  ztoolkit.log("[vt-main-pane-drop] timeout waiting for tabIds:", tabIds);
}

function handleDragEnter(state: MainPaneDropState, doc: Document): void {
  if (state.isExternalDrag) return;
  state.isExternalDrag = true;
  state.dragEnterCount = 1;

  cancelPendingCollapse(doc);

  const sidebar = getSidebar(doc);
  if (!sidebar) return;

  // Auto-expand the floating sidebar when an external drag enters.
  if (!getFloatingExpanded(doc)) {
    expandFloatingSidebar(doc);
  }
}

function handleDragOver(
  state: MainPaneDropState,
  doc: Document,
  e: DragEvent,
): void {
  if (!state.isExternalDrag) return;
  e.preventDefault();

  const target = computeDropTarget(doc, e.clientX, e.clientY);
  if (!state.lastTarget || !dropTargetsEqual(target, state.lastTarget)) {
    clearAllDropVisuals(doc);
    applyDropVisuals(doc, target);
    state.lastTarget = target;
  }
}

function handleDragLeave(
  state: MainPaneDropState,
  doc: Document,
  e: DragEvent,
): void {
  if (!state.isExternalDrag) return;

  const sidebar = getSidebar(doc);
  const related = e.relatedTarget as Node | null;
  if (sidebar && related && sidebar.contains(related)) {
    return;
  }

  state.isExternalDrag = false;
  state.dragEnterCount = 0;
  state.lastTarget = null;
  clearAllDropVisuals(doc);
  scheduleCollapse(doc);
}

async function handleDrop(
  state: MainPaneDropState,
  doc: Document,
  e: DragEvent,
): Promise<void> {
  if (!state.isExternalDrag) return;
  e.preventDefault();
  e.stopPropagation();

  const target =
    state.lastTarget ?? computeDropTarget(doc, e.clientX, e.clientY);
  ztoolkit.log("[vt-main-pane-drop] target:", JSON.stringify(target));
  if (target.type === "none") {
    resetDragState(state, doc);
    return;
  }

  const items = getSelectedItems(doc);
  if (items.length === 0) {
    resetDragState(state, doc);
    return;
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
    resetDragState(state, doc);
    return;
  }

  const entries = await openPDFAttachmentsAsTabs(attachments, doc);
  const openedTabIds = entries.map((e) => e.tabId);
  ztoolkit.log(
    "[vt-main-pane-drop] opened entries:",
    entries,
    "openedTabIds:",
    openedTabIds,
  );
  if (entries.length === 0) {
    if (missingLabels.length > 0) {
      showToast(doc, getString("vertical-tabs-drop-missing-pdf"));
    }
    resetDragState(state, doc);
    return;
  }

  // Wait until the newly opened tabs have actually entered Zotero_Tabs._tabs
  // before persisting data and syncing native tab order.
  await waitForTabIds(doc, openedTabIds);

  const currentData = getData();
  let newData: VerticalTabsData;

  if (target.type === "category") {
    const insertBeforeTabId = getInsertBeforeTabId(target, currentData);
    ztoolkit.log(
      "[vt-main-pane-drop] category insertBeforeTabId:",
      insertBeforeTabId,
    );
    newData = insertItemsIntoCategoryAt(
      currentData,
      target.categoryId,
      entries,
      insertBeforeTabId,
    );
  } else if (target.type === "item-before" || target.type === "item-after") {
    const insertBeforeTabId = getInsertBeforeTabId(target, currentData);
    ztoolkit.log(
      "[vt-main-pane-drop] item insertBeforeTabId:",
      insertBeforeTabId,
      "categoryId:",
      target.categoryId,
    );
    if (target.categoryId === "__uncategorized__") {
      newData = insertUncategorizedItemsAt(
        currentData,
        entries,
        insertBeforeTabId,
      );
    } else {
      newData = insertItemsIntoCategoryAt(
        currentData,
        target.categoryId,
        entries,
        insertBeforeTabId,
      );
    }
  } else if (target.type === "drop-zone") {
    const insertBeforeTabId = getInsertBeforeTabId(target, currentData);
    ztoolkit.log(
      "[vt-main-pane-drop] drop-zone insertBeforeTabId:",
      insertBeforeTabId,
    );
    newData = insertUncategorizedItemsAt(
      currentData,
      entries,
      insertBeforeTabId,
    );
  } else {
    resetDragState(state, doc);
    return;
  }

  const targetCat =
    target.type !== "drop-zone" && target.categoryId !== "__uncategorized__"
      ? newData.categories.find((c) => c.id === target.categoryId)
      : undefined;
  if (targetCat) {
    ztoolkit.log(
      "[vt-main-pane-drop] result category tabIds:",
      targetCat.tabIds,
    );
  } else {
    ztoolkit.log(
      "[vt-main-pane-drop] result uncategorizedOrder:",
      newData.uncategorizedOrder,
    );
  }

  // Log the actual insertion indices of the newly opened tabs for diagnosis.
  const orderToSearch = targetCat
    ? targetCat.tabIds
    : newData.uncategorizedOrder;
  for (const tabId of openedTabIds) {
    const idx = orderToSearch.indexOf(tabId);
    ztoolkit.log(
      "[vt-main-pane-drop] inserted tab",
      tabId,
      "at index",
      idx,
      "of",
      targetCat ? `category ${targetCat.id}` : "uncategorized",
    );
  }

  dispatchVtEvent(doc, "vertical-tabs:external-items-dropped", {
    data: newData,
    pendingTabIds: openedTabIds,
  });

  if (missingLabels.length > 0) {
    showToast(doc, getString("vertical-tabs-drop-missing-pdf"));
  }

  resetDragState(state, doc);
}

function resetDragState(state: MainPaneDropState, doc: Document): void {
  state.isExternalDrag = false;
  state.dragEnterCount = 0;
  state.lastTarget = null;
  clearAllDropVisuals(doc);
  scheduleCollapse(doc);
}

export function initMainPaneDrop(doc: Document): void {
  if (getState(doc)) return;
  const sidebar = getSidebar(doc);
  if (!sidebar) return;

  const state: MainPaneDropState = {
    isExternalDrag: false,
    lastTarget: null,
    dragEnterCount: 0,
    onDragEnter: () => {},
    onDragOver: () => {},
    onDragLeave: () => {},
    onDrop: () => {},
  };

  state.onDragEnter = (e: DragEvent) => {
    if (isInternalVtDrag(e.dataTransfer)) return;
    e.preventDefault();
    state.dragEnterCount++;
    handleDragEnter(state, doc);
  };

  state.onDragOver = (e: DragEvent) => {
    if (isInternalVtDrag(e.dataTransfer)) {
      // Internal drag is handled by existing VT row/category listeners.
      return;
    }
    handleDragOver(state, doc, e);
  };

  state.onDragLeave = (e: DragEvent) => {
    if (!state.isExternalDrag) return;
    state.dragEnterCount = Math.max(0, state.dragEnterCount - 1);
    if (state.dragEnterCount === 0) {
      handleDragLeave(state, doc, e);
    }
  };

  state.onDrop = (e: DragEvent) => {
    if (isInternalVtDrag(e.dataTransfer)) return;
    void handleDrop(state, doc, e);
  };

  sidebar.addEventListener("dragenter", state.onDragEnter);
  sidebar.addEventListener("dragover", state.onDragOver);
  sidebar.addEventListener("dragleave", state.onDragLeave);
  sidebar.addEventListener("drop", state.onDrop);

  setState(doc, state);
}

export function destroyMainPaneDrop(doc: Document): void {
  const state = getState(doc);
  if (!state) return;

  const sidebar = getSidebar(doc);
  if (sidebar) {
    sidebar.removeEventListener("dragenter", state.onDragEnter);
    sidebar.removeEventListener("dragover", state.onDragOver);
    sidebar.removeEventListener("dragleave", state.onDragLeave);
    sidebar.removeEventListener("drop", state.onDrop);
  }

  clearAllDropVisuals(doc);
  clearState(doc);
}
