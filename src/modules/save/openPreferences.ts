import { config } from "../../../package.json";

export function openPluginPreferences(): void {
  try {
    Zotero.Utilities.Internal.openPreferences(config.addonID);
  } catch (error) {
    ztoolkit.log("Failed to open plugin preferences:", error);
  }
}
