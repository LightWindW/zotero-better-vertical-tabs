/**
 * 预置窗口的 UI 小工具：内联 SVG 图标 + 轻量 DOM 构建助手。
 *
 * 图标一律使用 currentColor，颜色交给外层 CSS（配合 Zotero 主题变量自动
 * 适配深浅色）。SVG 通过 iconSvgs.svgElement 解析后插入，禁止 innerHTML。
 */

import { svgElement } from "../ui/iconSvgs";

export const XHTML_NS = "http://www.w3.org/1999/xhtml";

/** 新建 HTML 元素并设置 class。 */
export function createPrefsElement<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className: string,
): HTMLElementTagNameMap[K] {
  const node = doc.createElementNS(XHTML_NS, tag) as HTMLElementTagNameMap[K];
  if (className) node.setAttribute("class", className);
  return node;
}

/** 把内联 SVG 图标追加到容器；返回插入的节点（便于后续移除）。 */
export function appendPrefsIcon(
  doc: Document,
  parent: Element,
  svg: string,
  className: string,
): Element | null {
  const icon = svgElement(doc, svg);
  if (!icon) return null;
  icon.setAttribute("class", className);
  parent.appendChild(icon);
  return icon;
}

function wrap(body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

export function refreshIcon(): string {
  return wrap(
    '<path d="M13.5 8a5.5 5.5 0 1 1-1.7-4"/><path d="M13.7 2.2v3.3h-3.3"/>',
  );
}

/** 新版本状态/一键更新用的上箭头。 */
export function upArrowIcon(): string {
  return wrap('<path d="M8 13V3"/><path d="M3.5 7.5 8 3l4.5 4.5"/>');
}

/** 「新功能介绍」按钮/弹窗用的灯泡。 */
export function lightbulbIcon(): string {
  return wrap(
    '<path d="M6.2 11.3h3.6"/><path d="M6.7 13.3h2.6"/><path d="M8 2.2a4.1 4.1 0 0 0-2.4 7.4c.4.3.6.8.6 1.3h3.6c0-.5.2-1 .6-1.3A4.1 4.1 0 0 0 8 2.2z"/>',
  );
}

export function checkCircleIcon(): string {
  return wrap(
    '<circle cx="8" cy="8" r="6.2"/><path d="M5.1 8.3 7.2 10.4 10.9 6.2"/>',
  );
}

export function bookIcon(): string {
  return wrap(
    '<path d="M2.9 2.7h3.3c.9 0 1.7.7 1.7 1.7v9c0-.6-.5-1.1-1.1-1.1H2.9z"/><path d="M13.1 2.7H9.8c-.9 0-1.7.7-1.7 1.7v9c0-.6.5-1.1 1.1-1.1h3.9z"/>',
  );
}

export function chevronIcon(direction: "up" | "down" | "right"): string {
  if (direction === "up") {
    return wrap('<path d="M4 10.2 8 6.2 12 10.2"/>');
  }
  if (direction === "right") {
    return wrap('<path d="M6.2 4 10.2 8 6.2 12"/>');
  }
  return wrap('<path d="M4 6.2 8 10.2 12 6.2"/>');
}

export function closeIcon(): string {
  return wrap('<path d="M4.3 4.3 11.7 11.7"/><path d="M11.7 4.3 4.3 11.7"/>');
}

export function cloudIcon(): string {
  return wrap(
    '<path d="M4.7 12.3h6.6a2.4 2.4 0 0 0 .4-4.7 3.4 3.4 0 0 0-6.5-.5 2.6 2.6 0 0 0-.5 5.2z"/>',
  );
}

export function externalLinkIcon(): string {
  return wrap(
    '<path d="M9.6 2.6h3.8v3.8"/><path d="M13.4 2.6 8 8"/><path d="M12.2 9.5v3a1 1 0 0 1-1 1H3.6a1 1 0 0 1-1-1V4.9a1 1 0 0 1 1-1h3.1"/>',
  );
}
