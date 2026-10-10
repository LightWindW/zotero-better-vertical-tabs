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

    /* Embedded automatic expansion reserves layout space, so it does not
       need the floating panel shadow that separates an overlay from content. */
    #${SIDEBAR_ID}.vertical-tabs-sidebar-floating.vertical-tabs-sidebar-expanded.vertical-tabs-sidebar-embedded-expanded {
      box-shadow: none;
    }

    #${SIDEBAR_ID} .vertical-tabs-header {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      /* Total height is exactly 40px (padding and border included). */
      height: 40px;
      box-sizing: border-box;
      padding: 5.5px 6px 6px 5.5px;
      margin-top: 0px;
      border-bottom: 1px solid var(--material-border, #ccc);
      font-weight: 600;
      transition: padding 0.2s ease-out, gap 0.2s ease-out, margin-top 0.3s ease;
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
      margin: 0 3px 0 3.5px;
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
      /* Thin scrollbar is always reserved (no reflow when it appears); its
         thumb color is driven inline by scrollbarAutoHide.ts (rAF fade,
         transparent while idle). */
      scrollbar-width: thin;
      scrollbar-color: transparent transparent;
      padding: 2px 0;
      /* Anchors the category-reorder gap indicator (absolute, scrolls with
         the content) and offsetTop-based layout measurements. */
      position: relative;
    }

    #${SIDEBAR_ID} .vertical-tabs-category {
      display: grid;
      grid-template-rows: auto 1fr;
      transition: grid-template-rows 0s ease, outline-color 0.3s ease, background 0.3s ease, transform 0.2s ease-out;
      margin-bottom: 2px;
      position: relative;
      outline: 1px dashed transparent;
      outline-offset: -1px;
      border-radius: 4px;
    }

    #${SIDEBAR_ID} .vertical-tabs-category-header {
      display: flex;
      align-items: center;
      min-height: 28px;
      height: 36px;
      box-sizing: border-box;
      overflow: hidden;
      padding: 4px 12px 4px 10px;
      cursor: pointer;
      gap: 6px;
      position: relative;
      transition: padding 0.2s ease-out, gap 0.2s ease-out;
    }

    #${SIDEBAR_ID} .vertical-tabs-category-header > * {
      position: relative;
      z-index: 2;
    }

    #${SIDEBAR_ID} .vertical-tabs-category-header .vt-save-success-overlay {
      position: absolute;
      z-index: 10;
    }

    #${SIDEBAR_ID} .vertical-tabs-category::before {
      content: "";
      position: absolute;
      /* Center the 26px highlight bar on the 36px-tall header: (36-26)/2.
         The collapsed wrapper below the header keeps a few px of items
         padding residue, so centering must target the header, not the
         wrapper. */
      top: 6px;
      left: 0;
      width: 100%;
      height: 26px;
      border-radius: 4px;
      background: #fff;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
      opacity: 0;
      transition: opacity 0.2s ease;
      pointer-events: none;
      z-index: 1;
    }

    #${SIDEBAR_ID} .vertical-tabs-category.has-active-reader-folded::before {
      opacity: 1;
    }

    /* Drag preview expands a collapsed category: the folded-header highlight
       bar fades out (the highlight moves back to the active row). When the
       preview ends and the category folds again, the bar fades back in. */
    #${SIDEBAR_ID} .vertical-tabs-category.has-active-reader-folded.vt-category-preview::before {
      opacity: 0;
    }

    /* Category deletion exit: while this class is present the wrapper
       collapses its inline height/opacity/margin (fade-out + slide-up of the
       content below) before the data commit removes it. Same specificity
       trick as the entrance class. pointer-events are blocked so a vanishing
       category stays inert. */
    #${SIDEBAR_ID} .vertical-tabs-category.vt-category-exit {
      overflow: hidden;
      pointer-events: none;
      transition:
        height 0.3s ease,
        opacity 0.3s ease,
        margin-bottom 0.3s ease;
    }

    /* Quick-create entrance: while this class is present the wrapper animates
       its inline height/opacity (slide-down + fade-in). Higher specificity
       than the base .vertical-tabs-category transition rule, so it wins for
       the duration of the animation; removed when the animation completes. */
    #${SIDEBAR_ID} .vertical-tabs-category.vt-new-category-entrance {
      overflow: hidden;
      transition: height 0.3s ease, opacity 0.3s ease;
    }

    #${SIDEBAR_ID} .vertical-tabs-category.collapsed {
      transition: outline-color 0.3s ease, background 0.3s ease, transform 0.2s ease-out;
    }

    #${SIDEBAR_ID} .vertical-tabs-category.drag-over {
      outline-color: #999;
    }

    #${SIDEBAR_ID} .vertical-tabs-category.vt-category-preview {
      transition: outline-color 0.3s ease, background 0.3s ease, transform 0.2s ease-out;
    }

    #${SIDEBAR_ID} .vertical-tabs-category.vt-height-animating {
      transition: outline-color 0.3s ease, background 0.3s ease, transform 0.2s ease-out;
    }

    /* Category reorder gap preview: every container child at and below the
       gap slides down one header height (categories, separators and the
       uncategorized drop-zone alike, so nothing stays behind to overlap).
       Those elements' base rules carry the same transform transition for
       the return direction. */
    #${SIDEBAR_ID} .vertical-tabs-categories > .vt-drop-preview-shift {
      transform: translateY(var(--vt-drop-shift-y, 0px));
      transition: transform 0.2s ease-out;
    }

    /* Green bar vertically centered in the reorder gap. Position jumps
       instantly (no top transition, same rule as item indicators); only the
       opacity fades. Absolute in the scroll container, so it scrolls with
       the content. */
    #${SIDEBAR_ID} .vertical-tabs-category-gap-indicator {
      position: absolute;
      left: 8px;
      right: 8px;
      height: 2px;
      background: #42614D;
      border-radius: 1px;
      opacity: 0;
      transition: opacity 0.15s ease;
      pointer-events: none;
      z-index: 10;
    }

    /* Source wrapper of a category reorder drag: fades/shrinks out after the
       smooth collapse, and fades back in on cancel. */
    #${SIDEBAR_ID} .vertical-tabs-category.vt-catdrag-source {
      overflow: hidden;
      pointer-events: none;
      transition: height 0.3s ease, opacity 0.3s ease;
    }

    #${SIDEBAR_ID} .vertical-tabs-category-header.drag-over {
      /* visual handled by wrapper outline */
    }

    #${SIDEBAR_ID} .vertical-tabs-chevron {
      width: 14px;
      height: 14px;
      /* Never let the flex row squeeze the chevron box. In the 35px collapsed
         sidebar a shrinking box would shift the arrow left of the item-icon
         column center (17px) — the old text "<" suffered from exactly this. */
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #6C6C6C;
      transition: transform 0.15s ease-out;
      /* The inline SVG is a right-pointing ">": expanded shows it rotated
         down, collapsed shows it unrotated (right). */
      transform: rotate(90deg);
      transform-origin: 50% 50%;
    }

    #${SIDEBAR_ID} .vertical-tabs-chevron svg {
      display: block;
    }

    #${SIDEBAR_ID} .vertical-tabs-category.collapsed .vertical-tabs-chevron {
      transform: rotate(0deg);
    }

    /* Drag preview expands even a collapsed category: point the chevron down
       while the preview class is present. Equal specificity with the
       .collapsed rule above, so this must come after it. The transform
       transition on .vertical-tabs-chevron animates the rotation both ways. */
    #${SIDEBAR_ID} .vertical-tabs-category.vt-category-preview .vertical-tabs-chevron {
      transform: rotate(90deg);
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
      box-sizing: border-box;
      overflow: hidden;
      opacity: 1;
      transition: height 0.45s ease-out, opacity 0.15s ease-out;
      position: relative;
    }

    #${SIDEBAR_ID} .vertical-tabs-category.collapsed .vertical-tabs-items {
      height: 0;
      padding: 0;
      opacity: 0;
      transition: opacity 0.15s ease-out;
    }

    /* Must come AFTER the .collapsed rule: both selectors have equal
       specificity, so the later one wins while a category is both collapsed
       and animating. The transition shorthand must repeat the full list —
       writing only "opacity 0s" here would replace the whole list and kill
       the height transition from the base rule. */
    #${SIDEBAR_ID} .vertical-tabs-category.vt-height-animating .vertical-tabs-items {
      opacity: 1;
      transition: height 0.3s ease-out, opacity 0s;
    }

    #${SIDEBAR_ID} .vertical-tabs-category.vt-category-preview .vertical-tabs-items {
      opacity: 1;
      transition: height 0.3s ease-out, opacity 0.15s ease-out;
    }

    #${SIDEBAR_ID} .vertical-tabs-item {
      display: flex;
      flex-direction: row;
      align-items: center;
      min-height: var(--vt-item-min-height, 36px);
      margin: 4px;
      padding: 4px 12px 4px 9px;
      cursor: pointer;
      gap: 8px;
      position: relative;
      border-radius: 5px;
      box-sizing: border-box;
      /* background/box-shadow must transition too: tab selection moves the
         .active class via a targeted update (no re-render), and without a
         transition the white highlight snaps on/off — a visible white flash.
         Freshly rendered rows start with their final class, so renders never
         trigger this transition. */
      transition: padding 0.2s ease-out, gap 0.2s ease-out, margin 0.2s ease-out, transform 0.2s ease-out, background 0.2s ease, box-shadow 0.2s ease;
    }

    #${SIDEBAR_ID} .vertical-tabs-item:hover,
    #${SIDEBAR_ID} .vertical-tabs-item.vt-sidebar-row-hover {
      background: var(--material-hover, rgba(0, 0, 0, 0.04));
    }

    #${SIDEBAR_ID}.vt-sidebar-row-band-hover,
    #${SIDEBAR_ID}.vt-sidebar-row-band-hover * {
      cursor: pointer;
    }

    /* Category headers get the same hover block in light mode (the dark
       @media block already groups them with items/home button). */
    #${SIDEBAR_ID} .vertical-tabs-category-header:hover {
      background: var(--material-hover, rgba(0, 0, 0, 0.04));
    }

    /* Tab exit animation: the class only carries the transition (height,
       opacity, vertical padding); geometry is driven inline by tabExit.ts
       (content-box + min-height would otherwise block height: 0). The fade
       finishes first (0.2s); the collapse keeps easing out to 0.3s so the
       slide-up of the rows below stays visible. */
    #${SIDEBAR_ID} .vertical-tabs-item.vt-tab-exit {
      overflow: hidden;
      pointer-events: none;
      transition:
        height 0.3s ease-out,
        opacity 0.2s ease-out,
        padding-top 0.3s ease-out,
        padding-bottom 0.3s ease-out,
        margin-top 0.3s ease-out,
        margin-bottom 0.3s ease-out;
    }

    /* Multi-select overlay: a real child element (the row's ::before/::after
       are taken by the drop indicator bars). Always present so selecting /
       deselecting fades opacity over 0.2s; the class only flips opacity.
       Deliberately deeper than the hover block so selection reads clearly. */
    #${SIDEBAR_ID} .vertical-tabs-item-selection-overlay {
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.08);
      border-radius: 5px;
      opacity: 0;
      transition: opacity 0.2s ease;
      pointer-events: none;
      z-index: 1;
    }

    #${SIDEBAR_ID} .vertical-tabs-item.vt-selected .vertical-tabs-item-selection-overlay {
      opacity: 1;
    }

    /* Multi-drag: every selected row fades out and collapses. Inline styles
       carry the animated values (height / padding / min-height are all
       driven inline — min-height and padding must be zeroed inline or the
       collapse stalls at 36px / leaves an 8px sliver); this class provides
       clipping + the transition list. */
    #${SIDEBAR_ID} .vertical-tabs-item.vt-multi-source-collapse {
      overflow: hidden;
      transition:
        height 0.25s ease,
        opacity 0.25s ease,
        padding-top 0.25s ease,
        padding-bottom 0.25s ease,
        margin-top 0.25s ease,
        margin-bottom 0.25s ease;
    }

    /* Multi-drop cascade release: same mechanics while rows unfold. */
    #${SIDEBAR_ID} .vertical-tabs-item.vt-multi-release {
      overflow: hidden;
      transition:
        height 0.25s ease,
        opacity 0.25s ease,
        padding-top 0.25s ease,
        padding-bottom 0.25s ease,
        margin-top 0.25s ease,
        margin-bottom 0.25s ease;
    }

    #${SIDEBAR_ID} .vertical-tabs-item.active {
      background: #fff;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
      border-radius: 5px;
    }

    #${SIDEBAR_ID} .vertical-tabs-item.active:hover,
    #${SIDEBAR_ID} .vertical-tabs-item.active.vt-sidebar-row-hover {
      background: #fff;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
    }

    #${SIDEBAR_ID}.vt-hover-locked .vertical-tabs-item:hover:not(.vt-sidebar-row-hover) {
      background: transparent;
      box-shadow: none;
    }

    #${SIDEBAR_ID}.vt-hover-locked .vertical-tabs-item.active:hover:not(.vt-sidebar-row-hover) {
      background: #fff;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
    }

    #${SIDEBAR_ID}.vt-hover-locked .vertical-tabs-item:hover:not(.vt-sidebar-row-hover) .vertical-tabs-item-close {
      opacity: 0;
    }

    /* While a category is collapsed, the active row's highlight stays
       transparent — the folded-header highlight bar takes over.
       - Collapse start: .collapsed is added, the highlight fades out over
         0.2s in cross-fade with the header bar fading in.
       - Collapse finish: the highlight does NOT snap back (an earlier
         version scoped this to .vt-height-animating, which ends exactly at
         finish; the background then reappeared during the items' 150ms
         opacity fade, visible through the ~4px padding residue, before
         fading out again).
       - Expand start: .collapsed is removed, the highlight returns with the
         row. Placed after .active:hover so equal specificity wins. */
    #${SIDEBAR_ID} .vertical-tabs-category.collapsed .vertical-tabs-item.active {
      background: transparent;
      box-shadow: none;
      transition: background 0.2s ease, box-shadow 0.2s ease;
    }

    /* Drag preview expands a collapsed category: hand the highlight back to
       the active row (fades in over 0.2s). When the preview ends and the
       category folds again, the .collapsed rule above takes over and the
       highlight fades back out. One specificity level above that rule, so
       source order does not matter. */
    #${SIDEBAR_ID} .vertical-tabs-category.collapsed.vt-category-preview .vertical-tabs-item.active {
      background: #fff;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
      transition: background 0.2s ease, box-shadow 0.2s ease;
    }

    #${SIDEBAR_ID} .vertical-tabs-item.reader-loaded {
      position: relative;
    }

    #${SIDEBAR_ID} .vertical-tabs-item-reader-loaded-indicator {
      position: absolute;
      left: 0px;
      top: 10%;
      width: 1.8px;
      height: 80%;
      border-radius: 0.5px 0.5px 0.5px 0.5px;
      background: #2e8b52;
      opacity: 0;
      transition: opacity 0.2s ease;
      pointer-events: none;
      z-index: 20;
    }

    #${SIDEBAR_ID} .vertical-tabs-item.reader-loaded .vertical-tabs-item-reader-loaded-indicator {
      opacity: 1;
    }

    #${SIDEBAR_ID} .vertical-tabs-item.dragging {
      opacity: 0.5;
    }

    #${SIDEBAR_ID} .vertical-tabs-item.vt-drag-source-collapsed {
      height: 0 !important;
      min-height: 0 !important;
      padding-top: 0 !important;
      padding-bottom: 0 !important;
      margin-top: 0 !important;
      margin-bottom: 0 !important;
      overflow: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
      transition: none !important;
    }

    #${SIDEBAR_ID} .vertical-tabs-item.vt-drop-preview-shift {
      transform: translateY(var(--vt-drop-shift-y, 0px));
      will-change: transform;
    }

    /* Drag reorder insertion indicators
       Pseudo-elements are always present so we can fade opacity in/out.
       Position is set immediately (no transition) to avoid the bar sliding
       from the item edge to the gap center. */
    #${SIDEBAR_ID} .vertical-tabs-item::before,
    #${SIDEBAR_ID} .vertical-tabs-item::after {
      content: "";
      position: absolute;
      left: 8px;
      right: 8px;
      height: 2px;
      background: #42614D;
      border-radius: 1px;
      z-index: 10;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.15s ease;
    }

    #${SIDEBAR_ID} .vertical-tabs-item::before {
      top: var(--vt-drop-indicator-offset, 0);
    }

    #${SIDEBAR_ID} .vertical-tabs-item::after {
      bottom: var(--vt-drop-indicator-offset, 0);
    }

    #${SIDEBAR_ID} .vertical-tabs-item.drop-before::before,
    #${SIDEBAR_ID} .vertical-tabs-item.drop-after::after {
      opacity: 1;
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
      background: linear-gradient(to right, transparent, var(--vt-close-bg, #F2F2F2) 60%);
      border-radius: 0 5px 5px 0;
      overflow: hidden;
      transition: opacity 0.15s ease;
      z-index: 5;
    }

    #${SIDEBAR_ID} .vertical-tabs-item.active .vertical-tabs-item-close {
      background: linear-gradient(to left, #fff 40%, transparent);
    }

    #${SIDEBAR_ID} .vertical-tabs-item-close::before {
      content: "";
      position: absolute;
      inset: 0;
      background: linear-gradient(to left, var(--material-hover, rgba(0, 0, 0, 0.04)), transparent);
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s ease;
    }

    #${SIDEBAR_ID} .vertical-tabs-item:hover .vertical-tabs-item-close {
      opacity: 1;
    }

    #${SIDEBAR_ID} .vertical-tabs-item:hover .vertical-tabs-item-close::before {
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
      /* Must slide with the category-reorder gap shift like every other
         container child. */
      transition: transform 0.2s ease-out;
    }

    /* Home button block: shown at the top of the sidebar while the native
       tab bar is hidden. */
    #${SIDEBAR_ID} .vertical-tabs-home-block {
      flex: 0 0 auto;
      overflow: hidden;
      box-sizing: border-box;
      transition: height 0.3s ease, opacity 0.3s ease;
    }

    #${SIDEBAR_ID} .vertical-tabs-home-btn {
      display: flex;
      flex-direction: row;
      align-items: center;
      /* Fixed 36px content height + 4px margin all around — matches the tab
         row geometry exactly (36 + 8 = 44px total) so the hover/active
         highlight is the same inset rounded rectangle as tab rows.
         Intentionally NOT following the tab-height preference. */
      height: 36px;
      margin: 4px;
      padding: 4px 12px 4px 9px;
      cursor: pointer;
      gap: 8px;
      position: relative;
      border-radius: 5px;
      box-sizing: border-box;
      /* Same cross-fade as tab rows: switching between a reader tab and the
         library moves .active between the row and this button. margin
         transitions too, for smooth strip <-> expanded switches. */
      transition: padding 0.2s ease-out, gap 0.2s ease-out, margin 0.2s ease-out, background 0.2s ease, box-shadow 0.2s ease;
    }

    #${SIDEBAR_ID} .vertical-tabs-home-btn:hover {
      background: var(--material-hover, rgba(0, 0, 0, 0.04));
    }

    #${SIDEBAR_ID} .vertical-tabs-home-btn.active {
      background: #fff;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
    }

    #${SIDEBAR_ID} .vertical-tabs-home-btn.active:hover {
      background: #fff;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
    }

    #${SIDEBAR_ID} .vertical-tabs-home-btn-icon {
      width: 16px;
      height: 16px;
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: margin 0.2s ease-out;
    }

    #${SIDEBAR_ID} .vertical-tabs-home-btn-title {
      flex: 1;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    #${SIDEBAR_ID} .vertical-tabs-home-separator {
      height: 1px;
      margin: 4px 12px;
      background: #DBDBDB;
    }

    /* Drop zone: area below categories for removing items from categories */
    #${SIDEBAR_ID} .vertical-tabs-drop-zone {
      flex: 1;
      min-height: 32px;
      padding: 4px 0;
      transition: background 0.3s ease, outline-color 0.3s ease, transform 0.2s ease-out;
      outline: 1px dashed transparent;
      outline-offset: -1px;
      position: relative;
    }

    #${SIDEBAR_ID} .vertical-tabs-drop-zone.vt-drop-zone-preview {
      min-height: var(--vt-category-preview-height, 32px);
      transition: min-height 0.45s ease-out, background 0.3s ease, outline-color 0.3s ease;
    }

    #${SIDEBAR_ID} .vertical-tabs-drop-zone.vertical-tabs-drop-zone-empty {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100%;
    }

    #${SIDEBAR_ID} .vertical-tabs-drop-zone.drag-over {
      outline-color: #999;
    }

    /* Quick-create-category drop zone pinned above the categories container.
       The element is collapsed (height 0, invisible) by default; the
       newCategoryDrop module drives inline height/opacity through these
       transitions to expand/collapse it smoothly. */
    #${SIDEBAR_ID} .vertical-tabs-new-category-zone {
      flex: 0 0 auto;
      overflow: hidden;
      height: 0;
      opacity: 0;
      transition: height 0.3s ease, opacity 0.3s ease;
    }

    #${SIDEBAR_ID} .vertical-tabs-new-category-inner {
      box-sizing: border-box;
      height: 32px;
      margin: 2px 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      color: #6C6C6C;
      outline: 1px dashed #999;
      outline-offset: -1px;
      border-radius: 4px;
      user-select: none;
      overflow: hidden;
    }

    /* Fade the label with the rest of the content in the 35px collapsed
       sidebar (same mechanism as item titles). */
    #${SIDEBAR_ID} .vertical-tabs-new-category-inner span {
      opacity: var(--vt-content-opacity, 1);
      transition: opacity 0.15s ease;
      white-space: nowrap;
    }

    #${SIDEBAR_ID} .vertical-tabs-drop-zone.vt-drop-preview-empty,
    #${SIDEBAR_ID} .vertical-tabs-drop-zone.vt-drop-preview-top-gap {
      position: relative;
    }

    #${SIDEBAR_ID} .vertical-tabs-drop-zone::before {
      content: "";
      position: absolute;
      left: 8px;
      right: 8px;
      top: var(--vt-drop-indicator-top-offset, 50%);
      transform: translateY(-50%);
      height: 2px;
      background: #42614D;
      border-radius: 1px;
      z-index: 10;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.15s ease;
    }

    #${SIDEBAR_ID} .vertical-tabs-drop-zone.vt-drop-preview-empty::before,
    #${SIDEBAR_ID} .vertical-tabs-drop-zone.vt-drop-preview-top-gap::before {
      opacity: 1;
    }

    #${SIDEBAR_ID} .vertical-tabs-items.vt-drop-preview-top-gap {
      position: relative;
    }

    #${SIDEBAR_ID} .vertical-tabs-items::before {
      content: "";
      position: absolute;
      left: 8px;
      right: 8px;
      top: var(--vt-drop-indicator-top-offset, 50%);
      transform: translateY(-50%);
      height: 2px;
      background: #42614D;
      border-radius: 1px;
      z-index: 10;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.15s ease;
    }

    #${SIDEBAR_ID} .vertical-tabs-items.vt-drop-preview-top-gap::before {
      opacity: 1;
    }

    /* Collapsed (floating, not expanded): icon-only layout */
    #${SIDEBAR_ID}.vertical-tabs-sidebar-floating:not(.vertical-tabs-sidebar-expanded) .vertical-tabs-header {
      padding: 6px 0;
    }

    /* macOS traffic lights overlap the sidebar's top edge after the native
       tab bar is hidden. Reserve 30px of space above controls. */
    #${SIDEBAR_ID}.vertical-tabs-macos-native-tabbar-hidden .vertical-tabs-header {
      margin-top: 30px;
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
      padding: 4px 0 4px 10px;
      gap: 0;
    }

    #${SIDEBAR_ID}.vertical-tabs-sidebar-floating:not(.vertical-tabs-sidebar-expanded) .vertical-tabs-chevron {
      margin-left: 0;
      margin-right: 0;
    }

    #${SIDEBAR_ID}.vertical-tabs-sidebar-floating:not(.vertical-tabs-sidebar-expanded) .vertical-tabs-item,
    #${SIDEBAR_ID}.vertical-tabs-sidebar-floating:not(.vertical-tabs-sidebar-expanded) .vertical-tabs-home-btn {
      padding: 4px 0;
      gap: 0;
    }

    #${SIDEBAR_ID}.vertical-tabs-sidebar-floating:not(.vertical-tabs-sidebar-expanded) .vertical-tabs-item,
    #${SIDEBAR_ID}.vertical-tabs-sidebar-floating:not(.vertical-tabs-sidebar-expanded) .vertical-tabs-home-btn {
      margin-left: 0;
      margin-right: 0;
    }

    #${SIDEBAR_ID}.vertical-tabs-sidebar-floating:not(.vertical-tabs-sidebar-expanded) .vertical-tabs-item-content {
      pointer-events: none;
    }

    #${SIDEBAR_ID}.vertical-tabs-sidebar-floating:not(.vertical-tabs-sidebar-expanded) .vertical-tabs-item-close {
      display: none;
    }

    #${SIDEBAR_ID}.vertical-tabs-sidebar-floating:not(.vertical-tabs-sidebar-expanded) .vertical-tabs-item-icon,
    #${SIDEBAR_ID}.vertical-tabs-sidebar-floating:not(.vertical-tabs-sidebar-expanded) .vertical-tabs-item-icon-fallback,
    #${SIDEBAR_ID}.vertical-tabs-sidebar-floating:not(.vertical-tabs-sidebar-expanded) .vertical-tabs-home-btn-icon {
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

    /* Minimal collapsed strip (auto-expand off + compact-strip pref): a 20px
       bar showing only the plugin icon, vertically centered. Everything else
       is hidden and the whole bar acts as a pin button. */
    #${SIDEBAR_ID}.vertical-tabs-sidebar-floating.vertical-tabs-sidebar-minimal {
      width: 20px;
      min-width: 20px;
      cursor: pointer;
    }

    #${SIDEBAR_ID}.vertical-tabs-sidebar-minimal .vertical-tabs-header,
    #${SIDEBAR_ID}.vertical-tabs-sidebar-minimal .vertical-tabs-home-block,
    #${SIDEBAR_ID}.vertical-tabs-sidebar-minimal .vertical-tabs-categories,
    #${SIDEBAR_ID}.vertical-tabs-sidebar-minimal .vertical-tabs-resize-handle {
      display: none;
    }

    #${SIDEBAR_ID} .vertical-tabs-minimal-icon {
      display: none;
      /* Always a FLOATING element (independent of the minimal class): fixed
         at the vertical center of the sidebar and horizontally centered on
         the 20px minimal strip, at a constant 12px size. The minimal-mode
         pin/unpin animations fade it out/in in place — without this it
         falls back into the document flow the moment the minimal class is
         removed (appearing at the bottom at the favicon's natural size). */
      position: absolute;
      top: 50%;
      left: 10px;
      transform: translate(-50%, -50%);
      width: 12px;
      height: 12px;
      z-index: 11;
      pointer-events: none;
    }

    #${SIDEBAR_ID}.vertical-tabs-sidebar-minimal .vertical-tabs-minimal-icon {
      display: block;
    }

    #${SIDEBAR_ID}.vertical-tabs-sidebar-floating:not(.vertical-tabs-sidebar-expanded) .vertical-tabs-separator,
    #${SIDEBAR_ID}.vertical-tabs-sidebar-floating:not(.vertical-tabs-sidebar-expanded) .vertical-tabs-home-separator {
      margin: 4px 6px;
    }

    /* Fade right-side content during the last 5px of collapse (40px -> 35px) */
    #${SIDEBAR_ID} .vertical-tabs-search,
    #${SIDEBAR_ID} .vertical-tabs-more-btn,
    #${SIDEBAR_ID} .vertical-tabs-category-name,
    #${SIDEBAR_ID} .vertical-tabs-count,
    #${SIDEBAR_ID} .vertical-tabs-item-content,
    #${SIDEBAR_ID} .vertical-tabs-home-btn-title,
    #${SIDEBAR_ID} .vertical-tabs-empty {
      opacity: var(--vt-content-opacity, 1);
    }

    /* Disable only the sidebar's own layout transition while pin/strip
       animation writes width every frame. Child rows keep their margin,
       padding, and opacity transitions so the expanded layout does not pop. */
    #${SIDEBAR_ID}.vertical-tabs-sidebar-resizing {
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

    /* Shared popup open/close animation (context menus) — same keyframes as
       the more menu; transform-origin is pinned inline per menu. */
    .vt-popup-appear {
      animation: vt-more-menu-appear 0.15s ease-out;
    }

    .vt-popup-leaving {
      animation: vt-more-menu-leave 0.15s ease-out forwards;
      pointer-events: none;
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
      background: transparent;
      border: 0;
      outline: 0;
      box-shadow: none;
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s ease-out;
    }

    .vt-action-btn::-moz-focus-inner {
      border: 0;
      padding: 0;
    }

    .vt-action-btn:hover {
      background: var(--material-button-hover, rgba(0, 0, 0, 0.06));
    }

    .vt-action-btn > span {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
    }

    @media (prefers-color-scheme: dark) {
      .vt-action-btn:hover {
        background: var(--material-button-hover, rgba(255, 255, 255, 0.08));
      }
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

    /* Help dialog */
    #vt-help-dialog-overlay {
      font-family: message-box;
    }

    .vt-help-dialog {
      animation: vt-help-dialog-appear 0.15s ease-out;
    }

    @keyframes vt-help-dialog-appear {
      from { opacity: 0; transform: scale(0.96); }
      to { opacity: 1; transform: scale(1); }
    }

    #vt-help-dialog-overlay.vt-help-dialog-leaving {
      animation: vt-help-dialog-overlay-leave 0.15s ease-out forwards;
    }

    #vt-help-dialog-overlay.vt-help-dialog-leaving .vt-help-dialog {
      animation: vt-help-dialog-content-leave 0.15s ease-out forwards;
    }

    @keyframes vt-help-dialog-overlay-leave {
      from { opacity: 1; }
      to { opacity: 0; }
    }

    @keyframes vt-help-dialog-content-leave {
      from { opacity: 1; transform: scale(1); }
      to { opacity: 0; transform: scale(0.96); }
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
      #${SIDEBAR_ID} .vertical-tabs-item:hover,
      #${SIDEBAR_ID} .vertical-tabs-item.vt-sidebar-row-hover,
      #${SIDEBAR_ID} .vertical-tabs-home-btn:hover {
        background: var(--material-hover, rgba(255, 255, 255, 0.05));
      }

      #${SIDEBAR_ID} .vertical-tabs-item-selection-overlay {
        background: rgba(255, 255, 255, 0.12);
      }

      #${SIDEBAR_ID} .vertical-tabs-item.active {
        background: #626262;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
      }

      #${SIDEBAR_ID} .vertical-tabs-home-btn.active {
        background: #494949;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
      }

      #${SIDEBAR_ID} .vertical-tabs-category.collapsed.vt-category-preview .vertical-tabs-item.active {
        background: #626262;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
      }

      #${SIDEBAR_ID} .vertical-tabs-item.active:hover,
      #${SIDEBAR_ID} .vertical-tabs-item.active.vt-sidebar-row-hover {
        background: #626262;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
      }

      #${SIDEBAR_ID}.vt-hover-locked .vertical-tabs-item.active:hover:not(.vt-sidebar-row-hover) {
        background: #626262;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
      }

      #${SIDEBAR_ID} .vertical-tabs-home-btn.active:hover {
        background: #494949;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
      }

      #${SIDEBAR_ID} .vertical-tabs-item-reader-loaded-indicator {
        background: #4a9e6e;
      }

      #${SIDEBAR_ID} .vertical-tabs-category::before {
        background: #626262;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
      }

      #${SIDEBAR_ID} .vertical-tabs-category.drag-over {
        outline-color: #888;
        transition: none;
      }

      #${SIDEBAR_ID} .vertical-tabs-category-header.drag-over {
        /* visual handled by wrapper outline */
      }

      #${SIDEBAR_ID} .vertical-tabs-drop-zone.drag-over {
        outline-color: #888;
      }

      #${SIDEBAR_ID} .vertical-tabs-new-category-inner {
        color: #A2A2A2;
        outline-color: #888;
      }

      #${SIDEBAR_ID} .vertical-tabs-separator,
      #${SIDEBAR_ID} .vertical-tabs-home-separator {
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
        background: linear-gradient(to right, transparent, var(--vt-close-bg, #303030) 60%);
      }

      #${SIDEBAR_ID} .vertical-tabs-item.active .vertical-tabs-item-close {
        background: linear-gradient(to left, #626262 40%, transparent);
      }

      #${SIDEBAR_ID} .vertical-tabs-item-close::before {
        background: linear-gradient(to left, var(--material-hover, rgba(255, 255, 255, 0.05)), transparent);
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
      /* Must paint above Zotero's #zotero-tab-cover (position:fixed, z-index:2,
         opaque) — the white loading mask Zotero shows while a reader-unloaded
         tab loads on select. Without this the cover blanks the whole VT
         (only z-index:2 category headers survive) for the reader's entire
         load time. */
      z-index: 3;
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

    /* User preference: settle every sidebar visual change immediately. Keep
       this rule after the component transition declarations so it wins the
       cascade for nested controls as well as the sidebar itself. */
    #${SIDEBAR_ID}.vertical-tabs-sidebar-no-animations,
    #${SIDEBAR_ID}.vertical-tabs-sidebar-no-animations * {
      transition: none !important;
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
