/**
 * 预览面板：模拟真实标签卡片的样子（左图标 + 右内容列）。
 *
 * 左列用插件自带的矢量图标（addon/content/icons/journal.svg，68×68）：Zotero
 * 主题的条目类型图标固有尺寸偏小、放大不了，所以这里固定走 chrome:// 资源并用
 * CSS 撑满图标列。加载失败时移除 img，保留同宽空占位，绝不撑破布局。
 *
 * 右列 = 装饰性标题占位条 + chip 行挂载点（行内不渲染任何真实条目，产品决策）。
 * 面板元素本身是拖拽命中判定区域（dragController 用它的 rect），因此这里只
 * 管 DOM 结构，不挂任何监听。
 */

import { config } from "../../../../package.json";
import { createPrefsElement } from "../prefsIcons";

const PANEL_CLASS = "vt-prefs-subtitle-preview";
const ICON_CLASS = "vt-prefs-subtitle-preview-icon";
const CONTENT_CLASS = "vt-prefs-subtitle-preview-content";
const TITLE_CLASS = "vt-prefs-subtitle-preview-title";
const SLOTS_CLASS = "vt-prefs-subtitle-preview-slots";

/** 预览用期刊/文档图标（插件 content 目录下的 68×68 矢量图）。 */
const PREVIEW_ICON_SRC = `chrome://${config.addonRef}/content/icons/journal.svg`;

export interface PreviewPanel {
  element: HTMLElement;
  /** chip 行挂载点（由调用方 append chipRow.element）。 */
  rowHost: HTMLElement;
}

export function createPreviewPanel(doc: Document): PreviewPanel {
  const element = createPrefsElement(doc, "div", PANEL_CLASS);

  const icon = createPrefsElement(doc, "span", ICON_CLASS);
  icon.setAttribute("aria-hidden", "true");
  const image = createPrefsElement(doc, "img", "vt-prefs-subtitle-preview-img");
  image.setAttribute("alt", "");
  // 加载失败时移除 img：图标列宽度由 CSS 固定，移除后自然成为同宽占位。
  image.addEventListener("error", () => image.remove());
  image.setAttribute("src", PREVIEW_ICON_SRC);
  icon.appendChild(image);

  const content = createPrefsElement(doc, "div", CONTENT_CLASS);
  const title = createPrefsElement(doc, "div", TITLE_CLASS);
  title.setAttribute("aria-hidden", "true");
  const rowHost = createPrefsElement(doc, "div", SLOTS_CLASS);
  content.append(title, rowHost);

  element.append(icon, content);
  return { element, rowHost };
}
