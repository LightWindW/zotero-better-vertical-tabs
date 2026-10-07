import { config } from "../../package.json";
import { dispatchVtEvent } from "../modules/core/events";
import {
  applyTabHeightToAllWindows,
  getTabHeightValue,
  type TabHeight,
} from "../modules/render/tabHeight";
import { clearSavedCategories } from "../modules/save/savedCategoryStore";
import { clearCardFigures } from "../modules/ui/cardFigure";

export async function registerPrefsScripts(_window: Window) {
  // This function is called when the prefs window is opened
  // See addon/content/preferences.xhtml onload
  addon.data.prefs = {
    window: _window,
  };
  bindPrefEvents();
}

function bindPrefEvents() {
  addon.data
    .prefs!.window.document?.querySelector(
      `#zotero-prefpane-${config.addonRef}-enable`,
    )
    ?.addEventListener("command", (e: Event) => {
      ztoolkit.log(e);
    });

  const vtCheckbox = addon.data.prefs!.window.document?.querySelector(
    `#zotero-prefpane-${config.addonRef}-vertical-tabs-enabled`,
  );
  if (vtCheckbox) {
    vtCheckbox.addEventListener("command", (e: Event) => {
      const checked = (e.target as XUL.Checkbox).checked;
      Zotero.Prefs.set(
        `${config.prefsPrefix}.verticalTabs.enabled`,
        checked,
        false,
      );
    });
  }

  // showExtra checkbox: manually fire Zotero.Prefs.set to trigger observers
  const showExtraCheckbox = addon.data.prefs!.window.document?.querySelector(
    `#zotero-prefpane-${config.addonRef}-show-extra`,
  );
  if (showExtraCheckbox) {
    showExtraCheckbox.addEventListener("command", (e: Event) => {
      Zotero.Prefs.set(
        `${config.prefsPrefix}.verticalTabs.showExtra`,
        (e.target as XUL.Checkbox).checked,
        false,
      );
    });
  }

  // showReaderLoadedIndicator checkbox
  const showReaderLoadedIndicatorCheckbox =
    addon.data.prefs!.window.document?.querySelector(
      `#zotero-prefpane-${config.addonRef}-show-reader-loaded-indicator`,
    );
  if (showReaderLoadedIndicatorCheckbox) {
    showReaderLoadedIndicatorCheckbox.addEventListener(
      "command",
      (e: Event) => {
        Zotero.Prefs.set(
          `${config.prefsPrefix}.verticalTabs.showReaderLoadedIndicator`,
          (e.target as XUL.Checkbox).checked,
          false,
        );
        // Re-render VT sidebars so the indicator visibility updates immediately.
        for (const win of Zotero.getMainWindows()) {
          dispatchVtEvent(win.document, "vertical-tabs:data-changed");
        }
      },
    );
  }

  // releaseReaderEnabled checkbox
  const releaseReaderEnabledCheckbox =
    addon.data.prefs!.window.document?.querySelector(
      `#zotero-prefpane-${config.addonRef}-release-reader-enabled`,
    );
  if (releaseReaderEnabledCheckbox) {
    releaseReaderEnabledCheckbox.addEventListener("command", (e: Event) => {
      Zotero.Prefs.set(
        `${config.prefsPrefix}.verticalTabs.releaseReaderEnabled`,
        (e.target as XUL.Checkbox).checked,
        false,
      );
    });
  }

  // releaseReaderMinutes input: clamp to 1-1440 and set pref
  const releaseReaderMinutesInput =
    addon.data.prefs!.window.document?.getElementById(
      `${config.addonRef}-release-reader-minutes`,
    ) as HTMLInputElement | null;
  if (releaseReaderMinutesInput) {
    releaseReaderMinutesInput.addEventListener("change", () => {
      let minutes = parseInt(releaseReaderMinutesInput.value, 10);
      if (Number.isNaN(minutes)) minutes = 30;
      minutes = Math.max(1, Math.min(1440, minutes));
      releaseReaderMinutesInput.value = String(minutes);
      Zotero.Prefs.set(
        `${config.prefsPrefix}.verticalTabs.releaseReaderMinutes`,
        minutes,
        false,
      );
    });
  }

  // enableBlur checkbox: manually fire Zotero.Prefs.set to trigger observers
  const enableBlurCheckbox = addon.data.prefs!.window.document?.querySelector(
    `#zotero-prefpane-${config.addonRef}-enable-blur`,
  );
  if (enableBlurCheckbox) {
    enableBlurCheckbox.addEventListener("command", (e: Event) => {
      Zotero.Prefs.set(
        `${config.prefsPrefix}.verticalTabs.enableBlur`,
        (e.target as XUL.Checkbox).checked,
        false,
      );
    });
  }

  // autoExpandEmbedded checkbox: keep the sidebar layout in sync immediately
  // when the preference is changed from the preferences window.
  const autoExpandEmbeddedCheckbox =
    addon.data.prefs!.window.document?.querySelector(
      `#zotero-prefpane-${config.addonRef}-auto-expand-embedded`,
    );
  if (autoExpandEmbeddedCheckbox) {
    autoExpandEmbeddedCheckbox.addEventListener("command", (e: Event) => {
      Zotero.Prefs.set(
        `${config.prefsPrefix}.verticalTabs.autoExpandEmbedded`,
        (e.target as XUL.Checkbox).checked,
        false,
      );
    });
  }

  // Expand/collapse animation checkbox. The sidebar preference observer
  // applies the change to every initialized main window immediately.
  const expandCollapseAnimationCheckbox =
    addon.data.prefs!.window.document?.querySelector(
      `#zotero-prefpane-${config.addonRef}-apply-expand-collapse-animation`,
    );
  if (expandCollapseAnimationCheckbox) {
    expandCollapseAnimationCheckbox.addEventListener("command", (e: Event) => {
      Zotero.Prefs.set(
        `${config.prefsPrefix}.verticalTabs.applyExpandCollapseAnimation`,
        (e.target as XUL.Checkbox).checked,
        false,
      );
    });
  }

  // autoCloseEnabled checkbox
  const autoCloseCheckbox = addon.data.prefs!.window.document?.querySelector(
    `#zotero-prefpane-${config.addonRef}-auto-close-enabled`,
  );
  if (autoCloseCheckbox) {
    autoCloseCheckbox.addEventListener("command", (e: Event) => {
      Zotero.Prefs.set(
        `${config.prefsPrefix}.verticalTabs.autoCloseEnabled`,
        (e.target as XUL.Checkbox).checked,
        false,
      );
    });
  }

  // autoCloseDays input: clamp to 1-365 and set pref
  const autoCloseDaysInput = addon.data.prefs!.window.document?.getElementById(
    `${config.addonRef}-auto-close-days`,
  ) as HTMLInputElement | null;
  if (autoCloseDaysInput) {
    autoCloseDaysInput.addEventListener("change", () => {
      let days = parseInt(autoCloseDaysInput.value, 10);
      if (Number.isNaN(days)) days = 7;
      days = Math.max(1, Math.min(365, days));
      autoCloseDaysInput.value = String(days);
      Zotero.Prefs.set(
        `${config.prefsPrefix}.verticalTabs.autoCloseDays`,
        days,
        false,
      );
    });
  }

  const protectCategorizedTabsCheckbox =
    addon.data.prefs!.window.document?.querySelector(
      `#zotero-prefpane-${config.addonRef}-protect-categorized-tabs`,
    );
  if (protectCategorizedTabsCheckbox) {
    protectCategorizedTabsCheckbox.addEventListener("command", (e: Event) => {
      Zotero.Prefs.set(
        `${config.prefsPrefix}.verticalTabs.protectCategorizedTabs`,
        (e.target as XUL.Checkbox).checked,
        false,
      );
    });
  }

  // Tab height dropdown: set pref and immediately update all VT sidebars.
  const tabHeightMenulist = addon.data.prefs!.window.document?.getElementById(
    `zotero-prefpane-${config.addonRef}-tab-height`,
  ) as XUL.MenuList | null;
  if (tabHeightMenulist) {
    tabHeightMenulist.value = getTabHeightValue();
    tabHeightMenulist.addEventListener("command", () => {
      const value = tabHeightMenulist.value as TabHeight;
      Zotero.Prefs.set(
        `${config.prefsPrefix}.verticalTabs.tabHeight`,
        value,
        false,
      );
      applyTabHeightToAllWindows(value);
    });
  }

  // Category color inputs (2-6)
  const colorInputs: HTMLInputElement[] = [];
  for (let i = 2; i <= 6; i++) {
    const input = addon.data.prefs!.window.document?.getElementById(
      `${config.addonRef}-cat-color-${i}`,
    ) as HTMLInputElement | null;
    if (input) {
      // Load saved value
      const saved = Zotero.Prefs.get(
        `${config.prefsPrefix}.verticalTabs.categoryColors`,
      ) as string | undefined;
      if (saved) {
        const parts = saved.split(",").map((s) => s.trim());
        if (parts[i - 2]) input.value = parts[i - 2];
      }
      input.addEventListener("change", () => {
        colorInputs[i - 2] = input;
        const values = colorInputs.map((inp) => inp?.value || "").join(",");
        if (values.split(",").filter(Boolean).length === 5) {
          Zotero.Prefs.set(
            `${config.prefsPrefix}.verticalTabs.categoryColors`,
            values,
            false,
          );
        }
      });
      colorInputs[i - 2] = input;
    }
  }

  // Clear VT data button
  const clearBtn = addon.data.prefs!.window.document?.getElementById(
    `${config.addonRef}-clear-vt-data`,
  ) as HTMLButtonElement | null;
  if (clearBtn) {
    clearBtn.addEventListener("click", async () => {
      try {
        const storageDir = Zotero.getStorageDirectory();
        const dataPath = PathUtils.join(
          storageDir.path,
          `BVT-vertical-tabs.json`,
        );

        await IOUtils.writeUTF8(
          dataPath,
          JSON.stringify(
            {
              version: 3,
              categories: [],
              uncategorizedOrder: [],
              uncategorizedItemIds: [],
            },
            null,
            2,
          ),
        );

        // Force reload VT data from JSON
        for (const win of Zotero.getMainWindows()) {
          const doc = win.document;
          const event = doc.createEvent("CustomEvent");
          event.initCustomEvent(
            "vertical-tabs:force-reload",
            true,
            false,
            null,
          );
          doc.dispatchEvent(event);
        }
      } catch {
        // ignore
      }
    });
  }

  const clearCardFiguresBtn = addon.data.prefs!.window.document?.getElementById(
    `${config.addonRef}-clear-card-figures`,
  ) as HTMLButtonElement | null;
  if (clearCardFiguresBtn) {
    clearCardFiguresBtn.addEventListener("click", async () => {
      try {
        await clearCardFigures();
        for (const win of Zotero.getMainWindows()) {
          dispatchVtEvent(win.document, "vertical-tabs:card-figures-cleared");
        }
      } catch (error) {
        ztoolkit.log("Failed to clear card figures:", error);
      }
    });
  }

  // Delete saved categories button
  const deleteSavedBtn = addon.data.prefs!.window.document?.getElementById(
    `${config.addonRef}-delete-saved-categories`,
  ) as HTMLButtonElement | null;
  if (deleteSavedBtn) {
    deleteSavedBtn.addEventListener("click", async () => {
      try {
        await clearSavedCategories();
      } catch {
        // ignore
      }
    });
  }
}
