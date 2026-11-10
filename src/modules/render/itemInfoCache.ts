/**
 * Per-item display-info cache.
 *
 * Computing a row's display fields walks the Zotero item object layer
 * (getField ×N, getCreators, getTags). That used to run for every row on
 * every render — the dominant cost of a full VT rebuild with many tabs open.
 * Item metadata changes rarely, so the results are cached per itemId and
 * invalidated by the item-modify notifier in itemTracker.
 *
 * 自定义标签副标题（verticalTabs.subtitleFields）所需的字段也在这里一次算好，
 * 缓存复用；既有字段（authors / year / journal / university）的语义保持不变，
 * 悬浮卡与搜索的显示不受影响。
 */

export interface ItemInfo {
  title: string;
  authors: string;
  /** 既有语义：YYYY，日期含月份时是 YYYY-MM（悬浮卡用）。 */
  year: string;
  journal: string;
  university: string;
  extra: string;
  tags: string[];
  /** 副标题字段：第一作者姓氏（双栏=lastName；单栏按中/外文规则推断，见 getCreatorFamilyName）。 */
  firstAuthorLastName: string;
  /** 副标题字段：第一作者（族名在前，与 authors 的格式一致）。 */
  firstAuthor: string;
  /** 副标题字段：全部作者（不截断、不加 et al.）。 */
  allAuthors: string;
  /**
   * 副标题字段：期刊名。
   * 期刊 → publicationTitle；会议论文 → 会议名（回落到论文集名）；
   * 学位论文 → 大学名。
   */
  venue: string;
  /** 副标题字段：刊名简称，为空时回落到 venue（完整刊名）。 */
  journalShort: string;
  /** 副标题字段：短标题。 */
  shortTitle: string;
  /** 副标题字段：date 字段的原始字符串。 */
  dateRaw: string;
  /** 副标题字段：纯 4 位年份（区别于既有 year 的 YYYY-MM）。 */
  yearOnly: string;
}

/** 空字段模板：缓存未命中 / 条目不可用时的统一回落。 */
export function createEmptyItemInfo(title = ""): ItemInfo {
  return {
    title,
    authors: "",
    year: "",
    journal: "",
    university: "",
    extra: "",
    tags: [],
    firstAuthorLastName: "",
    firstAuthor: "",
    allAuthors: "",
    venue: "",
    journalShort: "",
    shortTitle: "",
    dateRaw: "",
    yearOnly: "",
  };
}

/** 单个 creator 的显示名：单字段模式（fieldMode=1）下 lastName 即完整姓名。 */
function formatCreatorName(creator: {
  lastName: string;
  firstName: string;
  fieldMode?: number;
}): string {
  if (creator.fieldMode === 1) return creator.lastName;
  return `${creator.lastName} ${creator.firstName}`.trim();
}

/** 中日韩汉字（基本区 + 扩展 A/F 区），用于区分「中文名」和「外文名」。 */
const CJK_RE = /[\u3400-\u9FFF\uF900-\uFAFF]/;

/**
 * 取 creator 的「姓」。
 *
 * Zotero 作者有两种输入模式：
 * - 双栏（firstName + lastName，fieldMode=0）：`lastName` 就是姓；
 * - 单栏（fieldMode=1，完整姓名都存在 `lastName`）：需要从整串推断——
 *   - 中文/日韩汉字名：默认**第一个字**是姓（有空格时取第一段，如「山田 太郎」→ 山田）；
 *   - 外文名：默认**最后一个空格分隔词**是姓（如「John Smith」→ Smith）；
 *     兼容「Last, First」写法（取逗号前）。
 */
export function getCreatorFamilyName(creator: {
  lastName: string;
  firstName: string;
  fieldMode?: number;
}): string {
  const lastName = (creator.lastName || "").trim();
  if (creator.fieldMode !== 1) return lastName;
  if (!lastName) return "";
  const tokens = lastName.split(/\s+/).filter(Boolean);
  if (CJK_RE.test(lastName)) {
    return tokens.length > 1 ? tokens[0] : (Array.from(lastName)[0] ?? "");
  }
  if (lastName.includes(",")) {
    const beforeComma = lastName.split(",")[0].trim();
    if (beforeComma) return beforeComma;
  }
  return tokens.length ? tokens[tokens.length - 1] : "";
}

/** Pure computation of a row's display fields from a Zotero item. */
export function computeItemInfo(item: Zotero.Item): ItemInfo {
  const title = (item.getField("title") as string) || "Untitled";

  const creators = item.getCreators();
  const authors = creators
    .slice(0, 3)
    .map((creator) => formatCreatorName(creator))
    .join(", ");
  const authorsLabel = creators.length > 3 ? `${authors} et al.` : authors;

  const firstCreator = creators[0];
  const firstAuthorLastName = firstCreator
    ? getCreatorFamilyName(firstCreator)
    : "";
  const firstAuthor = firstCreator ? formatCreatorName(firstCreator) : "";
  const allAuthors = creators
    .map((creator) => formatCreatorName(creator))
    .join(", ");

  const date = (item.getField("date") as string) || "";
  const yearMatch = date.match(/^(\d{4})(?:-(\d{2}))?/);
  const month = Number(yearMatch?.[2] || 0);
  const year = yearMatch
    ? month >= 1 && month <= 12
      ? `${yearMatch[1]}-${yearMatch[2]}`
      : yearMatch[1]
    : "";
  const yearOnly = yearMatch ? yearMatch[1] : "";

  const publicationTitle = (item.getField("publicationTitle") as string) || "";
  const proceedingsTitle = (item.getField("proceedingsTitle") as string) || "";
  const universityField = (item.getField("university") as string) || "";
  const institution = (item.getField("institution") as string) || "";

  const journal = publicationTitle || proceedingsTitle;
  const university = universityField || institution;

  // 期刊名标签：会议论文显示会议名称、学位论文显示大学名称（注释 1）。
  const itemType = item.itemType;
  const venue =
    itemType === "conferencePaper"
      ? (item.getField("conferenceName") as string) ||
        proceedingsTitle ||
        publicationTitle ||
        ""
      : itemType === "thesis"
        ? university
        : publicationTitle || proceedingsTitle || university || "";

  const journalAbbreviation =
    (item.getField("journalAbbreviation") as string) || "";
  // 刊名简称为空时回落到完整刊名（注释 2）。
  const journalShort = journalAbbreviation || venue;
  const shortTitle = (item.getField("shortTitle") as string) || "";

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
    firstAuthorLastName,
    firstAuthor,
    allAuthors,
    venue,
    journalShort,
    shortTitle,
    dateRaw: date,
    yearOnly,
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
