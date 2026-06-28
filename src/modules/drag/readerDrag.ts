/**
 * Manual drag-and-drop implementation for the PDF Reader sidebar.
 *
 * The Reader sandbox blocks HTML5 DnD, and in practice left-click mousedown
 * events do not reach our listeners there. We therefore use Pointer Events as
 * the primary input source (mouse/pen/touch) and fall back to mouse events when
 * Pointer Events are unavailable.
 */

import {
  applyDropVisuals,
  clearAllDropVisuals,
  computeDropTarget,
  dropTargetsEqual,
  type DropTarget,
} from "./dropTarget";
import {
  createDragState,
  destroyDragState,
  shouldStartDrag,
  createGhostElement,
  updateGhostPosition,
  type DragState,
} from "./dragState";
import { dispatchVtEvent } from "../core/events";

const DRAG_STATE_KEY = "__vtReaderDragState";
const DRAG_INIT_KEY = "__vtReaderDragInit";
const LAST_TARGET_KEY = "__vtReaderDragLastTarget";

interface BoundListeners {
  start: EventListener;
  move: EventListener;
  end: EventListener;
}

const _boundListeners = new WeakMap<Document, BoundListeners>();

/**
 * Minimal CSS identifier escape for IDs that contain only
 * letters, digits, hyphens and underscores.
 */
function safeCssId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function dispatchForTarget(
  doc: Document,
  state: DragState,
  target: DropTarget,
): void {
  switch (target.type) {
    case "category": {
      dispatchVtEvent(doc, "vertical-tabs:assign-item", {
        itemId: state.itemId,
        tabId: state.tabId,
        categoryId: target.categoryId,
      });
      break;
    }
    case "item-before":
    case "item-after": {
      dispatchVtEvent(doc, "vertical-tabs:reorder-item", {
        categoryId: target.categoryId,
        tabId: state.tabId,
        targetTabId: target.targetTabId,
        before: target.type === "item-before",
      });
      break;
    }
    case "drop-zone": {
      if (target.targetTabId !== undefined && target.before !== undefined) {
        dispatchVtEvent(doc, "vertical-tabs:reorder-item", {
          categoryId: "__uncategorized__",
          tabId: state.tabId,
          targetTabId: target.targetTabId,
          before: target.before,
        });
      } else {
        dispatchVtEvent(doc, "vertical-tabs:assign-item", {
          itemId: state.itemId,
          tabId: state.tabId,
          categoryId: "__uncategorized__",
        });
      }
      break;
    }
    case "none":
      break;
  }
}

function hideHoverCard(doc: Document): void {
  const hoverCard = doc.getElementById(
    "vertical-tabs-hover-card",
  ) as HTMLElement | null;
  if (hoverCard) {
    hoverCard.style.opacity = "0";
    setTimeout(() => {
      if (hoverCard.style.opacity === "0") {
        hoverCard.style.display = "none";
      }
    }, 200);
  }
}

function startDrag(
  doc: Document,
  itemRow: HTMLElement,
  e: MouseEvent,
): boolean {
  if (e.button !== 0) return false;
  const target = e.target as HTMLElement;
  if (target.closest(".vertical-tabs-item-close")) return false;

  const state = createDragState(itemRow, e.clientX, e.clientY);
  if (!state) return false;

  e.preventDefault();
  hideHoverCard(doc);
  (doc as any)[DRAG_STATE_KEY] = state;
  return true;
}

