import { config } from "../../../package.json";

const PANEL_WIDTH = "260px";
const SIDEBAR_ID = `${config.addonRef}-vertical-tabs-sidebar`;
const WRAPPER_ID = `${config.addonRef}-vertical-tabs-wrapper`;
const SPLITTER_ID = `${config.addonRef}-vertical-tabs-splitter`;
const STYLE_ID = `${config.addonRef}-vertical-tabs-styles`;

export function injectStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElementNS("http://www.w3.org/1999/xhtml", "style");
  style.id = STYLE_ID;
  style.textContent = getStyles();
  doc.documentElement?.appendChild(style);
}

export function removeStyles(doc: Document): void {
  const style = doc.getElementById(STYLE_ID);
  if (style) style.remove();
}

export function getStyles(): string {
  return `
    #${SIDEBAR_ID} {
      position: relative;
      flex-shrink: 0;
      width: ${PANEL_WIDTH};
      min-width: 160px;
      max-width: 800px;
      height: 100%;
      background: var(--material-sidepane, #f5f5f5);
      border-right: 1px solid #DBDBDB;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      font-family: inherit;
      font-size: 13px;
      color: var(--material-text, #222);
      user-select: none;
      --vt-content-opacity: 1;
    }

    #${SIDEBAR_ID}[hidden] {
      display: none !important;
    }

    #${SIDEBAR_ID}.vertical-tabs-sidebar-pinned {
      position: relative;
      width: 100% !important;
      height: 100%;
      flex-shrink: 0;
    }

    #${SIDEBAR_ID}.vertical-tabs-sidebar-floating {
      position: relative;
      width: 35px;
      min-width: 35px;
      height: 100%;
      z-index: 100000;
      flex-shrink: 0;
      border-right: 1px solid #DBDBDB;
      box-shadow: none;
      overflow: hidden;
      transition: width 0.2s, border-color 0.2s, box-shadow 0.2s;
      transition-timing-function: ease-out;
    }

    #${SIDEBAR_ID}.vertical-tabs-sidebar-floating.vertical-tabs-sidebar-expanded {
      width: var(--vt-expanded-width, ${PANEL_WIDTH});
      border-right-color: transparent;
      box-shadow: 2px 0 8px rgba(0, 0, 0, 0.15);
      pointer-events: auto;
      transition-timing-function: ease-in;
    }

    #${SIDEBAR_ID} .vertical-tabs-header {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      min-height: 38px;
      padding: 6px 12px 6px 5px;
      border-bottom: 1px solid var(--material-border, #ccc);
      font-weight: 600;
      transition: padding 0.2s ease-out, gap 0.2s ease-out;
    }

    #${SIDEBAR_ID} .vertical-tabs-search {
      flex: 1;
      min-width: 0;
      height: 20px;
      padding: 2px 8px;
      border: 1.5px solid transparent;
      border-radius: 12px;
      background: var(--material-background, #fff);
      color: var(--material-text, #222);
      font-size: 12px;
      outline: none;
      transition: border-color 0.2s ease;
    }

    #${SIDEBAR_ID} .vertical-tabs-search::placeholder {
      color: var(--material-text-muted, #999);
    }

    #${SIDEBAR_ID} .vertical-tabs-search:focus {
      border-color: #DBDBDB;
    }

    #${SIDEBAR_ID} .vertical-tabs-pin-btn {
      background: transparent;
      border: none;
      cursor: pointer;
      padding: 4px;
      margin-right: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: padding 0.2s ease-out, margin 0.2s ease-out, background 0.2s ease-out;
    }

    #${SIDEBAR_ID} .vertical-tabs-pin-icon {
      width: 16px;
      height: 16px;
      object-fit: contain;
      display: block;
    }

    #${SIDEBAR_ID} .vertical-tabs-pin-btn:hover {
      background: var(--material-button-hover, rgba(0, 0, 0, 0.06));
      border-radius: 4px;
      color: #999;
    }

    #${SIDEBAR_ID} .vertical-tabs-more-btn {
      background: transparent;
      border: none;
      cursor: pointer;
      font-size: 18px;
      line-height: 1;
      padding: 0 4px;
      color: #6C6C6C;
    }

    #${SIDEBAR_ID} .vertical-tabs-more-btn:hover {
      background: var(--material-button-hover, rgba(0, 0, 0, 0.06));
      border-radius: 4px;
      color: #999;
    }

    #${SIDEBAR_ID} .vertical-tabs-categories {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow-y: auto;
      padding: 2px 0;
    }

    #${SIDEBAR_ID} .vertical-tabs-category {
      display: grid;
      grid-template-rows: auto 1fr;
      transition: grid-template-rows 0.3s ease-out;
      margin-bottom: 2px;
    }

    #${SIDEBAR_ID} .vertical-tabs-category.collapsed {
      grid-template-rows: auto 0fr;
    }

    #${SIDEBAR_ID} .vertical-tabs-category-header {
      position: relative;
      display: flex;
      align-items: center;
      min-height: 28px;
      padding: 4px 12px 4px 10px;
      cursor: pointer;
      gap: 6px;
      transition: padding 0.2s ease-out, gap 0.2s ease-out;
    }

    #${SIDEBAR_ID} .vertical-tabs-category-header:hover {
      background: var(--material-hover, rgba(0, 0, 0, 0.04));
    }

    #${SIDEBAR_ID} .vertical-tabs-category.drag-over {
      background: var(--material-selected, rgba(0, 0, 0, 0.05));
      outline: 1px dashed #999;
      outline-offset: -1px;
      border-radius: 4px;
      transition: none;
    }

    /* Category reorder drop indicators */
    #${SIDEBAR_ID} .vertical-tabs-category.cat-drop-before {
      border-top: 2px solid #42614D;
      transition: none;
    }

    #${SIDEBAR_ID} .vertical-tabs-category.cat-drop-after {
      border-bottom: 2px solid #42614D;
      transition: none;
    }

    #${SIDEBAR_ID} .vertical-tabs-category-header.drag-over {
      /* visual handled by wrapper outline */
    }

    #${SIDEBAR_ID} .vertical-tabs-chevron {
      font-size: 12px;
      width: 14px;
      text-align: center;
      color: #6C6C6C;
      display: inline-block;
      transition: transform 0.15s ease-out, margin 0.2s ease-out;
      transform: rotate(-90deg);
    }

    #${SIDEBAR_ID} .vertical-tabs-category.collapsed .vertical-tabs-chevron {
      transform: rotate(-180deg);
    }

    #${SIDEBAR_ID} .vertical-tabs-category-name {
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-weight: 500;
    }

    #${SIDEBAR_ID} .vertical-tabs-count {
      font-size: 11px;
      color: var(--material-text-muted, #666);
      background: var(--material-chip, rgba(0, 0, 0, 0.06));
      padding: 1px 6px;
      border-radius: 10px;
    }

    #${SIDEBAR_ID} .vertical-tabs-items {
      padding: 2px 0;
      overflow: hidden;
      opacity: 1;
      transition: opacity 0.15s ease-out;
    }

    #${SIDEBAR_ID} .vertical-tabs-category.collapsed .vertical-tabs-items {
      opacity: 0;
    }

    #${SIDEBAR_ID} .vertical-tabs-item {
      display: flex;
      flex-direction: row;
      align-items: center;
      min-height: 36px;
      padding: 4px 12px 4px 9px;
      cursor: pointer;
      gap: 8px;
      position: relative;
      transition: padding 0.2s ease-out, gap 0.2s ease-out;
    }

    #${SIDEBAR_ID} .vertical-tabs-item:hover {
      background: var(--material-hover, rgba(0, 0, 0, 0.04));
    }

    #${SIDEBAR_ID} .vertical-tabs-item.active {
      background: #fff;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
      border-radius: 4px;
    }

    #${SIDEBAR_ID} .vertical-tabs-item.active:hover {
      background: #fff;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
    }

    #${SIDEBAR_ID} .vertical-tabs-item.dragging {
      opacity: 0.5;
    }

    /* Drag reorder insertion indicators */
    #${SIDEBAR_ID} .vertical-tabs-item.drop-before::before {
      content: "";
      position: absolute;
      left: 8px;
      right: 8px;
      top: 0;
      height: 2px;
      background: #42614D;
      border-radius: 1px;
      z-index: 10;
      pointer-events: none;
    }

    #${SIDEBAR_ID} .vertical-tabs-item.drop-after::after {
      content: "";
      position: absolute;
      left: 8px;
      right: 8px;
      bottom: 0;
      height: 2px;
      background: #42614D;
      border-radius: 1px;
      z-index: 10;
      pointer-events: none;
    }

    /* Close button: appears on hover, gradient right edge */
    #${SIDEBAR_ID} .vertical-tabs-item-close {
      position: absolute;
      right: 0;
      top: 0;
      bottom: 0;
      width: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      color: #6C6C6C;
      opacity: 0;
      cursor: pointer;
      background: linear-gradient(to right, transparent, #F2F2F2 60%);
      transition: opacity 0.15s ease;
      z-index: 5;
    }

    #${SIDEBAR_ID} .vertical-tabs-item:hover .vertical-tabs-item-close {
      opacity: 1;
    }

    #${SIDEBAR_ID} .vertical-tabs-item-close:hover {
      color: #333;
    }

    /* Tab type icon (uses Zotero's built-in item type icons) */
    #${SIDEBAR_ID} .vertical-tabs-item-icon {
      width: 16px;
      height: 16px;
      flex-shrink: 0;
      object-fit: contain;
      transition: margin 0.2s ease-out;
    }

    #${SIDEBAR_ID} .vertical-tabs-item-icon-fallback {
      transition: margin 0.2s ease-out;
    }

    /* Content block (right of icon) */
    #${SIDEBAR_ID} .vertical-tabs-item-content {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    #${SIDEBAR_ID} .vertical-tabs-item-title {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 13px;
      line-height: 1.3;
    }

    #${SIDEBAR_ID} .vertical-tabs-item-meta {
      display: flex;
      gap: 4px;
      font-size: 11px;
      color: var(--material-text-muted, #666);
      white-space: nowrap;
      overflow: hidden;
    }

    #${SIDEBAR_ID} .vertical-tabs-item-time {
      flex-shrink: 0;
    }

    #${SIDEBAR_ID} .vertical-tabs-item-dot {
      flex-shrink: 0;
    }

    #${SIDEBAR_ID} .vertical-tabs-item-pub {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* Extra field ("其他") for PDF reader tabs */
    #${SIDEBAR_ID} .vertical-tabs-item-extra {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 11px;
      color: var(--material-text-muted, #666);
    }

    /* Separator between extra and meta in PDF reader tabs */
    #${SIDEBAR_ID} .vertical-tabs-extra-separator {
      border-bottom: 0.5px solid #DBDBDB;
    }

    #${SIDEBAR_ID} .vertical-tabs-empty {
      padding: 12px 12px;
      text-align: center;
      color: var(--material-text-muted, #888);
      font-size: 12px;
    }

    /* Separator line between categories and uncategorized items */
    #${SIDEBAR_ID} .vertical-tabs-separator {
      height: 1px;
      margin: 4px 12px;
      background: #DBDBDB;
    }

    /* Drop zone: area below categories for removing items from categories */
    #${SIDEBAR_ID} .vertical-tabs-drop-zone {
      flex: 1;
      min-height: 32px;
      padding: 4px 0;
      transition: background 0.15s ease;
    }

    #${SIDEBAR_ID} .vertical-tabs-drop-zone.drag-over {
      background: var(--material-selected, rgba(0, 0, 0, 0.08));
      outline: 1px dashed #999;
      outline-offset: -1px;
    }

    /* Collapsed (floating, not expanded): icon-only layout */
    #${SIDEBAR_ID}.vertical-tabs-sidebar-floating:not(.vertical-tabs-sidebar-expanded) .vertical-tabs-header {
      padding: 6px 0;
    }

    #${SIDEBAR_ID}.vertical-tabs-sidebar-floating:not(.vertical-tabs-sidebar-expanded) .vertical-tabs-search,
    #${SIDEBAR_ID}.vertical-tabs-sidebar-floating:not(.vertical-tabs-sidebar-expanded) .vertical-tabs-more-btn {
      pointer-events: none;
    }

    #${SIDEBAR_ID}.vertical-tabs-sidebar-floating:not(.vertical-tabs-sidebar-expanded) .vertical-tabs-pin-btn {
      margin-left: 5px;
      margin-right: 5px;
    }

    #${SIDEBAR_ID}.vertical-tabs-sidebar-floating:not(.vertical-tabs-sidebar-expanded) .vertical-tabs-category-header {
      padding: 4px 0;
      gap: 0;
    }

    #${SIDEBAR_ID}.vertical-tabs-sidebar-floating:not(.vertical-tabs-sidebar-expanded) .vertical-tabs-chevron {
      margin-left: 10px;
      margin-right: 10px;
    }

    #${SIDEBAR_ID}.vertical-tabs-sidebar-floating:not(.vertical-tabs-sidebar-expanded) .vertical-tabs-item {
      padding: 4px 0;
      gap: 0;
    }

    #${SIDEBAR_ID}.vertical-tabs-sidebar-floating:not(.vertical-tabs-sidebar-expanded) .vertical-tabs-item-content {
      pointer-events: none;
    }

    #${SIDEBAR_ID}.vertical-tabs-sidebar-floating:not(.vertical-tabs-sidebar-expanded) .vertical-tabs-item-close {
      display: none;
    }

    #${SIDEBAR_ID}.vertical-tabs-sidebar-floating:not(.vertical-tabs-sidebar-expanded) .vertical-tabs-item-icon,
    #${SIDEBAR_ID}.vertical-tabs-sidebar-floating:not(.vertical-tabs-sidebar-expanded) .vertical-tabs-item-icon-fallback {
      margin-left: 9px;
      margin-right: 9px;
    }

    #${SIDEBAR_ID}.vertical-tabs-sidebar-floating:not(.vertical-tabs-sidebar-expanded) .vertical-tabs-resize-handle {
      display: none;
    }

    #${SIDEBAR_ID}.vertical-tabs-sidebar-floating:not(.vertical-tabs-sidebar-expanded) .vertical-tabs-empty {
      padding: 12px 4px;
      font-size: 10px;
    }

    #${SIDEBAR_ID}.vertical-tabs-sidebar-floating:not(.vertical-tabs-sidebar-expanded) .vertical-tabs-drop-zone {
      min-height: 20px;
    }

    #${SIDEBAR_ID}.vertical-tabs-sidebar-floating:not(.vertical-tabs-sidebar-expanded) .vertical-tabs-separator {
      margin: 4px 6px;
    }

    /* Fade right-side content during the last 5px of collapse (40px -> 35px) */
    #${SIDEBAR_ID} .vertical-tabs-search,
    #${SIDEBAR_ID} .vertical-tabs-more-btn,
    #${SIDEBAR_ID} .vertical-tabs-category-name,
    #${SIDEBAR_ID} .vertical-tabs-count,
    #${SIDEBAR_ID} .vertical-tabs-item-content,
    #${SIDEBAR_ID} .vertical-tabs-empty {
      opacity: var(--vt-content-opacity, 1);
    }

    /* Disable transitions while dragging the resize handle */
    #${SIDEBAR_ID}.vertical-tabs-sidebar-resizing,
    #${SIDEBAR_ID}.vertical-tabs-sidebar-resizing * {
      transition: none !important;
    }

    /* Resize handle: draggable right edge */
    #${SIDEBAR_ID} .vertical-tabs-resize-handle {
      position: absolute;
      top: 0;
      right: 0;
      width: 4px;
      height: 100%;
      cursor: col-resize;
      background: transparent;
      z-index: 10;
      transition: background 0.15s ease;
    }

    #${SIDEBAR_ID} .vertical-tabs-resize-handle:hover,
    #${SIDEBAR_ID} .vertical-tabs-resize-handle.active {
      background: rgba(128, 128, 128, 0.5);
    }

    /* More menu popup */
    .vertical-tabs-more-menu {
      transform-origin: top right;
      animation: vt-more-menu-appear 0.15s ease-out;
    }

    .vertical-tabs-more-menu-leaving {
      transform-origin: top right;
      animation: vt-more-menu-leave 0.15s ease-out forwards;
    }

    .vertical-tabs-more-menu-item img {
      display: block;
    }

    /* Save success animation */
    .vt-save-success-overlay {
      position: absolute;
      inset: 0;
      z-index: 10;
      pointer-events: none;
      overflow: hidden;
      border-radius: inherit;
    }

    .vt-save-success-bar {
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      filter: brightness(0.85);
      animation: vt-save-bar 3s ease-in-out forwards;
    }

    .vt-save-success-text {
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      display: flex;
      align-items: center;
      white-space: nowrap;
      font-size: 12px;
      font-weight: 600;
      color: #fff;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
      animation: vt-save-text 3s ease-in-out forwards;
    }

    @keyframes vt-more-menu-appear {
      from { opacity: 0; transform: scale(0.95); }
      to { opacity: 1; transform: scale(1); }
    }

    @keyframes vt-more-menu-leave {
      from { opacity: 1; transform: scale(1); }
      to { opacity: 0; transform: scale(0.95); }
    }

    @keyframes vt-save-bar {
      0% { width: 0%; left: 0; }
      33% { width: 100%; left: 0; }
      66% { width: 100%; left: 0; }
      100% { width: 0%; left: 100%; }
    }

    @keyframes vt-save-text {
      0% { left: 0%; transform: translateX(-100%); opacity: 0; }
      10% { opacity: 1; }
      33% { left: 50%; transform: translateX(calc(-50% - 10px)); }
      66% { left: 70%; transform: translateX(calc(-70% - 10px)); }
      100% { left: 100%; transform: translateX(0); opacity: 1; }
    }

    /* Import category dialog */
    #vt-import-dialog-overlay {
      font-family: message-box;
    }

    .vt-import-dialog {
      animation: vt-import-dialog-appear 0.15s ease-out;
    }

    @keyframes vt-import-dialog-appear {
      from { opacity: 0; transform: scale(0.96); }
      to { opacity: 1; transform: scale(1); }
    }

    #vt-import-dialog-overlay.vt-import-dialog-leaving {
      animation: vt-import-dialog-overlay-leave 0.15s ease-out forwards;
    }

    #vt-import-dialog-overlay.vt-import-dialog-leaving .vt-import-dialog {
      animation: vt-import-dialog-content-leave 0.15s ease-out forwards;
    }

    @keyframes vt-import-dialog-overlay-leave {
      from { opacity: 1; }
      to { opacity: 0; }
    }

    @keyframes vt-import-dialog-content-leave {
      from { opacity: 1; transform: scale(1); }
      to { opacity: 0; transform: scale(0.96); }
    }

    .vt-action-btn {
      -moz-appearance: none;
      appearance: none;
      border: 0;
      outline: 0;
    }

    .vt-action-btn::-moz-focus-inner {
      border: 0;
      padding: 0;
    }

    .vt-saved-category-row {
      transition: max-height 0.25s ease-out, opacity 0.25s ease-out, padding 0.25s ease-out;
      overflow: hidden;
    }

    .vt-saved-category-row-removing {
      max-height: 0 !important;
      opacity: 0 !important;
      padding-top: 0 !important;
      padding-bottom: 0 !important;
    }

    .vt-import-dialog-list::-webkit-scrollbar {
      width: 6px;
    }

    .vt-import-dialog-list::-webkit-scrollbar-thumb {
      background: rgba(128, 128, 128, 0.4);
      border-radius: 3px;
    }

    @media (prefers-color-scheme: dark) {
      #${SIDEBAR_ID} .vertical-tabs-chevron {
        color: #A2A2A2;
      }

      #${SIDEBAR_ID} {
        background: var(--material-sidepane, #2a2a2a);
        border-right-color: #555;
        color: var(--material-text, #eee);
      }

      #${SIDEBAR_ID} .vertical-tabs-resize-handle:hover,
      #${SIDEBAR_ID} .vertical-tabs-resize-handle.active {
        background: rgba(200, 200, 200, 0.3);
      }

      #${SIDEBAR_ID} .vertical-tabs-search {
        background: var(--material-background, #2a2a2a);
        color: var(--material-text, #eee);
      }

      #${SIDEBAR_ID} .vertical-tabs-search:focus {
        border-color: #6C6C6C;
      }

      #${SIDEBAR_ID} .vertical-tabs-pin-btn:hover,
      #${SIDEBAR_ID} .vertical-tabs-add-btn:hover {
        background: var(--material-button-hover, rgba(255, 255, 255, 0.08));
      }

      #${SIDEBAR_ID} .vertical-tabs-category-header:hover,
      #${SIDEBAR_ID} .vertical-tabs-item:hover {
        background: var(--material-hover, rgba(255, 255, 255, 0.05));
      }

      #${SIDEBAR_ID} .vertical-tabs-item.active {
        background: #626262;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
      }

      #${SIDEBAR_ID} .vertical-tabs-item.active:hover {
        background: #626262;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
      }

      #${SIDEBAR_ID} .vertical-tabs-category.drag-over {
        background: var(--material-selected, rgba(255, 255, 255, 0.06));
        outline-color: #888;
        transition: none;
      }

      #${SIDEBAR_ID} .vertical-tabs-category-header.drag-over {
        /* visual handled by wrapper outline */
      }

      #${SIDEBAR_ID} .vertical-tabs-drop-zone.drag-over {
        background: var(--material-selected, rgba(255, 255, 255, 0.08));
      }

      #${SIDEBAR_ID} .vertical-tabs-separator {
        background: #555;
      }

      #${SIDEBAR_ID} .vertical-tabs-extra-separator {
        border-bottom-color: #555;
      }

      #${SIDEBAR_ID} .vertical-tabs-item-extra {
        color: var(--material-text-muted, #aaa);
      }

      #${SIDEBAR_ID} .vertical-tabs-item-close {
        color: #999;
        background: linear-gradient(to right, transparent, #303030 60%);
      }

      #${SIDEBAR_ID} .vertical-tabs-item-close:hover {
        color: #ccc;
      }

      #${SIDEBAR_ID} .vertical-tabs-count,
      #${SIDEBAR_ID} .vertical-tabs-tag {
        background: var(--material-chip, rgba(255, 255, 255, 0.1));
        color: var(--material-text-muted, #aaa);
      }

      #${SIDEBAR_ID} .vertical-tabs-item-meta {
        color: var(--material-text-muted, #aaa);
      }

      #${SIDEBAR_ID}.vertical-tabs-sidebar-floating {
        border-right-color: #555;
        box-shadow: none;
      }

      #${SIDEBAR_ID}.vertical-tabs-sidebar-floating.vertical-tabs-sidebar-expanded {
        border-right-color: transparent;
        box-shadow: 2px 0 8px rgba(0, 0, 0, 0.4);
      }
    }

    /* Wrapper and splitter: VT sits in a vbox inside #browser, before #tabs-deck */
    #${WRAPPER_ID} {
      flex-shrink: 0;
      overflow: visible;
      position: relative;
    }

    #${WRAPPER_ID}[hidden] {
      display: none !important;
    }

    #${SPLITTER_ID} {
      width: 4px;
      min-width: 4px;
      background: var(--material-border, #ccc);
      cursor: col-resize;
      border-right: 1px solid var(--material-border, #ccc);
      flex-shrink: 0;
    }

    #${SPLITTER_ID}[hidden] {
      display: none !important;
    }

    @media (prefers-color-scheme: dark) {
      #${SPLITTER_ID} {
        background: var(--material-border, #555);
        border-right-color: var(--material-border, #555);
      }
    }
  `;
}

export { SIDEBAR_ID, WRAPPER_ID, SPLITTER_ID };
