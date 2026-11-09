/**
 * 更新热重载期间保持首选项停留在本插件面板。
 *
 * 背景：插件升级时 Zotero 会先注销我们的 prefs pane（触发首选项窗口 reload，
 * 此时窗口回落到「常规」并覆盖 `lastSelectedPrefPane`），随后新插件 startup
 * 再注册 pane 并再次 reload —— 如果不干预，用户会被甩到别的标签页。
 *
 * 做法：
 * 1. 发起更新的旧插件先把「想保留的面板 id」写进 `update.keepPaneOnReload`；
 * 2. 新插件 startup 在注册 pane 前把 `lastSelectedPrefPane` 重新指回本面板，
 *    让第二次 reload 直接落在本面板；
 * 3. 再兜一组短延迟重试，导航到本面板（覆盖 reload 时序竞争），完成后清标记。
 */

import { config } from "../../../package.json";
import { getPref, setPref } from "../../utils/prefs";

const KEEP_PANE_PREF = "update.keepPaneOnReload";
/** Zotero 自身的「上次选中的首选项面板」pref（非本插件命名空间）。 */
const LAST_PANE_PREF = "lastSelectedPrefPane";
const RETRY_DELAYS_MS = [0, 200, 500, 1000, 2000, 3500];
const CLEAR_DELAY_MS = 6000;

/** 旧插件在发起更新前调用：只有用户此刻正停在本插件面板时才记录。 */
export function rememberPaneForReload(): void {
  const onOurPane = getPrefsWindows().some((win) => {
    const prefs = (win as { Zotero_Preferences?: PrefsController })
      .Zotero_Preferences;
    return prefs?.navigation?.value === config.addonID;
  });
  if (onOurPane) {
    setPref(KEEP_PANE_PREF, config.addonID);
  }
}

/** 更新失败时清掉标记。 */
export function clearPaneForReload(): void {
  setPref(KEEP_PANE_PREF, "");
}

/** 新插件 startup 调用（在 register 之前）：让 reload 后仍停在本面板。 */
export function restorePaneAfterReload(): void {
  const paneID = getPref(KEEP_PANE_PREF);
  if (!paneID) return;

  // 关键一步：下一次 prefs 窗口 reload 的 init 会读这个 pref。
  try {
    Zotero.Prefs.set(LAST_PANE_PREF, paneID, false);
  } catch (error) {
    ztoolkit.log("Failed to restore lastSelectedPrefPane:", error);
  }

  const attempt = (): void => {
    for (const win of getPrefsWindows()) {
      try {
        const prefs = (win as { Zotero_Preferences?: PrefsController })
          .Zotero_Preferences;
        if (!prefs) continue;
        if (prefs.navigation?.value === paneID) {
          clearPaneForReload();
          continue;
        }
        void prefs.navigateToPane(paneID);
      } catch (error) {
        ztoolkit.log("Failed to navigate back to prefs pane:", error);
      }
    }
  };

  for (const delay of RETRY_DELAYS_MS) {
    setTimeout(attempt, delay);
  }
  setTimeout(() => clearPaneForReload(), CLEAR_DELAY_MS);
}

interface PrefsController {
  navigation?: { value?: string | null };
  navigateToPane(paneID: string): Promise<void>;
}

function getPrefsWindows(): Window[] {
  const windows: Window[] = [];
  try {
    const enumerator = Services.wm.getEnumerator("zotero:pref");
    while (enumerator.hasMoreElements()) {
      const xulWindow = enumerator.getNext() as {
        docShell?: { domWindow?: Window };
        closed?: boolean;
      };
      const domWindow =
        xulWindow.docShell?.domWindow ?? (xulWindow as unknown as Window);
      if (domWindow && !domWindow.closed) windows.push(domWindow);
    }
  } catch (error) {
    ztoolkit.log("Failed to enumerate prefs windows:", error);
  }
  return windows;
}