export function initReaderDragSystem(doc: Document, sidebarId: string): void {
  if ((doc as any)[DRAG_INIT_KEY]) return;
  (doc as any)[DRAG_INIT_KEY] = true;

  const panel = doc.getElementById(sidebarId) as HTMLElement | null;
  if (!panel) return;

  const itemSelector = `.vertical-tabs-item`;
  const win = doc.defaultView;
  const usePointer = win ? "PointerEvent" in win : false;

  const startEvents = usePointer
    ? (["pointerdown"] as const)
    : (["mousedown"] as const);
  const moveEvents = usePointer
    ? (["pointermove"] as const)
    : (["mousemove"] as const);
  const endEvents = usePointer
    ? (["pointerup", "pointercancel"] as const)
    : (["mouseup"] as const);

  const onStart = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const itemRow = target.closest(itemSelector) as HTMLElement | null;
    if (!itemRow) return;
    startDrag(doc, itemRow, e);
  };

  const onMove = (e: MouseEvent) => {
    const state: DragState | undefined = (doc as any)[DRAG_STATE_KEY];
    if (!state) return;

    if (!state.moved && !shouldStartDrag(state, e.clientX, e.clientY)) {
      return;
    }

    state.moved = true;

    if (!state.ghost) {
      const src = panel.querySelector(
        `${itemSelector}[data-tab-id="${safeCssId(state.tabId)}"]`,
      ) as HTMLElement | null;
      if (src) {
        src.classList.add("dragging");
        state.ghost = createGhostElement(doc, src);
      }
    }

    if (state.ghost) {
      updateGhostPosition(state.ghost, e.clientX, e.clientY);
    }

    const target = computeDropTarget(doc, e.clientX, e.clientY, state.tabId);
    const lastTarget: DropTarget | undefined = (doc as any)[LAST_TARGET_KEY];
    if (!lastTarget || !dropTargetsEqual(target, lastTarget)) {
      clearAllDropVisuals(doc);
      applyDropVisuals(doc, target);
      (doc as any)[LAST_TARGET_KEY] = target;
    }
  };

  const onEnd = (e: MouseEvent) => {
    const state: DragState | undefined = (doc as any)[DRAG_STATE_KEY];
    if (!state) return;

    delete (doc as any)[DRAG_STATE_KEY];
    delete (doc as any)[LAST_TARGET_KEY];

    clearAllDropVisuals(doc);

    if (state.moved) {
      const target = computeDropTarget(doc, e.clientX, e.clientY, state.tabId);
      dispatchForTarget(doc, state, target);
    }

    destroyDragState(state);
    panel
      .querySelectorAll(".vertical-tabs-item.dragging")
      .forEach((el: Element) => el.classList.remove("dragging"));
  };

  // Capture phase on the panel: in the Reader sandbox mousedown does not bubble
  // all the way to the document, so we listen on the panel itself.
  for (const evt of startEvents) {
    panel.addEventListener(evt, onStart as EventListener, true);
  }
  for (const evt of moveEvents) {
    panel.addEventListener(evt, onMove as EventListener, true);
  }
  for (const evt of endEvents) {
    panel.addEventListener(evt, onEnd as EventListener, true);
  }

  // Fallback on document for releases outside the panel.
  for (const evt of endEvents) {
    doc.addEventListener(evt, onEnd as EventListener, true);
  }

  _boundListeners.set(doc, {
    start: onStart as EventListener,
    move: onMove as EventListener,
    end: onEnd as EventListener,
  });
}

/**
 * Bind drag events directly to a single item row.
 *
 * Kept as a safety net for environments where panel capture delegation fails
 * (e.g. the item is inside a shadow root or behind an overlay). When Pointer
 * Events are available they take precedence over mouse events to avoid double
 * handling.
 */
export function bindReaderItemDrag(row: HTMLElement): void {
  if ((row as any).__vtItemDragBound) return;
  (row as any).__vtItemDragBound = true;

  const doc = row.ownerDocument;
  if (!doc) return;
  const win = doc.defaultView;
  const usePointer = win ? "PointerEvent" in win : false;
  const startEvent = usePointer ? "pointerdown" : "mousedown";

  row.addEventListener(startEvent, ((e: MouseEvent) => {
    startDrag(doc, row, e);
  }) as EventListener);
}

export function destroyReaderDragSystem(doc: Document): void {
  const listeners = _boundListeners.get(doc);
  if (!listeners) return;

  const panel = doc.querySelector(
    ".vertical-tabs-sidebar",
  ) as HTMLElement | null;
  if (panel) {
    panel.removeEventListener("pointerdown", listeners.start, true);
    panel.removeEventListener("mousedown", listeners.start, true);
    panel.removeEventListener("pointermove", listeners.move, true);
    panel.removeEventListener("mousemove", listeners.move, true);
    panel.removeEventListener("pointerup", listeners.end, true);
    panel.removeEventListener("pointercancel", listeners.end, true);
    panel.removeEventListener("mouseup", listeners.end, true);
  }
  doc.removeEventListener("pointerup", listeners.end, true);
  doc.removeEventListener("pointercancel", listeners.end, true);
  doc.removeEventListener("mouseup", listeners.end, true);
  _boundListeners.delete(doc);

  delete (doc as any)[DRAG_INIT_KEY];
  delete (doc as any)[DRAG_STATE_KEY];
  delete (doc as any)[LAST_TARGET_KEY];
}
