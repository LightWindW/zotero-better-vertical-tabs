/**
 * The "home" button shown at the top of the VT sidebar while the native tab
 * bar is hidden. It mirrors the native library tab ("zotero-pane"): same
 * icon, same title ("我的文库" or the currently viewed collection), same
 * click behavior (switch to the library tab).
 *
 * The block (button + separator) sits between `.vertical-tabs-header` and
 * `.vertical-tabs-categories`, outside the rebuilt/scrollable container, so
 * category re-renders never touch it. It registers no drag handlers, so
 * tabs cannot be dropped onto it.
 *
 * Show/hide animations reuse the inline-height + opacity pattern from
 * categoryCollapse.ts: pin the current height, force a reflow, transition
 * to the target, then clean up inline styles.
 */

import { SIDEBAR_ID } from "./sidebar";
import { getZoteroTabs } from "../track/itemTracker";

const BLOCK_CLASS = "vertical-tabs-home-block";
const BTN_CLASS = "vertical-tabs-home-btn";
const ICON_CLASS = "vertical-tabs-home-btn-icon";
const TITLE_CLASS = "vertical-tabs-home-btn-title";
const SEPARATOR_CLASS = "vertical-tabs-home-separator";
const LIBRARY_TAB_ID = "zotero-pane";
const ANIMATION_MS = 300;

const animState = new WeakMap<HTMLElement, number>();

function createEl(doc: Document, tag: string, className: string): HTMLElement {
  const el = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    tag,
  ) as HTMLElement;
  el.className = className;
  return el;
}

function getSidebarEl(doc: Document): HTMLElement | null {
  return doc.getElementById(SIDEBAR_ID) as HTMLElement | null;
}

function getBlock(doc: Document): HTMLElement | null {
  return (getSidebarEl(doc)?.querySelector(`.${BLOCK_CLASS}`) ??
    null) as HTMLElement | null;
}

function cancelAnimation(block: HTMLElement): void {
  const win = block.ownerDocument?.defaultView;
  const timeout = animState.get(block);
  if (timeout !== undefined && win) win.clearTimeout(timeout);
  animState.delete(block);
}

function transitionBlock(
  doc: Document,
  block: HTMLElement,
  targetHeight: number,
  targetOpacity: string,
  onDone: () => void,
): void {
  cancelAnimation(block);
  // Commit the current inline styles as the transition start point.
  void block.offsetHeight;
  block.style.height = `${targetHeight}px`;
  block.style.opacity = targetOpacity;
  const win = doc.defaultView;
  if (!win) {
    onDone();
    return;
  }
  const timeout = win.setTimeout(() => {
    animState.delete(block);
    if (block.isConnected) onDone();
  }, ANIMATION_MS);
  animState.set(block, timeout);
}

function buildBlock(doc: Document): HTMLElement {
  const block = createEl(doc, "div", BLOCK_CLASS);

  const btn = createEl(doc, "div", BTN_CLASS);
  btn.setAttribute("role", "button");
  btn.addEventListener("click", () => {
    // Zotero_Tabs is a Window property (not a global) — access via the doc.
    getZoteroTabs(doc)?.select(LIBRARY_TAB_ID);
  });

  const icon = createEl(doc, "span", ICON_CLASS);
  const title = createEl(doc, "span", TITLE_CLASS);
  btn.appendChild(icon);
  btn.appendChild(title);
  block.appendChild(btn);

  block.appendChild(createEl(doc, "div", SEPARATOR_CLASS));
  return block;
}

/**
 * Mirror the native library tab's icon, title and selected state into the
 * home button. Reads from the (possibly hidden) `#tab-bar-container` DOM so
 * the button always matches what the native tab would show.
 */
