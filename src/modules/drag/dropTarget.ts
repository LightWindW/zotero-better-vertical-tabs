/**
 * Drop target computation for vertical tabs drag-and-drop.
 *
 * This module is environment-agnostic: it only operates on a Document and
 * coordinates, so it can be used by both the main window (HTML5 DnD) and the
 * PDF Reader sandbox (manual mouse drag).
 */

export type DropTargetType =
  | "category"
  | "item-before"
  | "item-after"
  | "drop-zone"
  | "none";

export interface DropTargetCategory {
  type: "category";
  categoryId: string;
}

export interface DropTargetItem {
  type: "item-before" | "item-after";
  categoryId: string | "__uncategorized__";
  targetTabId: string;
}

export interface DropTargetDropZone {
  type: "drop-zone";
  targetTabId?: string;
  before?: boolean;
}

export interface DropTargetNone {
  type: "none";
}

export type DropTarget =
  | DropTargetCategory
  | DropTargetItem
  | DropTargetDropZone
  | DropTargetNone;

const UNCATEGORIZED = "__uncategorized__";

function getItemCategoryId(itemEl: HTMLElement): string | "__uncategorized__" {
  const categoryEl = itemEl.closest(
    ".vertical-tabs-category",
  ) as HTMLElement | null;
  if (categoryEl?.dataset.categoryId) {
    return categoryEl.dataset.categoryId;
  }
  const inDropZone = itemEl.closest(".vertical-tabs-drop-zone") !== null;
  if (inDropZone) {
    return UNCATEGORIZED;
  }
  return UNCATEGORIZED;
}

/**
 * Determine the current drop target for a drag at the given coordinates.
 *
 * Search order:
 * 1. Item under cursor -> item-before / item-after (excluding the dragged item itself)
 * 2. Category under cursor -> category
 * 3. Drop-zone under cursor -> drop-zone
 * 4. None
 */
export function computeDropTarget(
  doc: Document,
  clientX: number,
  clientY: number,
  draggedTabId: string,
): DropTarget {
  const el = doc.elementFromPoint(clientX, clientY) as HTMLElement | null;
  if (!el) return { type: "none" };

  // 1. Item target (highest priority)
  const itemEl = el.closest(".vertical-tabs-item") as HTMLElement | null;
  if (itemEl) {
    const targetTabId = itemEl.dataset.tabId;
    if (targetTabId && targetTabId !== draggedTabId) {
      const rect = itemEl.getBoundingClientRect();
      const before = clientY < rect.top + rect.height / 2;
      return {
        type: before ? "item-before" : "item-after",
        categoryId: getItemCategoryId(itemEl),
        targetTabId,
      };
    }
  }

  // 2. Category target
  const categoryEl = el.closest(
    ".vertical-tabs-category",
  ) as HTMLElement | null;
  if (categoryEl?.dataset.categoryId) {
    return { type: "category", categoryId: categoryEl.dataset.categoryId };
  }

  // 3. Drop-zone target (background, not an item)
  const dropZoneEl = el.closest(
    ".vertical-tabs-drop-zone",
  ) as HTMLElement | null;
  if (dropZoneEl) {
    return { type: "drop-zone" };
  }

  return { type: "none" };
}

/**
 * Remove all drag visual feedback classes from the document.
 */
export function clearAllDropVisuals(doc: Document): void {
  doc
    .querySelectorAll(
      ".vertical-tabs-category.drag-over, .vertical-tabs-drop-zone.drag-over",
    )
    .forEach((el: Element) => el.classList.remove("drag-over"));
  doc
    .querySelectorAll(
      ".vertical-tabs-item.drop-before, .vertical-tabs-item.drop-after",
    )
    .forEach((el: Element) => el.classList.remove("drop-before", "drop-after"));
}

/**
 * Apply drag visual feedback classes based on the current drop target.
 */
export function applyDropVisuals(doc: Document, target: DropTarget): void {
  switch (target.type) {
    case "category": {
      const cat = doc.querySelector(
        `.vertical-tabs-category[data-category-id="${CSS.escape(target.categoryId)}"]`,
      );
      cat?.classList.add("drag-over");
      break;
    }
    case "item-before":
    case "item-after": {
      const item = doc.querySelector(
        `.vertical-tabs-item[data-tab-id="${CSS.escape(target.targetTabId)}"]`,
      );
      item?.classList.add(
        target.type === "item-before" ? "drop-before" : "drop-after",
      );
      break;
    }
    case "drop-zone": {
      const dz = doc.querySelector(".vertical-tabs-drop-zone");
      dz?.classList.add("drag-over");
      if (target.targetTabId !== undefined && target.before !== undefined) {
        const item = doc.querySelector(
          `.vertical-tabs-item[data-tab-id="${CSS.escape(target.targetTabId)}"]`,
        );
        item?.classList.add(target.before ? "drop-before" : "drop-after");
      }
      break;
    }
    case "none":
      break;
  }
}

/**
 * Compare two drop targets for equality.
 */
export function dropTargetsEqual(a: DropTarget, b: DropTarget): boolean {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case "category":
      return (b as DropTargetCategory).categoryId === a.categoryId;
    case "item-before":
    case "item-after":
      return (
        (b as DropTargetItem).targetTabId === a.targetTabId &&
        (b as DropTargetItem).categoryId === a.categoryId
      );
    case "drop-zone":
      return (
        (b as DropTargetDropZone).targetTabId === a.targetTabId &&
        (b as DropTargetDropZone).before === a.before
      );
    case "none":
      return true;
  }
}
