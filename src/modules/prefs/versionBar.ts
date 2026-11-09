/**
 * 预置面板顶部的版本提醒状态条。
 *
 * 状态：idle（尚未检查）/ checking / latest / outdated / error，
 * 以及一键更新期间的 downloading / installing / done / error / manual。
 * 先在本地渲染缓存结果，只有距离上次成功检查超过 24h 才联网；
 * 刷新按钮强制检查；点红色「新版本」直接下载安装最新 release。
 */

import {
  PLUGIN_VERSION,
  checkLatestVersion,
  getCachedStatus,
  isCheckDue,
  type VersionState,
  type VersionStatus,
} from "../update/versionInfo";
import { installLatestRelease } from "../update/updateInstaller";
import { clearPaneForReload, rememberPaneForReload } from "../update/keepPane";
import {
  getLocalFeatureVersionsForAll,
  loadRemoteFeatureVersions,
} from "../features/featuresRemote";
import { showFeaturesDialog } from "../features/featuresDialog";
import {
  appendPrefsIcon,
  bookIcon,
  checkCircleIcon,
  chevronIcon,
  createPrefsElement,
  lightbulbIcon,
  refreshIcon,
  upArrowIcon,
} from "./prefsIcons";
import type { PrefsL10n } from "./prefsL10n";

const STATUS_TEXT_IDS: Record<Exclude<VersionState, "idle">, string> = {
  latest: "pref-version-latest",
  outdated: "pref-version-outdated",
  error: "pref-version-error",
};

/** 一键更新的本地 UI 阶段。 */
type UpdateUiPhase =
  | "idle"
  | "downloading"
  | "installing"
  | "done"
  | "error"
  | "network-delay"
  | "manual";

export interface VersionBarOptions {
  doc: Document;
  win: Window;
  host: HTMLElement;
  l10n: PrefsL10n;
  onToggleChangelog: (anchor: HTMLElement, open: boolean) => void;
}

export interface VersionBar {
  refresh(options?: { force?: boolean }): void;
  setChangelogOpen(open: boolean): void;
}

