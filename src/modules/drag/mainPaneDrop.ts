import { dispatchVtEvent } from "../core/events";
import { isInternalVtDrag } from "./dropTarget";
import {
  applyExternalDropPreview,
  clearExternalDropIndicators,
  clearExternalDropPreview,
  computeExternalInsertTarget,
} from "./externalDropPreview";
import { prepareExternalDropData } from "./externalDropPrepare";
import { clearDropOutlineFade, markDropOutlineFade } from "./dropOutlineFade";
import { markMultiTabRelease } from "../render/multiTabRelease";
import {
  cancelPendingCollapse,
  expandFloatingSidebar,
  getFloatingExpanded,
  scheduleCollapse,
  SIDEBAR_ID,
} from "../sidebar/sidebar";
import {
  insertItemsIntoCategoryAt,
  insertUncategorizedItemsAt,
  type VerticalTabsData,
} from "../track/dataStore";
import { getString } from "../../utils/locale";
import { showToast } from "../ui/toast";

const UNCATEGORIZED = "__uncategorized__";

interface MainPaneDropState {
  isExternalDrag: boolean;
  dragEnterCount: number;
  /**
   * Set synchronously when a drop is being handled (before its awaits).
   * dragend fires right after drop — without this flag the doc-level dragend
   * listener could not tell "drop in progress" apart from "drag cancelled
   * without a drop" (Esc), and would tear down the preview mid-handling.
   */
  dropHandled: boolean;
  onDragEnter: (e: DragEvent) => void;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
  onDocDragEnd: () => void;
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
  applyExternalDropPreview(doc, e);
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

  resetDragState(state, doc, true, true);
}

async function handleDrop(
  state: MainPaneDropState,
  doc: Document,
  e: DragEvent,
): Promise<void> {
  if (!state.isExternalDrag) return;
  e.preventDefault();
  e.stopPropagation();
  // Mark synchronously (before any await) so the doc-level dragend listener —
  // which fires right after this drop event — leaves the handling alone.
  state.dropHandled = true;

  // Resolve the landing spot with the same gap math the preview used, so the
  // drop lands exactly where the green bar showed.
  const insert = computeExternalInsertTarget(doc, e.target, e.clientY);
  if (!insert) {
    resetDragState(state, doc, true, false);
    return;
  }

  // The drop re-renders the categories DOM and destroys the outlined element;
  // record the target now (before any await) so the render post-processing
  // replays the dashed-outline fade-out on the fresh DOM. Cleared below if
  // the drop aborts early.
  markDropOutlineFade(
    doc,
    insert.categoryId === UNCATEGORIZED
      ? { type: "drop-zone" }
      : { type: "category", categoryId: insert.categoryId },
  );

  // Drop moment: clear the green bar and dashed outline now, but keep the gap
  // shifts and container height preview — the persist-triggered re-render
  // replaces the DOM and the old shifted geometry matches the new natural
  // geometry, so the list does not flash (the internal "don't clear the gap
  // on drop" rule).
  clearExternalDropIndicators(doc);

  const prepared = await prepareExternalDropData(doc);
  if (!prepared) {
    clearDropOutlineFade(doc);
    resetDragState(state, doc, true, false);
    return;
  }
  const { entries, openedTabIds, currentData, missingLabels } = prepared;

  let newData: VerticalTabsData =
    insert.categoryId === UNCATEGORIZED
      ? insertUncategorizedItemsAt(
          currentData,
          entries,
          insert.insertBeforeTabId,
        )
      : insertItemsIntoCategoryAt(
          currentData,
          insert.categoryId,
          entries,
          insert.insertBeforeTabId,
        );

  // Dropping into a collapsed category expands it (persisted): the dropped
  // tabs' cascade release must play visibly instead of disappearing into a
  // folded category.
  if (insert.categoryId !== UNCATEGORIZED) {
    newData = {
      ...newData,
      categories: newData.categories.map((c) =>
        c.id === insert.categoryId ? { ...c, collapsed: false } : c,
      ),
    };
  }

  // The dropped tabs fade in with the same cascade release as the multi-tab
  // drop (single item = N=1 fade-in). Mark before the persist-triggered
  // re-render that the dispatch kicks off.
  markMultiTabRelease(doc, openedTabIds);
  dispatchVtEvent(doc, "vertical-tabs:external-items-dropped", {
    data: newData,
    pendingTabIds: openedTabIds,
  });

  if (missingLabels.length > 0) {
    showToast(doc, getString("vertical-tabs-drop-missing-pdf"));
  }

  // Success: the re-render swaps the DOM and clears the leftover preview
  // geometry; only reset the drag flags here.
  resetDragState(state, doc, false, false);
}

/**
 * Reset the external drag state. fullClear also tears down every preview
 * visual (drag aborted / drag left the sidebar / drop failed); a successful
 * drop passes false so the gap geometry survives until the re-render swaps
 * the DOM.
 *
 * collapse=true schedules the floating collapse (used when the drag LEAVES
 * the sidebar without dropping). After a drop the sidebar stays expanded as
 * long as the mouse is over it — the sidebar's own mouseleave handler
 * schedules the collapse later, in every expand mode. This never touches the
 * autoExpand/compactStrip prefs: a drag-driven floating expansion always
 * settles back into the user's chosen collapsed strip (manual 35px / compact
 * 20px) via performCollapse's applyCollapsedStripPresentation.
 */
function resetDragState(
  state: MainPaneDropState,
  doc: Document,
  fullClear: boolean,
  collapse: boolean,
): void {
  state.isExternalDrag = false;
  state.dragEnterCount = 0;
  state.dropHandled = false;
  if (fullClear) {
    clearExternalDropPreview(doc);
  }
  if (collapse) {
    scheduleCollapse(doc);
  }
}

export function initMainPaneDrop(doc: Document): void {
  if (getState(doc)) return;
  const sidebar = getSidebar(doc);
  if (!sidebar) return;

  const state: MainPaneDropState = {
    isExternalDrag: false,
    dragEnterCount: 0,
    dropHandled: false,
    onDragEnter: () => {},
    onDragOver: () => {},
    onDragLeave: () => {},
    onDrop: () => {},
    onDocDragEnd: () => {},
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

  state.onDocDragEnd = () => {
    // Drag cancelled without a drop (Esc while hovering the sidebar): neither
    // dragleave nor drop fires, so the drag flag would stay stuck and block
    // the next drag's enter handling. Reset only — the sidebar stays expanded
    // until the mouse actually leaves the VT (sidebar mouseleave), matching
    // the after-drop rule. A handled drop sets dropHandled first, and its own
    // reset clears the flag, so this never interferes with a real drop.
    if (!state.isExternalDrag || state.dropHandled) return;
    resetDragState(state, doc, true, false);
  };

  sidebar.addEventListener("dragenter", state.onDragEnter);
  sidebar.addEventListener("dragover", state.onDragOver);
  sidebar.addEventListener("dragleave", state.onDragLeave);
  sidebar.addEventListener("drop", state.onDrop);
  // dragend fires on the drag SOURCE (the Zotero item tree, same document),
  // after the drop event when a drop happened.
  doc.addEventListener("dragend", state.onDocDragEnd);

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
  doc.removeEventListener("dragend", state.onDocDragEnd);

  clearExternalDropPreview(doc);
  clearState(doc);
}
