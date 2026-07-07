import { config } from "../../../package.json";

const DATA_VERSION = 2;
const DATA_FILE_NAME = `BVT-vertical-tabs.json`;

export interface Category {
  id: string;
  name: string;
  order: number;
  itemIds: number[];
  tabIds: string[];
  color?: string;
  collapsed?: boolean;
}

export interface TrackedItemInfo {
  title: string;
  type: string;
  parentItemId?: number;
  parentItemType?: string;
  openedAt: number;
  vtPinned?: boolean;
}

export interface VerticalTabsData {
  version: number;
  categories: Category[];
  trackedItems: Record<number, TrackedItemInfo>;
  uncategorizedOrder: string[]; // tabIds for uncategorized items order
}

function getDataFilePath(): string {
  const storageDir = Zotero.getStorageDirectory();
  return PathUtils.join(storageDir.path, DATA_FILE_NAME);
}

function createDefaultData(): VerticalTabsData {
  return {
    version: DATA_VERSION,
    categories: [],
    trackedItems: {},
    uncategorizedOrder: [],
  };
}

export interface ItemSnapshot {
  itemId: number;
  title: string;
  type?: string;
  data?: any;
  parentItemId?: number;
}

export interface CategorySnapshot {
  name: string;
  itemIds: number[];
  color?: string;
  itemSnapshots?: ItemSnapshot[];
}

export function createCategorySnapshot(
  data: VerticalTabsData,
  categoryId: string,
  itemSnapshots?: ItemSnapshot[],
): CategorySnapshot | undefined {
  const category = data.categories.find((c) => c.id === categoryId);
  if (!category) return undefined;

  return {
    name: category.name,
    itemIds: [...category.itemIds],
    color: category.color,
    itemSnapshots,
  };
}

export function importCategoryFromSnapshot(
  data: VerticalTabsData,
  snapshot: CategorySnapshot,
  tabIds?: string[],
): VerticalTabsData {
  const newCategory: Category = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    name: snapshot.name,
    order: 0,
    itemIds: [...snapshot.itemIds],
    tabIds: tabIds ?? [],
    collapsed: false,
    color: snapshot.color,
  };

  return {
    ...data,
    categories: [
      newCategory,
      ...data.categories.map((c) => ({ ...c, order: c.order + 1 })),
    ],
  };
}

export async function loadData(): Promise<VerticalTabsData> {
  const path = getDataFilePath();
  try {
    if (!(await IOUtils.exists(path))) {
      return createDefaultData();
    }
    const raw = await IOUtils.readUTF8(path);
    const parsed = JSON.parse(raw) as VerticalTabsData;
    if (!parsed || typeof parsed !== "object") {
      return createDefaultData();
    }
    // Add tabIds to old categories that don't have them
    const categories: Category[] = Array.isArray(parsed.categories)
      ? parsed.categories.map((cat: any) => ({
          id: cat.id,
          name: cat.name,
          order: cat.order ?? 0,
          itemIds: Array.isArray(cat.itemIds) ? cat.itemIds : [],
          tabIds: Array.isArray(cat.tabIds) ? cat.tabIds : [],
          color: cat.color || undefined,
          collapsed: cat.collapsed ?? false,
        }))
      : [];

    return {
      version: parsed.version ?? DATA_VERSION,
      categories,
      trackedItems:
        parsed.trackedItems && typeof parsed.trackedItems === "object"
          ? (parsed.trackedItems as Record<number, TrackedItemInfo>)
          : {},
      uncategorizedOrder: Array.isArray(parsed.uncategorizedOrder)
        ? parsed.uncategorizedOrder
        : [],
    };
  } catch (error) {
    ztoolkit.log("Failed to load vertical tabs data:", error);
    return createDefaultData();
  }
}

export async function saveData(data: VerticalTabsData): Promise<void> {
  const path = getDataFilePath();
  try {
    await IOUtils.writeUTF8(path, JSON.stringify(data, null, 2));
  } catch (error) {
    ztoolkit.log("Failed to save vertical tabs data:", error);
  }
}

