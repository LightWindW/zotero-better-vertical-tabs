/**
 * Modal "name a category" dialog shared by the more-menu "add category" flow
 * and the drag-to-top quick-create drop zone.
 *
 * Extracted from categoryManager.handleAddCategory: ztoolkit.Dialog with a
 * label + text input, confirm/cancel buttons, Enter-to-confirm and auto
 * focus+select. The sidebar collapse guard (setDialogOpen) is held for the
 * whole lifetime of the dialog.
 */

import { getString } from "../../utils/locale";
import { setDialogOpen } from "../sidebar/sidebar";

export interface CategoryNameDialogOptions {
  /** Used as both the input label and the dialog window title. */
  title: string;
  /** Initial input value, e.g. the default "new category" name. */
  initial: string;
  /** Input element id inside the dialog document (stable per call site). */
  inputId: string;
}

/**
 * Open the dialog and resolve with the trimmed name on confirm, or null when
 * cancelled / closed / left empty.
 *
 * The collapse guard is set synchronously at call time (before the first
 * await), so a drop handler that calls this without awaiting still blocks the
 * floating-sidebar collapse that a bubbled drop may schedule right after.
 */
export async function promptCategoryName(
  doc: Document,
  options: CategoryNameDialogOptions,
): Promise<string | null> {
  setDialogOpen(doc, true);

  const dialogData: { [key: string]: any } = {
    inputValue: options.initial,
  };

  const dialog = new ztoolkit.Dialog(2, 1)
    .addCell(0, 0, {
      tag: "label",
      namespace: "html",
      properties: {
        innerHTML: options.title,
      },
    })
    .addCell(1, 0, {
      tag: "input",
      namespace: "html",
      id: options.inputId,
      attributes: {
        "data-bind": "inputValue",
        "data-prop": "value",
        type: "text",
      },
    })
    .addButton(getString("vertical-tabs-confirm"), "confirm")
    .addButton(getString("vertical-tabs-cancel"), "cancel")
    .setDialogData(dialogData)
    .open(options.title);

  dialogData.loadCallback = () => {
    const input = dialog.window.document.getElementById(
      options.inputId,
    ) as HTMLInputElement | null;
    if (!input) return;
    input.focus();
    input.select();
    input.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter") {
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
  const name = ((dialogData.inputValue as string) || "").trim();
  return name || null;
}
