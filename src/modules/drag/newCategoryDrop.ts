/**
 * Quick-create-category drop zone at the top of the VT sidebar.
 *
 * While dragging a tab (internal VT drag) or library items (external drag)
 * over the top region of the sidebar — the home-button block, the gap below
 * the header, or the upper half of the first category header — a dashed
 * "+ New Category" zone smoothly expands above the categories container
 * (pushing the list down). Moving away collapses it. Dropping on it opens the
 * shared naming dialog: on confirm a new category is created at the TOP of
 * the list and the dragged tab/items land inside; on cancel nothing ever
 * changed (the internal tab was never moved, external tabs were never opened).
 *
 * The zone element lives OUTSIDE the re-rendered `.vertical-tabs-categories`
 * container (inserted right before it), so it survives drop-triggered
 * re-renders and stays pinned to the visible top.
 *
 * Oscillation-free thresholds: hidden trigger = container.top + 18px; shown
 * keep = zone.top + 36px (its own height) + 6px. Expanding pushes content down
 * (the cursor ends up inside the zone), collapsing pulls it up (the cursor
 * ends up outside the trigger strip), so the state never flaps.
 */

import { dispatchVtEvent } from "../core/events";
import { getString } from "../../utils/locale";
import { getOpenedPDFs } from "../track/itemTracker";
import {
  addCategoryAtTop,
  insertItemsIntoCategoryAt,
} from "../track/dataStore";
import { getCategoriesContainer, SIDEBAR_ID } from "../sidebar/sidebar";
import { showToast } from "../ui/toast";
import { promptCategoryName } from "../ui/categoryNameDialog";
import { markNewCategoryEntrance } from "../render/categoryEntrance";
import { getDraggedTabId } from "./itemDragState";
import { clearAllDropVisuals, isInternalVtDrag } from "./dropTarget";
import { clearCategoryPreview } from "./categoryPreview";
import { clearItemShiftPreview } from "./dropPreview";
import { clearAllItemDropIndicators } from "./dropZoneIndicator";
import { prepareExternalDropData } from "./mainPaneDrop";

const ZONE_CLASS = "vertical-tabs-new-category-zone";
const INNER_CLASS = "vertical-tabs-new-category-inner";
const STATE_KEY = "__vtNewCategoryDropState";

/** Item-row height the zone expands to (matches --vt-item-min-height). */
const ZONE_HEIGHT_PX = 36;
/** Top strip of the categories container that triggers the zone when hidden. */
const HIDDEN_STRIP_PX = 18;
/** Extra margin below the expanded zone that keeps it visible. */
const SHOWN_KEEP_MARGIN_PX = 6;
const ANIMATION_MS = 300;

interface NewCategoryDropState {
  zone: HTMLElement | null;
  visible: boolean;
  animTimeout: number | undefined;
  onSidebarDragOver: (e: DragEvent) => void;
  onSidebarDragLeave: (e: DragEvent) => void;
  onDocDragEnd: () => void;
}

function peekState(doc: Document): NewCategoryDropState | undefined {
  return (doc as any)[STATE_KEY] as NewCategoryDropState | undefined;
}

/**
 * True when the pointer is inside the zone's trigger/keep region. Returns
 * false when the feature is not initialized for this document, so dragover
 * handlers can use it as an early-return guard without side effects.
 */
export function isNewCategoryZonePointer(
  doc: Document,
  clientY: number,
): boolean {
  const state = peekState(doc);
  if (!state) return false;
  if (state.visible && state.zone) {
    // The zone's top edge is fixed (nothing above it moves), so measuring it
    // is stable even mid-animation; keep using the FINAL height rather than
    // the interpolated one so the expanding animation itself can't re-hide.
    const top = state.zone.getBoundingClientRect().top;
    return clientY <= top + ZONE_HEIGHT_PX + SHOWN_KEEP_MARGIN_PX;
  }
  const container = getCategoriesContainer(doc);
  if (!container) return false;
  return clientY <= container.getBoundingClientRect().top + HIDDEN_STRIP_PX;
}

