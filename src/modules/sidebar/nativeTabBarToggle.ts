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
import { SIDEBAR_ID } from "../render/styles";
import { isPinned } from "./sidebar";
import {
  hasLibraryHomeButton,
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
const VISIBILITY_RETRY_OBSERVER_KEY = "__vtNativeTabBarVisibilityObserver";
const READER_SYNC_OBSERVER_KEY = "__vtReaderToolbarSyncObserver";
const READER_UI_OBSERVER_KEY = "__vtReaderUIRenderObserver";
const READER_FRAME_SYNC_KEY = "__vtReaderToolbarSyncHandler";
const ANIMATION_MS = 300;
const MACOS_TOP_SPACER_CLASS = "vertical-tabs-macos-native-tabbar-hidden";
const MACOS_TOOLBAR_PADDING = "35px";
const PINNED_TOOLBAR_PADDING = "8px";
const TOOLBAR_PADDING_TRANSITION_MS = 300;

interface TitleBarAnim {
  frame: number;
}

const animState = new WeakMap<HTMLElement, TitleBarAnim>();
const nativeTabBarDisplayState = new WeakMap<
  HTMLElement,
  { value: string; priority: string }
>();
const readerUIDocuments = new Set<Document>();
const toolbarTransitionState = new WeakMap<
  HTMLElement,
  {
    value: string;
    priority: string;
    cleanupTimer?: ReturnType<typeof setTimeout>;
  }
>();

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

function getNativeTabBarContainer(doc: Document): HTMLElement | null {
  return doc.getElementById(TAB_BAR_CONTAINER_ID) as HTMLElement | null;
}

function setNativeTabBarElementHidden(
  element: HTMLElement | null,
  hidden: boolean,
): void {
  if (!element) return;
  if (hidden) {
    if (!nativeTabBarDisplayState.has(element)) {
      nativeTabBarDisplayState.set(element, {
        value: element.style.getPropertyValue("display"),
        priority: element.style.getPropertyPriority("display"),
      });
    }
    element.style.setProperty("display", "none", "important");
    return;
  }

  const original = nativeTabBarDisplayState.get(element);
  if (original?.value) {
    element.style.setProperty("display", original.value, original.priority);
  } else {
    element.style.removeProperty("display");
  }
  nativeTabBarDisplayState.delete(element);
}

function setNativeTabBarContainerHidden(doc: Document, hidden: boolean): void {
  setNativeTabBarElementHidden(getNativeTabBarContainer(doc), hidden);
}

function setNativeTabBarHidden(doc: Document, hidden: boolean): void {
  setNativeTabBarElementHidden(getTitleBar(doc), hidden);
  setNativeTabBarContainerHidden(doc, hidden);
}

function isReaderToolbarPaddingEnabled(): boolean {
  return Zotero.isMac && isNativeTabBarHidden() && isVtGloballyEnabled();
}

function setAnimatedToolbarPadding(
  element: HTMLElement,
  enabled: boolean,
  pinned: boolean,
  includeInlineStart = false,
): void {
  let state = toolbarTransitionState.get(element);
  if (!state) {
    state = {
      value: element.style.getPropertyValue("transition"),
      priority: element.style.getPropertyPriority("transition"),
    };
    toolbarTransitionState.set(element, state);
  }
  if (state.cleanupTimer) {
    clearTimeout(state.cleanupTimer);
    state.cleanupTimer = undefined;
  }

  const paddingTransitions = [
    "padding-left 300ms ease",
    ...(includeInlineStart ? ["padding-inline-start 300ms ease"] : []),
  ];
  const transitionValue = [state.value, ...paddingTransitions]
    .filter(Boolean)
    .join(", ");
  element.style.setProperty("transition", transitionValue, "important");

  if (enabled) {
    const padding = pinned ? PINNED_TOOLBAR_PADDING : MACOS_TOOLBAR_PADDING;
    element.style.setProperty("padding-left", padding, "important");
    if (includeInlineStart) {
      element.style.setProperty("padding-inline-start", padding, "important");
    }
    return;
  }

  element.style.removeProperty("padding-left");
  if (includeInlineStart) {
    element.style.removeProperty("padding-inline-start");
  }
  state.cleanupTimer = setTimeout(() => {
    element.style.removeProperty("transition");
    if (state?.value) {
      element.style.setProperty("transition", state.value, state.priority);
    }
    toolbarTransitionState.delete(element);
  }, TOOLBAR_PADDING_TRANSITION_MS + 50);
}

function syncReaderToolbarDocument(
  readerDoc: Document,
  enabled: boolean,
  pinned = isPinned(),
): void {
  const readerToolbars = readerDoc.querySelectorAll("#reader-ui .toolbar");
  const betterNotesToolbars = readerDoc.querySelectorAll(
    "#BetterNotes-left-toolbar",
  );
  for (const readerToolbar of readerToolbars) {
    setAnimatedToolbarPadding(
      readerToolbar as HTMLElement,
      enabled,
      pinned,
      true,
    );
  }
  for (const betterNotesToolbar of betterNotesToolbars) {
    setAnimatedToolbarPadding(
      betterNotesToolbar as HTMLElement,
      enabled,
      pinned,
    );
  }
}

function syncReaderSandboxDocuments(
  enabled: boolean,
  pinned = isPinned(),
): void {
  const readers = (Zotero.Reader as any)?._readers as
    | Array<Record<string, any>>
    | undefined;
  if (!readers) return;
  readers.forEach((reader) => {
    try {
      const iframe = reader._iframe as
        | (Element & {
            contentDocument?: Document;
            [READER_FRAME_SYNC_KEY]?: EventListener;
          })
        | undefined;
      const primaryView = reader._internalReader?._primaryView as
        | Record<string, any>
        | undefined;
      const documents = [
        (reader._window as Window | undefined)?.document,
        (reader._iframeWindow as Window | undefined)?.document,
        (primaryView?._iframeWindow as Window | undefined)?.document,
        iframe?.contentDocument,
      ].filter((readerDoc): readerDoc is Document => !!readerDoc);
      for (const readerDoc of documents) {
        syncReaderToolbarDocument(readerDoc, enabled, pinned);
        ensureReaderUIDocumentObserver(readerDoc);
      }
      if (iframe && !iframe[READER_FRAME_SYNC_KEY]) {
        const handler: EventListener = () => {
          syncReaderSandboxDocuments(isReaderToolbarPaddingEnabled());
        };
        iframe[READER_FRAME_SYNC_KEY] = handler;
        iframe.addEventListener("load", handler);
      }
    } catch {
      // Reader instances can be torn down while the registry is scanned.
    }
  });
}

function ensureReaderUIDocumentObserver(doc: Document): void {
  if ((doc as any)[READER_UI_OBSERVER_KEY]) return;
  const root = doc.documentElement;
  const win = doc.defaultView;
  if (!root || !win) return;
  const observer = new win.MutationObserver((records: MutationRecord[]) => {
    const toolbarAdded = records.some((record) =>
      Array.from(record.addedNodes).some((node: Node | null) => {
        if (!node || node.nodeType !== 1) return false;
        const element = node as Element;
        return (
          element.matches(".toolbar, #BetterNotes-left-toolbar") ||
          !!element.querySelector(".toolbar, #BetterNotes-left-toolbar")
        );
      }),
    );
    if (toolbarAdded) {
      syncReaderToolbarDocument(doc, isReaderToolbarPaddingEnabled());
    }
  });
  observer.observe(root, { childList: true, subtree: true });
  (doc as any)[READER_UI_OBSERVER_KEY] = observer;
  readerUIDocuments.add(doc);
}

function ensureReaderSandboxObserver(doc: Document): void {
  if ((doc as any)[READER_SYNC_OBSERVER_KEY]) return;
  const root = doc.documentElement;
  const win = doc.defaultView;
  if (!root || !win) return;
  const observer = new win.MutationObserver((records: MutationRecord[]) => {
    if (
      records.some((record) =>
        Array.from(record.addedNodes).some(
          (node: Node | null) =>
            !!node &&
            node.nodeType === 1 &&
            !!(
              (node as Element).matches?.("iframe, browser") ||
              (node as Element).querySelector?.("iframe, browser")
            ),
        ),
      )
    ) {
      syncReaderSandboxDocuments(isReaderToolbarPaddingEnabled());
    }
  });
  observer.observe(root, { childList: true, subtree: true });
  (doc as any)[READER_SYNC_OBSERVER_KEY] = observer;
}

function destroyReaderSandboxObserver(doc: Document): void {
  const observer = (doc as any)[READER_SYNC_OBSERVER_KEY] as
    | MutationObserver
    | undefined;
  observer?.disconnect();
  delete (doc as any)[READER_SYNC_OBSERVER_KEY];
}

function syncMacOSTopSpacer(
  doc: Document,
  nativeTabBarHidden: boolean,
  pinned = isPinned(),
): void {
  const enabled = Zotero.isMac && nativeTabBarHidden;
  const toolbarPaddingEnabled = enabled;
  const sidebar = doc.getElementById(SIDEBAR_ID);
  const header = sidebar?.querySelector<HTMLElement>(".vertical-tabs-header");
  const spacerChanged =
    !!sidebar && sidebar.classList.contains(MACOS_TOP_SPACER_CLASS) !== enabled;
  if (header && spacerChanged) {
    // Commit the current rendered margin before changing the class. Both
    // directions (and reversals mid-transition) then have a numeric start.
    header.style.marginTop =
      doc.defaultView?.getComputedStyle(header)?.marginTop || "0px";
    void header.offsetHeight;
  }
  doc.documentElement?.classList.toggle(MACOS_TOP_SPACER_CLASS, enabled);
  sidebar?.classList.toggle(MACOS_TOP_SPACER_CLASS, enabled);
  if (header && spacerChanged) {
    header.style.marginTop = enabled ? "30px" : "0px";
  }
  const collectionToolbar = doc.getElementById(
    "zotero-toolbar-collection-tree",
  ) as HTMLElement | null;
  if (collectionToolbar) {
    setAnimatedToolbarPadding(collectionToolbar, enabled, pinned);
  }
  const betterNotesToolbar = doc.querySelector(
    "#BetterNotes-left-toolbar",
  ) as HTMLElement | null;
  if (betterNotesToolbar) {
    setAnimatedToolbarPadding(betterNotesToolbar, enabled, pinned);
  }
  syncReaderToolbarDocument(doc, toolbarPaddingEnabled, pinned);
  syncReaderSandboxDocuments(toolbarPaddingEnabled, pinned);
  for (const readerDoc of readerUIDocuments) {
    syncReaderToolbarDocument(readerDoc, toolbarPaddingEnabled, pinned);
  }
  ensureReaderSandboxObserver(doc);
}

function syncMacOSTopSpacerSafely(
  doc: Document,
  nativeTabBarHidden: boolean,
  pinned = isPinned(),
): void {
  try {
    syncMacOSTopSpacer(doc, nativeTabBarHidden, pinned);
  } catch (error) {
    Zotero.logError(
      new Error(`[BVT] Failed to sync macOS toolbar layout: ${String(error)}`),
    );
  }
}

/** Reapply toolbar padding after the pinned preference changes. */
export function syncNativeTabBarLayout(
  doc: Document,
  pinned = isPinned(),
): void {
  syncMacOSTopSpacerSafely(
    doc,
    isNativeTabBarHidden() && isVtGloballyEnabled(),
    pinned,
  );
}

/**
 * Apply the persisted visibility to one window instantly (startup / VT
 * re-enable). The tab strip is never hidden when VT is globally disabled,
 * so the user always keeps a tab UI.
 */
export function applyNativeTabBarVisibility(doc: Document): void {
  ensureNativeTabBarVisibilityObserver(doc);
  const titleBar = getTitleBar(doc);
  const hide = isNativeTabBarHidden() && isVtGloballyEnabled();
  syncMacOSTopSpacerSafely(doc, hide);
  setNativeTabBarHidden(doc, hide);
  if (hide) showLibraryHomeButton(doc, false);
  else hideLibraryHomeButton(doc, false);
  if (!titleBar) return;
  cancelTitleBarAnimation(titleBar);
  clearTitleBarInlineStyles(titleBar);
}

/**
 * The add-on can initialize before Zotero finishes mounting its React tab
 * strip and the vertical-tabs sidebar. Watch for those late nodes and apply
 * the persisted state again once the actual targets exist.
 */
function ensureNativeTabBarVisibilityObserver(doc: Document): void {
  if ((doc as any)[VISIBILITY_RETRY_OBSERVER_KEY]) return;
  const root = doc.documentElement;
  const win = doc.defaultView;
  if (!root || !win) return;

  const observer = new win.MutationObserver((records: MutationRecord[]) => {
    const relevantNodeAdded = records.some((record) =>
      Array.from(record.addedNodes).some((node) => {
        if (!node || node.nodeType !== 1) return false;
        const element = node as Element;
        return (
          element.id === TITLE_BAR_ID ||
          element.id === TAB_BAR_CONTAINER_ID ||
          element.id === SIDEBAR_ID ||
          !!element.querySelector(
            `#${TITLE_BAR_ID}, #${TAB_BAR_CONTAINER_ID}, #${SIDEBAR_ID}`,
          )
        );
      }),
    );
    if (relevantNodeAdded) applyNativeTabBarVisibility(doc);
  });
  observer.observe(root, { childList: true, subtree: true });
  (doc as any)[VISIBILITY_RETRY_OBSERVER_KEY] = observer;
}

function destroyNativeTabBarVisibilityObserver(doc: Document): void {
  const observer = (doc as any)[VISIBILITY_RETRY_OBSERVER_KEY] as
    | MutationObserver
    | undefined;
  observer?.disconnect();
  delete (doc as any)[VISIBILITY_RETRY_OBSERVER_KEY];
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
  syncMacOSTopSpacerSafely(doc, hidden && isVtGloballyEnabled());
  const titleBar = getTitleBar(doc);
  if (!titleBar) {
    setNativeTabBarContainerHidden(doc, hidden);
    return;
  }
  cancelTitleBarAnimation(titleBar);

  if (hidden) {
    // Collapse from the current rendered height to 0, then hide.
    const startHeight = titleBar.getBoundingClientRect().height;
    animateTitleBarHeight(titleBar, startHeight, 0, () => {
      setNativeTabBarHidden(doc, true);
      clearTitleBarInlineStyles(titleBar);
    });
  } else {
    // Expand. Read the start height BEFORE restoring display: while
    // display:none the rect is 0 (correct start), and mid-collapse reversals
    // read the interpolated inline height. Reading after display="" would
    // already return the natural height (layout is synchronous) and skip
    // the animation entirely.
    const startHeight = titleBar.getBoundingClientRect().height;
    setNativeTabBarHidden(doc, false);
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
  syncMacOSTopSpacerSafely(doc, false);
  setNativeTabBarHidden(doc, false);
  const titleBar = getTitleBar(doc);
  if (!titleBar) return;
  cancelTitleBarAnimation(titleBar);
  clearTitleBarInlineStyles(titleBar);
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
 *
 * The observer is only connected while the home button EXISTS: the native
 * tab bar is a React component that re-renders on every tab switch, so a
 * permanently-connected subtree+attributes observer fires (and queries the
 * DOM) on each switch for nothing. Call syncNativeTabBarObserver after
 * showing/hiding the button to re-evaluate.
 */
export function initNativeTabBarObserver(doc: Document): void {
  destroyNativeTabBarObserver(doc);
  const tabBar = doc.getElementById(TAB_BAR_CONTAINER_ID) as HTMLElement | null;
  const win = doc.defaultView;
  if (!tabBar || !win) return;
  if (!hasLibraryHomeButton(doc)) return;
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

/** Connect/disconnect the observer to match the home button's existence. */
export function syncNativeTabBarObserver(doc: Document): void {
  const connected = !!(doc as any)[OBSERVER_KEY];
  if (hasLibraryHomeButton(doc)) {
    if (!connected) initNativeTabBarObserver(doc);
  } else if (connected) {
    destroyNativeTabBarObserver(doc);
  }
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
      // Connect the mirror observer (the button now exists).
      syncNativeTabBarObserver(winDoc);
    } else {
      hideLibraryHomeButton(winDoc, true);
      // The button animates away over 300ms and still exists during the
      // animation — disconnect explicitly instead of checking existence.
      destroyNativeTabBarObserver(winDoc);
    }
  }
}

/** Per-window teardown: observer off, tab bar restored, button removed. */
export function destroyNativeTabBarToggle(doc: Document): void {
  destroyNativeTabBarObserver(doc);
  destroyNativeTabBarVisibilityObserver(doc);
  restoreNativeTabBar(doc);
  destroyReaderSandboxObserver(doc);
  for (const readerDoc of readerUIDocuments) {
    const observer = (readerDoc as any)[READER_UI_OBSERVER_KEY] as
      | MutationObserver
      | undefined;
    observer?.disconnect();
    delete (readerDoc as any)[READER_UI_OBSERVER_KEY];
  }
  readerUIDocuments.clear();
  removeLibraryHomeButton(doc);
}
