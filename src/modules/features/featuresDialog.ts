/**
 * 「新功能介绍」弹窗（主窗口与首选项窗口共用）。
 *
 * 调用方决定展示哪些版本：
 * - 主窗口「更多 → 新功能介绍」只传未读版本，并在打开后把版本记为已读；
 * - 首选项「新功能介绍」传全部版本，且不写已读状态。
 *
 * 样式与 help 弹窗同源（overlay + 居中卡片 + Esc/遮罩/× 关闭），
 * 内容按版本分组，支持段落、列表、`**粗体**` 与图片（addon/content/figs/）。
 */

import { config } from "../../../package.json";
import { getString } from "../../utils/locale";
import { isDarkMode } from "../render/colorUtils";
import { getDialogStyleSheet } from "../render/popupStyleUtils";
import { setDialogOpen } from "../sidebar/sidebar";
import {
  getLocalizedText,
  parseInlineSegments,
  sortFeatureVersions,
  PLUGIN_VERSION,
  type FeatureEntry,
  type FeatureVersion,
} from "./featuresData";

const OVERLAY_ID = "vt-features-dialog-overlay";
const escListeners = new Map<Document, (e: KeyboardEvent) => void>();

export interface FeaturesDialogOptions {
  versions: FeatureVersion[];
  /** 主窗口打开时抑制侧栏交互；首选项窗口传 false。 */
  suppressSidebar?: boolean;
  /** 版本之间加分割线（首选项「全部版本」用）。 */
  showDividers?: boolean;
  /** 把 > 当前安装版本的标题标红，最新版本号后加「（待更新）」。 */
  markPendingUpdates?: boolean;
  /** 打开后异步拉取远程数据；成功后整块替换内容，失败保留本地内容并提示。 */
  refresh?: () => Promise<FeatureVersion[]>;
}

interface DialogColors {
  text: string;
  muted: string;
  border: string;
  imageBorder: string;
  pending: string;
}

export function closeFeaturesDialog(doc: Document): void {
  const overlay = doc.getElementById(OVERLAY_ID) as HTMLElement | null;
  if (!overlay || overlay.classList.contains("vt-features-dialog-leaving")) {
    return;
  }

  const escListener = escListeners.get(doc);
  if (escListener) {
    doc.removeEventListener("keydown", escListener, true);
    escListeners.delete(doc);
  }

  overlay.classList.add("vt-features-dialog-leaving");
  let finished = false;
  const finish = (): void => {
    if (finished) return;
    finished = true;
    overlay.removeEventListener("animationend", onLeaveEnd);
    if (overlay.isConnected) overlay.remove();
    setDialogOpen(doc, false);
  };
  const onLeaveEnd = (e: AnimationEvent): void => {
    if (e.target !== overlay) return;
    finish();
  };
  overlay.addEventListener("animationend", onLeaveEnd);
  // 兜底：某些上下文（如首选项窗口）没有对应 keyframes 时也要能移除。
  setTimeout(finish, 300);
}

export function showFeaturesDialog(
  doc: Document,
  options: FeaturesDialogOptions,
): void {
  closeFeaturesDialog(doc);
  const suppressSidebar = options.suppressSidebar !== false;
  if (suppressSidebar) {
    setDialogOpen(doc, true);
  }

  const colors: DialogColors = isDarkMode(doc)
    ? {
        text: "#eee",
        muted: "#aaa",
        border: "1px solid rgba(85, 85, 85, 0.5)",
        imageBorder: "1px solid rgba(255, 255, 255, 0.16)",
        pending: "#ff8a80",
      }
    : {
        text: "#333",
        muted: "#6C6C6C",
        border: "1px solid rgba(182, 182, 182, 0.5)",
        imageBorder: "1px solid rgba(0, 0, 0, 0.12)",
        pending: "#d93025",
      };

  const overlay = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as HTMLElement;
  overlay.id = OVERLAY_ID;
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.3);
    z-index: 100001;
    display: flex;
    align-items: center;
    justify-content: center;
  `;

  const dialog = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as HTMLElement;
  dialog.className = "vt-features-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.style.cssText = `${getDialogStyleSheet(doc)}
    min-width: 420px;
    max-width: min(620px, calc(100vw - 48px));
    max-height: 74vh;`;

  const titleText = getString("vertical-tabs-features-dialog-title");
  dialog.setAttribute("aria-label", titleText);

  const header = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as HTMLElement;
  header.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    font-size: 15px;
    font-weight: 600;
    border-bottom: ${colors.border};
    color: ${colors.text};
  `;
  const title = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "span",
  ) as HTMLElement;
  title.textContent = titleText;
  header.appendChild(title);

  const closeBtn = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "button",
  ) as HTMLButtonElement;
  closeBtn.setAttribute("aria-label", getString("dialog-close"));
  closeBtn.title = getString("dialog-close");
  closeBtn.textContent = "×";
  closeBtn.style.cssText = `
    -moz-appearance: none;
    appearance: none;
    background: transparent;
    border: 0;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    font-size: 18px;
    line-height: 1;
    color: ${colors.muted};
  `;
  closeBtn.addEventListener("mouseenter", () => {
    closeBtn.style.background =
      "var(--material-button-hover, rgba(0, 0, 0, 0.06))";
  });
  closeBtn.addEventListener("mouseleave", () => {
    closeBtn.style.background = "transparent";
  });
  closeBtn.addEventListener("click", () => closeFeaturesDialog(doc));
  header.appendChild(closeBtn);
  dialog.appendChild(header);

  const content = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as HTMLElement;
  content.style.cssText = `
    padding: 16px 20px;
    overflow-y: auto;
    flex: 1;
    color: ${colors.text};
  `;

  const renderVersions = (versions: FeatureVersion[]): void => {
    content.textContent = "";
    const sorted = sortFeatureVersions(versions);
    if (!sorted.length) {
      content.appendChild(
        createTextBlock(
          doc,
          getString("vertical-tabs-features-empty"),
          colors.muted,
          "italic",
        ),
      );
      return;
    }
    sorted.forEach((version, index) => {
      content.appendChild(
        buildVersionSection(doc, version, colors, {
          showDivider: options.showDividers === true && index > 0,
          markPending: options.markPendingUpdates === true,
          isLatest: index === 0,
        }),
      );
    });
  };

  renderVersions(options.versions);

  if (options.refresh) {
    const status = createTextBlock(
      doc,
      getString("vertical-tabs-features-loading"),
      colors.muted,
      "italic",
    );
    status.style.marginTop = "4px";
    content.prepend(status);
    void options
      .refresh()
      .then((versions) => {
        if (!dialog.isConnected) return;
        renderVersions(versions);
      })
      .catch(() => {
        if (!status.isConnected) return;
        status.textContent = getString("vertical-tabs-features-offline");
      });
  }

  dialog.appendChild(content);
  overlay.appendChild(dialog);
  doc.documentElement?.appendChild(overlay);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      closeFeaturesDialog(doc);
    }
  });

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closeFeaturesDialog(doc);
    }
  };
  escListeners.set(doc, onKeyDown);
  doc.addEventListener("keydown", onKeyDown, true);
}

