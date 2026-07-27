/**
 * Modal dialog for editing a Zotero item's Extra field. Used from the
 * single-tab right-click context menu when the "showExtra" preference is
 * enabled and the item has Extra content.
 */

import { getString } from "../../utils/locale";
import { setDialogOpen } from "../sidebar/sidebar";
import { isDarkMode } from "../render/colorUtils";

/**
 * Open a textarea dialog pre-filled with the item's current Extra content.
 * Resolves with the edited text on confirm, or null when cancelled.
 */
export async function promptEditExtra(
  doc: Document,
  itemId: number,
  currentExtra: string,
): Promise<string | null> {
  setDialogOpen(doc, true);

  const dialogData: { [key: string]: any } = {
    extraValue: currentExtra,
  };

  const dark = isDarkMode(doc);
  const textColor = dark ? "#eee" : "#333";
  const bgColor = dark ? "#3a3a3a" : "#fff";
  const borderColor = dark ? "#555" : "#ccc";

  const dialog = new ztoolkit.Dialog(2, 1)
    .addCell(0, 0, {
      tag: "label",
      namespace: "html",
      properties: {
        innerHTML: getString("vertical-tabs-edit-extra"),
      },
    })
    .addCell(1, 0, {
      tag: "textarea",
      namespace: "html",
      id: "vt-edit-extra-textarea",
      attributes: {
        "data-bind": "extraValue",
        "data-prop": "value",
      },
      properties: {
        style: `width: 360px; height: 160px; resize: vertical; color: ${textColor}; background: ${bgColor}; border: 1px solid ${borderColor}; border-radius: 4px; padding: 8px; font-size: 13px; line-height: 1.5;`,
      },
    })
    .addButton(getString("vertical-tabs-confirm"), "confirm")
    .addButton(getString("vertical-tabs-cancel"), "cancel")
    .setDialogData(dialogData)
    .open(getString("vertical-tabs-edit-extra"));

  dialogData.loadCallback = () => {
    const textarea = dialog.window.document.getElementById(
      "vt-edit-extra-textarea",
    ) as HTMLTextAreaElement | null;
    if (!textarea) return;
    textarea.focus();
    // Place cursor at the end
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    // Ctrl+Enter to confirm
    textarea.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        dialogData._lastButtonId = "confirm";
        dialog.window.close();
      }
    });
  };

  try {
    await dialogData.unloadLock.promise;
  } finally {
    setDialogOpen(doc, false);
  }

  if (dialogData._lastButtonId !== "confirm") return null;
  return ((dialogData.extraValue as string) || "").trimEnd();
}
