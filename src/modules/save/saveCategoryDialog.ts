import { getString } from "../../utils/locale";

export async function promptOverwriteSavedCategory(
  doc: Document,
  name: string,
): Promise<boolean> {
  const dialogData: { [key: string]: any } = {};

  new ztoolkit.Dialog(1, 1)
    .addCell(0, 0, {
      tag: "div",
      namespace: "html",
      properties: {
        innerHTML: getString("vertical-tabs-overwrite-confirm", {
          args: { name },
        }),
      },
    })
    .addButton(getString("vertical-tabs-confirm"), "confirm")
    .addButton(getString("vertical-tabs-cancel"), "cancel")
    .setDialogData(dialogData)
    .open(getString("vertical-tabs-overwrite-title"));

  await dialogData.unloadLock.promise;
  return dialogData._lastButtonId === "confirm";
}