interface VersionSectionOptions {
  showDivider: boolean;
  markPending: boolean;
  isLatest: boolean;
}

function isPendingVersion(version: string): boolean {
  try {
    return Zotero.Utilities.semverCompare(version, PLUGIN_VERSION) > 0;
  } catch {
    return false;
  }
}

function buildVersionSection(
  doc: Document,
  version: FeatureVersion,
  colors: DialogColors,
  options: VersionSectionOptions,
): HTMLElement {
  const section = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as HTMLElement;
  section.style.cssText = options.showDivider
    ? `margin-bottom: 18px; border-top: ${colors.border}; padding-top: 14px;`
    : "margin-bottom: 18px;";

  const pending = options.markPending && isPendingVersion(version.version);
  const heading = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as HTMLElement;
  heading.style.cssText = `
    font-size: 13px;
    font-weight: 600;
    color: ${pending ? colors.pending : colors.text};
    margin-bottom: 8px;
  `;
  heading.textContent = `v${version.version}`;
  if (pending && options.isLatest) {
    const badge = doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "span",
    ) as HTMLElement;
    badge.textContent = getString("vertical-tabs-features-pending");
    badge.style.cssText = `margin-left: 4px; font-weight: 600; color: ${colors.pending};`;
    heading.appendChild(badge);
  }
  section.appendChild(heading);

  if (!version.entries.length) {
    section.appendChild(
      createTextBlock(
        doc,
        getString("vertical-tabs-features-empty-version"),
        colors.muted,
        "italic",
      ),
    );
    return section;
  }

  for (const entry of version.entries) {
    section.appendChild(buildEntry(doc, entry, colors));
  }
  return section;
}

function buildEntry(
  doc: Document,
  entry: FeatureEntry,
  colors: DialogColors,
): HTMLElement {
  if (entry.type === "image") {
    const image = doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "img",
    ) as HTMLImageElement;
    image.src = `chrome://${config.addonRef}/content/figs/${entry.file ?? ""}`;
    image.alt = entry.zh ? getLocalizedText(entry, Zotero.locale) : "";
    image.style.cssText = `
      display: block;
      max-width: 100%;
      height: auto;
      margin: 8px 0 12px;
      border-radius: 6px;
      border: ${colors.imageBorder};
    `;
    return image;
  }

  const row = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as HTMLElement;
  row.style.cssText =
    entry.type === "bullet"
      ? "display: flex; gap: 6px; margin-bottom: 5px; font-size: 13px; line-height: 1.65;"
      : "margin-bottom: 8px; font-size: 13px; line-height: 1.65;";

  if (entry.type === "bullet") {
    const bullet = doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "span",
    ) as HTMLElement;
    bullet.textContent = "•";
    bullet.style.cssText = `flex: 0 0 auto; color: ${colors.muted};`;
    row.appendChild(bullet);
  }

  const body = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "span",
  ) as HTMLElement;
  body.style.cssText = "flex: 1 1 auto; min-width: 0;";
  const text = getLocalizedText(entry, Zotero.locale);
  for (const segment of parseInlineSegments(text)) {
    if (segment.bold) {
      const strong = doc.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "strong",
      ) as HTMLElement;
      strong.textContent = segment.text;
      body.appendChild(strong);
    } else if (segment.text) {
      body.appendChild(doc.createTextNode(segment.text));
    }
  }
  row.appendChild(body);
  return row;
}

function createTextBlock(
  doc: Document,
  text: string,
  color: string,
  fontStyle?: string,
): HTMLElement {
  const block = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as HTMLElement;
  block.textContent = text;
  block.style.cssText = `
    font-size: 13px;
    line-height: 1.6;
    color: ${color};
    ${fontStyle ? `font-style: ${fontStyle};` : ""}
  `;
  return block;
}
