/**
 * Icon resolution for vertical tabs.
 *
 * Strategy (reader sandbox):
 *   1. Pre-load Zotero native item-type SVGs at init (main window, no CSP)
 *      → convert to data: URIs → cache in memory
 *   2. Reader sidebar: use cached data URIs in <img> tags
 *      (data: URIs are inline, never blocked by CSP)
 *   3. Fallback: inline SVG from FALLBACK_ICONS (simple but not native)
 */

const FALLBACK_COLOR = "#6C6C6C";
const SVG_NS = 'xmlns="http://www.w3.org/2000/svg"';

/**
 * Item type → URL slug used by Zotero skin.
 * e.g. "journalArticle" → "journal-article"
 */
const ITEM_TYPE_TO_SLUG: Record<string, string> = {
  journalArticle: "journal-article",
  book: "book",
  bookSection: "book-section",
  thesis: "thesis",
  conferencePaper: "conference-paper",
  preprint: "preprint",
  report: "report",
  note: "note",
  webPage: "webpage",
  document: "document",
  manuscript: "manuscript",
  patent: "patent",
  presentation: "presentation",
  blogPost: "blog-post",
  magazineArticle: "magazine-article",
  newspaperArticle: "newspaper-article",
  podcast: "podcast",
  radioBroadcast: "radio-broadcast",
  tvBroadcast: "tv-broadcast",
  videoRecording: "video-recording",
  audioRecording: "audio-recording",
  artwork: "artwork",
  map: "map",
  email: "email",
  instantMessage: "instant-message",
  forumPost: "forum-post",
  hearing: "hearing",
  case: "case",
  statute: "statute",
  bill: "bill",
  computerProgram: "computer-program",
  encyclopediaArticle: "encyclopedia-article",
  dictionaryEntry: "dictionary-entry",
  interview: "interview",
  letter: "letter",
};

/** data: URI cache: itemType → data URI */
const _iconCache: Map<string, string> = new Map();

/** Simple inline SVG fallbacks (used when native icon isn't cached yet) */
const FALLBACK_ICONS: Record<string, string> = {
  journalArticle: [
    `<svg width="16" height="16" viewBox="0 0 16 16" ${SVG_NS}>`,
    `<rect x="2.5" y="1.5" width="11" height="13" rx="1.5" fill="${FALLBACK_COLOR}"/>`,
    `<line x1="5" y1="5" x2="11" y2="5" stroke="#fff" stroke-width="1" stroke-linecap="round"/>`,
    `<line x1="5" y1="7.5" x2="11" y2="7.5" stroke="#fff" stroke-width="1" stroke-linecap="round"/>`,
    `<line x1="5" y1="10" x2="9" y2="10" stroke="#fff" stroke-width="1" stroke-linecap="round"/>`,
    `</svg>`,
  ].join(""),
  note: [
    `<svg width="16" height="16" viewBox="0 0 16 16" ${SVG_NS}>`,
    `<rect x="2.5" y="1.5" width="11" height="13" rx="1.5" fill="${FALLBACK_COLOR}"/>`,
    `<line x1="5" y1="4.5" x2="11" y2="4.5" stroke="#fff" stroke-width="1" stroke-linecap="round"/>`,
    `<line x1="5" y1="7" x2="10" y2="7" stroke="#fff" stroke-width="1" stroke-linecap="round"/>`,
    `<line x1="5" y1="9.5" x2="8" y2="9.5" stroke="#fff" stroke-width="1" stroke-linecap="round"/>`,
    `<circle cx="12.5" cy="3" r="2.5" fill="#f39c12" stroke="#fff" stroke-width="0.8"/>`,
    `</svg>`,
  ].join(""),
  book: [
    `<svg width="16" height="16" viewBox="0 0 16 16" ${SVG_NS}>`,
    `<path d="M3 1.5h4.5v13H3a1.5 1.5 0 0 1-1.5-1.5V3A1.5 1.5 0 0 1 3 1.5z" fill="${FALLBACK_COLOR}"/>`,
    `<path d="M7.5 1.5H13A1.5 1.5 0 0 1 14.5 3v10A1.5 1.5 0 0 1 13 14.5H7.5V1.5z" fill="${FALLBACK_COLOR}" opacity="0.6"/>`,
    `<line x1="4.5" y1="4.5" x2="6.5" y2="4.5" stroke="#fff" stroke-width="0.8" stroke-linecap="round"/>`,
    `</svg>`,
  ].join(""),
  bookSection: [
    `<svg width="16" height="16" viewBox="0 0 16 16" ${SVG_NS}>`,
    `<path d="M2.5 1.5h11v13l-5.5-3.5-5.5 3.5V1.5z" fill="${FALLBACK_COLOR}"/>`,
    `<line x1="5" y1="5" x2="11" y2="5" stroke="#fff" stroke-width="1" stroke-linecap="round"/>`,
    `</svg>`,
  ].join(""),
  thesis: [
    `<svg width="16" height="16" viewBox="0 0 16 16" ${SVG_NS}>`,
    `<path d="M1.5 6L8 2.5 14.5 6 8 9.5 1.5 6z" fill="${FALLBACK_COLOR}"/>`,
    `<path d="M3.5 7.5v3L8 12.5l4.5-2v-3" fill="none" stroke="${FALLBACK_COLOR}" stroke-width="1.2"/>`,
    `<rect x="7" y="12" width="2" height="1.5" rx="0.5" fill="${FALLBACK_COLOR}"/>`,
    `</svg>`,
  ].join(""),
  conferencePaper: [
    `<svg width="16" height="16" viewBox="0 0 16 16" ${SVG_NS}>`,
    `<rect x="4.5" y="5" width="7" height="6.5" rx="0.8" fill="${FALLBACK_COLOR}"/>`,
    `<rect x="5.5" y="3" width="5" height="2" rx="0.8" fill="${FALLBACK_COLOR}" opacity="0.45"/>`,
    `<rect x="2.5" y="11.5" width="11" height="1" rx="0.5" fill="${FALLBACK_COLOR}"/>`,
    `</svg>`,
  ].join(""),
  preprint: [
    `<svg width="16" height="16" viewBox="0 0 16 16" ${SVG_NS}>`,
    `<rect x="3" y="2" width="8" height="11" rx="1.2" fill="${FALLBACK_COLOR}"/>`,
    `<line x1="5" y1="5" x2="9" y2="5" stroke="#fff" stroke-width="0.8"/>`,
    `<path d="M10.5 1.5l2.5 2-2.5 2" fill="none" stroke="${FALLBACK_COLOR}" stroke-width="1"/>`,
    `</svg>`,
  ].join(""),
  report: [
    `<svg width="16" height="16" viewBox="0 0 16 16" ${SVG_NS}>`,
    `<rect x="3" y="3" width="10" height="11" rx="1.2" fill="${FALLBACK_COLOR}"/>`,
    `<rect x="5" y="1" width="6" height="3" rx="1" fill="${FALLBACK_COLOR}"/>`,
    `<line x1="5" y1="6.5" x2="11" y2="6.5" stroke="#fff" stroke-width="0.8"/>`,
    `<line x1="5" y1="9" x2="11" y2="9" stroke="#fff" stroke-width="0.8"/>`,
    `</svg>`,
  ].join(""),
};