export function createVersionBar(options: VersionBarOptions): VersionBar {
  const { doc, win, host, l10n, onToggleChangelog } = options;

  const refreshBtn = createPrefsElement(doc, "button", "vt-prefs-refresh");
  refreshBtn.type = "button";
  refreshBtn.title = l10n.get("pref-version-refresh");
  refreshBtn.setAttribute("aria-label", refreshBtn.title);
  appendPrefsIcon(doc, refreshBtn, refreshIcon(), "vt-prefs-icon");

  const status = createPrefsElement(doc, "span", "vt-prefs-status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const statusIcon = createPrefsElement(doc, "span", "vt-prefs-status-icon");
  const statusText = createPrefsElement(doc, "span", "vt-prefs-status-text");
  const statusVersion = createPrefsElement(
    doc,
    "span",
    "vt-prefs-status-version",
  );
  status.append(statusIcon, statusText, statusVersion);

  const divider = createPrefsElement(doc, "span", "vt-prefs-divider");

  // 「新功能介绍」按钮：放在更新日志左边，样式一致、图标换成灯泡。
  // 首选项内这一页优先拉取 GitHub 上的 doc/features.md（+翻译表+releases 版本
  // 列表）；打开时先用内置数据渲染，远程成功后整块替换并标注「待更新」。
  // 这个入口不写已读状态，已读必须由主窗口入口触发。
  const featuresBtn = createPrefsElement(
    doc,
    "button",
    "vt-prefs-features-btn",
  );
  featuresBtn.type = "button";
  featuresBtn.title = l10n.get("pref-features-open");
  featuresBtn.setAttribute("aria-label", featuresBtn.title);
  appendPrefsIcon(doc, featuresBtn, lightbulbIcon(), "vt-prefs-icon");
  const featuresLabel = createPrefsElement(
    doc,
    "span",
    "vt-prefs-features-label",
  );
  featuresLabel.textContent = l10n.get("pref-features-open");
  featuresBtn.appendChild(featuresLabel);
  featuresBtn.addEventListener("click", () => {
    showFeaturesDialog(doc, {
      versions: getLocalFeatureVersionsForAll(),
      suppressSidebar: false,
      showDividers: true,
      markPendingUpdates: true,
      refresh: loadRemoteFeatureVersions,
    });
  });

  const changelogBtn = createPrefsElement(
    doc,
    "button",
    "vt-prefs-changelog-btn",
  );
  changelogBtn.type = "button";
  changelogBtn.setAttribute("aria-expanded", "false");
  appendPrefsIcon(doc, changelogBtn, bookIcon(), "vt-prefs-icon");
  const changelogLabel = createPrefsElement(
    doc,
    "span",
    "vt-prefs-changelog-label",
  );
  changelogLabel.textContent = l10n.get("pref-changelog-open");
  changelogBtn.appendChild(changelogLabel);
  appendPrefsIcon(
    doc,
    changelogBtn,
    chevronIcon("down"),
    "vt-prefs-icon vt-prefs-chevron",
  );

  host.textContent = "";
  host.append(refreshBtn, status, divider, featuresBtn, changelogBtn);

  let current: VersionStatus = getCachedStatus();
  let checking = false;
  let changelogOpen = false;
  let phase: UpdateUiPhase = "idle";
  let downloadPercent = 0;

  const setStatusClass = (modifier: string | null): void => {
    status.classList.remove(
      "vt-prefs-status-latest",
      "vt-prefs-status-outdated",
      "vt-prefs-status-checking",
      "vt-prefs-status-error",
      "vt-prefs-status-updating",
      "vt-prefs-status-update-error",
    );
    if (modifier) status.classList.add(modifier);
  };

  const render = (): void => {
    refreshBtn.classList.remove("vt-prefs-checking");
    refreshBtn.removeAttribute("aria-busy");
    statusIcon.textContent = "";
    statusText.textContent = "";
    statusVersion.textContent = "";
    status.removeAttribute("title");

    if (checking) {
      setStatusClass("vt-prefs-status-checking");
      refreshBtn.classList.add("vt-prefs-checking");
      refreshBtn.setAttribute("aria-busy", "true");
      statusText.textContent = l10n.get("pref-version-checking");
      statusVersion.textContent = `v${PLUGIN_VERSION}`;
      return;
    }

    if (phase === "downloading") {
      setStatusClass("vt-prefs-status-updating");
      appendPrefsIcon(doc, statusIcon, upArrowIcon(), "vt-prefs-icon");
      statusText.textContent = l10n.get("pref-version-downloading");
      if (downloadPercent > 0) {
        statusVersion.textContent = `${downloadPercent}%`;
      }
      return;
    }

    if (phase === "installing") {
      setStatusClass("vt-prefs-status-updating");
      appendPrefsIcon(doc, statusIcon, upArrowIcon(), "vt-prefs-icon");
      statusText.textContent = l10n.get("pref-version-installing");
      return;
    }

    if (phase === "done") {
      setStatusClass("vt-prefs-status-latest");
      appendPrefsIcon(doc, statusIcon, checkCircleIcon(), "vt-prefs-icon");
      statusText.textContent = l10n.get("pref-version-updated");
      return;
    }

    if (phase === "error") {
      setStatusClass("vt-prefs-status-update-error");
      appendPrefsIcon(doc, statusIcon, upArrowIcon(), "vt-prefs-icon");
      statusText.textContent = l10n.get("pref-version-update-error");
      status.title = l10n.get("pref-version-update-hint");
      return;
    }

    if (phase === "network-delay") {
      setStatusClass("vt-prefs-status-update-error");
      appendPrefsIcon(doc, statusIcon, upArrowIcon(), "vt-prefs-icon");
      statusText.textContent = l10n.get("pref-version-network-delay");
      status.title = l10n.get("pref-version-update-hint");
      return;
    }

    if (phase === "manual") {
      setStatusClass(null);
      appendPrefsIcon(doc, statusIcon, upArrowIcon(), "vt-prefs-icon");
      statusText.textContent = l10n.get("pref-version-update-manual");
      return;
    }

    if (current.state === "latest") {
      setStatusClass("vt-prefs-status-latest");
      appendPrefsIcon(doc, statusIcon, checkCircleIcon(), "vt-prefs-icon");
      statusText.textContent = l10n.get(STATUS_TEXT_IDS.latest);
      statusVersion.textContent = `v${PLUGIN_VERSION}`;
      return;
    }

    if (current.state === "outdated") {
      setStatusClass("vt-prefs-status-outdated");
      appendPrefsIcon(doc, statusIcon, upArrowIcon(), "vt-prefs-icon");
      statusText.textContent = l10n.get(STATUS_TEXT_IDS.outdated);
      statusVersion.textContent = `v${current.latestVersion}`;
      status.title = l10n.get("pref-version-update-hint");
      return;
    }

    if (current.state === "error") {
      setStatusClass("vt-prefs-status-error");
      statusText.textContent = l10n.get(STATUS_TEXT_IDS.error);
      return;
    }

    // idle：只显示当前版本，等面板首次显示时再触发检查
    setStatusClass(null);
    statusVersion.textContent = `v${PLUGIN_VERSION}`;
  };

  const doRefresh = async (force: boolean): Promise<void> => {
    if (checking) return;
    if (phase === "downloading" || phase === "installing") return;
    if (!force) {
      current = getCachedStatus();
      render();
      if (!isCheckDue()) return;
    }
    checking = true;
    render();
    const result = await checkLatestVersion(force);
    checking = false;
    if (win.closed) return;
    current = result;
    render();
  };

  const startUpdate = async (): Promise<void> => {
    if (phase === "downloading" || phase === "installing") return;
    phase = "idle";
    current = getCachedStatus(); // 下载地址可能在这次会话之前就已缓存
    if (current.state !== "outdated") {
      render();
      return;
    }
    if (!current.downloadUrl) {
      // 旧缓存没有资产地址：退化为打开发布页，提示手动更新。
      phase = "manual";
      render();
      Zotero.launchURL(current.releaseUrl);
      return;
    }
    phase = "downloading";
    downloadPercent = 0;
    // 告诉新插件：这次热重载要把首选项窗口留在本插件面板。
    rememberPaneForReload();
    render();
    try {
      await installLatestRelease({
        onPhase: (next) => {
          phase = next;
          render();
        },
        onDownloadProgress: (received, total) => {
          const raw = total > 0 ? Math.round((received / total) * 100) : 0;
          if (raw <= 0) return;
          // 上限 99：只有真正结束（进入安装阶段）才允许"完成"的观感，
          // 避免服务器错误页/重试被误显示成 100% 卡住。
          downloadPercent = Math.min(raw, 99);
          // 只刷百分比，避免整块状态条重排抖动。
          statusVersion.textContent = `${downloadPercent}%`;
        },
        onError: (reason) => {
          clearPaneForReload();
          ztoolkit.log("Plugin update error:", reason);
          phase = reason === "network-delay" ? "network-delay" : "error";
          render();
        },
      });
    } catch (error) {
      clearPaneForReload();
      ztoolkit.log("Plugin update failed:", error);
      phase = "error";
      render();
    }
    // 成功时插件会被 shutdown + 热重载（首选项窗口随新插件注册自动 refresh），
    // 这段只会短暂显示；仅作极端情况兜底，不再提示重启。
    try {
      if (
        !win.closed &&
        status.isConnected &&
        (phase as UpdateUiPhase) === "installing"
      ) {
        phase = "done";
        render();
      }
    } catch {
      // 插件重载过程中访问旧 DOM 可能失败，忽略。
    }
  };

  refreshBtn.addEventListener("click", () => {
    void doRefresh(true);
  });

  status.addEventListener("click", () => {
    if (phase === "downloading" || phase === "installing") return;
    if (phase === "error" || phase === "network-delay" || phase === "done") {
      phase = "idle";
      render();
      if (current.state === "outdated") void startUpdate();
      return;
    }
    if (phase === "manual") {
      Zotero.launchURL(current.releaseUrl);
      return;
    }
    if (current.state === "outdated") void startUpdate();
  });

  changelogBtn.addEventListener("click", () => {
    onToggleChangelog(changelogBtn, !changelogOpen);
  });

  const setChangelogOpen = (open: boolean): void => {
    changelogOpen = open;
    changelogBtn.setAttribute("aria-expanded", open ? "true" : "false");
  };

  render();

  return {
    refresh(option = {}) {
      void doRefresh(option.force === true);
    },
    setChangelogOpen,
  };
}
