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
