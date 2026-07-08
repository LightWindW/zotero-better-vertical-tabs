import { config } from "../../../package.json";

const DATA_VERSION = 3;
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

export interface VerticalTabsData {
  version: number;
  categories: Category[];
  uncategorizedOrder: string[]; // tabIds for uncategorized items order
  uncategorizedItemIds: number[]; // parallel itemIds for restart restore
}

function getDataFilePath(): string {
  const storageDir = Zotero.getStorageDirectory();
  return PathUtils.join(storageDir.path, DATA_FILE_NAME);
}

function createDefaultData(): VerticalTabsData {
  return {
    version: DATA_VERSION,
    categories: [],
    uncategorizedOrder: [],
    uncategorizedItemIds: [],
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
    // Migrate old data: drop empty tabId slots and any trackedItems residue.
    const categories: Category[] = Array.isArray(parsed.categories)
      ? parsed.categories.map((cat: any) => {
          const rawItemIds: number[] = Array.isArray(cat.itemIds)
            ? cat.itemIds
            : [];
          const rawTabIds: string[] = Array.isArray(cat.tabIds)
            ? cat.tabIds
            : [];
          const itemIds: number[] = [];
          const tabIds: string[] = [];
          const len = Math.min(rawItemIds.length, rawTabIds.length);
          for (let i = 0; i < len; i++) {
            if (rawTabIds[i]) {
              itemIds.push(rawItemIds[i]);
              tabIds.push(rawTabIds[i]);
            }
          }
          return {
            id: cat.id,
            name: cat.name,
            order: cat.order ?? 0,
            itemIds,
            tabIds,
            color: cat.color || undefined,
            collapsed: cat.collapsed ?? false,
          };
        })
      : [];

    const rawUncategorizedOrder = Array.isArray(parsed.uncategorizedOrder)
      ? parsed.uncategorizedOrder.filter((id: any) => id)
      : [];

    return {
      version: DATA_VERSION,
      categories,
      uncategorizedOrder: rawUncategorizedOrder,
      uncategorizedItemIds: Array.isArray(parsed.uncategorizedItemIds)
        ? parsed.uncategorizedItemIds.slice(0, rawUncategorizedOrder.length)
        : rawUncategorizedOrder.map(() => 0),
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
  if (tabId) {
    // Tab-specific move: only remove the pair matching this tabId from other
    // categories. The target category also drops any existing pair with the
    // same tabId before appending, which handles within-category reorder.
    const categories = data.categories.map((category) => {
      const keptItemIds: number[] = [];
      const keptTabIds: string[] = [];
      for (let i = 0; i < category.tabIds.length; i++) {
        if (category.tabIds[i] !== tabId) {
          keptItemIds.push(category.itemIds[i]);
          keptTabIds.push(category.tabIds[i]);
        }
      }
      if (category.id === categoryId) {
        return {
          ...category,
          itemIds: [...keptItemIds, itemId],
          tabIds: [...keptTabIds, tabId],
        };
      }
      return { ...category, itemIds: keptItemIds, tabIds: keptTabIds };
    });
    return { ...data, categories };
  }

  // Item-level assignment without a tabId is no longer supported: categories
  // only track currently open tabs, so every assignment must identify a real
  // tab. Log a warning and leave the data unchanged.
  ztoolkit.log(
    "[vt-dataStore] assignItemToCategory called without tabId for itemId:",
    itemId,
  );
  return data;
}

export function removeItemFromAllCategories(
  data: VerticalTabsData,
  itemId: number,
  tabId?: string,
): VerticalTabsData {
  if (tabId) {
    // Tab-specific removal: only drop the pair matching this tabId.
    return {
      ...data,
      categories: data.categories.map((category) => {
        const keptItemIds: number[] = [];
        const keptTabIds: string[] = [];
        for (let i = 0; i < category.tabIds.length; i++) {
          if (category.tabIds[i] !== tabId) {
            keptItemIds.push(category.itemIds[i]);
            keptTabIds.push(category.tabIds[i]);
          }
        }
        return { ...category, itemIds: keptItemIds, tabIds: keptTabIds };
      }),
    };
  }

  // Item-level removal: drop all pairs for this itemId.
  return {
    ...data,
    categories: data.categories.map((category) => {
      const indicesToRemove = new Set<number>();
      for (let i = 0; i < category.itemIds.length; i++) {
        if (category.itemIds[i] === itemId) {
          indicesToRemove.add(i);
        }
      }
      return {
        ...category,
        itemIds: category.itemIds.filter((_, i) => !indicesToRemove.has(i)),
        tabIds: category.tabIds.filter((_, i) => !indicesToRemove.has(i)),
      };
    }),
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
      const idx = category.tabIds.indexOf(tabId);
      if (idx < 0) return category;

      const pairItemId = category.itemIds[idx];
      const keptItemIds = category.itemIds.filter((_, i) => i !== idx);
      const keptTabIds = category.tabIds.filter((_, i) => i !== idx);

      let insertAt = keptTabIds.length;
      if (insertBeforeTabId) {
        const targetIdx = keptTabIds.indexOf(insertBeforeTabId);
        if (targetIdx >= 0) insertAt = targetIdx;
      }

      keptItemIds.splice(insertAt, 0, pairItemId);
      keptTabIds.splice(insertAt, 0, tabId);
      return { ...category, itemIds: keptItemIds, tabIds: keptTabIds };
    }),
  };
}

