/**
 * Changelog 弹层。
 *
 * 从状态条的「Changelog」按钮向下展开、与按钮左缘对齐、并钳位在预置窗口内；
 * 当前版本默认展开，旧版本折叠可点开。关闭时机：✕ / Esc / 点外部 /
 * 内容区滚动 / 窗口缩放 / 面板切换（由接线层调用 close）。
 */

import {
  TYPE_LABEL_IDS,
  formatVersionDate,
  getChangelogVersions,
  getEntryText,
  isCurrentVersion,
  isPendingVersion,
  sortChangelogVersions,
  type ChangelogVersion,
} from "./changelogData";
import { loadRemoteChangelog } from "./changelogRemote";
import { RELEASES_PAGE, getCachedStatus } from "../update/versionInfo";
import {
  appendPrefsIcon,
  chevronIcon,
  closeIcon,
  cloudIcon,
  createPrefsElement,
  externalLinkIcon,
} from "./prefsIcons";
import type { PrefsL10n } from "./prefsL10n";
import {
  animatePopupClose,
  animatePopupOpen,
  placePopupWithinWindow,
} from "../ui/popupAnimation";

const BEAK_MIN_MARGIN = 14;
const BEAK_WIDTH = 11;

/** 最近一次打开的面板标记：旧请求返回时据此丢弃结果。 */
let latestPanelToken = 0;

export interface ChangelogPanelOptions {
  doc: Document;
  win: Window;
  l10n: PrefsL10n;
  onClose: () => void;
}

export interface ChangelogPanel {
  open(anchor: HTMLElement): void;
  close(): void;
  destroy(): void;
}

export function createChangelogPanel(
  options: ChangelogPanelOptions,
): ChangelogPanel {
  const { doc, win, l10n, onClose } = options;
  let panel: HTMLElement | null = null;
  let detach: (() => void) | null = null;

  const close = (): void => {
    const node = panel;
    if (!node) return;
    panel = null;
    detach?.();
    detach = null;
    animatePopupClose(node);
    onClose();
  };

  const open = (anchor: HTMLElement): void => {
    if (panel) return;
    const node = buildPanel(doc, l10n, close);
    const root = doc.documentElement;
    if (!root) return;
    root.appendChild(node);
    panel = node;
    positionPanel(node, anchor);
    animatePopupOpen(node, "top right");
    detach = attachDismiss(node, anchor, win, close);
  };

  const destroy = (): void => {
    detach?.();
    detach = null;
    if (panel) {
      panel.remove();
      panel = null;
    }
  };

  return { open, close, destroy };
}

