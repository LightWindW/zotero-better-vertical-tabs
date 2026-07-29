# Zotero Better Vertical Tabs

[![Using Zotero Plugin Template](https://img.shields.io/badge/Using-Zotero%20Plugin%20Template-blue?style=flat-square&logo=github)](https://github.com/windingwind/zotero-plugin-template)

A vertical tabs extension for [Zotero](https://www.zotero.org/).

[English](./README.md) | [简体中文](./doc/README-zhCN.md) | [Español](./doc/README-esES.md)

![logo](.\doc\figs\logo.jpg)

A vertical tabs plugin for both the Zotero main window and the PDF reader.

This plugin helps you manage open tabs through a vertical sidebar, making it faster to locate tabs, switch views, and organize tabs into categories.

---

# 🧩 Features

## 1️⃣ Main Window

After installing the plugin, a vertical tabs sidebar (VT) appears on the left side of the main window. It automatically expands when you hover over it and collapses when you move the cursor away.

![VT](.\doc\figs\VT.gif)

The main window VT currently supports:

1. **Tab Synchronization**: Keeps in sync with Zotero's native tab bar; attachments display their parent item icon.

2. **Hover Detail Card**: Shows detailed item information when hovering over a tab.

3. **Tab Search**: Quickly filter open tabs via the search box at the top.

4. **Drag & Drop**: Drag tabs to reorder or categorize them; entire categories can also be dragged. Use **Ctrl/Shift+click** to multi-select tabs for batch drag-and-drop.

5. **Save & Import Categories**: Save frequently used categories locally and import them with one click when needed.

   ![Category](.\doc\figs\Category.jpg)

## 2️⃣ Category Creation

The plugin provides three ways to create categories, making it easy to organize tabs by project, topic, or reading plan:

- **① Right-Click Menu**: Select one or more tabs, right-click → "Add Category".

  <img src=".\doc\figs\add1.jpg" width="300" />

- **② Drag to "+ New Category" Drop Zone**: Drag tabs to the dashed box at the top of the sidebar and release to create a new category.

  <img src=".\doc\figs\add2.gif" width="300" />

- **③ More Menu**: Click "More" → "Add Category" in the top-right corner to create an empty category, then drag tabs into it.

  <img src=".\doc\figs\add3.jpg" width="300" />

## 3️⃣ Expand Modes

The "More" menu offers three sidebar expand modes to suit different workflows:

| Mode | Behavior |
|------|----------|
| **Auto** | Automatically expands on hover, collapses on mouse leave — ideal for quickly browsing tabs |
| **Manual** | Hover does not expand; click the Pin button to expand. Stays expanded until the Pin button is clicked again |
| **Minimal** | Same as Manual, but the collapsed strip shrinks to a 20px icon-only bar, for minimal visual distraction |

Mode changes take effect immediately across all windows.

## 4️⃣ PDF Reader Management

Zotero runs PDF readers in isolated sandboxes. The more readers are open, the more memory is consumed. This plugin provides the following tools to manage reader resources:

- **Green Highlight Indicator**: Tabs with an open PDF reader display a green vertical bar on the far left — recognizable at a glance (can be disabled in Preferences).

- **Manual Reader Close/Open**: Right-click a tab → "Close Reader" / "Open Reader" to instantly free memory — without affecting the tab itself.

- **Auto-Close Idle Readers**: Enabled by default. The plugin automatically closes PDF readers that have not been read for a specified number of minutes. Default is 120 minutes, adjustable in Preferences.

## 5️⃣ Auto-Close Idle Tabs

To prevent tab clutter from long-unread tabs, the plugin can automatically close tabs that have not been read for a specified number of days.

- **Disabled by default**: Must be manually enabled in Preferences.
- A configurable day threshold — tabs unread beyond this limit are automatically closed.

## 6️⃣ Preferences

The plugin provides the following preferences (`Edit` → `Preferences` → `Better Vertical Tabs`):

- **Custom Tab Height**: Adjust the display height of individual tab items in VT.
- **Expand Mode**: Switch between Auto / Manual / Minimal modes.
- **Enable Blur Effect**: Use a frosted-glass background for popups/hover cards; disable it if your environment does not support `backdrop-filter` or based on personal preference.
- **PDF Reader Highlight Indicator**: Show a green indicator bar on tabs with an open PDF reader; can be disabled.
- **Auto-Close Idle Readers**: When enabled, PDF readers idle for more than X minutes are automatically closed.
- **Auto-Close Idle Tabs**: When enabled, tabs idle for more than X days are automatically closed; disabled by default.

---

# 🚀 Installation

1. Download the `.xpi` plugin file from the Release page.
2. Open Zotero and click `Tools` → `Plugins` in the top menu bar.
3. Click the gear icon in the top-right corner → `Install Plugin From File`.
4. Select the downloaded `.xpi` file and install it.
5. Restart Zotero for the plugin to take effect.

---

# ⚠️ Known Issues

1. Currently, VT only synchronizes tab order from the Zotero native tab bar in one direction: dragging tabs in the native tab bar will not sync their order to VT, which may cause inconsistencies. It is recommended to manage tab order using VT, or use "More → Hide Native Tabs" to show only the vertical tab bar.

---

# 📄 License

This project is open source under the [AGPL-3.0-or-later](./LICENSE) license.