/**
 * Pre-load Zotero native item-type SVGs and cache them as data: URIs.
 * Called once from the main window at plugin init (CSP doesn't block
 * chrome://zotero/skin/ requests there).
 */
export async function preloadZoteroIcons(): Promise<void> {
  const itemTypes = Object.keys(ITEM_TYPE_TO_SLUG);
  const batchSize = 6;
  for (let i = 0; i < itemTypes.length; i += batchSize) {
    const batch = itemTypes.slice(i, i + batchSize);
    await Promise.allSettled(
      batch.map(async (itemType) => {
        if (_iconCache.has(itemType)) return;
        const slug = ITEM_TYPE_TO_SLUG[itemType];
        if (!slug) return;
        const url = `chrome://zotero/skin/item-type/16/light/${slug}@2x.svg`;
        try {
          const svgText = await fetchIcon(url);
          if (svgText) {
            const dataUri = svgToDataUri(svgText);
            _iconCache.set(itemType, dataUri);
          }
        } catch {
          // Silently skip — fallback SVGs available
        }
      }),
    );
  }
}

function fetchIcon(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", url, true);
      xhr.timeout = 5000;
      xhr.onload = () => {
        if (xhr.status === 200 && xhr.responseText) {
          resolve(xhr.responseText);
        } else {
          resolve(null);
        }
      };
      xhr.onerror = () => resolve(null);
      xhr.ontimeout = () => resolve(null);
      xhr.send();
    } catch {
      resolve(null);
    }
  });
}

function svgToDataUri(svg: string): string {
  const encoded = encodeURIComponent(svg)
    .replace(/'/g, "%27")
    .replace(/"/g, "%22");
  return `data:image/svg+xml,${encoded}`;
}

/**
 * Get the best available icon for a given item type in reader context.
 * Returns: data: URI (preferred) → inline SVG fallback → null
 */
export function getReaderIconHtml(itemType: string): string | null {
  // 1. Cached native Zotero icon (data: URI)
  const dataUri = _iconCache.get(itemType);
  if (dataUri) return dataUri;

  // 2. Inline SVG fallback
  return FALLBACK_ICONS[itemType] ?? null;
}

/**
 * Check if the given value is a data: URI (vs inline SVG markup).
 */
export function isDataUri(value: string): boolean {
  return value.startsWith("data:");
}
