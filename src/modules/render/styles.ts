import { config } from "../../../package.json";

const PANEL_WIDTH = "260px";
const TOGGLE_BTN_ID = `${config.addonRef}-vertical-tabs-toggle`;
const SIDEBAR_ID = `${config.addonRef}-vertical-tabs-sidebar`;
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
    }

    #${SIDEBAR_ID}[hidden] {
      display: none !important;
    }

    #${SIDEBAR_ID}.vertical-tabs-sidebar-pinned {
      position: relative;
      flex-shrink: 0;
    }

    #${SIDEBAR_ID}.vertical-tabs-sidebar-floating {
      position: absolute;
      left: 0;
      top: 0;
      height: 100%;
      z-index: 100000;
      flex-shrink: 0;
      box-shadow: 2px 0 8px rgba(0, 0, 0, 0.15);
      transform: translateX(-100%);
      opacity: 0;
      pointer-events: none;
      transition: transform 0.2s ease, opacity 0.2s ease;
    }

    #${SIDEBAR_ID}.vertical-tabs-sidebar-floating.vertical-tabs-sidebar-expanded {
      transform: translateX(0);
      opacity: 1;
      pointer-events: auto;
    }

    #${SIDEBAR_ID} .vertical-tabs-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      border-bottom: 1px solid var(--material-border, #ccc);
      font-weight: 600;
    }

    #${SIDEBAR_ID} .vertical-tabs-search {
      flex: 1;
      min-width: 0;
      height: 24px;
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
      font-size: 14px;
      line-height: 1;
      padding: 2px 4px;
      color: #6C6C6C;
      margin-right: 4px;
    }

    #${SIDEBAR_ID} .vertical-tabs-pin-btn:hover {
      background: var(--material-button-hover, rgba(0, 0, 0, 0.06));
      border-radius: 4px;
      color: #999;
    }

    #${SIDEBAR_ID} .vertical-tabs-add-btn {
      background: transparent;
      border: none;
      cursor: pointer;
      font-size: 18px;
      line-height: 1;
      padding: 0 4px;
      color: #6C6C6C;
    }

    #${SIDEBAR_ID} .vertical-tabs-add-btn:hover {
      background: var(--material-button-hover, rgba(0, 0, 0, 0.06));
      border-radius: 4px;
      color: #999;
    }

    #${SIDEBAR_ID} .vertical-tabs-categories {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow-y: auto;
      padding: 4px 0;
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
      display: flex;
      align-items: center;
      padding: 6px 12px;
      cursor: pointer;
      gap: 6px;
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
      transition: transform 0.15s ease;
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
      padding: 6px 12px;
      cursor: pointer;
      gap: 8px;
      position: relative;
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
      padding: 20px 12px;
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
      min-height: 40px;
      padding: 4px 0;
      transition: background 0.15s ease;
    }

    #${SIDEBAR_ID} .vertical-tabs-drop-zone.drag-over {
      background: var(--material-selected, rgba(0, 0, 0, 0.08));
      outline: 1px dashed #999;
      outline-offset: -1px;
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

    /* Hover strip: shown when sidebar is unpinned/collapsed.
       Inserted as a relative element to the left of the collections pane. */
    #${TOGGLE_BTN_ID} {
      position: relative;
      flex-shrink: 0;
      width: 24px;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      opacity: 0.5;
      transition: opacity 0.15s, background 0.15s;
      border-right: 1px solid #DBDBDB;
      background: var(--material-sidepane, #f5f5f5);
    }

    #${TOGGLE_BTN_ID}:hover {
      opacity: 1;
      background: var(--material-hover, rgba(0, 0, 0, 0.04));
    }

    @media (prefers-color-scheme: dark) {
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

      #${TOGGLE_BTN_ID} {
        background: var(--material-button, #3a3a3a);
        border-color: var(--material-border, #555);
      }

      #${TOGGLE_BTN_ID}:hover {
        background: var(--material-button-hover, #4a4a4a);
      }

      #${SIDEBAR_ID}.vertical-tabs-sidebar-floating {
        box-shadow: 2px 0 8px rgba(0, 0, 0, 0.4);
      }
    }

    /* Reader sidebar context: override structural styles
       #sidebarContainer is Zotero's reader sidebar wrapper.
       When the VT panel is inserted inside the reader sidebar,
       it should fill the available space, not use the main-sidebar width. */
    #sidebarContainer #${SIDEBAR_ID} {
      width: 100%;
      height: 100%;
      flex-shrink: 1;
      min-width: 0;
      max-width: none;
      border-right: none;
      position: static;
    }
  `;
}

export { SIDEBAR_ID, TOGGLE_BTN_ID };
