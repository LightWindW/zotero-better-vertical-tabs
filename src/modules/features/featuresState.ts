/**
 * 新功能的「已读 / 未读」状态。
 *
 * - 已读版本集合存在 pref `newFeatures.readVersions`（逗号分隔）；
 * - 首次运行（`newFeatures.initialized` 为 false）时，把「当前版本之前」的
 *   条目全部视为已读，只提示当前版本，避免新装用户一次弹出所有历史；
 * - 未读判定：数据里有内容、版本号 ≤ 当前安装版本、且不在已读集合里；
 * - 状态变化后向所有主窗口广播 `vertical-tabs:features-changed`，绿点据此刷新。
 */

import { getPref, setPref } from "../../utils/prefs";
import { dispatchVtEvent } from "../core/events";
import { getFeatureVersions, sortFeatureVersions } from "./featuresData";
import type { FeatureVersion } from "./featuresData";
import { PLUGIN_VERSION } from "../update/versionInfo";

export const FEATURES_CHANGED_EVENT = "vertical-tabs:features-changed";

function compareToCurrent(version: string): number | null {
  try {
    return Zotero.Utilities.semverCompare(version, PLUGIN_VERSION);
  } catch {
    return null;
  }
}

/** 首次运行时建立基线：当前版本之前的全部视为已读。 */
export function ensureFeaturesBaseline(): void {
  if (getPref("newFeatures.initialized")) return;
  try {
    const readVersions = getFeatureVersions()
      .map((item) => item.version)
      .filter((version) => {
        const comparison = compareToCurrent(version);
        return comparison !== null && comparison < 0;
      });
    setPref("newFeatures.readVersions", readVersions.join(","));
    setPref("newFeatures.initialized", true);
  } catch (error) {
    ztoolkit.log("Failed to initialize new-features baseline:", error);
  }
}

export function getReadFeatureVersions(): Set<string> {
  const raw = getPref("newFeatures.readVersions");
  return new Set(
    raw
      .split(",")
      .map((version) => version.trim())
      .filter(Boolean),
  );
}

/** 有内容、≤ 当前版本、且未读的版本（从新到旧）。 */
export function getUnreadFeatureVersions(): FeatureVersion[] {
  const readVersions = getReadFeatureVersions();
  const unread = getFeatureVersions().filter((item) => {
    if (!item.entries.length) return false;
    const comparison = compareToCurrent(item.version);
    if (comparison === null || comparison > 0) return false;
    return !readVersions.has(item.version);
  });
  return sortFeatureVersions(unread);
}

export function hasUnreadFeatures(): boolean {
  return getUnreadFeatureVersions().length > 0;
}

export function markFeatureVersionsRead(versions: string[]): void {
  if (!versions.length) return;
  const readVersions = getReadFeatureVersions();
  let changed = false;
  for (const version of versions) {
    if (readVersions.has(version)) continue;
    readVersions.add(version);
    changed = true;
  }
  if (!changed) return;
  setPref("newFeatures.readVersions", [...readVersions].join(","));
  notifyFeaturesChanged();
}

/** 广播状态变化（绿点/菜单行据此刷新）。 */
export function notifyFeaturesChanged(): void {
  for (const win of Zotero.getMainWindows()) {
    dispatchVtEvent(win.document, FEATURES_CHANGED_EVENT);
  }
}
