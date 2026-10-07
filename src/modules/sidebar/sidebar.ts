import { config } from "../../../package.json";
import { getString } from "../../utils/locale";
import {
  injectStyles,
  removeStyles,
  SIDEBAR_ID,
  WRAPPER_ID,
  SPLITTER_ID,
} from "../render/styles";
import { applyTabHeightStyle } from "../render/tabHeight";
import { attachScrollbarAutoHide } from "../render/scrollbarAutoHide";
import { dispatchVtEvent } from "../core/events";
import { dispatchTimeTick } from "../track/itemTracker";
import { isDarkMode } from "../render/colorUtils";
import { pinFillIcon, pinIcon, svgElement } from "../ui/iconSvgs";

const PREF_NAMESPACE = config.prefsPrefix;
const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 160;
const MAX_WIDTH = 800;
const PINNED_REFRESH_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const DISPLAY_REFRESH_INTERVAL_MS = 60 * 1000; // 1 minute
const RESIZE_HANDLE_CLASS = "vertical-tabs-resize-handle";
const PIN_BTN_CLASS = "vertical-tabs-pin-btn";
const PIN_ICON_CLASS = "vertical-tabs-pin-icon";
const HOVER_STRIP_WIDTH = 35;
const MINIMAL_STRIP_WIDTH = 20;
const COLLAPSE_FADE_START_WIDTH = 40;

function getIconColor(doc: Document): string {
  return isDarkMode(doc) ? "#A2A2A2" : "#6C6C6C";
}

function pinIconSvg(filled: boolean, doc: Document): string {
  const color = getIconColor(doc);
  return filled ? pinFillIcon(color) : pinIcon(color);
}

type TimerHandle = ReturnType<typeof setTimeout>;

let _pinnedRefreshTimer: ReturnType<typeof setInterval> | null = null;
let _displayRefreshTimer: ReturnType<typeof setInterval> | null = null;

const HOVER_DELAY_MS = 300;
const LEAVE_DELAY_MS = 250;

function vtLog(msg: string): void {
  Zotero.logError(new Error("[BVT] " + msg));
}

function getSavedWidth(): number {
  const saved = Zotero.Prefs.get(`${PREF_NAMESPACE}.verticalTabs.width`) as
    | number
    | undefined;
  if (typeof saved === "number" && saved >= MIN_WIDTH && saved <= MAX_WIDTH) {
    return saved;
  }
  return DEFAULT_WIDTH;
}

function saveWidth(width: number): void {
  Zotero.Prefs.set(
    `${PREF_NAMESPACE}.verticalTabs.width`,
    Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, width)),
    false,
  );
}

function updateContentOpacity(sidebar: HTMLElement): void {
  const width = sidebar.clientWidth;
  const opacity = Math.max(
    0,
    Math.min(
      1,
      (width - HOVER_STRIP_WIDTH) /
        (COLLAPSE_FADE_START_WIDTH - HOVER_STRIP_WIDTH),
    ),
  );
  sidebar.style.setProperty("--vt-content-opacity", opacity.toFixed(3));
}

