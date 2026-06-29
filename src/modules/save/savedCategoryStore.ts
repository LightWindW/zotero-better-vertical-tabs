import { config } from "../../../package.json";

const SAVED_CATEGORY_VERSION = 1;
const SAVED_CATEGORY_FILE_NAME = "BVT-saved-categories.json";

export interface SavedCategory {
  id: string;
  name: string;
  savedAt: number;
  itemIds: number[];
  color?: string;
  itemSnapshots?: {
    itemId: number;
    title: string;
    type?: string;
    data?: any;
    parentItemId?: number;
  }[];
}

export interface SavedCategoryCollection {
  version: number;
  categories: SavedCategory[];
}

function getSavedCategoryFilePath(): string {
  const storageDir = Zotero.getStorageDirectory();
  return PathUtils.join(storageDir.path, SAVED_CATEGORY_FILE_NAME);
}

function createDefaultCollection(): SavedCategoryCollection {
  return {
    version: SAVED_CATEGORY_VERSION,
    categories: [],
  };
}

export async function loadSavedCategories(): Promise<SavedCategoryCollection> {
  const path = getSavedCategoryFilePath();
  try {
    if (!(await IOUtils.exists(path))) {
      return createDefaultCollection();
    }
    const raw = await IOUtils.readUTF8(path);
    const parsed = JSON.parse(raw) as SavedCategoryCollection;
    if (!parsed || typeof parsed !== "object") {
      return createDefaultCollection();
    }

    const categories: SavedCategory[] = Array.isArray(parsed.categories)
      ? parsed.categories.map((cat: any) => ({
          id: cat.id,
          name: cat.name,
          savedAt: cat.savedAt ?? Date.now(),
          itemIds: Array.isArray(cat.itemIds) ? cat.itemIds : [],
          color: cat.color || undefined,
          itemSnapshots: Array.isArray(cat.itemSnapshots)
            ? cat.itemSnapshots.map((snap: any) => ({
                itemId: snap.itemId,
                title: snap.title,
                type: snap.type,
                data: snap.data,
                parentItemId: snap.parentItemId,
              }))
            : undefined,
        }))
      : [];

    return {
      version: parsed.version ?? SAVED_CATEGORY_VERSION,
      categories,
    };
  } catch (error) {
    ztoolkit.log("Failed to load saved categories:", error);
    return createDefaultCollection();
  }
}

export async function saveSavedCategories(
  collection: SavedCategoryCollection,
): Promise<void> {
  const path = getSavedCategoryFilePath();
  try {
    await IOUtils.writeUTF8(path, JSON.stringify(collection, null, 2));
  } catch (error) {
    ztoolkit.log("Failed to save saved categories:", error);
  }
}

export function addSavedCategory(
  collection: SavedCategoryCollection,
  category: Omit<SavedCategory, "id" | "savedAt">,
): SavedCategoryCollection {
  const savedCategory: SavedCategory = {
    ...category,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    savedAt: Date.now(),
  };
  return {
    ...collection,
    categories: [...collection.categories, savedCategory],
  };
}

export function renameSavedCategory(
  collection: SavedCategoryCollection,
  savedCategoryId: string,
  newName: string,
): SavedCategoryCollection {
  return {
    ...collection,
    categories: collection.categories.map((cat) =>
      cat.id === savedCategoryId
        ? { ...cat, name: newName.trim(), savedAt: Date.now() }
        : cat,
    ),
  };
}

export function deleteSavedCategory(
  collection: SavedCategoryCollection,
  savedCategoryId: string,
): SavedCategoryCollection {
  return {
    ...collection,
    categories: collection.categories.filter(
      (cat) => cat.id !== savedCategoryId,
    ),
  };
}

export function findSavedCategoryByName(
  collection: SavedCategoryCollection,
  name: string,
): SavedCategory | undefined {
  return collection.categories.find(
    (cat) => cat.name.toLowerCase() === name.trim().toLowerCase(),
  );
}

export function findSavedCategoryById(
  collection: SavedCategoryCollection,
  savedCategoryId: string,
): SavedCategory | undefined {
  return collection.categories.find((cat) => cat.id === savedCategoryId);
}