function cancelZoneTimeout(doc: Document, state: NewCategoryDropState): void {
  const win = doc.defaultView;
  if (state.animTimeout !== undefined && win) {
    win.clearTimeout(state.animTimeout);
  }
  state.animTimeout = undefined;
}

function ensureZone(doc: Document, state: NewCategoryDropState): HTMLElement {
  if (state.zone?.isConnected) return state.zone;
  const container = getCategoriesContainer(doc);
  if (!container) throw new Error("categories container missing");
  const zone = doc.createElement("div");
  zone.className = ZONE_CLASS;
  const inner = doc.createElement("div");
  inner.className = INNER_CLASS;
  const label = doc.createElement("span");
  label.textContent = getString("vertical-tabs-new-category-dropzone");
  inner.appendChild(label);
  zone.appendChild(inner);
  zone.addEventListener("dragover", (e: DragEvent) => {
    const internal = isInternalVtDrag(e.dataTransfer);
    // Not a target for category reorder drags.
    if (internal && !getDraggedTabId(doc)) return;
    e.preventDefault();
  });
  zone.addEventListener("drop", (e: DragEvent) => {
    void onZoneDrop(doc, e);
  });
  container.before(zone);
  state.zone = zone;
  return zone;
}

function showZone(doc: Document, state: NewCategoryDropState): void {
  const container = getCategoriesContainer(doc);
  if (!container) return;
  const zone = ensureZone(doc, state);
  state.visible = true;
  // Smoothly release any in-progress category preview so its height falls
  // back with an animation instead of snapping.
  clearCategoryPreview(doc, true);

  cancelZoneTimeout(doc, state);
  // Pin the current (possibly interpolated) geometry, commit it, then
  // transition to the expanded target — seamless even when reversing a
  // collapse mid-animation.
  zone.style.height = `${zone.getBoundingClientRect().height}px`;
  zone.style.opacity = doc.defaultView?.getComputedStyle(zone)?.opacity ?? "0";
  void zone.offsetHeight;
  zone.style.height = `${ZONE_HEIGHT_PX}px`;
  zone.style.opacity = "1";
}

function hideZone(doc: Document, state: NewCategoryDropState): void {
  if (!state.visible) return;
  state.visible = false;
  const zone = state.zone;
  if (!zone) return;

  cancelZoneTimeout(doc, state);
  zone.style.height = `${zone.getBoundingClientRect().height}px`;
  zone.style.opacity = doc.defaultView?.getComputedStyle(zone)?.opacity ?? "1";
  void zone.offsetHeight;
  zone.style.height = "0px";
  zone.style.opacity = "0";
  const win = doc.defaultView;
  if (win) {
    state.animTimeout = win.setTimeout(() => {
      state.animTimeout = undefined;
      // Hand the hidden steady state back to CSS (height: 0; opacity: 0).
      zone.style.height = "";
      zone.style.opacity = "";
    }, ANIMATION_MS);
  }
}

/**
 * Drop on the zone: hide it, ask for a name, then create the category at the
 * top with the dragged content inside. Cancel = nothing ever changed.
 */