function attachWidthFadeTracker(sidebar: HTMLElement, doc: Document): void {
  const win = doc.defaultView;
  if (!win) return;

  let rafId: number | null = null;
  let safetyId: number | null = null;

  const cleanup = () => {
    if (rafId !== null) {
      win.cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (safetyId !== null) {
      win.clearTimeout(safetyId);
      safetyId = null;
    }
  };

  const onEnd = (e?: TransitionEvent) => {
    if (e && e.propertyName !== "width") return;
    cleanup();
    updateContentOpacity(sidebar);
  };

  const step = () => {
    updateContentOpacity(sidebar);
    rafId = win.requestAnimationFrame(step);
  };

  const onRun = (e: TransitionEvent) => {
    if (e.propertyName !== "width") return;
    cleanup();
    rafId = win.requestAnimationFrame(step);
    safetyId = win.setTimeout(cleanup, 500);
  };

  sidebar.addEventListener("transitionrun", onRun);
  sidebar.addEventListener("transitionend", onEnd);
  sidebar.addEventListener("transitioncancel", onEnd);
  (sidebar as any).__vtFadeCleanup = cleanup;
}

export function isPinned(): boolean {
  return (
    (Zotero.Prefs.get(`${PREF_NAMESPACE}.verticalTabs.pinned`, false) as
      | boolean
      | undefined) ?? false
  );
}

export function setPinned(pinned: boolean): void {
  Zotero.Prefs.set(`${PREF_NAMESPACE}.verticalTabs.pinned`, pinned, false);
}

/**
 * Whether hovering the collapsed floating strip auto-expands VT (pref
 * `verticalTabs.autoExpand`, default true). Read live on every hover so the
 * toggle takes effect without any re-render.
 */
export function isAutoExpandEnabled(): boolean {
  return (
    (Zotero.Prefs.get(`${PREF_NAMESPACE}.verticalTabs.autoExpand`, true) as
      | boolean
      | undefined) ?? true
  );
}

/**
 * Whether automatic hover expansion should reserve layout space for the
 * expanded sidebar instead of painting over the main content.
 *
 * This is intentionally separate from `autoExpand`: the latter controls the
 * hover behavior, while this preference only controls the expanded layout.
 */
export function isAutoExpandEmbeddedEnabled(): boolean {
  return (
    (Zotero.Prefs.get(
      `${PREF_NAMESPACE}.verticalTabs.autoExpandEmbedded`,
      true,
    ) as boolean | undefined) ?? false
  );
}

/** Whether sidebar expand/collapse transitions are enabled (default true). */
export function areExpandCollapseAnimationsEnabled(): boolean {
  return (
    (Zotero.Prefs.get(
      `${PREF_NAMESPACE}.verticalTabs.applyExpandCollapseAnimation`,
      true,
    ) as boolean | undefined) ?? true
  );
}

/** Whether the current automatic expansion uses the embedded layout. */
function isEmbeddedAutoExpansionEnabled(): boolean {
  return isAutoExpandEnabled() && isAutoExpandEmbeddedEnabled();
}

/** Pref `verticalTabs.compactStrip` (default false): 20px minimal bar.
 *  NOTE: Zotero.Prefs.get's 2nd arg is `global` (absolute pref path), NOT a
 *  default value — pass `true` so the absolute name (and the prefs.js
 *  default) is used. */
export function isCompactStripEnabled(): boolean {
  return (
    (Zotero.Prefs.get(`${PREF_NAMESPACE}.verticalTabs.compactStrip`, true) as
      | boolean
      | undefined) ?? false
  );
}

/**
 * The three expand modes exposed in the "more" menu, mapped onto the two
 * stored prefs (autoExpand + compactStrip):
 * - auto: hovering the collapsed strip expands VT (autoExpand on).
 * - manual: hover does not expand; only the pin button opens the panel.
 * - minimal: manual + the collapsed strip is a 20px bar (plugin icon only).
 */
export type ExpandMode = "auto" | "manual" | "minimal";

export function getExpandMode(): ExpandMode {
  if (isAutoExpandEnabled()) return "auto";
  return isCompactStripEnabled() ? "minimal" : "manual";
}

/**
 * Switch the expand mode. Zotero.Prefs.set's 3rd arg is `global` — `true`
 * writes the ABSOLUTE pref name (matching the readers above and the prefs.js
 * defaults); `false` would silently write to a double-prefixed ghost pref
 * (the historical reason the menu items appeared to do nothing).
 *
 * The switch always lands UNPINNED in the new mode's collapsed strip:
 * - pinned (incl. manual/minimal, where the more-menu requires pin): unpin
 *   and collapse to the new mode's strip — a visible change.
 * - floating hover-expanded (auto): collapse to the new mode's strip.
 * animatePinToggle(false) covers both start states, incl. the minimal-mode
 * cross-fade when the target strip is the 20px bar. Other windows sync via
 * the pref observers (which skip this doc).
 */
export function setExpandMode(doc: Document, mode: ExpandMode): void {
  if (getExpandMode() === mode) return;
  _modeSwitchHandledDocs.add(doc);
  Zotero.Prefs.set(
    `${PREF_NAMESPACE}.verticalTabs.autoExpand`,
    mode === "auto",
    true,
  );
  Zotero.Prefs.set(
    `${PREF_NAMESPACE}.verticalTabs.compactStrip`,
    mode === "minimal",
    true,
  );
  if (isPinned()) {
    // Skip this window in the pinned-pref observer — it is animated below.
    _pinToggleHandledDocs.add(doc);
    setPinned(false);
  }
  animatePinToggle(doc, false);
}

/** Docs currently handled (animated) by their own setExpandMode call. */
const _modeSwitchHandledDocs = new WeakSet<Document>();

/** The lazyInit pref observers skip these docs (they animate themselves). */
export function isModeSwitchHandled(doc: Document): boolean {
  return _modeSwitchHandledDocs.has(doc);
}

/**
 * Pure: collapsed floating strip width in px. The minimal 20px bar (plugin
 * icon only) applies only when not pinned, auto-expand off, and the
 * compact-strip pref on; otherwise the regular 35px icon strip.
 */
export function resolveCollapsedStripWidth(
  pinned: boolean,
  autoExpand: boolean,
  compactStrip: boolean,
): number {
  return !pinned && !autoExpand && compactStrip
    ? MINIMAL_STRIP_WIDTH
    : HOVER_STRIP_WIDTH;
}

/**
 * Pure layout helper for the floating wrapper. Automatic embedded expansion
 * is active only while the sidebar is actually hover-expanded, and only when
 * automatic expansion is enabled. Manual/pinned mode keeps its own layout.
 */
export function resolveFloatingWrapperWidth(
  pinned: boolean,
  expanded: boolean,
  autoExpand: boolean,
  embedded: boolean,
  savedWidth: number,
  collapsedWidth: number,
): number {
  return !pinned && expanded && autoExpand && embedded
    ? savedWidth
    : collapsedWidth;
}

function getCollapsedStripWidth(): number {
  return resolveCollapsedStripWidth(
    isPinned(),
    isAutoExpandEnabled(),
    isCompactStripEnabled(),
  );
}

/**
 * Create or retrieve the wrapper <vbox> and <splitter> inside
 * <hbox id="browser">, placed before <deck id="tabs-deck">.
 * This makes the VT appear above both the main page and the reader page.
 */
function findOrCreateWrapper(
  doc: Document,
): { wrapper: HTMLElement; splitter: HTMLElement } | null {
  let wrapper = doc.getElementById(WRAPPER_ID) as HTMLElement | null;
  let splitter = doc.getElementById(SPLITTER_ID) as HTMLElement | null;
  if (wrapper && splitter) {
    return { wrapper, splitter };
  }

  const browser = doc.getElementById("browser");
  const tabsDeck = doc.getElementById("tabs-deck");

  vtLog(
    "findOrCreateWrapper: browser=" +
      (browser ? browser.tagName : "null") +
      " tabsDeck=" +
      (tabsDeck ? tabsDeck.tagName : "null") +
      " tabsDeckParent=" +
      (tabsDeck?.parentNode
        ? (tabsDeck.parentNode as Element).tagName || "#document"
        : "null"),
  );

  if (!browser || !tabsDeck) {
    return null;
  }

  const xulNS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
  const createXul = (tag: string): HTMLElement => {
    const create = (doc as any).createXULElement as
      | ((tag: string) => HTMLElement)
      | undefined;
    if (create) {
      return create.call(doc, tag);
    }
    return doc.createElementNS(xulNS, tag) as HTMLElement;
  };

  function safeInsert(node: Node, before: Node | null): void {
    if (before && before.parentNode) {
      before.parentNode.insertBefore(node, before);
    } else if (browser) {
      browser.appendChild(node);
    }
  }

  if (!wrapper) {
    wrapper = createXul("vbox");
    wrapper.id = WRAPPER_ID;
    wrapper.setAttribute("flex", "0");
    wrapper.style.position = "relative";
    wrapper.style.overflow = "visible";
    wrapper.style.flexShrink = "0";
    safeInsert(wrapper, tabsDeck);
  }

  if (!splitter) {
    splitter = createXul("splitter");
    splitter.id = SPLITTER_ID;
    splitter.setAttribute("collapse", "none");
    splitter.style.flexShrink = "0";
    safeInsert(splitter, tabsDeck);
  }

  return { wrapper, splitter };
}

function getWrapper(doc: Document): HTMLElement | null {
  return doc.getElementById(WRAPPER_ID) as HTMLElement | null;
}

function getSplitter(doc: Document): HTMLElement | null {
  return doc.getElementById(SPLITTER_ID) as HTMLElement | null;
}

function removeWrapper(doc: Document): void {
  getWrapper(doc)?.remove();
  getSplitter(doc)?.remove();
  clearWidthObserver(doc);
}

// ── Per-document timers ──

interface DocState {
  hoverTimer: TimerHandle | null;
  leaveTimer: TimerHandle | null;
  expanded: boolean;
  contextMenuOpen: boolean;
  searchFocused: boolean;
  waitMouseMoveAfterInput: boolean;
  dialogOpen: boolean;
  inputPositionCleanup: (() => void) | null;
  widthObserverCleanup: (() => void) | null;
  searchDebounceTimer: TimerHandle | null;
  menuToken: object | null;
  pinAnimRaf: number | null;
  wrapperAnimRaf: number | null;
  expandAnimationToken: object | null;
}

function getDocState(doc: Document): DocState {
  const key = `${config.addonRef}-hover-state`;
  let state = (doc as any)[key] as DocState | undefined;
  if (!state) {
    state = {
      hoverTimer: null,
      leaveTimer: null,
      expanded: false,
      contextMenuOpen: false,
      searchFocused: false,
      waitMouseMoveAfterInput: false,
      dialogOpen: false,
      inputPositionCleanup: null,
      widthObserverCleanup: null,
      searchDebounceTimer: null,
      menuToken: null,
      pinAnimRaf: null,
      wrapperAnimRaf: null,
      expandAnimationToken: null,
    };
    (doc as any)[key] = state;
  }
  return state;
}

export function setContextMenuOpen(doc: Document, open: boolean): void {
  const state = getDocState(doc);
  state.contextMenuOpen = open;
  if (!open) state.menuToken = null;
}

/**
 * Claim the menu-open collapse suppression with a fresh token; only a
 * release with the SAME token clears it. Without this, right-clicking a
 * second row while a menu is open let the FIRST menu's delayed close
 * callback clear the suppression the second menu had just armed — VT then
 * collapsed with a menu still open.
 */
export function claimContextMenuOpen(doc: Document): object {
  const state = getDocState(doc);
  const token = {};
  state.contextMenuOpen = true;
  state.menuToken = token;
  return token;
}

export function releaseContextMenuOpen(doc: Document, token: object): void {
  const state = getDocState(doc);
  if (state.menuToken === token) {
    state.contextMenuOpen = false;
    state.menuToken = null;
  }
}

function isContextMenuOpen(doc: Document): boolean {
  return getDocState(doc).contextMenuOpen;
}

export function setDialogOpen(doc: Document, open: boolean): void {
  getDocState(doc).dialogOpen = open;
}

function isDialogOpen(doc: Document): boolean {
  return getDocState(doc).dialogOpen;
}

export function setSearchFocused(doc: Document, focused: boolean): void {
  getDocState(doc).searchFocused = focused;
}

function isSearchFocused(doc: Document): boolean {
  return getDocState(doc).searchFocused;
}

export function setWaitMouseMoveAfterInput(
  doc: Document,
  value: boolean,
): void {
  getDocState(doc).waitMouseMoveAfterInput = value;
}

function isWaitingMouseMoveAfterInput(doc: Document): boolean {
  return getDocState(doc).waitMouseMoveAfterInput;
}

function clearInputPositionListener(doc: Document): void {
  const state = getDocState(doc);
  if (state.inputPositionCleanup) {
    state.inputPositionCleanup();
    state.inputPositionCleanup = null;
  }
}

function clearWidthObserver(doc: Document): void {
  const state = getDocState(doc);
  if (state.widthObserverCleanup) {
    state.widthObserverCleanup();
    state.widthObserverCleanup = null;
  }
}

function setupWidthObserver(doc: Document, wrapper: HTMLElement): void {
  clearWidthObserver(doc);
  const win = doc.defaultView;
  if (!win) return;

  let lastWidth = wrapper.clientWidth;
  let saveTimer: number | null = null;
  const flushSave = () => {
    if (saveTimer !== null) {
      win.clearTimeout(saveTimer);
      saveTimer = null;
    }
    saveWidth(lastWidth);
  };
  const save = () => {
    const w = wrapper.clientWidth;
    if (w > 0 && w !== lastWidth) {
      lastWidth = w;
      // Debounce the pref write: during a window/splitter drag the observer
      // fires continuously, and Zotero.Prefs.set is not free.
      if (saveTimer !== null) win.clearTimeout(saveTimer);
      saveTimer = win.setTimeout(flushSave, 300);
    }
  };
  const cancelPendingSave = () => {
    if (saveTimer !== null) {
      win.clearTimeout(saveTimer);
      saveTimer = null;
    }
  };

  const RO = (win as any).ResizeObserver as
    | (new (cb: () => void) => {
        disconnect: () => void;
        observe: (el: Element) => void;
      })
    | undefined;
  if (RO) {
    const ro = new RO(save);
    ro.observe(wrapper);
    getDocState(doc).widthObserverCleanup = () => {
      cancelPendingSave();
      ro.disconnect();
    };
    return;
  }

  // Fallback: poll width every 500ms when wrapper is connected
  const timer = setInterval(() => {
    if (!wrapper.isConnected) {
      clearWidthObserver(doc);
      return;
    }
    save();
  }, 500);
  getDocState(doc).widthObserverCleanup = () => {
    cancelPendingSave();
    clearInterval(timer);
  };
}

function isMouseOverVt(
  doc: Document,
  clientX: number,
  clientY: number,
): boolean {
  const sidebar = getSidebar(doc);
  if (!sidebar) return false;
  const rect = sidebar.getBoundingClientRect();
  return (
    clientX >= rect.left &&
    clientX <= rect.right &&
    clientY >= rect.top &&
    clientY <= rect.bottom
  );
}

const HOME_BLOCK_CLASS = "vertical-tabs-home-block";

/**
 * Strip zones that must NOT trigger auto-expand on hover: the "home"
 * (library) button block and the header (pin button area). Once VT is
 * expanded they still count as VT area (both live inside the sidebar).
 */
const NO_EXPAND_ZONE_SELECTOR = `.${HOME_BLOCK_CLASS}, .vertical-tabs-header`;

function isPointOverNoExpandZone(
  doc: Document,
  clientX: number,
  clientY: number,
): boolean {
  const el = doc.elementFromPoint(clientX, clientY);
  return !!el && !!(el as Element).closest?.(NO_EXPAND_ZONE_SELECTOR);
}

function startHoverExpandTimer(doc: Document): void {
  // A pin/strip width animation is driving the widths — don't interfere.
  if (getDocState(doc).pinAnimRaf !== null) return;
  if (getHoverTimer(doc)) return;
  const timer = setTimeout(() => {
    setHoverTimer(doc, null);
    expandFloatingSidebar(doc);
  }, HOVER_DELAY_MS);
  setHoverTimer(doc, timer);
}

function setupInputPositionListener(doc: Document): void {
  clearInputPositionListener(doc);
  const state = getDocState(doc);
  state.waitMouseMoveAfterInput = true;

  const handler = (e: MouseEvent) => {
    if (!state.waitMouseMoveAfterInput) return;
    if (isPinned()) return;
    if (!isFloatingExpanded(doc)) return;

    if (isMouseOverVt(doc, e.clientX, e.clientY)) {
      // Mouse is still inside VT; keep waiting for a decisive move/outside click.
      return;
    }

    // Mouse moved outside VT — schedule delayed collapse and stop waiting.
    clearInputPositionListener(doc);
    state.waitMouseMoveAfterInput = false;
    const searchInput = getSidebar(doc)?.querySelector(
      ".vertical-tabs-search",
    ) as HTMLInputElement | null;
    searchInput?.blur();
    scheduleCollapse(doc);
  };

  doc.addEventListener("mousemove", handler);
  doc.addEventListener("mousedown", handler);
  state.inputPositionCleanup = () => {
    doc.removeEventListener("mousemove", handler);
    doc.removeEventListener("mousedown", handler);
  };
}

function getHoverTimer(doc: Document): TimerHandle | null {
  return getDocState(doc).hoverTimer;
}

function setHoverTimer(doc: Document, timer: TimerHandle | null): void {
  getDocState(doc).hoverTimer = timer;
}

function clearHoverTimer(doc: Document): void {
  const state = getDocState(doc);
  if (state.hoverTimer) {
    clearTimeout(state.hoverTimer);
    state.hoverTimer = null;
  }
}

function getLeaveTimer(doc: Document): TimerHandle | null {
  return getDocState(doc).leaveTimer;
}

function setLeaveTimer(doc: Document, timer: TimerHandle | null): void {
  getDocState(doc).leaveTimer = timer;
}

function clearLeaveTimer(doc: Document): void {
  const state = getDocState(doc);
  if (state.leaveTimer) {
    clearTimeout(state.leaveTimer);
    state.leaveTimer = null;
  }
}

export function cancelPendingCollapse(doc: Document): void {
  clearLeaveTimer(doc);
}

function isFloatingExpanded(doc: Document): boolean {
  return getDocState(doc).expanded;
}

export function getFloatingExpanded(doc: Document): boolean {
  return isFloatingExpanded(doc);
}

function setFloatingExpanded(doc: Document, expanded: boolean): void {
  getDocState(doc).expanded = expanded;
}

export function scheduleCollapse(doc: Document): void {
  if (
    isContextMenuOpen(doc) ||
    isSearchFocused(doc) ||
    isWaitingMouseMoveAfterInput(doc) ||
    isDialogOpen(doc)
  )
    return;
  clearLeaveTimer(doc);
  const timer = setTimeout(() => {
    setLeaveTimer(doc, null);
    collapseFloatingSidebar(doc);
  }, LEAVE_DELAY_MS);
  setLeaveTimer(doc, timer);
}

export function createSidebar(doc: Document): HTMLElement {
  injectStyles(doc);

  const existing = doc.getElementById(SIDEBAR_ID);
  if (existing) return existing as HTMLElement;

  const sidebar = ztoolkit.UI.createElement(doc, "div", {
    id: SIDEBAR_ID,
    namespace: "html",
    classList: ["vertical-tabs-sidebar"],
    children: [
      {
        tag: "div",
        classList: ["vertical-tabs-header"],
        children: [
          {
            tag: "button",
            classList: [PIN_BTN_CLASS],
            attributes: {
              title: getString(
                isPinned() ? "vertical-tabs-unpin" : "vertical-tabs-pin",
              ),
            },
            children: [
              {
                tag: "span",
                classList: [PIN_ICON_CLASS],
                styles: {
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "16px",
                  height: "16px",
                },
              },
            ],
            listeners: [
              {
                type: "click",
                listener: (e: Event) => {
                  e.stopPropagation();
                  togglePinned(doc);
                },
              },
            ],
          },
          {
            tag: "input",
            classList: ["vertical-tabs-search"],
            attributes: {
              type: "text",
              placeholder: getString("vertical-tabs-search-placeholder"),
            },
            properties: {
              value: "",
            },
          },
          {
            tag: "button",
            classList: ["vertical-tabs-more-btn"],
            attributes: {
              title: getString("vertical-tabs-more-menu"),
            },
            properties: {
              textContent: "⋯",
            },
          },
        ],
      },
      {
        tag: "div",
        classList: ["vertical-tabs-categories"],
      },
      {
        // Plugin icon shown only in the minimal 16px strip (CSS-hidden
        // otherwise), vertically centered in the bar.
        tag: "img",
        classList: ["vertical-tabs-minimal-icon"],
        attributes: {
          src: `chrome://${config.addonRef}/content/icons/favicon.png`,
          alt: "",
        },
      },
    ],
  }) as HTMLElement;

  // Width is set by renderSidebarMode depending on pinned/floating mode.
  // Pinned: fills wrapper (100%). Floating: collapsed 35px or expanded savedWidth.

  // Search input: dispatch filter event on input (debounced — one render per
  // typing pause instead of one per keystroke)
  const searchInput = sidebar.querySelector(
    ".vertical-tabs-search",
  ) as HTMLInputElement | null;
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      const state = getDocState(doc);
      if (state.searchDebounceTimer) {
        clearTimeout(state.searchDebounceTimer);
      }
      state.searchDebounceTimer = setTimeout(() => {
        state.searchDebounceTimer = null;
        dispatchVtEvent(doc, "vertical-tabs:search", {
          query: searchInput.value.trim().toLowerCase(),
        });
      }, 120);

      // After typing, wait for the next mouse position before deciding collapse.
      // (This part must stay immediate — it is what keeps VT open while typing.)
      if (isPinned()) return;
      setWaitMouseMoveAfterInput(doc, true);
      clearLeaveTimer(doc);
      setupInputPositionListener(doc);
    });

    // Blur search when clicking outside the sidebar
    doc.addEventListener("mousedown", (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(`#${SIDEBAR_ID}`)) {
        searchInput.blur();
      }
    });

    // Suppress auto-collapse while search is focused
    searchInput.addEventListener("focus", () => {
      setSearchFocused(doc, true);
      clearLeaveTimer(doc);
    });
    searchInput.addEventListener("blur", () => {
      setSearchFocused(doc, false);
      // Keep waitMouseMoveAfterInput active: the next mouse move/down will decide.
    });
  }

  // Pin button hover title update helper
  const updatePinBtn = () => {
    const pinBtn = sidebar.querySelector(
      `.${PIN_BTN_CLASS}`,
    ) as HTMLElement | null;
    if (pinBtn) {
      pinBtn.title = getString(
        isPinned() ? "vertical-tabs-unpin" : "vertical-tabs-pin",
      );
      const icon = pinBtn.querySelector(
        `.${PIN_ICON_CLASS}`,
      ) as HTMLElement | null;
      if (icon) {
        // DOMParser insertion (not innerHTML) — Zotero's sanitizer strips
        // the svg xmlns with a console warning / flattens it without.
        icon.textContent = "";
        const svgEl = svgElement(doc, pinIconSvg(isPinned(), doc));
        if (svgEl) icon.appendChild(svgEl);
      }
    }
  };
  (sidebar as any).__updatePinBtn = updatePinBtn;
  // Initial fill of the pin icon span (the createElement spec leaves it empty).
  updatePinBtn();

  // Mouse enter to expand, mouse leave to collapse (only when floating / unpinned)
  sidebar.addEventListener("mouseenter", (e: MouseEvent) => {
    clearLeaveTimer(doc);
    // The mouse returned to VT after a context menu opened: the menu-open
    // collapse suppression ends here. From now on the normal leave-collapse
    // rule applies (the menu itself still closes on click as usual).
    if (isContextMenuOpen(doc)) setContextMenuOpen(doc, false);
    if (isPinned() || isFloatingExpanded(doc)) return;
    // Auto-expand disabled: hovering the strip never expands VT — only the
    // pin button does (pinned panel).
    if (!isAutoExpandEnabled()) return;
    // Hovering the "home" (library) button or the header (pin button area)
    // must not auto-expand VT.
    if (isPointOverNoExpandZone(doc, e.clientX, e.clientY)) return;
    startHoverExpandTimer(doc);
  });

  // Track movement within the collapsed strip so the expand timer only runs
  // while the pointer is OFF the no-expand zones (home button / header):
  // entering the strip on one of them then sliding onto the tab icons starts
  // the countdown, and sliding back cancels it.
  sidebar.addEventListener("mousemove", (e: MouseEvent) => {
    if (isPinned() || isFloatingExpanded(doc)) return;
    if (!isAutoExpandEnabled()) return;
    if (isPointOverNoExpandZone(doc, e.clientX, e.clientY)) {
      clearHoverTimer(doc);
      return;
    }
    startHoverExpandTimer(doc);
  });

  // Minimal 16px strip: nothing else is visible, so the whole bar acts as
  // one big pin button — clicking it opens the pinned panel (and unpinning
  // returns to the minimal strip).
  sidebar.addEventListener("click", () => {
    if (!sidebar.classList.contains("vertical-tabs-sidebar-minimal")) return;
    togglePinned(doc);
  });

  sidebar.addEventListener("mouseleave", (e: MouseEvent) => {
    // Always clear pending expand timer so a quick mouse pass doesn't expand VT
    clearHoverTimer(doc);
    if (isPinned() || !isFloatingExpanded(doc)) return;
    if (isWaitingMouseMoveAfterInput(doc)) {
      setWaitMouseMoveAfterInput(doc, false);
      clearInputPositionListener(doc);
      // New mouse position is outside VT → schedule delayed collapse.
      if (!isMouseOverVt(doc, e.clientX, e.clientY)) {
        scheduleCollapse(doc);
      }
      return;
    }
    scheduleCollapse(doc);
  });

  // Create resize handle
  const resizeHandle = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as HTMLElement;
  resizeHandle.className = RESIZE_HANDLE_CLASS;
  sidebar.appendChild(resizeHandle);

  // Drag-to-resize logic
  let startX = 0;
  let startWidth = 0;

  function onMouseMove(e: MouseEvent): void {
    const delta = e.clientX - startX;
    const newWidth = startWidth + delta;
    const clamped = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth));
    sidebar.style.setProperty("--vt-expanded-width", `${clamped}px`);
    if (
      !isPinned() &&
      isFloatingExpanded(doc) &&
      isAutoExpandEnabled() &&
      isAutoExpandEmbeddedEnabled()
    ) {
      const target = findOrCreateWrapper(doc);
      if (target) {
        target.wrapper.style.width = `${clamped}px`;
        target.wrapper.style.minWidth = `${clamped}px`;
        target.wrapper.style.maxWidth = `${clamped}px`;
      }
    }
  }

  function onMouseUp(e: MouseEvent): void {
    resizeHandle.classList.remove("active");
    sidebar.classList.remove("vertical-tabs-sidebar-resizing");
    doc.removeEventListener("mousemove", onMouseMove);
    doc.removeEventListener("mouseup", onMouseUp);
    const finalWidth = sidebar.offsetWidth;
    saveWidth(finalWidth);
    sidebar.style.setProperty("--vt-content-opacity", "1");
  }

  resizeHandle.addEventListener("mousedown", (e: MouseEvent) => {
    e.preventDefault();
    startX = e.clientX;
    startWidth = sidebar.offsetWidth;
    resizeHandle.classList.add("active");
    sidebar.classList.add("vertical-tabs-sidebar-resizing");
    doc.addEventListener("mousemove", onMouseMove);
    doc.addEventListener("mouseup", onMouseUp);
  });

  // Insert into the wrapper vbox inside #browser (before #tabs-deck)
  const target = findOrCreateWrapper(doc);
  if (target) {
    target.wrapper.appendChild(sidebar);
  } else {
    const pane = doc.getElementById("zotero-pane") || doc.body;
    if (pane) {
      pane.insertBefore(sidebar, pane.firstChild);
    }
  }

  attachWidthFadeTracker(sidebar, doc);

  const moreBtn = sidebar.querySelector(
    ".vertical-tabs-more-btn",
  ) as HTMLElement | null;
  if (moreBtn) {
    let hoverTimer: ReturnType<typeof setTimeout> | null = null;
    const trigger = () => {
      if (doc.getElementById("vertical-tabs-more-menu")) return;
      dispatchVtEvent(doc, "vertical-tabs:show-more-menu");
    };
    moreBtn.addEventListener("mouseenter", () => {
      if (hoverTimer) return;
      hoverTimer = setTimeout(() => {
        hoverTimer = null;
        trigger();
      }, 150);
    });
    moreBtn.addEventListener("mouseleave", () => {
      if (hoverTimer) {
        clearTimeout(hoverTimer);
        hoverTimer = null;
      }
    });
  }

  // Apply the current tab height preference to the sidebar.
  applyTabHeightStyle(doc);

  // Hide the categories scrollbar until the user actually scrolls.
  attachScrollbarAutoHide(doc);

  return sidebar;
}