export function createCategory(data: VerticalTabsData, name: string): Category {
  const maxOrder = data.categories.reduce(
    (max, category) => Math.max(max, category.order),
    -1,
  );
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    name: name.trim(),
    order: maxOrder + 1,
    itemIds: [],
    tabIds: [],
    collapsed: false,
  };
}

export function addCategory(
  data: VerticalTabsData,
  name: string,
): VerticalTabsData {
  const category = createCategory(data, name);
  return {
    ...data,
    categories: [...data.categories, category],
  };
}

export function renameCategory(
  data: VerticalTabsData,
  categoryId: string,
  newName: string,
): VerticalTabsData {
  return {
    ...data,
    categories: data.categories.map((category) =>
      category.id === categoryId
        ? { ...category, name: newName.trim() }
        : category,
    ),
  };
}

export function deleteCategory(
  data: VerticalTabsData,
  categoryId: string,
): VerticalTabsData {
  return {
    ...data,
    categories: data.categories.filter(
      (category) => category.id !== categoryId,
    ),
  };
}

export function assignItemToCategory(
  data: VerticalTabsData,
  itemId: number,
  categoryId: string,
  tabId?: string,
): VerticalTabsData {
  // Collect tabIds to remove: current tabId + any tabIds from OTHER categories
  // where this itemId appears (stale duplicates from previous buggy drags).
  // We do NOT collect tabIds from the TARGET category — those belong to
  // other items and should be preserved.
  const staleTabIds = new Set<string>();
  if (tabId) staleTabIds.add(tabId);
  for (const cat of data.categories) {
    if (cat.id === categoryId) continue; // skip target
    if (cat.itemIds.includes(itemId)) {
      for (const tid of cat.tabIds) {
        staleTabIds.add(tid);
      }
    }
  }

  const categories = data.categories.map((category) => {
    // Remove itemId from all categories
    const withoutItem = category.itemIds.filter((id) => id !== itemId);
    // Remove ALL associated tabIds (stale + current)
    let withoutTab = category.tabIds;
    for (const tid of staleTabIds) {
      withoutTab = withoutTab.filter((id) => id !== tid);
    }
    if (tabId) {
      withoutTab = withoutTab.filter((id) => id !== tabId);
    }

    if (category.id === categoryId) {
      return {
        ...category,
        itemIds: [...withoutItem, itemId],
        tabIds: tabId ? [...withoutTab, tabId] : withoutTab,
      };
    }
    return { ...category, itemIds: withoutItem, tabIds: withoutTab };
  });
  return { ...data, categories };
}

export function removeItemFromAllCategories(
  data: VerticalTabsData,
  itemId: number,
  tabId?: string,
): VerticalTabsData {
  const staleTabIds = new Set<string>();
  if (tabId) staleTabIds.add(tabId);
  for (const cat of data.categories) {
    if (cat.itemIds.includes(itemId)) {
      for (const tid of cat.tabIds) {
        staleTabIds.add(tid);
      }
    }
  }

  return {
    ...data,
    categories: data.categories.map((category) => ({
      ...category,
      itemIds: category.itemIds.filter((id) => id !== itemId),
      tabIds: (() => {
        let filtered = category.tabIds;
        for (const tid of staleTabIds) {
          filtered = filtered.filter((id) => id !== tid);
        }
        if (tabId) {
          filtered = filtered.filter((id) => id !== tabId);
        }
        return filtered;
      })(),
    })),
  };
}

export function getCategoryById(
  data: VerticalTabsData,
  categoryId: string,
): Category | undefined {
  return data.categories.find((category) => category.id === categoryId);
}

export function getItemCategoryId(
  data: VerticalTabsData,
  itemId: number,
): string | undefined {
  return data.categories.find((category) => category.itemIds.includes(itemId))
    ?.id;
}

export function sortCategories(data: VerticalTabsData): Category[] {
  return [...data.categories].sort((a, b) => a.order - b.order);
}