function buildPanel(
  doc: Document,
  l10n: PrefsL10n,
  requestClose: () => void,
): HTMLElement {
  const panelToken = ++latestPanelToken;
  const panel = createPrefsElement(doc, "div", "vt-prefs-changelog-panel");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", l10n.get("pref-changelog-title"));

  const head = createPrefsElement(doc, "div", "vt-prefs-changelog-head");
  const title = createPrefsElement(doc, "span", "vt-prefs-changelog-title");
  title.textContent = l10n.get("pref-changelog-title");
  const closeBtn = createPrefsElement(
    doc,
    "button",
    "vt-prefs-changelog-close",
  );
  closeBtn.type = "button";
  closeBtn.title = l10n.get("pref-changelog-close");
  closeBtn.setAttribute("aria-label", closeBtn.title);
  appendPrefsIcon(doc, closeBtn, closeIcon(), "vt-prefs-icon");
  closeBtn.addEventListener("click", requestClose);
  head.append(title, closeBtn);

  const body = createPrefsElement(doc, "div", "vt-prefs-changelog-body");
  // 先用内置数据立即渲染（离线也完整可用）；随后异步拉远程，成功后整块替换。
  const remoteHint = createPrefsElement(
    doc,
    "div",
    "vt-prefs-changelog-remote-hint",
  );
  remoteHint.textContent = l10n.get("pref-changelog-loading");
  body.appendChild(remoteHint);
  renderVersions(doc, l10n, body, getChangelogVersions());

  const footer = createPrefsElement(doc, "div", "vt-prefs-changelog-footer");
  const synced = createPrefsElement(doc, "span", "vt-prefs-changelog-synced");
  appendPrefsIcon(doc, synced, cloudIcon(), "vt-prefs-icon");
  const syncedText = createPrefsElement(
    doc,
    "span",
    "vt-prefs-changelog-synced-text",
  );
  syncedText.textContent = l10n.get("pref-changelog-never-checked");
  synced.appendChild(syncedText);

  const fullBtn = createPrefsElement(doc, "button", "vt-prefs-changelog-full");
  fullBtn.type = "button";
  const fullText = createPrefsElement(
    doc,
    "span",
    "vt-prefs-changelog-full-text",
  );
  fullText.textContent = l10n.get("pref-changelog-full");
  fullBtn.appendChild(fullText);
  appendPrefsIcon(doc, fullBtn, externalLinkIcon(), "vt-prefs-icon");
  fullBtn.addEventListener("click", () => Zotero.launchURL(RELEASES_PAGE));
  footer.append(synced, fullBtn);

  panel.append(head, body, footer);

  const { checkedAt } = getCachedStatus();
  if (checkedAt) {
    const time = formatCheckedAt(checkedAt);
    void l10n.format("pref-changelog-last-checked", { time }).then((text) => {
      if (syncedText.isConnected) syncedText.textContent = text;
    });
  }

  void refreshVersionsFromRemote(doc, l10n, body, remoteHint, panelToken);

  return panel;
}

/** 版本列表整块渲染：清掉旧版本/空态节点，保留 body 顶部的远程提示。 */
function renderVersions(
  doc: Document,
  l10n: PrefsL10n,
  body: HTMLElement,
  versions: ChangelogVersion[],
): void {
  for (const child of Array.from(body.children)) {
    if (
      child.classList.contains("vt-prefs-changelog-version") ||
      child.classList.contains("vt-prefs-changelog-empty")
    ) {
      child.remove();
    }
  }

  const sorted = sortChangelogVersions(versions);
  if (sorted.length === 0) {
    const empty = createPrefsElement(doc, "div", "vt-prefs-changelog-empty");
    empty.textContent = l10n.get("pref-changelog-empty");
    body.appendChild(empty);
    return;
  }
  for (const version of sorted) {
    body.appendChild(buildVersionSection(doc, l10n, version));
  }
}

/**
 * 异步拉远程数据并整块替换版本列表。关闭/重开面板后，旧请求的结果直接丢弃
 * （面板已断开，或已有更新的 panel token），避免写进已销毁的 DOM。
 */
async function refreshVersionsFromRemote(
  doc: Document,
  l10n: PrefsL10n,
  body: HTMLElement,
  remoteHint: HTMLElement,
  panelToken: number,
): Promise<void> {
  let versions: ChangelogVersion[];
  try {
    versions = await loadRemoteChangelog();
  } catch {
    if (panelToken !== latestPanelToken || !remoteHint.isConnected) return;
    remoteHint.textContent = l10n.get("pref-changelog-offline");
    return;
  }
  if (panelToken !== latestPanelToken || !body.isConnected) return;
  renderVersions(doc, l10n, body, versions);
  remoteHint.hidden = true;
}