export function getSidebar(doc: Document): HTMLElement | null {
  return doc.getElementById(SIDEBAR_ID) as HTMLElement | null;
}

function applySidebarClasses(
  sidebar: HTMLElement,
  mode: "pinned" | "floating",
): void {
  sidebar.classList.remove("vertical-tabs-sidebar-pinned");
  sidebar.classList.remove("vertical-tabs-sidebar-floating");
  sidebar.classList.add(
    mode === "pinned"
      ? "vertical-tabs-sidebar-pinned"
      : "vertical-tabs-sidebar-floating",
  );
}

function updatePinButtonVisual(doc: Document): void {
  const sidebar = getSidebar(doc);
  if (sidebar && (sidebar as any).__updatePinBtn) {
    (sidebar as any).__updatePinBtn();
  }
}

function startPinnedRefreshTimer(): void {
  if (_pinnedRefreshTimer) return;
  _pinnedRefreshTimer = setInterval(() => {
    // In-place time-label refresh so pinned VT's relative "last read" labels
    // stay current — a full re-render is no longer needed for this.
    dispatchTimeTick();
  }, PINNED_REFRESH_INTERVAL_MS);
}

function stopPinnedRefreshTimer(): void {
  if (!_pinnedRefreshTimer) return;
  clearInterval(_pinnedRefreshTimer);
  _pinnedRefreshTimer = null;
}

