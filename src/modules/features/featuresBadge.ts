/**
 * 侧边栏「⋯」按钮右上角的「有新功能未读」绿点。
 *
 * 数据来自 `featuresState`（本身只读本地 pref/数据，不发请求）；状态变化时
 * `featuresState` 会广播 `vertical-tabs:features-changed`，这里据此切换按钮上的
 * `data-vt-features` 属性。红绿双点布局（红左绿右）由 styles.ts 的 CSS 负责。
 */

import { FEATURES_CHANGED_EVENT, hasUnreadFeatures } from "./featuresState";

const DOT_ATTR = "data-vt-features";
const MORE_BTN_CLASS = "vertical-tabs-more-btn";
/** 这些事件触发时重新应用绿点（侧边栏可能在启动/启用后才创建）。 */
const SYNC_EVENTS = [
  FEATURES_CHANGED_EVENT,
  "vertical-tabs:visibility-changed",
];

const boundHandlers = new WeakMap<Document, () => void>();

export function initFeaturesBadge(doc: Document): void {
  if (boundHandlers.has(doc)) {
    syncFeaturesBadge(doc);
    return;
  }
  const handler = (): void => syncFeaturesBadge(doc);
  for (const type of SYNC_EVENTS) {
    doc.addEventListener(type, handler);
  }
  boundHandlers.set(doc, handler);
  syncFeaturesBadge(doc);
}

export function destroyFeaturesBadge(doc: Document): void {
  const handler = boundHandlers.get(doc);
  if (!handler) return;
  for (const type of SYNC_EVENTS) {
    doc.removeEventListener(type, handler);
  }
  boundHandlers.delete(doc);
}

/** 按当前已读状态刷新绿点（幂等，可随时调用）。 */
export function syncFeaturesBadge(doc: Document): void {
  const unread = hasUnreadFeatures();
  const buttons = doc.querySelectorAll(
    `.${MORE_BTN_CLASS}`,
  ) as unknown as Element[];
  for (const button of buttons) {
    if (unread) {
      button.setAttribute(DOT_ATTR, "1");
    } else {
      button.removeAttribute(DOT_ATTR);
    }
  }
}
