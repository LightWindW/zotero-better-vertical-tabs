import { config } from "../../../package.json";
import { SIDEBAR_ID } from "./styles";

/**
 * Vertical tabs item height preset.
 * The actual visual height is min-height + 8px vertical padding.
 */
export type TabHeight = "compact" | "loose" | "extraLoose";

const TAB_HEIGHT_PREF = `${config.prefsPrefix}.verticalTabs.tabHeight`;

const TAB_HEIGHT_MIN_HEIGHT: Record<TabHeight, string> = {
  compact: "36px", // 36 + 8 = 44px
  loose: "47px", // 47 + 8 = 55px
  extraLoose: "58px", // 58 + 8 = 66px
};

const VALID_TAB_HEIGHTS = Object.keys(
  TAB_HEIGHT_MIN_HEIGHT,
) as ReadonlyArray<TabHeight>;

function isTabHeight(value: unknown): value is TabHeight {
  return (
    typeof value === "string" && VALID_TAB_HEIGHTS.includes(value as TabHeight)
  );
}

export function getTabHeightValue(): TabHeight {
  const raw = Zotero.Prefs.get(TAB_HEIGHT_PREF, true) as string | undefined;
  return isTabHeight(raw) ? raw : "loose";
}

export function getTabHeightMinHeight(value: TabHeight): string {
  return TAB_HEIGHT_MIN_HEIGHT[value];
}

/**
 * Apply the tab height CSS variable to a document's VT sidebar.
 * If no value is provided, reads the current preference.
 */
export function applyTabHeightStyle(doc: Document, value?: TabHeight): void {
  const effective = value ?? getTabHeightValue();
  const sidebar = doc.getElementById(SIDEBAR_ID) as HTMLElement | null;
  if (!sidebar) return;
  sidebar.style.setProperty(
    "--vt-item-min-height",
    getTabHeightMinHeight(effective),
  );
}

/**
 * Apply the tab height CSS variable to all open main windows.
 */
export function applyTabHeightToAllWindows(value?: TabHeight): void {
  const effective = value ?? getTabHeightValue();
  for (const win of Zotero.getMainWindows()) {
    applyTabHeightStyle(win.document, effective);
  }
}