function startDisplayRefreshTimer(): void {
  if (_displayRefreshTimer) return;
  _displayRefreshTimer = setInterval(() => {
    // In-place time-label refresh so relative "last read" labels age
    // (1 min → 2 min, etc.) without a full re-render — which also means a
    // drag session or hover card can no longer be destroyed by the timer.
    dispatchTimeTick();
  }, DISPLAY_REFRESH_INTERVAL_MS);
}

function stopDisplayRefreshTimer(): void {
  if (!_displayRefreshTimer) return;
  clearInterval(_displayRefreshTimer);
  _displayRefreshTimer = null;
}

function togglePinned(doc: Document): void {
  const newPinned = !isPinned();
  // Mark BEFORE writing the pref: the pinned-pref observer syncs the change
  // to every window — the window where the user clicked is handled right
  // here (animated), so the observer must skip it (other windows snap,
  // unseen by the user).
  _pinToggleHandledDocs.add(doc);
  setPinned(newPinned);
  updatePinButtonVisual(doc);
  animatePinToggle(doc, newPinned);
}

/** Docs currently handled (animated) by their own togglePinned call. */
const _pinToggleHandledDocs = new WeakSet<Document>();

/**
 * Whether this doc's pinned-pref change is already being handled by its own
 * togglePinned (animated). The lazyInit pinned-pref observer skips these so
 * it does not snap the final state mid-animation.
 */