export function reorderUncategorized(
  data: VerticalTabsData,
  tabId: string,
  itemId: number,
  insertBeforeTabId: string | null,
): VerticalTabsData {
  const order = data.uncategorizedOrder.filter((id) => id !== tabId);
  const itemIds = data.uncategorizedItemIds.filter(
    (_, i) => data.uncategorizedOrder[i] !== tabId,
  );
  const idx = insertBeforeTabId
    ? order.indexOf(insertBeforeTabId)
    : order.length;
  const insertAt = idx >= 0 ? idx : order.length;
  order.splice(insertAt, 0, tabId);
  itemIds.splice(insertAt, 0, itemId);
  return { ...data, uncategorizedOrder: order, uncategorizedItemIds: itemIds };
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
  const tabIdsToMove = new Set(entries.map((e) => e.tabId));

  const cleanCategories = data.categories.map((category) => {
    // Remove any existing pair whose tabId is being inserted, keeping the two
    // arrays parallel. itemId-level deduplication is intentionally not done so
    // that multiple tabs for the same item can coexist independently.
    const keptItemIds: number[] = [];
    const keptTabIds: string[] = [];
    for (let i = 0; i < category.tabIds.length; i++) {
      const itemId = category.itemIds[i];
      const tabId = category.tabIds[i];
      if (!tabIdsToMove.has(tabId)) {
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
  const keptUncategorizedIndices = data.uncategorizedOrder
    .map((id, i) => ({ id, i }))
    .filter(({ id }) => !movedTabIdSet.has(id));
  const newUncategorizedOrder = keptUncategorizedIndices.map(({ id }) => id);
  const newUncategorizedItemIds = keptUncategorizedIndices.map(
    ({ i }) => data.uncategorizedItemIds[i] ?? 0,
  );

  return {
    ...data,
    categories: cleanCategories,
    uncategorizedOrder: newUncategorizedOrder,
    uncategorizedItemIds: newUncategorizedItemIds,
  };
}

/**
 * Insert a contiguous block of items into the uncategorized list at a specific
 * position. Items are first removed from all categories by tabId only, so
 * multiple tabs for the same item remain independent.
 */
export function insertUncategorizedItemsAt(
  data: VerticalTabsData,
  entries: ItemTabEntry[],
  insertBeforeTabId?: string | null,
): VerticalTabsData {
  const tabIdsToMove = new Set(entries.map((e) => e.tabId));

  const newCategories = data.categories.map((category) => ({
    ...category,
    itemIds: category.itemIds.filter(
      (_, i) => !tabIdsToMove.has(category.tabIds[i]),
    ),
    tabIds: category.tabIds.filter((id) => !tabIdsToMove.has(id)),
  }));

  const keptUncategorizedIndices = data.uncategorizedOrder
    .map((id, i) => ({ id, i }))
    .filter(({ id }) => !tabIdsToMove.has(id));
  const order = keptUncategorizedIndices.map(({ id }) => id);
  const itemIds = keptUncategorizedIndices.map(
    ({ i }) => data.uncategorizedItemIds[i] ?? 0,
  );
  let insertAt = order.length;
  if (insertBeforeTabId) {
    const idx = order.indexOf(insertBeforeTabId);
    if (idx >= 0) insertAt = idx;
  }

  const insertedTabIds = entries.map((e) => e.tabId);
  const insertedItemIds = entries.map((e) => e.itemId);
  order.splice(insertAt, 0, ...insertedTabIds);
  itemIds.splice(insertAt, 0, ...insertedItemIds);

  return {
    ...data,
    categories: newCategories,
    uncategorizedOrder: order,
    uncategorizedItemIds: itemIds,
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
 * Remove closed or empty tabIds from categories and uncategorizedOrder.
 * Since categories only track currently open tabs, closed tabId/itemId pairs
 * are removed entirely instead of being replaced with empty strings.
 */
export function cleanStaleTabIds(
  data: VerticalTabsData,
  liveTabIds: Set<string>,
): VerticalTabsData {
  return {
    ...data,
    categories: data.categories.map((category) => {
      const keptItemIds: number[] = [];
      const keptTabIds: string[] = [];
      for (let i = 0; i < category.tabIds.length; i++) {
        const tabId = category.tabIds[i];
        if (tabId && liveTabIds.has(tabId)) {
          keptItemIds.push(category.itemIds[i]);
          keptTabIds.push(tabId);
        }
      }
      return { ...category, itemIds: keptItemIds, tabIds: keptTabIds };
    }),
    uncategorizedOrder: data.uncategorizedOrder.filter(
      (id) => id && liveTabIds.has(id),
    ),
    uncategorizedItemIds: data.uncategorizedItemIds.filter((_, i) => {
      const id = data.uncategorizedOrder[i];
      return id && liveTabIds.has(id);
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
  liveEntries: ItemTabEntry[],
): VerticalTabsData {
  const existing = new Set(data.uncategorizedOrder);
  const appended: ItemTabEntry[] = [];
  for (const entry of liveEntries) {
    if (!existing.has(entry.tabId)) {
      appended.push(entry);
    }
  }
  if (appended.length === 0) return data;
  return {
    ...data,
    uncategorizedOrder: [
      ...data.uncategorizedOrder,
      ...appended.map((e) => e.tabId),
    ],
    uncategorizedItemIds: [
      ...data.uncategorizedItemIds,
      ...appended.map((e) => e.itemId),
    ],
  };
}

/**
 * Restore category/uncategorized tabIds after a Zotero restart.
 *
 * Zotero may assign new tabIds on session restore, so the JSON records need to
 * be matched by itemId. For each stale (closed/non-live) tabId we look for a
 * currently open tab with the same itemId that has not already been consumed by
 * another restored slot; if found we replace the tabId, otherwise we drop the
 * pair. Live tabIds that are already in the data are kept as-is.
 *
 * This is intentionally run only once at startup. Tabs opened after startup are
 * marked as new and are never restored by this function.
 */
export function restoreCategoryTabIdsAndOrder(
  data: VerticalTabsData,
  liveEntries: ItemTabEntry[],
): VerticalTabsData {
  const liveTabIds = new Set(liveEntries.map((e) => e.tabId));
  const liveTabIdsByItemId = new Map<number, string[]>();
  for (const { itemId, tabId } of liveEntries) {
    const list = liveTabIdsByItemId.get(itemId);
    if (list) {
      list.push(tabId);
    } else {
      liveTabIdsByItemId.set(itemId, [tabId]);
    }
  }

  // Live tabIds already present in the data are reserved and should not be
  // re-assigned to another restored slot.
  const consumedLiveTabIds = new Set<string>();
  for (const category of data.categories) {
    for (const tabId of category.tabIds) {
      if (liveTabIds.has(tabId)) {
        consumedLiveTabIds.add(tabId);
      }
    }
  }

  let categoriesChanged = false;
  const newCategories = data.categories.map((category) => {
    const newItemIds: number[] = [];
    const newTabIds: string[] = [];
    for (let i = 0; i < category.tabIds.length; i++) {
      const itemId = category.itemIds[i];
      const tabId = category.tabIds[i];
      if (liveTabIds.has(tabId)) {
        newItemIds.push(itemId);
        newTabIds.push(tabId);
        continue;
      }
      const replacement = findReplacementTabId(
        itemId,
        liveTabIdsByItemId,
        consumedLiveTabIds,
      );
      if (replacement) {
        newItemIds.push(itemId);
        newTabIds.push(replacement);
        consumedLiveTabIds.add(replacement);
        categoriesChanged = true;
      } else {
        categoriesChanged = true;
      }
    }
    if (
      newItemIds.length !== category.itemIds.length ||
      newTabIds.length !== category.tabIds.length
    ) {
      categoriesChanged = true;
    }
    return { ...category, itemIds: newItemIds, tabIds: newTabIds };
  });

  // Restore uncategorized order the same way.
  const newUncategorizedOrder: string[] = [];
  const newUncategorizedItemIds: number[] = [];
  let uncategorizedChanged = false;
  for (let i = 0; i < data.uncategorizedOrder.length; i++) {
    const tabId = data.uncategorizedOrder[i];
    let itemId = data.uncategorizedItemIds[i];
    if (!itemId) {
      // Old data may not have recorded itemIds for uncategorized tabs; try to
      // recover from the current live entries.
      const liveEntry = liveEntries.find((e) => e.tabId === tabId);
      if (liveEntry) itemId = liveEntry.itemId;
    }

    if (liveTabIds.has(tabId)) {
      newUncategorizedOrder.push(tabId);
      newUncategorizedItemIds.push(itemId);
      continue;
    }
    const replacement = itemId
      ? findReplacementTabId(itemId, liveTabIdsByItemId, consumedLiveTabIds)
      : undefined;
    if (replacement) {
      newUncategorizedOrder.push(replacement);
      newUncategorizedItemIds.push(itemId);
      consumedLiveTabIds.add(replacement);
      uncategorizedChanged = true;
    } else {
      uncategorizedChanged = true;
    }
  }

  if (!categoriesChanged && !uncategorizedChanged) return data;
  return {
    ...data,
    categories: newCategories,
    uncategorizedOrder: newUncategorizedOrder,
    uncategorizedItemIds: newUncategorizedItemIds,
  };
}

function findReplacementTabId(
  itemId: number,
  liveTabIdsByItemId: Map<number, string[]>,
  consumedLiveTabIds: Set<string>,
): string | undefined {
  const candidates = liveTabIdsByItemId.get(itemId);
  if (!candidates) return undefined;
  for (const tabId of candidates) {
    if (!consumedLiveTabIds.has(tabId)) {
      return tabId;
    }
  }
  return undefined;
}
