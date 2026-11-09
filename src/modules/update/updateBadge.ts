/**
 * 侧边栏「⋯」按钮右上角的新版本红点。
 *
 * 数据只读 `versionInfo` 的本地缓存（不发请求）；`versionInfo` 每次检查完会向
 * 所有主窗口广播 `vertical-tabs:update-state-changed`，这里据此切换按钮上的
 * `data-vt-update` 属性，红点样式在 styles.ts 里。
 */

import { UPDATE_STATE_EVENT, getCachedStatus } from "./versionInfo";

const DOT_ATTR = "data-vt-update";
const MORE_BTN_CLASS = "vertical-tabs-more-btn";
/** 这些事件触发时重新应用红点（侧边栏可能在启动/启用后才创建）。 */
const SYNC_EVENTS = [UPDATE_STATE_EVENT, "vertical-tabs:visibility-changed"];

const boundHandlers = new WeakMap<Document, () => void>();

export function initUpdateBadge(doc: Document): void {
  if (boundHandlers.has(doc)) {
    syncUpdateBadge(doc);
    return;
  }
  const handler = (): void => syncUpdateBadge(doc);
  for (const type of SYNC_EVENTS) {
    doc.addEventListener(type, handler);
  }
  boundHandlers.set(doc, handler);
  syncUpdateBadge(doc);
}

export function destroyUpdateBadge(doc: Document): void {
  const handler = boundHandlers.get(doc);
  if (!handler) return;
  for (const type of SYNC_EVENTS) {
    doc.removeEventListener(type, handler);
  }
  boundHandlers.delete(doc);
}

/** 按当前缓存状态刷新红点（幂等，可随时调用）。 */
export function syncUpdateBadge(doc: Document): void {
  const outdated = getCachedStatus().state === "outdated";
  const buttons = doc.querySelectorAll(
    `.${MORE_BTN_CLASS}`,
  ) as unknown as Element[];
  for (const button of buttons) {
    if (outdated) {
      button.setAttribute(DOT_ATTR, "1");
    } else {
      button.removeAttribute(DOT_ATTR);
    }
  }
}