export function isPinToggleHandled(doc: Document): boolean {
  return _pinToggleHandledDocs.has(doc);
}

function cancelPinAnimation(doc: Document): void {
  const state = getDocState(doc);
  if (state.pinAnimRaf !== null) {
    doc.defaultView?.cancelAnimationFrame(state.pinAnimRaf);
    state.pinAnimRaf = null;
  }
}

function cancelFloatingWrapperAnimation(doc: Document): void {
  const state = getDocState(doc);
  if (state.wrapperAnimRaf !== null) {
    doc.defaultView?.cancelAnimationFrame(state.wrapperAnimRaf);
    state.wrapperAnimRaf = null;
  }
}

const PIN_ANIMATION_MS = 220;
/** Expand: right-side content (names, counts, search) fades in over the LAST
 * 100ms so the panel grows first and the text appears as it settles. */
const PIN_EXPAND_CONTENT_FADE_MS = 100;
/** Collapse: content starts fading out immediately, done in 150ms. */
const PIN_COLLAPSE_CONTENT_FADE_MS = 150;

/**
 * Animate the wrapper (vbox) and sidebar width between the collapsed strip
 * width and the saved pinned width, so pin/unpin glides instead of snapping
 * and the content to the right resizes smoothly with it. XUL vbox does not
 * run CSS width transitions, so the width is driven per frame via rAF
 * (same pattern as the native tab bar height animation).
 *
 * During the animation the sidebar stays in floating + expanded classes:
 * full row layout with inline width (the pinned class has
 * `width: 100% !important`, which would override the per-frame width).
 * The canonical mode state is applied by renderSidebarMode at the end.
 *
 * The `vertical-tabs-sidebar-resizing` class kills the sidebar's own CSS
 * width transition for the duration — otherwise every per-frame inline
 * width is itself re-transitioned over 0.2s, the sidebar lags behind the
 * wrapper and then catches up in a rush at the end (the "too fast at the
 * end" artifact).
 */
function animatePinToggle(doc: Document, toPinned: boolean): void {
  const finish = () => {
    const sb = getSidebar(doc);
    if (sb) {
      sb.classList.remove("vertical-tabs-sidebar-resizing");
      sb.style.boxShadow = "";
      sb.style.borderRightColor = "";
      clearMinimalFadeStyles(sb);
    }
    _pinToggleHandledDocs.delete(doc);
    // Also cleared here: setExpandMode routes through this same animation.
    _modeSwitchHandledDocs.delete(doc);
    renderSidebarMode(doc);
    updatePinButtonVisual(doc);
  };
  const sidebar = getSidebar(doc);
  const target = findOrCreateWrapper(doc);
  const win = doc.defaultView;
  if (!sidebar || !target || !win) {
    finish();
    return;
  }
  const { wrapper } = target;

  cancelPinAnimation(doc);
  cancelFloatingWrapperAnimation(doc);
  if (
    isEmbeddedAutoExpansionEnabled() &&
    !areExpandCollapseAnimationsEnabled()
  ) {
    finish();
    return;
  }

  // Already floating-expanded (hover-expanded VT being pinned): the sidebar
  // is visually at the saved width while the wrapper is still at strip
  // width. The sidebar starts from its CURRENT visual width (usually equal
  // to the target — no motion, no re-fade), but the WRAPPER must still
  // glide from strip width to the saved width: it is the wrapper that
  // pushes the rest of Zotero's layout, and snapping it makes every other
  // element jump.
  const wasExpanded = sidebar.classList.contains(
    "vertical-tabs-sidebar-expanded",
  );
  const endWidth = toPinned ? getSavedWidth() : getCollapsedStripWidth();
  const wrapperFrom =
    wrapper.clientWidth ||
    (toPinned ? getCollapsedStripWidth() : getSavedWidth());
  const sidebarFrom = wasExpanded
    ? sidebar.offsetWidth || wrapperFrom
    : wrapperFrom;
  if (wrapperFrom === endWidth && sidebarFrom === endWidth) {
    finish();
    return;
  }

  // Minimal mode (20px strip ↔ panel): the whole content group and the
  // plugin icon cross-fade instead of the text-only --vt-content-opacity
  // fade — pin fades the icon out while the content fades in with the
  // expansion; unpin fades everything out during the collapse and the icon
  // back in at the end.
  const minimalMode = !isAutoExpandEnabled() && isCompactStripEnabled();
  const contentEls = minimalMode
    ? (Array.from(
        sidebar.querySelectorAll<HTMLElement>(
          ":scope > .vertical-tabs-header, :scope > .vertical-tabs-home-block, :scope > .vertical-tabs-categories",
        ),
      ) as HTMLElement[])
    : [];
  const minimalIconEl = minimalMode
    ? (sidebar.querySelector(
        ":scope > .vertical-tabs-minimal-icon",
      ) as HTMLElement | null)
    : null;

  applySidebarClasses(sidebar, "floating");
  sidebar.classList.remove("vertical-tabs-sidebar-minimal");
  sidebar.classList.add("vertical-tabs-sidebar-expanded");
  sidebar.classList.add("vertical-tabs-sidebar-resizing");
  sidebar.style.width = `${sidebarFrom}px`;
  // Keep the right divider CONSTANT through the animation: the expanded
  // class sets border-right-color transparent, so without this the divider
  // would be invisible mid-animation and pop in at the end.
  sidebar.style.borderRightColor = isDarkMode(doc) ? "#555" : "#DBDBDB";
  setFloatingExpanded(doc, true);
  setResizeHandleVisible(doc, false);
  wrapper.style.minWidth = "0px";
  wrapper.style.maxWidth = "none";
  wrapper.style.width = `${wrapperFrom}px`;
  wrapper.removeAttribute("hidden");

  if (minimalMode) {
    // A collapse-time icon fade-in may still be pending: cancel it before
    // driving the icon per frame — its leftover inline `transition` would
    // re-transition every frame write and lag the animation.
    cancelMinimalIconFadeIn(sidebar);
    // The minimal class is gone for the animation, so the icon's CSS hides
    // it — show it inline and drive its fade per frame.
    if (minimalIconEl) {
      minimalIconEl.style.display = "block";
      minimalIconEl.style.opacity = toPinned ? "1" : "0";
    }
    const startOpacity = toPinned ? "0" : "1";
    for (const el of contentEls) el.style.opacity = startOpacity;
  }

  // The expanded class carries `box-shadow: 2px 0 8px rgba(0,0,0,0.15)`,
  // which the resizing class would otherwise hold at full strength for the
  // whole animation. Drive its alpha on the same time axis: OUT over the
  // first 150ms while collapsing (no shadow trailing the shrinking panel),
  // IN across the expansion (instead of popping on at the start).
  const shadowFrom = toPinned ? (wasExpanded ? 0.15 : 0) : 0.15;
  const shadowTo = toPinned ? 0.15 : 0;
  const shadowFadeMs = toPinned
    ? PIN_ANIMATION_MS
    : PIN_COLLAPSE_CONTENT_FADE_MS;

  const startTime = Date.now();
  // Expand: linear (ease-out made the late phase feel rushed once combined
  // with the content fade-in). Collapse: ease-out cubic (felt good already).
  const ease = toPinned
    ? (t: number) => t
    : (t: number) => 1 - Math.pow(1 - t, 3);

  const step = () => {
    const elapsed = Date.now() - startTime;
    const t = Math.min(1, elapsed / PIN_ANIMATION_MS);
    const eased = ease(t);
    wrapper.style.width = `${Math.round(wrapperFrom + (endWidth - wrapperFrom) * eased)}px`;
    sidebar.style.width = `${Math.round(sidebarFrom + (endWidth - sidebarFrom) * eased)}px`;
    const shadowT = Math.min(1, elapsed / shadowFadeMs);
    const shadowAlpha = shadowFrom + (shadowTo - shadowFrom) * shadowT;
    sidebar.style.boxShadow = `2px 0 8px rgba(0, 0, 0, ${shadowAlpha.toFixed(3)})`;
    if (minimalMode) {
      sidebar.style.setProperty("--vt-content-opacity", "1");
      let contentOpacity: number;
      let iconOpacity: number;
      if (toPinned) {
        // Content fades in across the whole expansion; the icon clears
        // early (first 150ms).
        contentOpacity = t;
        iconOpacity = Math.max(0, 1 - elapsed / PIN_COLLAPSE_CONTENT_FADE_MS);
      } else {
        // Everything fades out together in the first 150ms; the icon fades
        // back in over the last 100ms as the strip reaches minimal width.
        contentOpacity = Math.max(
          0,
          1 - elapsed / PIN_COLLAPSE_CONTENT_FADE_MS,
        );
        iconOpacity = Math.min(
          1,
          Math.max(
            0,
            (elapsed - (PIN_ANIMATION_MS - PIN_EXPAND_CONTENT_FADE_MS)) /
              PIN_EXPAND_CONTENT_FADE_MS,
          ),
        );
      }
      for (const el of contentEls) {
        el.style.opacity = contentOpacity.toFixed(3);
      }
      if (minimalIconEl) {
        minimalIconEl.style.opacity = iconOpacity.toFixed(3);
      }
    } else {
      // Time-based content fade (not width-based): pinning from the collapsed
      // strip holds the text hidden until the final 100ms; pinning an
      // already-expanded VT keeps it fully visible (only the width glides);
      // unpinning fades the text out over the first 150ms.
      let opacity: number;
      if (toPinned && wasExpanded) {
        opacity = 1;
      } else if (toPinned) {
        const fadeStart = PIN_ANIMATION_MS - PIN_EXPAND_CONTENT_FADE_MS;
        opacity =
          elapsed <= fadeStart
            ? 0
            : Math.min(1, (elapsed - fadeStart) / PIN_EXPAND_CONTENT_FADE_MS);
      } else {
        opacity = Math.max(0, 1 - elapsed / PIN_COLLAPSE_CONTENT_FADE_MS);
      }
      sidebar.style.setProperty("--vt-content-opacity", opacity.toFixed(3));
    }
    if (t < 1) {
      getDocState(doc).pinAnimRaf = win.requestAnimationFrame(step);
      return;
    }
    getDocState(doc).pinAnimRaf = null;
    finish();
  };
  getDocState(doc).pinAnimRaf = win.requestAnimationFrame(step);
}