export function syncLibraryHomeButton(doc: Document): void {
  const block = getBlock(doc);
  if (!block) return;
  const btn = block.querySelector(`.${BTN_CLASS}`) as HTMLElement | null;
  const iconEl = block.querySelector(`.${ICON_CLASS}`) as HTMLElement | null;
  const titleEl = block.querySelector(`.${TITLE_CLASS}`) as HTMLElement | null;
  if (!btn || !iconEl || !titleEl) return;

  const nativeTab = doc.querySelector(
    `#tab-bar-container .tab[data-id="${LIBRARY_TAB_ID}"]`,
  ) as HTMLElement | null;

  // Title: mirror the native label; fall back to the tabs data model.
  let title = nativeTab?.querySelector(".tab-name")?.textContent?.trim();
  if (!title) {
    title = getZoteroTabs(doc)?._getTab(LIBRARY_TAB_ID)?.tab?.title || "";
  }
  if (title && titleEl.textContent !== title) {
    titleEl.textContent = title;
    btn.title = title;
  }

  // Icon: clone the native icon node so theming matches exactly. Wrap it in
  // a `.tab` span because Zotero's icon CSS keys off ancestor tab classes.
  const nativeIcon = nativeTab?.querySelector(".tab-icon");
  if (nativeIcon) {
    const nextHtml = (nativeIcon as HTMLElement).outerHTML;
    const currentHtml = (
      iconEl.firstElementChild?.firstElementChild as HTMLElement | null
    )?.outerHTML;
    if (nextHtml !== currentHtml) {
      iconEl.innerHTML = "";
      const wrapper = createEl(doc, "span", "tab");
      wrapper.style.display = "contents";
      wrapper.appendChild(nativeIcon.cloneNode(true));
      iconEl.appendChild(wrapper);
    }
  }

  // Active state mirrors whether the library tab is selected.
  btn.classList.toggle(
    "active",
    getZoteroTabs(doc)?.selectedID === LIBRARY_TAB_ID,
  );
}

/**
 * Show the home button block. When `animate` is true the block grows from
 * 0 height and fades in (tabs below smoothly shift down); otherwise it
 * appears instantly (startup restore).
 */
export function showLibraryHomeButton(doc: Document, animate: boolean): void {
  const sidebar = getSidebarEl(doc);
  if (!sidebar) return;

  const existing = getBlock(doc);
  if (existing) {
    // Already visible (possibly mid-hide): reverse seamlessly from the
    // current rendered height.
    if (animate) {
      existing.style.height = `${existing.getBoundingClientRect().height}px`;
      transitionBlock(doc, existing, existing.scrollHeight, "1", () => {
        existing.style.height = "";
        existing.style.opacity = "";
      });
    } else {
      cancelAnimation(existing);
      existing.style.height = "";
      existing.style.opacity = "";
    }
    syncLibraryHomeButton(doc);
    return;
  }

  const block = buildBlock(doc);
  const categories = sidebar.querySelector(".vertical-tabs-categories");
  sidebar.insertBefore(block, categories);
  syncLibraryHomeButton(doc);

  if (animate) {
    block.style.height = "0px";
    block.style.opacity = "0";
    transitionBlock(doc, block, block.scrollHeight, "1", () => {
      block.style.height = "";
      block.style.opacity = "";
    });
  }
}

/**
 * Hide the home button block. When `animate` is true the block fades out
 * and shrinks to 0 height (tabs below smoothly shift up) before removal.
 */
export function hideLibraryHomeButton(doc: Document, animate: boolean): void {
  const block = getBlock(doc);
  if (!block) return;
  if (!animate) {
    cancelAnimation(block);
    block.remove();
    return;
  }
  // Pin the current rendered height so the transition starts from the exact
  // visual height (seamless when reversing a mid-show animation).
  block.style.height = `${block.getBoundingClientRect().height}px`;
  transitionBlock(doc, block, 0, "0", () => block.remove());
}

/** Immediately remove the block and cancel any pending animation. */
export function removeLibraryHomeButton(doc: Document): void {
  const block = getBlock(doc);
  if (!block) return;
  cancelAnimation(block);
  block.remove();
}
