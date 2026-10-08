/**
 * Per-item display-info cache.
 *
 * Computing a row's display fields walks the Zotero item object layer
 * (getField ×6, getCreators, getTags). That used to run for every row on
 * every render — the dominant cost of a full VT rebuild with many tabs open.
 * Item metadata changes rarely, so the results are cached per itemId and
 * invalidated by the item-modify notifier in itemTracker.
 */

export interface ItemInfo {
  title: string;
  authors: string;
  year: string;
  journal: string;
  university: string;
  extra: string;
  tags: string[];
}

/** Pure computation of a row's display fields from a Zotero item. */
export function computeItemInfo(item: Zotero.Item): ItemInfo {
  const title = (item.getField("title") as string) || "Untitled";

  const creators = item.getCreators();
  const authors = creators
    .slice(0, 3)
    .map((creator) => {
      if (creator.fieldMode === 1) return creator.lastName;
      return `${creator.lastName} ${creator.firstName}`.trim();
    })
    .join(", ");
  const authorsLabel = creators.length > 3 ? `${authors} et al.` : authors;

  const date = (item.getField("date") as string) || "";
  const yearMatch = date.match(/^(\d{4})(?:-(\d{2}))?/);
  const month = Number(yearMatch?.[2] || 0);
  const year = yearMatch
    ? month >= 1 && month <= 12
      ? `${yearMatch[1]}-${yearMatch[2]}`
      : yearMatch[1]
    : "";
  const journal =
    (item.getField("publicationTitle") as string) ||
    (item.getField("proceedingsTitle") as string) ||
    "";
  const university =
    (item.getField("university") as string) ||
    (item.getField("institution") as string) ||
    "";

  const tags = item.getTags().map((tag) => tag.tag);
  const extra = (item.getField("extra") as string) || "";

  return {
    title,
    authors: authorsLabel,
    year,
    journal,
    university,
    extra,
    tags,
  };
}

const _infoCache = new Map<number, ItemInfo>();

/** Cached variant of computeItemInfo, keyed by the item's id. */
export function getItemInfo(item: Zotero.Item): ItemInfo {
  const cached = _infoCache.get(item.id);
  if (cached) return cached;
  const info = computeItemInfo(item);
  _infoCache.set(item.id, info);
  return info;
}

export function invalidateItemInfo(itemId: number): void {
  _infoCache.delete(itemId);
}

export function clearItemInfoCache(): void {
  _infoCache.clear();
}

const _imageSrcCache = new Map<string, string>();

/**
 * Zotero.ItemTypes.getImageSrc is a pure function of the item type, so the
 * result is cached per type instead of being re-looked-up for every row.
 * Returns "" when the lookup fails (caller falls back to a letter badge).
 *
 * NOTE: the returned icons are theme-aware, so the cache MUST be cleared on
 * dark/light switch (see setupCategoryDarkMode) or rows keep showing the
 * previous theme's icons.
 */
export function getItemTypeImageSrc(itemType: string): string {
  const cached = _imageSrcCache.get(itemType);
  if (cached !== undefined) return cached;
  let src = "";
  try {
    src =
      (Zotero.ItemTypes.getImageSrc(
        itemType as Parameters<typeof Zotero.ItemTypes.getImageSrc>[0],
      ) as string | undefined) || "";
  } catch {
    src = "";
  }
  _imageSrcCache.set(itemType, src);
  return src;
}

/** Drop cached icon srcs (theme switch / teardown). */
export function clearItemTypeImageSrc(): void {
  _imageSrcCache.clear();
}