async function onZoneDrop(doc: Document, e: DragEvent): Promise<void> {
  const internal = isInternalVtDrag(e.dataTransfer);
  const dragData = e.dataTransfer?.getData("text/plain") || "";
  const isItemDrag = internal && !!dragData && !dragData.startsWith("cat:");

  if (internal) {
    if (!isItemDrag) return; // category reorder drag: not a target
    e.preventDefault();
    e.stopPropagation();
  } else {
    // External drop: allow it, but let the event bubble to mainPaneDrop's
    // sidebar listener so its drag state resets via the target=none path.
    e.preventDefault();
  }

  const state = peekState(doc);
  if (state) hideZone(doc, state);

  // promptCategoryName sets the dialog-open collapse guard synchronously.
  const name = await promptCategoryName(doc, {
    title: getString("vertical-tabs-add-category"),
    initial: getString("vertical-tabs-category-new"),
    inputId: "vt-new-category-drop-input",
  });
  if (!name) return;

  if (isItemDrag) {
    const byTab = getOpenedPDFs().find((p) => p.tabId === dragData);
    dispatchVtEvent(doc, "vertical-tabs:create-category-with-item", {
      name,
      itemId: byTab ? byTab.itemId : Number(dragData),
      tabId: byTab ? dragData : undefined,
    });
    return;
  }

  // External library items: open them as lazy tabs and insert into the new
  // top category via the existing external-items-dropped pipeline.
  const prepared = await prepareExternalDropData(doc);
  if (!prepared) return;
  const created = addCategoryAtTop(prepared.currentData, name);
  const data = insertItemsIntoCategoryAt(
    created.data,
    created.categoryId,
    prepared.entries,
    undefined,
  );
  // The persist triggered by external-items-dropped re-renders; mark the new
  // category so the render post-processing plays its entrance animation.
  markNewCategoryEntrance(doc, created.categoryId);
  dispatchVtEvent(doc, "vertical-tabs:external-items-dropped", {
    data,
    pendingTabIds: prepared.openedTabIds,
  });
  if (prepared.missingLabels.length > 0) {
    showToast(doc, getString("vertical-tabs-drop-missing-pdf"));
  }
}

function handleSidebarDragOver(doc: Document, e: DragEvent): void {
  const internal = isInternalVtDrag(e.dataTransfer);
  // Category reorder drags never trigger the zone.
  if (internal && !getDraggedTabId(doc)) return;

  const state = peekState(doc);
  if (!state) return;

  if (isNewCategoryZonePointer(doc, e.clientY)) {
    // The region claims the drop visuals: remove whatever the per-wrapper or
    // mainPaneDrop handlers just applied this tick (they run before us), so
    // the dashed zone is the only affordance shown. Shifted rows slide back
    // via their transform transition; the indicators fade via opacity.
    clearAllDropVisuals(doc);
    clearAllItemDropIndicators(doc);
    clearItemShiftPreview(doc);
    if (!state.visible) {
      showZone(doc, state);
    }
  } else if (state.visible) {
    hideZone(doc, state);
  }
}

function handleSidebarDragLeave(doc: Document, e: DragEvent): void {
  const sidebar = doc.getElementById(SIDEBAR_ID);
  const related = e.relatedTarget as Node | null;
  if (sidebar && related && sidebar.contains(related)) return;
  const state = peekState(doc);
  if (state) hideZone(doc, state);
}

export function initNewCategoryDrop(doc: Document): void {
  if (peekState(doc)) return;
  const sidebar = doc.getElementById(SIDEBAR_ID);
  if (!sidebar) return;

  const state: NewCategoryDropState = {
    zone: null,
    visible: false,
    animTimeout: undefined,
    onSidebarDragOver: (e) => handleSidebarDragOver(doc, e),
    onSidebarDragLeave: (e) => handleSidebarDragLeave(doc, e),
    onDocDragEnd: () => {
      const s = peekState(doc);
      if (s) hideZone(doc, s);
    },
  };
  // mainPaneDrop's sidebar listeners were registered first, so this handler
  // runs after them within the same event tick and gets the final say.
  sidebar.addEventListener("dragover", state.onSidebarDragOver);
  sidebar.addEventListener("dragleave", state.onSidebarDragLeave);
  doc.addEventListener("dragend", state.onDocDragEnd);
  (doc as any)[STATE_KEY] = state;
}

export function destroyNewCategoryDrop(doc: Document): void {
  const state = peekState(doc);
  if (!state) return;
  const sidebar = doc.getElementById(SIDEBAR_ID);
  if (sidebar) {
    sidebar.removeEventListener("dragover", state.onSidebarDragOver);
    sidebar.removeEventListener("dragleave", state.onSidebarDragLeave);
  }
  doc.removeEventListener("dragend", state.onDocDragEnd);
  cancelZoneTimeout(doc, state);
  state.zone?.remove();
  delete (doc as any)[STATE_KEY];
}