/** Remove the inline fade styles driven by the minimal-mode pin animation
 * so the CSS (minimal class or normal rules) takes over again. */
function clearMinimalFadeStyles(sidebar: HTMLElement): void {
  const els = sidebar.querySelectorAll<HTMLElement>(
    ":scope > .vertical-tabs-header, :scope > .vertical-tabs-home-block, :scope > .vertical-tabs-categories",
  );
  for (const el of Array.from(els) as HTMLElement[]) {
    el.style.opacity = "";
  }
  const icon = sidebar.querySelector(
    ":scope > .vertical-tabs-minimal-icon",
  ) as HTMLElement | null;
  if (icon) {
    icon.style.display = "";
    icon.style.opacity = "";
  }
}

// ── Minimal-icon fade-in on floating collapse ──
//
// performCollapse applies the minimal class in the same tick the width starts
// transitioning back to the 20px strip, and the class's `display: block`
// makes the plugin icon pop in. startMinimalIconFadeIn pins the icon inline
// (transparent, one-shot delayed opacity transition) so it fades in over the
// collapse's tail instead; the pending cleanup hands the icon back to CSS on
// transition end/cancel (safety timeout if the icon is hidden mid-fade).

const ICON_FADE_STATE_KEY = "__vtMinimalIconFade";

interface MinimalIconFadeState {
  cleanup: () => void;
}

function startMinimalIconFadeIn(doc: Document, icon: HTMLElement): void {
  // Supersede any still-pending fade (rapid collapse→expand→collapse): the
  // old fade's listeners are removed and its stale timeout turns into a
  // no-op, so it can never wipe THIS fade's inline styles mid-flight.
  const prev = (icon as any)[ICON_FADE_STATE_KEY] as
    | MinimalIconFadeState
    | undefined;
  const state: MinimalIconFadeState = { cleanup: () => {} };
  (icon as any)[ICON_FADE_STATE_KEY] = state;
  prev?.cleanup();

  icon.style.display = "block";
  icon.style.opacity = "0";
  // 0.1s fade after a 0.1s delay: the icon appears over the collapse's last
  // 100ms (the width transition is 0.2s), like the unpin cross-fade.
  icon.style.transition = "opacity 0.1s ease-out 0.1s";

  state.cleanup = () => {
    icon.removeEventListener("transitionend", state.cleanup);
    icon.removeEventListener("transitioncancel", state.cleanup);
    // Superseded by a newer fade — it owns the inline styles now.
    if ((icon as any)[ICON_FADE_STATE_KEY] !== state) return;
    delete (icon as any)[ICON_FADE_STATE_KEY];
    icon.style.display = "";
    icon.style.opacity = "";
    icon.style.transition = "";
  };
  icon.addEventListener("transitionend", state.cleanup);
  icon.addEventListener("transitioncancel", state.cleanup);
  // Safety net: transitionend doesn't fire when the icon is hidden mid-fade
  // (re-expansion removes the minimal class) — hand styles back to CSS.
  doc.defaultView?.setTimeout(state.cleanup, 300);
}

/**
 * Cancel a pending collapse fade-in: clear the icon's inline styles so CSS
 * decides its visibility (expanded/pinned states hide it). Also required
 * before animatePinToggle drives the icon's opacity per frame — a leftover
 * inline `transition` would re-transition every frame write.
 */
function cancelMinimalIconFadeIn(sidebar: HTMLElement): void {
  const icon = sidebar.querySelector(
    ":scope > .vertical-tabs-minimal-icon",
  ) as HTMLElement | null;
  const state = (icon as any)?.[ICON_FADE_STATE_KEY] as
    | MinimalIconFadeState
    | undefined;
  state?.cleanup();
}

function setExpandAnimating(doc: Document, animating: boolean): void {
  (doc as any).__vtExpandAnimating = animating;
}

export function isExpandAnimating(doc: Document): boolean {
  return (doc as any).__vtExpandAnimating ?? false;
}

