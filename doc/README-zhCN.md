# Zotero Better Vertical Tabs插件

[![Using Zotero Plugin Template](https://img.shields.io/badge/Using-Zotero%20Plugin%20Template-blue?style=flat-square&logo=github)](https://github.com/windingwind/zotero-plugin-template)

适配 [Zotero](https://www.zotero.org/) 的垂直标签栏拓展插件。

[English](../README.md) | [简体中文](./README-zhCN.md)

一个适配Zotero主页面、PDF阅读页面的垂直标签栏插件。

本插件旨在支持用户通过垂直标签栏的方式管理已经打开的标签栏，更快速地定位已打开的标签，并对标签进行分类等操作。

---

# 🧩 功能预览

## 1️⃣ 主页面

加载插件后，主页面最左侧会出现垂直侧边栏（VT），鼠标放在侧边栏后VT会自动展开。

目前版本垂直侧边栏实现了：

1、标签与原生标签栏同步，附件显示父条目图标，标签详细信息悬浮框。

2、搜索标签

3、新建分类。右键分类栏可对分类进行颜色设置（颜色可在插件首选项内自定义）

4、拖拽整理标签，分类也可以统一拖拽。

主页面垂直标签栏可以通过左上角的固定按钮固定在主页面上。

## 2️⃣ PDF阅读界面

在主页面左侧边栏会出现“V”图标，点击即可打开VT。

每个标签的侧边栏都是相互独立的，因此打开新标签需要重新点击V图标打开VT。但已经打开了VT的标签会固定在VT页面，重启Zotero也会保持。

## 3️⃣首选项设置

-
- 自动清除X天没有阅读的标签，该功能默认关闭，需手动开启。

*

# 🚀 安装方式

1. 在release页面下载 `.xpi` 插件文件
2. 打开 Zotero，点击顶部菜单栏中的 `工具` → `插件`
3. 点击右上角齿轮图标 → `从文件安装插件`
4. 选择下载的 `.xpi` 文件并安装

# 可能存在的bug及后续计划

1、目前只实现了VT对Zotero原生标签单方面的顺序同步，拖拽原生标签不会改变VT的顺序，可能造成bug，请尽量使用VT管理标签。

2、后续计划开发保存VT工作区和导入功能，该功能可以保存目前的VT分类和顺序，下次导入会清空VT并还原。

3、更fluent的拖拽等动画效果。
