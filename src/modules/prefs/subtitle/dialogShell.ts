/**
 * 自定义副标题弹窗的「壳」：overlay + 居中卡片 + 标题栏/提示/主体/注释区。
 *
 * 只搭 DOM 与开/关动画，不接线任何业务（关闭矩阵、持久化都在 index.ts）。
 * 样式全部来自 addon/content/preferences.css 的
 * `.vt-prefs-subtitle-*` 规则；开关动画复用预置窗口已有的
 * `.vt-popup-appear` / `.vt-popup-leaving`（0.15s ease-out，见该 CSS）。
 *
 * close() 幂等：播离场动画（animationend 判 card + 300ms 兜底）后移除 overlay
 * 并回调 onClosed；destroy() 立即移除（窗口 unload / 重开时用）。
 */

import { getString } from "../../../utils/locale";
import { createPrefsElement } from "../prefsIcons";

const OVERLAY_CLASS = "vt-prefs-subtitle-overlay";
const OVERLAY_APPEAR_CLASS = "vt-prefs-subtitle-overlay-appear";
const OVERLAY_LEAVING_CLASS = "vt-prefs-subtitle-overlay-leaving";
const CARD_CLASS = "vt-prefs-subtitle-card";
const HEADER_CLASS = "vt-prefs-subtitle-header";
const TITLE_CLASS = "vt-prefs-subtitle-title";
const CLOSE_CLASS = "vt-prefs-subtitle-close";
const HINT_CLASS = "vt-prefs-subtitle-hint";
const HINT_MAX_PART_CLASS = "vt-prefs-subtitle-hint-max-part";
const HINT_MAX_NORMAL_CLASS = "vt-prefs-subtitle-hint-max-normal";
const HINT_MAX_EM_CLASS = "vt-prefs-subtitle-hint-max-em";
const BODY_CLASS = "vt-prefs-subtitle-body";
const PREVIEW_HOST_CLASS = "vt-prefs-subtitle-preview-host";
const POOL_HOST_CLASS = "vt-prefs-subtitle-pool-host";
const RESTORE_CLASS = "vt-prefs-subtitle-restore";
const NOTES_CLASS = "vt-prefs-subtitle-notes";
const NOTE_CLASS = "vt-prefs-subtitle-note";

const CLOSE_FALLBACK_MS = 300;
/** 满额提示：「最多 4 个」段红色样式淡入 + 横向振动，约 1.1s 后淡出还原。 */
const HINT_MAX_CLASS = "vt-prefs-subtitle-hint-max";
const HINT_MAX_MS = 1100;

const NOTE_IDS = [
  "vertical-tabs-subtitle-note-venue",
  "vertical-tabs-subtitle-note-fields",
] as const;

export interface DialogShellOptions {
  doc: Document;
  /** 离场动画播完、overlay 已移除后调用（index 在这里做监听清理）。 */
  onClosed?: () => void;
}

export interface DialogShell {
  root: HTMLElement;
  card: HTMLElement;
  body: HTMLElement;
  previewHost: HTMLElement;
  poolHost: HTMLElement;
  restoreButton: HTMLButtonElement;
  closeButton: HTMLButtonElement;
  /** 已满 4 个仍尝试放入：只让「最多 4 个」段变红加粗（淡入）+ 振动后淡回。 */
  playMaxReachedHint(): void;
  close(): void;
  destroy(): void;
}

