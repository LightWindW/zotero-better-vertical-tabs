import { config } from "../../../package.json";
import { getString } from "../../utils/locale";
import {
  injectStyles,
  removeStyles,
  SIDEBAR_ID,
  TOGGLE_BTN_ID,
  WRAPPER_ID,
  SPLITTER_ID,
} from "../render/styles";
import { dispatchVtEvent } from "../core/events";

const PREF_NAMESPACE = config.prefsPrefix;
const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 160;
const MAX_WIDTH = 800;
const RESIZE_HANDLE_CLASS = "vertical-tabs-resize-handle";
const HOVER_STRIP_CLASS = "vertical-tabs-hover-strip";
const PIN_BTN_CLASS = "vertical-tabs-pin-btn";
const HOVER_STRIP_WIDTH = 24;
type TimerHandle = ReturnType<typeof setTimeout>;

const HOVER_DELAY_MS = 300;
const LEAVE_DELAY_MS = 150;

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

function getHoverStrip(doc: Document): HTMLElement | null {
  return doc.querySelector(`.${HOVER_STRIP_CLASS}`) as HTMLElement | null;
}

function removeHoverStrip(doc: Document): void {
  const strip = getHoverStrip(doc);
  if (strip) strip.remove();
}

function createHoverStrip(doc: Document): HTMLElement {
  let strip = getHoverStrip(doc);
  if (strip) return strip;

  injectStyles(doc);

  strip = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as HTMLElement;
  strip.className = HOVER_STRIP_CLASS;
  strip.id = TOGGLE_BTN_ID;
  strip.title = getString("vertical-tabs-expand");

  const icon = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "img",
  ) as HTMLImageElement;
  icon.src = `chrome://${config.addonRef}/content/icons/favicon.png`;
  icon.style.width = "16px";
  icon.style.height = "16px";
  strip.appendChild(icon);

  const target = findOrCreateWrapper(doc);
  if (target) {
    target.wrapper.appendChild(strip);
  } else {
    const pane = doc.getElementById("zotero-pane") || doc.body;
    if (pane) {
      pane.insertBefore(strip, pane.firstChild);
    }
  }

  // Hover to expand
  strip.addEventListener("mouseenter", () => {
    clearLeaveTimer(doc);
    if (getHoverTimer(doc)) return;
    const timer = setTimeout(() => {
      setHoverTimer(doc, null);
      expandFloatingSidebar(doc);
    }, HOVER_DELAY_MS);
    setHoverTimer(doc, timer);
  });

  strip.addEventListener("mouseleave", () => {
    clearHoverTimer(doc);
    scheduleCollapse(doc);
  });

  return strip;
}

// ── Per-document timers ──

interface DocState {
  hoverTimer: TimerHandle | null;
  leaveTimer: TimerHandle | null;
  expanded: boolean;
  contextMenuOpen: boolean;
  searchFocused: boolean;
  waitMouseMoveAfterInput: boolean;
  inputPositionCleanup: (() => void) | null;
  widthObserverCleanup: (() => void) | null;
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
      inputPositionCleanup: null,
      widthObserverCleanup: null,
    };
    (doc as any)[key] = state;
  }
  return state;
}

export function setContextMenuOpen(doc: Document, open: boolean): void {
  getDocState(doc).contextMenuOpen = open;
}

