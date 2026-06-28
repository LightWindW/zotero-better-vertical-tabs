/**
 * Drag state management for the PDF Reader manual drag-and-drop system.
 *
 * The Reader sandbox blocks HTML5 DnD, so we track drag state explicitly
 * from mousedown through mouseup and render a custom ghost element.
 */

export interface DragState {
  tabId: string;
  itemId: number;
  sourceCategoryId: string | undefined;
  startX: number;
  startY: number;
  ghost: HTMLElement | null;
  moved: boolean;
}

const GHOST_OFFSET_X = 10;
const GHOST_OFFSET_Y = 10;
const DRAG_THRESHOLD = 5;

export function createDragState(
  sourceRow: HTMLElement,
  startX: number,
  startY: number,
): DragState | null {
  const tabId = sourceRow.dataset.tabId;
  const itemIdRaw = sourceRow.dataset.itemId;
  if (!tabId || !itemIdRaw) return null;

  const itemId = Number(itemIdRaw);
  if (!Number.isFinite(itemId)) return null;

  return {
    tabId,
    itemId,
    sourceCategoryId: sourceRow.dataset.categoryId,
    startX,
    startY,
    ghost: null,
    moved: false,
  };
}

export function shouldStartDrag(
  state: DragState,
  currentX: number,
  currentY: number,
): boolean {
  return (
    Math.abs(currentX - state.startX) >= DRAG_THRESHOLD ||
    Math.abs(currentY - state.startY) >= DRAG_THRESHOLD
  );
}

export function createGhostElement(
  doc: Document,
  sourceRow: HTMLElement,
): HTMLElement {
  const ghost = sourceRow.cloneNode(true) as HTMLElement;
  ghost.classList.add("vt-drag-ghost");
  ghost.style.cssText = `
    position: fixed;
    pointer-events: none;
    z-index: 100000;
    opacity: 0.8;
    width: ${sourceRow.offsetWidth}px;
  `;
  doc.documentElement?.appendChild(ghost);
  return ghost;
}

export function updateGhostPosition(
  ghost: HTMLElement,
  clientX: number,
  clientY: number,
): void {
  ghost.style.left = `${clientX + GHOST_OFFSET_X}px`;
  ghost.style.top = `${clientY + GHOST_OFFSET_Y}px`;
}

export function destroyDragState(state: DragState): void {
  if (state.ghost?.parentNode) {
    state.ghost.remove();
  }
  state.ghost = null;
}
