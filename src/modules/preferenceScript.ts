import { config } from "../../package.json";

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
      // Auto-sync mainPageEnabled checkbox when global VT is toggled
      const mainPageCheckbox = addon.data.prefs!.window.document?.querySelector(
        `#zotero-prefpane-${config.addonRef}-main-page-enabled`,
      ) as XUL.Checkbox | null;
      if (mainPageCheckbox) {
        mainPageCheckbox.checked = checked;
        Zotero.Prefs.set(
          `${config.prefsPrefix}.verticalTabs.mainPageEnabled`,
          checked,
          false,
        );
      }
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

  // mainPageEnabled checkbox
  const mainPageCheckbox = addon.data.prefs!.window.document?.querySelector(
    `#zotero-prefpane-${config.addonRef}-main-page-enabled`,
  );
  if (mainPageCheckbox) {
    mainPageCheckbox.addEventListener("command", (e: Event) => {
      Zotero.Prefs.set(
        `${config.prefsPrefix}.verticalTabs.mainPageEnabled`,
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

        // Read existing data to preserve trackedItems
        let trackedItems = {};
        if (await IOUtils.exists(dataPath)) {
          try {
            const raw = await IOUtils.readUTF8(dataPath);
            const parsed = JSON.parse(raw);
            trackedItems = parsed.trackedItems || {};
          } catch {
            // ignore
          }
        }

        // Get native tab order (skip library tab at index 0)
        const uncategorizedOrder: string[] = [];
        try {
          const win = Zotero.getMainWindows()[0] as any;
          const ztabs = win?.Zotero_Tabs;
          const internalTabs = ztabs?._tabs as any[] | undefined;
          if (internalTabs) {
            for (let i = 1; i < internalTabs.length; i++) {
              const tid = String(internalTabs[i]?.id ?? "");
              if (tid) uncategorizedOrder.push(tid);
            }
          }
        } catch {
          // ignore
        }

        await IOUtils.writeUTF8(
          dataPath,
          JSON.stringify(
            {
              version: 2,
              categories: [],
              trackedItems,
              uncategorizedOrder,
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
}
