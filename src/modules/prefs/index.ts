/**
 * 首选项「版本提醒 + Changelog」的接线层。
 *
 * 由 preferenceScript（pane 的 onload）调用；负责：
 * - 拿到面板里的状态条挂载点；
 * - 预载动态文案后创建状态条与弹层；
 * - 面板显示（showing）时刷新状态、面板隐藏时关闭弹层；
 * - 预置窗口卸载时清理监听。
 *
 * 注意：插件脚本跑在 Cu.Sandbox 里，沙盒不暴露 HTMLElement /
 * MutationObserver 这类 DOM 构造器（见 src/modules/core/events.ts 顶部注释）。
 * 因此这里不写 `instanceof HTMLElement`，也统一用 `win.MutationObserver`；
 * 一旦初始化抛错就整体失败且界面上什么都看不到，所以外面兜一层日志。
 */

import { config } from "../../../package.json";
import { PREFS_STRING_IDS, PrefsL10n } from "./prefsL10n";
import { createVersionBar, type VersionBar } from "./versionBar";
import { createChangelogPanel, type ChangelogPanel } from "./changelogPanel";

interface WindowWithConstructors extends Window {
  MutationObserver?: typeof MutationObserver;
  HTMLElement?: typeof HTMLElement;
}

export function initPrefsVersionUI(win: Window): void {
  try {
    setup(win);
  } catch (error) {
    ztoolkit.log("Prefs version UI failed to initialize", error);
    Zotero.logError(error instanceof Error ? error : new Error(String(error)));
  }
}

function setup(win: Window): void {
  const doc = win.document;
  const host = doc.getElementById(
    `${config.addonRef}-prefs-version-bar`,
  ) as HTMLElement | null;
  if (!host) return;

  const paneContainer = host.closest(".pane-container") as HTMLElement | null;
  const groupbox = host.closest("groupbox");
  const navigation = doc.getElementById("prefs-navigation");
  const Observer = (win as WindowWithConstructors).MutationObserver;

  const l10n = new PrefsL10n(doc);
  let bar: VersionBar | null = null;
  let panel: ChangelogPanel | null = null;
  let panelOpen = false;
  let destroyed = false;
  let pendingShow = false;

  const closePanel = (): void => {
    if (!panelOpen) return;
    panelOpen = false;
    panel?.close();
    bar?.setChangelogOpen(false);
  };

  const handleShowing = (): void => {
    if (bar) {
      bar.refresh();
    } else {
      pendingShow = true;
    }
  };

  groupbox?.addEventListener("showing", handleShowing);
  navigation?.addEventListener("select", closePanel);

  let hiddenObserver: MutationObserver | null = null;
  if (paneContainer && Observer) {
    hiddenObserver = new Observer(() => {
      if (paneContainer.hidden) closePanel();
    });
    hiddenObserver.observe(paneContainer, {
      attributes: true,
      attributeFilter: ["hidden"],
    });
  }

  const cleanup = (): void => {
    destroyed = true;
    hiddenObserver?.disconnect();
    hiddenObserver = null;
    groupbox?.removeEventListener("showing", handleShowing);
    navigation?.removeEventListener("select", closePanel);
    panel?.destroy();
    panel = null;
    bar = null;
  };
  win.addEventListener("unload", cleanup, { once: true });

  void l10n.load(PREFS_STRING_IDS).then(() => {
    if (destroyed || win.closed || !host.isConnected) return;

    panel = createChangelogPanel({
      doc,
      win,
      l10n,
      onClose: () => {
        panelOpen = false;
        bar?.setChangelogOpen(false);
      },
    });

    bar = createVersionBar({
      doc,
      win,
      host,
      l10n,
      onToggleChangelog: (anchor, open) => {
        if (open) {
          panel?.open(anchor);
          panelOpen = true;
        } else {
          panel?.close();
          panelOpen = false;
        }
        bar?.setChangelogOpen(open);
      },
    });

    const visible = !!paneContainer && !paneContainer.hidden;
    if (pendingShow || visible) bar.refresh();
    pendingShow = false;
  });
}
