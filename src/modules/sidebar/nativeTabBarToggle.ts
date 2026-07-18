/**
 * Hide/show the native Zotero tab strip and keep the VT "home" button in
 * sync with the native library tab.
 *
 * Hiding is done with an inline `display: none` on the `#zotero-title-bar`
 * hbox — the strip that contains `#tab-bar-container` plus the tabs-menu
 * toolbar — so everything below it moves up. React renders *into*
 * `#tab-bar-container` and never resets ancestor attributes, so the style
 * sticks — and the hidden DOM keeps updating, which lets libraryHomeButton
 * mirror the library tab's icon/title from it.
 *
 * The hidden state is persisted in the `verticalTabs.nativeTabBarHidden`
 * pref and restored on startup. The tab strip is force-restored when the
 * plugin is destroyed or VT is globally disabled, so users can never lose
 * the native tab strip permanently.
 */

import { getPref, setPref } from "../../utils/prefs";
import {
  hideLibraryHomeButton,
  removeLibraryHomeButton,
  showLibraryHomeButton,
  syncLibraryHomeButton,
} from "./libraryHomeButton";

/** The hbox strip that gets hidden (title bar: tabs + tabs-menu toolbar). */
const TITLE_BAR_ID = "zotero-title-bar";
/** Inner React render target we observe for library-tab changes. */
const TAB_BAR_CONTAINER_ID = "tab-bar-container";
const OBSERVER_KEY = "__vtNativeTabBarObserver";
const ANIMATION_MS = 300;

interface TitleBarAnim {
  frame: number;
}

const animState = new WeakMap<HTMLElement, TitleBarAnim>();

function cancelTitleBarAnimation(el: HTMLElement): void {
  const win = el.ownerDocument?.defaultView;
  const anim = animState.get(el);
  if (anim && win) win.cancelAnimationFrame(anim.frame);
  animState.delete(el);
}

function clearTitleBarInlineStyles(el: HTMLElement): void {
  el.style.height = "";
  el.style.minHeight = "";
  el.style.overflow = "";
}

/**
 * Drive a height animation by writing explicit px values every animation
 * frame. CSS transitions on `height` do NOT run on XUL hbox elements (the
 * legacy -moz-box layout ignores the interpolation), so the animation has
 * to be stepped manually — inline px heights themselves apply fine.
 */
function animateTitleBarHeight(
  el: HTMLElement,
  from: number,
  to: number,
  done: () => void,
): void {
  cancelTitleBarAnimation(el);
  const win = el.ownerDocument?.defaultView;
  if (!win || from === to) {
    el.style.height = `${to}px`;
    done();
    return;
  }
  el.style.overflow = "hidden";
  el.style.minHeight = "0px";
  el.style.height = `${from}px`;
  const now = (): number => win.performance?.now() ?? Date.now();
  const start = now();
  // easeInOutQuad — close to the CSS "ease" curve used elsewhere.
  const ease = (t: number): number =>
    t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  const step = (nowTs: number): void => {
    if (!el.isConnected) {
      animState.delete(el);
      return;
    }
    const t = Math.min(1, (nowTs - start) / ANIMATION_MS);
    el.style.height = `${from + (to - from) * ease(t)}px`;
    if (t < 1) {
      animState.set(el, { frame: win.requestAnimationFrame(step) });
    } else {
      animState.delete(el);
      done();
    }
  };
  animState.set(el, { frame: win.requestAnimationFrame(step) });
}

export function isNativeTabBarHidden(): boolean {
  return getPref("verticalTabs.nativeTabBarHidden") ?? false;
}

function isVtGloballyEnabled(): boolean {
  return getPref("verticalTabs.enabled") ?? true;
}

function getTitleBar(doc: Document): HTMLElement | null {
  return doc.getElementById(TITLE_BAR_ID) as HTMLElement | null;
}

/**
 * Apply the persisted visibility to one window instantly (startup / VT
 * re-enable). The tab strip is never hidden when VT is globally disabled,
 * so the user always keeps a tab UI.
 */