export function reorderItemInCategory(
  data: VerticalTabsData,
  categoryId: string,
  tabId: string,
  insertBeforeTabId: string | null, // null = move to end
): VerticalTabsData {
  return {
    ...data,
    categories: data.categories.map((category) => {
      if (category.id !== categoryId) return category;
      const tabIds = category.tabIds.filter((id) => id !== tabId);
      const idx = insertBeforeTabId
        ? tabIds.indexOf(insertBeforeTabId)
        : tabIds.length;
      const insertAt = idx >= 0 ? idx : tabIds.length;
      tabIds.splice(insertAt, 0, tabId);
      return { ...category, tabIds };
    }),
  };
}

export function reorderUncategorized(
  data: VerticalTabsData,
  tabId: string,
  insertBeforeTabId: string | null,
): VerticalTabsData {
  const order = data.uncategorizedOrder.filter((id) => id !== tabId);
  const idx = insertBeforeTabId
    ? order.indexOf(insertBeforeTabId)
    : order.length;
  const insertAt = idx >= 0 ? idx : order.length;
  order.splice(insertAt, 0, tabId);
  return { ...data, uncategorizedOrder: order };
}

export interface ItemTabEntry {
  itemId: number;
  tabId: string;
}

/**
 * Insert a contiguous block of items into a category at a specific position.
 * Items are first removed from all other categories and from the uncategorized
 * list, then inserted at the computed index in the target category.
 */
export function insertItemsIntoCategoryAt(
  data: VerticalTabsData,
  categoryId: string,
  entries: ItemTabEntry[],
  insertBeforeTabId?: string | null,
): VerticalTabsData {
  const itemIdsToMove = new Set(entries.map((e) => e.itemId));
  const tabIdsToMove = new Set(entries.map((e) => e.tabId));

  const cleanCategories = data.categories.map((category) => {
    // Remove any existing pairs whose itemId or tabId is being moved, keeping
    // the two arrays parallel.
    const keptItemIds: number[] = [];
    const keptTabIds: string[] = [];
    for (let i = 0; i < category.tabIds.length; i++) {
      const itemId = category.itemIds[i];
      const tabId = category.tabIds[i];
      if (!itemIdsToMove.has(itemId) && !tabIdsToMove.has(tabId)) {
        keptItemIds.push(itemId);
        keptTabIds.push(tabId);
      }
    }

    if (category.id !== categoryId) {
      return { ...category, itemIds: keptItemIds, tabIds: keptTabIds };
    }

    let insertAt = keptTabIds.length;
    if (insertBeforeTabId) {
      const idx = keptTabIds.indexOf(insertBeforeTabId);
      if (idx >= 0) insertAt = idx;
    }

    const insertedItemIds = entries.map((e) => e.itemId);
    const insertedTabIds = entries.map((e) => e.tabId);

    return {
      ...category,
      itemIds: [
        ...keptItemIds.slice(0, insertAt),
        ...insertedItemIds,
        ...keptItemIds.slice(insertAt),
      ],
      tabIds: [
        ...keptTabIds.slice(0, insertAt),
        ...insertedTabIds,
        ...keptTabIds.slice(insertAt),
      ],
    };
  });

  const movedTabIdSet = tabIdsToMove;
  const newUncategorizedOrder = data.uncategorizedOrder.filter(
    (id) => !movedTabIdSet.has(id),
  );

  return {
    ...data,
    categories: cleanCategories,
    uncategorizedOrder: newUncategorizedOrder,
  };
}

/**
 * Insert a contiguous block of items into the uncategorized list at a specific
 * position. Items are first removed from all categories.
 */
export function insertUncategorizedItemsAt(
  data: VerticalTabsData,
  entries: ItemTabEntry[],
  insertBeforeTabId?: string | null,
): VerticalTabsData {
  const itemIdsToMove = new Set(entries.map((e) => e.itemId));
  const tabIdsToMove = new Set(entries.map((e) => e.tabId));

  const newCategories = data.categories.map((category) => ({
    ...category,
    itemIds: category.itemIds.filter((id) => !itemIdsToMove.has(id)),
    tabIds: category.tabIds.filter((id) => !tabIdsToMove.has(id)),
  }));

  const order = data.uncategorizedOrder.filter((id) => !tabIdsToMove.has(id));
  let insertAt = order.length;
  if (insertBeforeTabId) {
    const idx = order.indexOf(insertBeforeTabId);
    if (idx >= 0) insertAt = idx;
  }

  const insertedTabIds = entries.map((e) => e.tabId);
  order.splice(insertAt, 0, ...insertedTabIds);

  return {
    ...data,
    categories: newCategories,
    uncategorizedOrder: order,
  };
}

