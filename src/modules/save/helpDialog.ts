import { getString } from "../../utils/locale";
import { isDarkMode } from "../render/colorUtils";
import { getDialogStyleSheet } from "../render/popupStyleUtils";
import { setDialogOpen } from "../sidebar/sidebar";

const OVERLAY_ID = "vt-help-dialog-overlay";
const escListeners = new Map<Document, (e: KeyboardEvent) => void>();

function getThemeColors(doc: Document) {
  const dark = isDarkMode(doc);
  return {
    text: dark ? "#eee" : "#333",
    muted: dark ? "#aaa" : "#6C6C6C",
    dialogBorder: dark
      ? "1px solid rgba(85, 85, 85, 0.5)"
      : "1px solid rgba(182, 182, 182, 0.5)",
  };
}

export function closeHelpDialog(doc: Document): void {
  const overlay = doc.getElementById(OVERLAY_ID) as HTMLElement | null;
  if (!overlay || overlay.classList.contains("vt-help-dialog-leaving")) return;

  const escListener = escListeners.get(doc);
  if (escListener) {
    doc.removeEventListener("keydown", escListener, true);
    escListeners.delete(doc);
  }

  overlay.classList.add("vt-help-dialog-leaving");
  const onLeaveEnd = (e: AnimationEvent) => {
    if (e.target !== overlay) return;
    overlay.removeEventListener("animationend", onLeaveEnd);
    overlay.remove();
    setDialogOpen(doc, false);
  };
  overlay.addEventListener("animationend", onLeaveEnd);
}

export function showHelpDialog(doc: Document): void {
  closeHelpDialog(doc);
  setDialogOpen(doc, true);

  const colors = getThemeColors(doc);

  const overlay = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as HTMLElement;
  overlay.id = OVERLAY_ID;
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.3);
    z-index: 100001;
    display: flex;
    align-items: center;
    justify-content: center;
  `;

  const dialog = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as HTMLElement;
  dialog.className = "vt-help-dialog";
  dialog.style.cssText = getDialogStyleSheet(doc);

  const header = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as HTMLElement;
  header.className = "vt-help-dialog-header";
  header.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    font-size: 15px;
    font-weight: 600;
    border-bottom: ${colors.dialogBorder};
    color: ${colors.text};
  `;

  const title = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "span",
  ) as HTMLElement;
  title.textContent = getString("vertical-tabs-help-dialog-title");
  header.appendChild(title);

  const closeBtn = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "button",
  ) as HTMLButtonElement;
  closeBtn.className = "vt-help-dialog-close";
  closeBtn.setAttribute("aria-label", getString("dialog-close"));
  closeBtn.title = getString("dialog-close");
  closeBtn.textContent = "×";
  closeBtn.style.cssText = `
    -moz-appearance: none;
    appearance: none;
    background: transparent;
    border: 0;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    font-size: 18px;
    line-height: 1;
    color: ${colors.muted};
  `;
  closeBtn.addEventListener("mouseenter", () => {
    closeBtn.style.background =
      "var(--material-button-hover, rgba(0, 0, 0, 0.06))";
  });
  closeBtn.addEventListener("mouseleave", () => {
    closeBtn.style.background = "transparent";
  });
  closeBtn.addEventListener("click", () => closeHelpDialog(doc));
  header.appendChild(closeBtn);

  dialog.appendChild(header);

  const content = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as HTMLElement;
  content.className = "vt-help-dialog-content";
  content.style.cssText = `
    padding: 16px 20px;
    overflow-y: auto;
    flex: 1;
    max-height: 60vh;
    color: ${colors.text};
  `;

  const sections = [
    {
      titleKey: "vertical-tabs-help-section-1-title",
      contentKey: "vertical-tabs-help-section-1-content",
    },
    {
      titleKey: "vertical-tabs-help-section-2-title",
      contentKey: "vertical-tabs-help-section-2-content",
    },
    {
      titleKey: "vertical-tabs-help-section-3-title",
      contentKey: "vertical-tabs-help-section-3-content",
    },
    {
      titleKey: "vertical-tabs-help-section-4-title",
      contentKey: "vertical-tabs-help-section-4-content",
    },
  ] as const;

  for (let i = 0; i < sections.length; i++) {
    const { titleKey, contentKey } = sections[i];
    const section = doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    ) as HTMLElement;
    section.className = "vt-help-dialog-section";
    if (i > 0) {
      section.style.marginTop = "16px";
    }

    const sectionTitle = doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    ) as HTMLElement;
    sectionTitle.className = "vt-help-dialog-section-title";
    sectionTitle.textContent = getString(titleKey);
    sectionTitle.style.cssText = `
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 6px;
    `;
    section.appendChild(sectionTitle);

    const sectionContent = doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    ) as HTMLElement;
    sectionContent.className = "vt-help-dialog-section-content";
    sectionContent.textContent = getString(contentKey);
    sectionContent.style.cssText = `
      font-size: 13px;
      line-height: 1.6;
      color: ${colors.muted};
    `;
    section.appendChild(sectionContent);

    content.appendChild(section);
  }

  dialog.appendChild(content);
  overlay.appendChild(dialog);
  doc.documentElement?.appendChild(overlay);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      closeHelpDialog(doc);
    }
  });

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closeHelpDialog(doc);
    }
  };
  escListeners.set(doc, onKeyDown);
  doc.addEventListener("keydown", onKeyDown, true);
}