export function applyNativeTabBarVisibility(doc: Document): void {
  const titleBar = getTitleBar(doc);
  if (!titleBar) return;
  cancelTitleBarAnimation(titleBar);
  clearTitleBarInlineStyles(titleBar);
  const hide = isNativeTabBarHidden() && isVtGloballyEnabled();
  titleBar.style.display = hide ? "none" : "";
}

/**
 * Animated visibility change: smoothly collapse / expand the
 * `#zotero-title-bar` hbox height (rAF-stepped, see animateTitleBarHeight).
 * `display: none` is only flipped at the very end of the collapse so the
 * animation is fully visible. Rapid toggles reverse seamlessly from the
 * current interpolated height.
 */
export function setNativeTabBarHiddenAnimated(
  doc: Document,
  hidden: boolean,
): void {
  const titleBar = getTitleBar(doc);
  if (!titleBar) return;
  cancelTitleBarAnimation(titleBar);

  if (hidden) {
    // Collapse from the current rendered height to 0, then hide.
    const startHeight = titleBar.getBoundingClientRect().height;
    animateTitleBarHeight(titleBar, startHeight, 0, () => {
      titleBar.style.display = "none";
      clearTitleBarInlineStyles(titleBar);
    });
  } else {
    // Expand. Read the start height BEFORE restoring display: while
    // display:none the rect is 0 (correct start), and mid-collapse reversals
    // read the interpolated inline height. Reading after display="" would
    // already return the natural height (layout is synchronous) and skip
    // the animation entirely.
    const startHeight = titleBar.getBoundingClientRect().height;
    titleBar.style.display = "";
    titleBar.style.height = "";
    void titleBar.offsetHeight;
    const naturalHeight = titleBar.getBoundingClientRect().height;
    animateTitleBarHeight(titleBar, startHeight, naturalHeight, () => {
      clearTitleBarInlineStyles(titleBar);
    });
  }
}

/** Force-restore the native tab strip (plugin destroy / VT disabled). */
export function restoreNativeTabBar(doc: Document): void {
  const titleBar = getTitleBar(doc);
  if (!titleBar) return;
  cancelTitleBarAnimation(titleBar);
  clearTitleBarInlineStyles(titleBar);
  titleBar.style.display = "";
}

function destroyNativeTabBarObserver(doc: Document): void {
  const observer = (doc as any)[OBSERVER_KEY] as MutationObserver | undefined;
  if (observer) {
    observer.disconnect();
    delete (doc as any)[OBSERVER_KEY];
  }
}

/**
 * Watch the native tab bar and mirror the library tab into the home button
 * whenever React re-renders it (title/icon/selection changes).
 */
export function initNativeTabBarObserver(doc: Document): void {
  destroyNativeTabBarObserver(doc);
  const tabBar = doc.getElementById(TAB_BAR_CONTAINER_ID) as HTMLElement | null;
  const win = doc.defaultView;
  if (!tabBar || !win) return;
  const observer = new win.MutationObserver(() => {
    // Read-only against the tab bar; writes only touch the VT sidebar, so
    // this cannot retrigger itself.
    syncLibraryHomeButton(doc);
  });
  observer.observe(tabBar, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
  });
  (doc as any)[OBSERVER_KEY] = observer;
}

/**
 * Toggle the native tab strip for all main windows. The strip's height
 * collapses/expands smoothly while the VT home button animates in/out in
 * parallel (both 0.3s).
 */
export function toggleNativeTabBar(doc: Document): void {
  const hidden = !isNativeTabBarHidden();
  setPref("verticalTabs.nativeTabBarHidden", hidden);
  for (const win of Zotero.getMainWindows()) {
    const winDoc = win.document;
    setNativeTabBarHiddenAnimated(winDoc, hidden);
    if (hidden) {
      showLibraryHomeButton(winDoc, true);
    } else {
      hideLibraryHomeButton(winDoc, true);
    }
  }
}

/** Per-window teardown: observer off, tab bar restored, button removed. */
export function destroyNativeTabBarToggle(doc: Document): void {
  destroyNativeTabBarObserver(doc);
  restoreNativeTabBar(doc);
  removeLibraryHomeButton(doc);
}