export function createDialogShell(options: DialogShellOptions): DialogShell {
  const { doc, onClosed } = options;
  const win = doc.defaultView;

  const root = createPrefsElement(doc, "div", OVERLAY_CLASS);
  root.classList.add(OVERLAY_APPEAR_CLASS);

  const card = createPrefsElement(doc, "div", CARD_CLASS);
  card.classList.add("vt-popup-appear");
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  const titleText = getString("vertical-tabs-subtitle-dialog-title");
  card.setAttribute("aria-label", titleText);

  const header = createPrefsElement(doc, "div", HEADER_CLASS);
  const title = createPrefsElement(doc, "span", TITLE_CLASS);
  title.textContent = titleText;
  const closeButton = createPrefsElement(
    doc,
    "button",
    CLOSE_CLASS,
  ) as HTMLButtonElement;
  closeButton.type = "button";
  closeButton.textContent = "×";
  const closeLabel = getString("vertical-tabs-subtitle-close");
  closeButton.title = closeLabel;
  closeButton.setAttribute("aria-label", closeLabel);
  header.append(title, closeButton);

  // 提示文案拆两段：前缀 + 「最多 4 个」段。红色段叠两层同样文本（normal 层在
  // 流内撑宽，em 层 absolute 覆盖），满额时只让 em 层淡入，实现「文字样式淡入淡出」。
  const hint = createPrefsElement(doc, "div", HINT_CLASS);
  hint.appendChild(
    doc.createTextNode(getString("vertical-tabs-subtitle-hint")),
  );
  const hintMaxPart = createPrefsElement(doc, "span", HINT_MAX_PART_CLASS);
  const hintMaxText = getString("vertical-tabs-subtitle-hint-max-part");
  const hintMaxNormal = createPrefsElement(doc, "span", HINT_MAX_NORMAL_CLASS);
  hintMaxNormal.textContent = hintMaxText;
  const hintMaxEm = createPrefsElement(doc, "span", HINT_MAX_EM_CLASS);
  hintMaxEm.textContent = hintMaxText;
  // 覆盖层只是视觉样式，不重复给屏幕阅读器读一遍。
  hintMaxEm.setAttribute("aria-hidden", "true");
  hintMaxPart.append(hintMaxNormal, hintMaxEm);
  hint.appendChild(hintMaxPart);

  const body = createPrefsElement(doc, "div", BODY_CLASS);
  const previewHost = createPrefsElement(doc, "div", PREVIEW_HOST_CLASS);
  const poolHost = createPrefsElement(doc, "div", POOL_HOST_CLASS);

  const restoreButton = createPrefsElement(
    doc,
    "button",
    RESTORE_CLASS,
  ) as HTMLButtonElement;
  restoreButton.type = "button";
  restoreButton.textContent = getString(
    "vertical-tabs-subtitle-restore-default",
  );

  const notes = createPrefsElement(doc, "div", NOTES_CLASS);
  for (const noteId of NOTE_IDS) {
    const note = createPrefsElement(doc, "div", NOTE_CLASS);
    note.textContent = getString(noteId);
    notes.appendChild(note);
  }

  body.append(previewHost, poolHost, restoreButton, notes);
  card.append(header, hint, body);
  root.appendChild(card);
  doc.documentElement?.appendChild(root);

  let closed = false;
  let hintTimer: number | null = null;

  const playMaxReachedHint = (): void => {
    if (hintTimer !== null) {
      win?.clearTimeout(hintTimer);
      hintTimer = null;
    }
    // 摘 class + reflow，连续触发时 shake keyframes 才能从头重播；em 层的
    // opacity 由 .vt-prefs-subtitle-hint-max 驱动淡入/淡出。
    hintMaxPart.classList.remove(HINT_MAX_CLASS);
    void hintMaxPart.offsetWidth;
    hintMaxPart.classList.add(HINT_MAX_CLASS);
    hintTimer = win
      ? win.setTimeout(() => {
          hintTimer = null;
          if (hintMaxPart.isConnected) {
            hintMaxPart.classList.remove(HINT_MAX_CLASS);
          }
        }, HINT_MAX_MS)
      : null;
  };

  const close = (): void => {
    if (closed) return;
    closed = true;
    card.classList.remove("vt-popup-appear");
    card.classList.add("vt-popup-leaving");
    root.classList.add(OVERLAY_LEAVING_CLASS);

    let finished = false;
    const finish = (): void => {
      if (finished) return;
      finished = true;
      root.removeEventListener("animationend", onAnimationEnd);
      if (root.isConnected) root.remove();
      onClosed?.();
    };
    const onAnimationEnd = (event: AnimationEvent): void => {
      if (event.target === card) finish();
    };
    root.addEventListener("animationend", onAnimationEnd);
    // 兜底：卡片动画被上下文吞掉（或 prefers-reduced-motion）时也要移除。
    win?.setTimeout(finish, CLOSE_FALLBACK_MS);
  };

  const destroy = (): void => {
    closed = true;
    if (root.isConnected) root.remove();
  };

  return {
    root,
    card,
    body,
    previewHost,
    poolHost,
    restoreButton,
    closeButton,
    playMaxReachedHint,
    close,
    destroy,
  };
}