function isContextMenuOpen(doc: Document): boolean {
  return getDocState(doc).contextMenuOpen;
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
  const save = () => {
    const w = wrapper.clientWidth;
    if (w > 0 && w !== lastWidth) {
      lastWidth = w;
      saveWidth(w);
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
    getDocState(doc).widthObserverCleanup = () => ro.disconnect();
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
  getDocState(doc).widthObserverCleanup = () => clearInterval(timer);
}

function isMouseOverVt(
  doc: Document,
  clientX: number,
  clientY: number,
): boolean {
  const sidebar = getSidebar(doc);
  if (sidebar) {
    const rect = sidebar.getBoundingClientRect();
    if (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    ) {
      return true;
    }
  }
  const strip = getHoverStrip(doc);
  if (strip) {
    const rect = strip.getBoundingClientRect();
    if (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    ) {
      return true;
    }
  }
  return false;
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

    // Mouse moved outside VT — collapse now and stop waiting.
    clearInputPositionListener(doc);
    state.waitMouseMoveAfterInput = false;
    performCollapse(doc);
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

function isFloatingExpanded(doc: Document): boolean {
  return getDocState(doc).expanded;
}

function setFloatingExpanded(doc: Document, expanded: boolean): void {
  getDocState(doc).expanded = expanded;
}

export function scheduleCollapse(doc: Document): void {
  if (
    isContextMenuOpen(doc) ||
    isSearchFocused(doc) ||
    isWaitingMouseMoveAfterInput(doc)
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
            properties: {
              textContent: isPinned() ? "📌" : "📍",
            },
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
            classList: ["vertical-tabs-add-btn"],
            attributes: {
              title: getString("vertical-tabs-add-category"),
            },
            properties: {
              textContent: "+",
            },
            listeners: [
              {
                type: "click",
                listener: () => {
                  dispatchVtEvent(doc, "vertical-tabs:add-category");
                },
              },
            ],
          },
        ],
      },
      {
        tag: "div",
        classList: ["vertical-tabs-categories"],
      },
    ],
  }) as HTMLElement;

  // Width is set by renderSidebarMode depending on pinned/floating mode.
  // Floating: explicit pixel width; Pinned: fills wrapper (100%).
  sidebar.style.width = `${getSavedWidth()}px`;

  // Search input: dispatch filter event on input
  const searchInput = sidebar.querySelector(
    ".vertical-tabs-search",
  ) as HTMLInputElement | null;
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      dispatchVtEvent(doc, "vertical-tabs:search", {
        query: searchInput.value.trim().toLowerCase(),
      });

      // After typing, wait for the next mouse position before deciding collapse.
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
      pinBtn.textContent = isPinned() ? "📌" : "📍";
    }
  };
  (sidebar as any).__updatePinBtn = updatePinBtn;

  // Mouse leave to collapse (only when floating / unpinned)
  sidebar.addEventListener("mouseleave", (e: MouseEvent) => {
    if (isPinned() || !isFloatingExpanded(doc)) return;
    if (isWaitingMouseMoveAfterInput(doc)) {
      setWaitMouseMoveAfterInput(doc, false);
      clearInputPositionListener(doc);
      // New mouse position is outside VT → collapse immediately.
      if (!isMouseOverVt(doc, e.clientX, e.clientY)) {
        performCollapse(doc);
      }
      return;
    }
    scheduleCollapse(doc);
  });

  sidebar.addEventListener("mouseenter", () => {
    clearLeaveTimer(doc);
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
    sidebar.style.width = `${clamped}px`;
  }

  function onMouseUp(e: MouseEvent): void {
    resizeHandle.classList.remove("active");
    doc.removeEventListener("mousemove", onMouseMove);
    doc.removeEventListener("mouseup", onMouseUp);
    const finalWidth = parseInt(sidebar.style.width, 10);
    saveWidth(finalWidth);
  }

  resizeHandle.addEventListener("mousedown", (e: MouseEvent) => {
    e.preventDefault();
    startX = e.clientX;
    startWidth = sidebar.offsetWidth;
    resizeHandle.classList.add("active");
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

function togglePinned(doc: Document): void {
  const newPinned = !isPinned();
  setPinned(newPinned);
  renderSidebarMode(doc);
  updatePinButtonVisual(doc);
}

export function expandFloatingSidebar(doc: Document): void {
  if (isPinned()) return;
  const sidebar = getSidebar(doc);
  if (!sidebar) return;
  sidebar.classList.add("vertical-tabs-sidebar-expanded");
  setFloatingExpanded(doc, true);
  dispatchVtEvent(doc, "vertical-tabs:visibility-changed", { visible: true });
}

function performCollapse(doc: Document): void {
  const sidebar = getSidebar(doc);
  if (!sidebar) return;
  if (!isFloatingExpanded(doc)) return;

  // Blur search so the focused state doesn't keep VT expanded next time.
  const searchInput = sidebar.querySelector(
    ".vertical-tabs-search",
  ) as HTMLInputElement | null;
  searchInput?.blur();

  sidebar.classList.remove("vertical-tabs-sidebar-expanded");
  setFloatingExpanded(doc, false);
  dispatchVtEvent(doc, "vertical-tabs:visibility-changed", { visible: false });
}

export function collapseFloatingSidebar(doc: Document): void {
  if (isPinned()) return;
  if (
    isContextMenuOpen(doc) ||
    isSearchFocused(doc) ||
    isWaitingMouseMoveAfterInput(doc)
  )
    return;
  const sidebar = getSidebar(doc);
  if (!sidebar) return;
  if (!isFloatingExpanded(doc)) return;

  // Check if mouse is currently over sidebar or hover strip — if so, don't collapse
  const hovered = doc.querySelector(":hover");
  if (
    hovered &&
    (hovered.closest(`#${SIDEBAR_ID}`) ||
      hovered.closest(`.${HOVER_STRIP_CLASS}`))
  ) {
    return;
  }

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
    wrapper.style.width = `${HOVER_STRIP_WIDTH}px`;
    wrapper.style.minWidth = `${HOVER_STRIP_WIDTH}px`;
    wrapper.style.maxWidth = `${HOVER_STRIP_WIDTH}px`;
    wrapper.removeAttribute("hidden");
    splitter.setAttribute("hidden", "true");
    splitter.style.display = "none";
    clearWidthObserver(doc);
  }
}

export function renderSidebarMode(doc: Document): HTMLElement | null {
  const mainPageEnabled = Zotero.Prefs.get(
    `${PREF_NAMESPACE}.verticalTabs.mainPageEnabled`,
    true,
  ) as boolean;
  const globallyEnabled = Zotero.Prefs.get(
    `${PREF_NAMESPACE}.verticalTabs.enabled`,
    true,
  ) as boolean;
  if (!globallyEnabled || !mainPageEnabled) {
    destroySidebar(doc);
    return null;
  }

  clearHoverTimer(doc);
  clearLeaveTimer(doc);
  clearInputPositionListener(doc);
  setWaitMouseMoveAfterInput(doc, false);

  const pinned = isPinned();
  const sidebar = getSidebar(doc) ?? createSidebar(doc);

  if (pinned) {
    removeHoverStrip(doc);
    applySidebarClasses(sidebar, "pinned");
    sidebar.classList.remove("vertical-tabs-sidebar-expanded");
    sidebar.removeAttribute("hidden");
    sidebar.style.display = "";
    sidebar.style.width = "100%";
    setFloatingExpanded(doc, false);
    setResizeHandleVisible(doc, false);
    setWrapperAndSplitter(doc, "pinned");
  } else {
    applySidebarClasses(sidebar, "floating");
    sidebar.classList.remove("vertical-tabs-sidebar-expanded");
    sidebar.removeAttribute("hidden");
    sidebar.style.display = "";
    sidebar.style.width = `${getSavedWidth()}px`;
    setFloatingExpanded(doc, false);
    setResizeHandleVisible(doc, true);
    setWrapperAndSplitter(doc, "floating");
    createHoverStrip(doc);
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
  return getHoverStrip(doc);
}

export function destroySidebar(doc: Document): void {
  clearHoverTimer(doc);
  clearLeaveTimer(doc);
  clearInputPositionListener(doc);
  clearWidthObserver(doc);
  setWaitMouseMoveAfterInput(doc, false);
  const sidebar = getSidebar(doc);
  if (sidebar) sidebar.remove();
  removeHoverStrip(doc);
  removeWrapper(doc);
  removeStyles(doc);
}

export { SIDEBAR_ID, TOGGLE_BTN_ID, HOVER_STRIP_CLASS };