export function expandFloatingSidebar(doc: Document): void {
  if (isPinned()) return;
  const sidebar = getSidebar(doc);
  if (!sidebar) return;

  // Refresh the relative "last read" labels IN PLACE on expand (targeted
  // time-text update, no DOM rebuild). A full dispatchPDFsChanged() re-render
  // here would rebuild the rows with their final margin/padding/active
  // highlight already applied, so the CSS transitions that glide the icon and
  // highlight rect on collapse could never play on expand — rows snapped.
  dispatchTimeTick();

  const savedWidth = getSavedWidth();
  sidebar.style.setProperty("--vt-expanded-width", `${savedWidth}px`);
  sidebar.style.width = "";
  sidebar.classList.remove("vertical-tabs-sidebar-minimal");
  sidebar.classList.add("vertical-tabs-sidebar-expanded");
  sidebar.classList.toggle(
    "vertical-tabs-sidebar-embedded-expanded",
    isAutoExpandEnabled() && isAutoExpandEmbeddedEnabled(),
  );
  // A collapse-time icon fade-in may still be pending (rapid collapse→
  // expand): cancel it so its inline display/opacity doesn't keep the icon
  // visible over the expanding panel.
  cancelMinimalIconFadeIn(sidebar);
  updateContentOpacity(sidebar);
  setResizeHandleVisible(doc, true);
  setFloatingExpanded(doc, true);
  animateFloatingWrapper(doc, true);

  // Keep the relative "last read" labels aging while VT stays visible.
  startDisplayRefreshTimer();

  // Block hover card until the width expand animation finishes.
  // The preference only controls embedded automatic expansion. The normal
  // floating hover animation remains enabled regardless of this setting.
  const animationsEnabled =
    !isEmbeddedAutoExpansionEnabled() || areExpandCollapseAnimationsEnabled();
  const expandAnimationToken = animationsEnabled ? {} : null;
  getDocState(doc).expandAnimationToken = expandAnimationToken;
  setExpandAnimating(doc, animationsEnabled);
  if (!animationsEnabled) {
    dispatchVtEvent(doc, "vertical-tabs:expand-animation-complete", {});
  }
  const onEnd = (e?: TransitionEvent) => {
    if (e && e.propertyName !== "width") return;
    sidebar.removeEventListener("transitionend", onEnd);
    sidebar.removeEventListener("transitioncancel", onEnd);
    if (getDocState(doc).expandAnimationToken !== expandAnimationToken) {
      return;
    }
    getDocState(doc).expandAnimationToken = null;
    if (!isExpandAnimating(doc)) return;
    setExpandAnimating(doc, false);
    dispatchVtEvent(doc, "vertical-tabs:expand-animation-complete", {});
  };
  if (animationsEnabled) {
    sidebar.addEventListener("transitionend", onEnd);
    sidebar.addEventListener("transitioncancel", onEnd);
    // Safety net in case transition events don't fire.
    setTimeout(() => {
      if (getDocState(doc).expandAnimationToken !== expandAnimationToken) {
        return;
      }
      getDocState(doc).expandAnimationToken = null;
      if (!isExpandAnimating(doc)) return;
      sidebar.removeEventListener("transitionend", onEnd);
      sidebar.removeEventListener("transitioncancel", onEnd);
      setExpandAnimating(doc, false);
      dispatchVtEvent(doc, "vertical-tabs:expand-animation-complete", {});
    }, 350);
  }

  dispatchVtEvent(doc, "vertical-tabs:visibility-changed", { visible: true });
}

function performCollapse(doc: Document): void {
  const sidebar = getSidebar(doc);
  if (!sidebar) return;
  if (!isFloatingExpanded(doc)) return;

  // Collapsing closes any open context menu so it does not float over the
  // collapsed strip (its token is already stale, so its late close callback
  // is a no-op).
  doc.getElementById("vertical-tabs-item-menu")?.remove();
  doc.getElementById("vertical-tabs-context-menu")?.remove();
  if (isContextMenuOpen(doc)) setContextMenuOpen(doc, false);

  // Blur search so the focused state doesn't keep VT expanded next time.
  const searchInput = sidebar.querySelector(
    ".vertical-tabs-search",
  ) as HTMLInputElement | null;
  searchInput?.blur();

  const embeddedAutoExpansion = isEmbeddedAutoExpansionEnabled();
  const embeddedAnimationsEnabled = areExpandCollapseAnimationsEnabled();
  sidebar.style.width = "";
  sidebar.classList.remove("vertical-tabs-sidebar-expanded");
  sidebar.classList.remove("vertical-tabs-sidebar-embedded-expanded");
  updateContentOpacity(sidebar);
  setResizeHandleVisible(doc, false);
  setFloatingExpanded(doc, false);
  getDocState(doc).expandAnimationToken = null;
  setExpandAnimating(doc, false);
  stopDisplayRefreshTimer();
  dispatchVtEvent(doc, "vertical-tabs:visibility-changed", { visible: false });
  // Minimal-mode collapse: the minimal class (applied below) would switch the
  // plugin icon to display:block instantly. Pin it inline at opacity 0 first,
  // then fade it in over the collapse's tail — mirroring the unpin
  // cross-fade's last 100ms — instead of popping in.
  const toMinimal = getCollapsedStripWidth() === MINIMAL_STRIP_WIDTH;
  const minimalIcon = toMinimal
    ? (sidebar.querySelector(
        ":scope > .vertical-tabs-minimal-icon",
      ) as HTMLElement | null)
    : null;
  if (minimalIcon && (!embeddedAutoExpansion || embeddedAnimationsEnabled)) {
    startMinimalIconFadeIn(doc, minimalIcon);
  }
  // Collapsed now: the minimal 16px strip may apply (prefs changed while
  // expanded never gets the class, so it is applied here on collapse).
  applyCollapsedStripPresentation(doc, true);
  if (minimalIcon && (!embeddedAutoExpansion || embeddedAnimationsEnabled)) {
    void minimalIcon.offsetHeight;
    minimalIcon.style.opacity = "1";
  }
}

export function collapseFloatingSidebar(doc: Document): void {
  if (isPinned()) return;
  if (
    isContextMenuOpen(doc) ||
    isSearchFocused(doc) ||
    isWaitingMouseMoveAfterInput(doc) ||
    isDialogOpen(doc)
  )
    return;
  const sidebar = getSidebar(doc);
  if (!sidebar) return;
  if (!isFloatingExpanded(doc)) return;

  // Check if mouse is currently over sidebar — if so, don't collapse
  const hovered = doc.querySelector(":hover");
  if (hovered && hovered.closest(`#${SIDEBAR_ID}`)) {
    return;
  }

  performCollapse(doc);
}

/** Collapse immediately for actions that must remove the expanded sidebar. */
export function collapseFloatingSidebarNow(doc: Document): void {
  if (isPinned() || !isFloatingExpanded(doc)) return;
  performCollapse(doc);
}

function setResizeHandleVisible(doc: Document, visible: boolean): void {
  const sidebar = getSidebar(doc);
  if (!sidebar) return;
  const handle = sidebar.querySelector(
    `.${RESIZE_HANDLE_CLASS}`,
  ) as HTMLElement | null;
  if (!handle) return;
  handle.style.display = visible ? "" : "none";
}

function setWrapperAndSplitter(
  doc: Document,
  mode: "pinned" | "floating",
): void {
  const target = findOrCreateWrapper(doc);
  if (!target) return;
  const { wrapper, splitter } = target;
  const savedWidth = getSavedWidth();

  if (mode === "pinned") {
    wrapper.style.width = `${savedWidth}px`;
    wrapper.style.minWidth = `${MIN_WIDTH}px`;
    wrapper.style.maxWidth = `${MAX_WIDTH}px`;
    wrapper.removeAttribute("hidden");
    splitter.removeAttribute("hidden");
    splitter.style.display = "";
    setupWidthObserver(doc, wrapper);
  } else {
    const stripWidth = getCollapsedStripWidth();
    wrapper.style.width = `${stripWidth}px`;
    wrapper.style.minWidth = `${stripWidth}px`;
    wrapper.style.maxWidth = `${stripWidth}px`;
    wrapper.removeAttribute("hidden");
    splitter.setAttribute("hidden", "true");
    splitter.style.display = "none";
    clearWidthObserver(doc);
  }
}

/**
 * Keep the floating wrapper in the same layout mode as its sidebar. In the
 * default floating mode the wrapper stays at the narrow strip width, letting
 * the expanded sidebar paint over the main content. When embedded auto-expand
 * is enabled, the wrapper grows with the hover-expanded sidebar instead.
 */
function applyFloatingWrapperPresentation(doc: Document): void {
  if (isPinned()) return;
  cancelFloatingWrapperAnimation(doc);
  const target = findOrCreateWrapper(doc);
  if (!target) return;

  const { wrapper, splitter } = target;
  const width = resolveFloatingWrapperWidth(
    false,
    isFloatingExpanded(doc),
    isAutoExpandEnabled(),
    isAutoExpandEmbeddedEnabled(),
    getSavedWidth(),
    getCollapsedStripWidth(),
  );
  wrapper.style.width = `${width}px`;
  wrapper.style.minWidth = `${width}px`;
  wrapper.style.maxWidth = `${width}px`;
  wrapper.removeAttribute("hidden");
  splitter.setAttribute("hidden", "true");
  splitter.style.display = "none";
  clearWidthObserver(doc);
}