export function reorderCategories(
  data: VerticalTabsData,
  categoryId: string,
  insertBeforeCategoryId: string | null,
): VerticalTabsData {
  const categories = [...data.categories];
  const idx = categories.findIndex((c) => c.id === categoryId);
  if (idx < 0) return data;
  const [moved] = categories.splice(idx, 1);

  let insertAt: number;
  if (insertBeforeCategoryId) {
    insertAt = categories.findIndex((c) => c.id === insertBeforeCategoryId);
    if (insertAt < 0) insertAt = categories.length;
  } else {
    insertAt = categories.length;
  }

  categories.splice(insertAt, 0, moved);

  return {
    ...data,
    categories: categories.map((c, i) => ({ ...c, order: i })),
  };
}

/**
 * Remove closed tabIds from the persisted order arrays.
 * - In categories, closed tabIds are replaced with empty strings so that the
 *   paired itemId (category assignment) is preserved for restart restore.
 * - In uncategorizedOrder, closed tabIds are removed entirely.
 */
export function cleanStaleTabIds(
  data: VerticalTabsData,
  liveTabIds: Set<string>,
): VerticalTabsData {
  return {
    ...data,
    categories: data.categories.map((category) => ({
      ...category,
      tabIds: category.tabIds.map((tabId) =>
        tabId && !liveTabIds.has(tabId) ? "" : tabId,
      ),
    })),
    uncategorizedOrder: data.uncategorizedOrder.filter((id) =>
      liveTabIds.has(id),
    ),
  };
}

/**
 * Move live (non-empty) tabId/itemId pairs to the front of a category and
 * dormant (empty) pairs to the back. This keeps insertion indices computed
 * from tabIds aligned with the visible VT order.
 */
export function compactCategoryTabIds(
  data: VerticalTabsData,
  categoryId: string,
): VerticalTabsData {
  return {
    ...data,
    categories: data.categories.map((category) => {
      if (category.id !== categoryId) return category;

      const live: { itemId: number; tabId: string }[] = [];
      const dormant: { itemId: number; tabId: string }[] = [];

      for (let i = 0; i < category.tabIds.length; i++) {
        const itemId = category.itemIds[i];
        const tabId = category.tabIds[i];
        if (tabId) {
          live.push({ itemId, tabId });
        } else {
          dormant.push({ itemId, tabId });
        }
      }

      const combined = [...live, ...dormant];
      return {
        ...category,
        itemIds: combined.map((e) => e.itemId),
        tabIds: combined.map((e) => e.tabId),
      };
    }),
  };
}

/**
 * Make sure all currently open uncategorized tabs are represented in
 * uncategorizedOrder, preserving the existing relative order and appending any
 * missing tabs at the end.
 */
export function reconcileUncategorizedOrder(
  data: VerticalTabsData,
  liveUncategorizedTabIds: string[],
): VerticalTabsData {
  const existing = new Set(data.uncategorizedOrder);
  const appended: string[] = [];
  for (const tabId of liveUncategorizedTabIds) {
    if (!existing.has(tabId)) {
      appended.push(tabId);
    }
  }
  if (appended.length === 0) return data;
  return {
    ...data,
    uncategorizedOrder: [...data.uncategorizedOrder, ...appended],
  };
}

export function saveTrackedItem(
  data: VerticalTabsData,
  itemId: number,
  info: TrackedItemInfo,
): VerticalTabsData {
  return {
    ...data,
    trackedItems: { ...data.trackedItems, [itemId]: info },
  };
}

export function removeTrackedItem(
  data: VerticalTabsData,
  itemId: number,
): VerticalTabsData {
  const { [itemId]: _, ...rest } = data.trackedItems;
  return { ...data, trackedItems: rest };
}
