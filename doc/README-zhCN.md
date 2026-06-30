# Zotero Better Vertical Tabs 插件

[![Using Zotero Plugin Template](https://img.shields.io/badge/Using-Zotero%20Plugin%20Template-blue?style=flat-square&logo=github)](https://github.com/windingwind/zotero-plugin-template)

适配 [Zotero](https://www.zotero.org/) 的垂直标签栏拓展插件。

[English](../README.md) | [简体中文](./README-zhCN.md)

![logo](.\figs\logo.jpg)

一个适配 Zotero 主页面、PDF 阅读页面的垂直标签栏插件。

本插件旨在通过垂直标签栏的方式管理已经打开的标签页，帮助用户更快速地定位标签、切换视图，并对标签进行分类整理。

---

# 🧩 功能预览

## 1️⃣ 主页面

加载插件后，主页面最左侧会出现垂直标签栏（VT）。鼠标悬停在该区域时 VT 会自动展开，移出后自动折叠。

目前主页面 VT 已实现：

1. **标签同步**：与 Zotero 原生标签栏保持同步，附件条目显示父条目图标。

2. **悬浮详情卡片**：鼠标悬停在标签上时显示条目详细信息。

3. **搜索标签**：在顶部搜索框快速过滤已打开的标签。

4. **分类管理**：支持新建分类，右键分类栏可设置分类颜色（颜色可在插件首选项内自定义）。

5. **拖拽整理**：支持拖拽标签调整顺序或归类，整个分类也可以统一拖拽。

6. **分类保存与导入**：可将常用分类保存到本地，需要时一键导入。

   ![Category](.\figs\Category.jpg)

## 3️⃣ 首选项设置

插件提供以下首选项（`编辑` → `首选项` → `Better Vertical Tabs`）：

- **标签高度自定义**：调整 VT 中单个标签项的显示高度。
- **启用磨砂效果**：在弹窗/悬浮卡片中使用磨砂背景，兼容不支持 `backdrop-filter` 的环境或用户个人偏好。
- **自动清除未读标签**：可设置超过 X 天没有阅读的标签自动关闭，默认关闭，需手动开启。

---

# 🚀 安装方式

1. 在 Release 页面下载 `.xpi` 插件文件。
2. 打开 Zotero，点击顶部菜单栏中的 `工具` → `插件`。
3. 点击右上角齿轮图标 → `从文件安装插件`。
4. 选择下载的 `.xpi` 文件并安装。
5. 安装完成后重启 Zotero 即可生效。

---

# ⚠️ 可能存在的 bug

1. 目前 VT 只实现了对 Zotero 原生标签单方面的顺序同步：拖拽原生标签栏不会同步改变 VT 的顺序，可能造成显示不一致。建议尽量使用 VT 管理标签顺序。

---

# 📄 开源协议

本项目基于 [AGPL-3.0-or-later](./LICENSE) 协议开源。