/** Animate the floating wrapper to match an automatic embedded expansion. */
function animateFloatingWrapper(doc: Document, expanded: boolean): void {
  if (isPinned()) return;
  const target = findOrCreateWrapper(doc);
  const win = doc.defaultView;
  if (!target || !win) return;

  const { wrapper } = target;
  cancelFloatingWrapperAnimation(doc);

  if (
    isEmbeddedAutoExpansionEnabled() &&
    !areExpandCollapseAnimationsEnabled()
  ) {
    applyFloatingWrapperPresentation(doc);
    return;
  }

  const targetWidth = resolveFloatingWrapperWidth(
    false,
    expanded,
    isAutoExpandEnabled(),
    isAutoExpandEmbeddedEnabled(),
    getSavedWidth(),
    getCollapsedStripWidth(),
  );
  const startWidth = wrapper.clientWidth || getCollapsedStripWidth();
  if (startWidth === targetWidth) {
    applyFloatingWrapperPresentation(doc);
    return;
  }

  // XUL vboxes do not animate CSS width transitions reliably, so drive the
  // layout width per frame, in sync with the sidebar's 0.2s transition.
  wrapper.style.minWidth = "0px";
  wrapper.style.maxWidth = "none";
  wrapper.removeAttribute("hidden");
  const startTime = Date.now();
  const duration = 220;
  const ease = expanded
    ? (t: number) => t
    : (t: number) => 1 - Math.pow(1 - t, 3);

  const step = () => {
    const t = Math.min(1, (Date.now() - startTime) / duration);
    const eased = ease(t);
    const width = Math.round(startWidth + (targetWidth - startWidth) * eased);
    wrapper.style.width = `${width}px`;
    if (t < 1) {
      getDocState(doc).wrapperAnimRaf = win.requestAnimationFrame(step);
      return;
    }
    getDocState(doc).wrapperAnimRaf = null;
    applyFloatingWrapperPresentation(doc);
  };

  wrapper.style.width = `${startWidth}px`;
  getDocState(doc).wrapperAnimRaf = win.requestAnimationFrame(step);
}

/**
 * Apply the collapsed-strip presentation for the current prefs: toggles the
 * minimal (16px, plugin-icon-only) class on the sidebar and refreshes the
 * wrapper width. Called by renderSidebarMode, after each floating collapse,
 * and by the autoExpand/compactStrip pref observers so toggles apply live.
 */
export function applyCollapsedStripPresentation(
  doc: Document,
  animateEmbedded = false,
): void {
  const sidebar = getSidebar(doc);
  if (!sidebar) return;
  const minimal =
    !isPinned() &&
    !isFloatingExpanded(doc) &&
    getCollapsedStripWidth() === MINIMAL_STRIP_WIDTH;
  sidebar.classList.toggle("vertical-tabs-sidebar-minimal", minimal);
  sidebar.classList.toggle(
    "vertical-tabs-sidebar-embedded-expanded",
    isFloatingExpanded(doc) &&
      isAutoExpandEnabled() &&
      isAutoExpandEmbeddedEnabled(),
  );
  if (!isPinned()) {
    if (
      animateEmbedded &&
      isAutoExpandEnabled() &&
      isAutoExpandEmbeddedEnabled()
    ) {
      animateFloatingWrapper(doc, false);
    } else {
      applyFloatingWrapperPresentation(doc);
    }
  }
}

/** Apply the animation preference and settle any in-flight transition. */
export function applyExpandCollapseAnimationPreference(doc: Document): void {
  const sidebar = getSidebar(doc);
  if (!sidebar) return;

  const enabled = areExpandCollapseAnimationsEnabled();
  sidebar.classList.toggle("vertical-tabs-sidebar-no-animations", !enabled);
  if (enabled) return;

  cancelFloatingWrapperAnimation(doc);
  cancelMinimalIconFadeIn(sidebar);
  const embeddedAutoExpansion = isEmbeddedAutoExpansionEnabled();
  if (embeddedAutoExpansion && isExpandAnimating(doc)) {
    getDocState(doc).expandAnimationToken = null;
    setExpandAnimating(doc, false);
    dispatchVtEvent(doc, "vertical-tabs:expand-animation-complete", {});
  }

  const pinAnimationWasRunning = getDocState(doc).pinAnimRaf !== null;
  cancelPinAnimation(doc);
  if (pinAnimationWasRunning) {
    sidebar.classList.remove("vertical-tabs-sidebar-resizing");
    sidebar.style.width = "";
    sidebar.style.boxShadow = "";
    sidebar.style.borderRightColor = "";
    clearMinimalFadeStyles(sidebar);
    _pinToggleHandledDocs.delete(doc);
    _modeSwitchHandledDocs.delete(doc);
    renderSidebarMode(doc);
    updatePinButtonVisual(doc);
    return;
  }

  if (!isPinned() && embeddedAutoExpansion) {
    applyFloatingWrapperPresentation(doc);
  }
}

export function renderSidebarMode(doc: Document): HTMLElement | null {
  const globallyEnabled = Zotero.Prefs.get(
    `${PREF_NAMESPACE}.verticalTabs.enabled`,
    true,
  ) as boolean;
  if (!globallyEnabled) {
    destroySidebar(doc);
    return null;
  }

  clearHoverTimer(doc);
  clearLeaveTimer(doc);
  clearInputPositionListener(doc);
  cancelPinAnimation(doc);
  cancelFloatingWrapperAnimation(doc);
  getDocState(doc).expandAnimationToken = null;
  setExpandAnimating(doc, false);
  setWaitMouseMoveAfterInput(doc, false);

  const pinned = isPinned();
  const sidebar = getSidebar(doc) ?? createSidebar(doc);
  sidebar.classList.toggle(
    "vertical-tabs-sidebar-no-animations",
    !areExpandCollapseAnimationsEnabled(),
  );

  // Ensure tab height CSS variable is up-to-date.
  applyTabHeightStyle(doc);

  if (pinned) {
    applySidebarClasses(sidebar, "pinned");
    sidebar.classList.remove("vertical-tabs-sidebar-expanded");
    sidebar.classList.remove("vertical-tabs-sidebar-embedded-expanded");
    sidebar.classList.remove("vertical-tabs-sidebar-minimal");
    sidebar.removeAttribute("hidden");
    sidebar.style.display = "";
    sidebar.style.width = "100%";
    sidebar.style.setProperty("--vt-content-opacity", "1");
    setFloatingExpanded(doc, false);
    setResizeHandleVisible(doc, false);
    setWrapperAndSplitter(doc, "pinned");
    startPinnedRefreshTimer();
    startDisplayRefreshTimer();
  } else {
    applySidebarClasses(sidebar, "floating");
    sidebar.classList.remove("vertical-tabs-sidebar-expanded");
    sidebar.removeAttribute("hidden");
    sidebar.style.display = "";
    sidebar.style.width = "";
    sidebar.style.setProperty("--vt-content-opacity", "0");
    setFloatingExpanded(doc, false);
    sidebar.classList.remove("vertical-tabs-sidebar-embedded-expanded");
    setResizeHandleVisible(doc, true);
    applyCollapsedStripPresentation(doc);
    stopPinnedRefreshTimer();
    stopDisplayRefreshTimer();
  }

  updatePinButtonVisual(doc);
  return sidebar;
}

/**
 * Legacy helper: show/hide the sidebar entirely.
 * In the new design this delegates to renderSidebarMode or destroySidebar.
 */
export function setSidebarVisibility(
  doc: Document,
  visible: boolean,
): HTMLElement | null {
  if (visible) {
    return renderSidebarMode(doc);
  } else {
    destroySidebar(doc);
    return null;
  }
}

export function isSidebarVisible(doc: Document): boolean {
  const sidebar = getSidebar(doc);
  if (!sidebar) return false;
  if (isPinned()) return !sidebar.hasAttribute("hidden");
  return isFloatingExpanded(doc);
}

export function getCategoriesContainer(doc: Document): HTMLElement | null {
  return (
    (doc.querySelector(
      `#${SIDEBAR_ID} .vertical-tabs-categories`,
    ) as HTMLElement) || null
  );
}

// ── Legacy toggle button helpers (kept for API compatibility) ──

export function getToggleButton(doc: Document): HTMLElement | null {
  return getSidebar(doc);
}

export function destroySidebar(doc: Document): void {
  clearHoverTimer(doc);
  clearLeaveTimer(doc);
  clearInputPositionListener(doc);
  clearWidthObserver(doc);
  cancelPinAnimation(doc);
  cancelFloatingWrapperAnimation(doc);
  getDocState(doc).expandAnimationToken = null;
  setExpandAnimating(doc, false);
  stopPinnedRefreshTimer();
  stopDisplayRefreshTimer();
  setWaitMouseMoveAfterInput(doc, false);
  const state = getDocState(doc);
  if (state.searchDebounceTimer) {
    clearTimeout(state.searchDebounceTimer);
    state.searchDebounceTimer = null;
  }
  const sidebar = getSidebar(doc);
  if (sidebar) {
    if ((sidebar as any).__vtFadeCleanup) {
      (sidebar as any).__vtFadeCleanup();
    }
    sidebar.remove();
  }
  removeWrapper(doc);
  removeStyles(doc);
}

export { SIDEBAR_ID };