function buildVersionSection(
  doc: Document,
  l10n: PrefsL10n,
  version: ChangelogVersion,
): HTMLElement {
  const current = isCurrentVersion(version.version);
  const pending = isPendingVersion(version.version);
  const section = createPrefsElement(
    doc,
    "section",
    "vt-prefs-changelog-version",
  );
  if (pending) section.classList.add("is-pending");

  const head = createPrefsElement(
    doc,
    "button",
    "vt-prefs-changelog-version-head",
  );
  head.type = "button";
  const num = createPrefsElement(doc, "span", "vt-prefs-changelog-version-num");
  num.textContent = `v${version.version}`;
  head.appendChild(num);

  if (current) {
    const badge = createPrefsElement(doc, "span", "vt-prefs-changelog-current");
    badge.textContent = l10n.get("pref-changelog-current");
    head.appendChild(badge);
  }

  if (pending) {
    const badge = createPrefsElement(doc, "span", "vt-prefs-changelog-pending");
    badge.textContent = l10n.get("pref-changelog-pending");
    head.appendChild(badge);
  }

  const date = createPrefsElement(doc, "span", "vt-prefs-changelog-date");
  date.textContent = formatVersionDate(version.date);
  head.appendChild(date);
  appendPrefsIcon(
    doc,
    head,
    chevronIcon("right"),
    "vt-prefs-icon vt-prefs-chevron",
  );

  const entries = createPrefsElement(doc, "div", "vt-prefs-changelog-entries");
  for (const entry of version.entries) {
    const row = createPrefsElement(doc, "div", "vt-prefs-changelog-entry");
    const chip = createPrefsElement(
      doc,
      "span",
      `vt-prefs-changelog-chip is-${entry.type}`,
    );
    chip.textContent = l10n.get(TYPE_LABEL_IDS[entry.type]);
    const text = createPrefsElement(doc, "span", "vt-prefs-changelog-text");
    text.textContent = getEntryText(entry, Zotero.locale);
    row.append(chip, text);
    entries.appendChild(row);
  }

  const syncExpanded = (): void => {
    const expanded = section.classList.contains("is-expanded");
    head.setAttribute("aria-expanded", expanded ? "true" : "false");
  };
  if (current) section.classList.add("is-expanded");
  head.addEventListener("click", () => {
    section.classList.toggle("is-expanded");
    syncExpanded();
  });
  syncExpanded();

  section.append(head, entries);
  return section;
}

function positionPanel(node: HTMLElement, anchor: HTMLElement): void {
  const anchorRect = anchor.getBoundingClientRect();
  // 状态条靠左对齐，弹层也以按钮左缘为锚（右对齐会让弹层压到左侧导航栏上）。
  const left = anchorRect.left;
  const top = anchorRect.bottom + 8;
  const origin = placePopupWithinWindow(node, left, top);
  node.classList.toggle("vt-prefs-panel-flipped", origin.startsWith("bottom"));

  const placed = node.getBoundingClientRect();
  const anchorCenter = anchorRect.left + anchorRect.width / 2;
  const beak = anchorCenter - placed.left - BEAK_WIDTH / 2;
  const clamped = Math.max(
    BEAK_MIN_MARGIN,
    Math.min(placed.width - BEAK_MIN_MARGIN - BEAK_WIDTH, beak),
  );
  node.style.setProperty("--vt-prefs-beak-left", `${Math.round(clamped)}px`);
}

function attachDismiss(
  node: HTMLElement,
  anchor: HTMLElement,
  win: Window,
  close: () => void,
): () => void {
  const doc = node.ownerDocument;
  if (!doc) return () => {};
  const content = doc.getElementById("prefs-content");

  const onMouseDown = (event: MouseEvent): void => {
    const target = event.target as Node | null;
    if (!target) return;
    if (node.contains(target) || anchor.contains(target)) return;
    close();
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    close();
  };
  const onScroll = (): void => close();
  const onResize = (): void => close();

  doc.addEventListener("mousedown", onMouseDown, true);
  doc.addEventListener("keydown", onKeyDown, true);
  content?.addEventListener("scroll", onScroll, { passive: true });
  win.addEventListener("resize", onResize);

  return () => {
    doc.removeEventListener("mousedown", onMouseDown, true);
    doc.removeEventListener("keydown", onKeyDown, true);
    content?.removeEventListener("scroll", onScroll);
    win.removeEventListener("resize", onResize);
  };
}

function formatCheckedAt(timestamp: number): string {
  try {
    return new Intl.DateTimeFormat(Zotero.locale, {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(timestamp));
  } catch {
    return new Date(timestamp).toLocaleString();
  }
}
