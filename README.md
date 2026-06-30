# Zotero Better Vertical Tabs

[![Using Zotero Plugin Template](https://img.shields.io/badge/Using-Zotero%20Plugin%20Template-blue?style=flat-square&logo=github)](https://github.com/windingwind/zotero-plugin-template)

A vertical tabs extension for [Zotero](https://www.zotero.org/).

[English](./README.md) | [简体中文](./doc/README-zhCN.md)

![logo](.\doc\figs\logo.jpg)

A vertical tabs plugin for both the Zotero main window and the PDF reader.

This plugin helps you manage open tabs through a vertical sidebar, making it faster to locate tabs, switch views, and organize tabs into categories.

---

# 🧩 Features

## 1️⃣ Main Window

After installing the plugin, a vertical tabs sidebar (VT) appears on the left side of the main window. It automatically expands when you hover over it and collapses when you move the cursor away.

The main window VT currently supports:

1. **Tab Synchronization**: Keeps in sync with Zotero's native tab bar; attachments display their parent item icon.

2. **Hover Detail Card**: Shows detailed item information when hovering over a tab.

3. **Tab Search**: Quickly filter open tabs via the search box at the top.

4. **Category Management**: Create categories and set category colors via right-click (colors can be customized in the plugin preferences).

5. **Drag & Drop**: Drag tabs to reorder or categorize them; entire categories can also be dragged.

6. **Save & Import Categories**: Save frequently used categories locally and import them with one click when needed.

   ![Category](.\doc\figs\Category.jpg)

## 3️⃣ Preferences

The plugin provides the following preferences (`Edit` → `Preferences` → `Better Vertical Tabs`):

- **Custom Tab Height**: Adjust the display height of individual tab items in VT.
- **Enable Blur Effect**: Use a frosted-glass background for popups/hover cards; disable it if your environment does not support `backdrop-filter` or based on personal preference.
- **Auto-Close Unread Tabs**: Automatically close tabs that have not been read for X days. This feature is disabled by default and must be enabled manually.

---

# 🚀 Installation

1. Download the `.xpi` plugin file from the Release page.
2. Open Zotero and click `Tools` → `Plugins` in the top menu bar.
3. Click the gear icon in the top-right corner → `Install Plugin From File`.
4. Select the downloaded `.xpi` file and install it.
5. Restart Zotero for the plugin to take effect.

---

# ⚠️ Known Issues

1. Currently, VT only synchronizes tab order from the Zotero native tab bar in one direction: dragging tabs in the native tab bar will not sync their order to VT, which may cause inconsistencies. It is recommended to manage tab order using VT.

---

# 📄 License

This project is open source under the [AGPL-3.0-or-later](./LICENSE) license.
