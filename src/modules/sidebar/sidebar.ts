import { config } from "../../../package.json";
import { getString } from "../../utils/locale";
import {
  injectStyles,
  removeStyles,
  SIDEBAR_ID,
  TOGGLE_BTN_ID,
} from "../render/styles";
import { dispatchVtEvent } from "../core/events";

const PREF_NAMESPACE = config.prefsPrefix;
const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 160;
const MAX_WIDTH = 800;
const RESIZE_HANDLE_CLASS = "vertical-tabs-resize-handle";

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

/**
 * Insert sidebar right BEFORE #zotero-collections-pane inside its parent.
 * This puts the sidebar to the LEFT of the collections pane.
 */
function findInsertBeforeCollections(
  doc: Document,
): { container: Node; before: Node } | null {
  const collectionsPane = doc.getElementById("zotero-collections-pane");
  if (!collectionsPane || !collectionsPane.parentNode) return null;
  return {
    container: collectionsPane.parentNode,
    before: collectionsPane,
  };
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
            classList: ["vertical-tabs-collapse-btn"],
            attributes: {
              title: getString("vertical-tabs-collapse"),
            },
            properties: {
              textContent: "<",
            },
            listeners: [
              {
                type: "click",
                listener: () => {
                  dispatchVtEvent(doc, "vertical-tabs:collapse");
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

  // Apply saved width
  const savedWidth = getSavedWidth();
  sidebar.style.width = `${savedWidth}px`;

  // Search input: dispatch filter event on input
  const searchInput = sidebar.querySelector(
    ".vertical-tabs-search",
  ) as HTMLInputElement | null;
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      dispatchVtEvent(doc, "vertical-tabs:search", {
        query: searchInput.value.trim().toLowerCase(),
      });
    });

    // Blur search when clicking outside the sidebar
    doc.addEventListener("mousedown", (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(`#${SIDEBAR_ID}`)) {
        searchInput.blur();
      }
    });
  }

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

  // Insert into the layout — BEFORE collections pane (left side)
  const target = findInsertBeforeCollections(doc);
  if (target) {
    try {
      target.container.insertBefore(sidebar, target.before);
    } catch (e) {
      doc.body?.appendChild(sidebar);
    }
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

export function setSidebarVisibility(
  doc: Document,
  visible: boolean,
): HTMLElement | null {
  const sidebar = getSidebar(doc) ?? createSidebar(doc);
  if (!sidebar) return null;

  if (visible) {
    sidebar.removeAttribute("hidden");
    sidebar.style.display = "";
    removeToggleButton(doc);
  } else {
    sidebar.setAttribute("hidden", "true");
    createToggleButton(doc);
  }
  return sidebar;
}

export function isSidebarVisible(doc: Document): boolean {
  const sidebar = getSidebar(doc);
  return sidebar ? !sidebar.hasAttribute("hidden") : false;
}

export function getCategoriesContainer(doc: Document): HTMLElement | null {
  return (
    (doc.querySelector(
      `#${SIDEBAR_ID} .vertical-tabs-categories`,
    ) as HTMLElement) || null
  );
}

// ── Toggle button (shown when sidebar is hidden) ──

let _toggleBtn: HTMLElement | null = null;

function createToggleButton(doc: Document): HTMLElement | null {
  // Guard: don't create toggle button if main page VT is disabled
  const mainPageEnabled = Zotero.Prefs.get(
    `${PREF_NAMESPACE}.verticalTabs.mainPageEnabled`,
    true,
  ) as boolean;
  const globallyEnabled = Zotero.Prefs.get(
    `${PREF_NAMESPACE}.verticalTabs.enabled`,
    true,
  ) as boolean;
  if (!globallyEnabled || !mainPageEnabled) return null;

  // Clean up stale toggle
  if (_toggleBtn && _toggleBtn.parentNode) {
    _toggleBtn.remove();
  }
  _toggleBtn = null;

  const collectionsPane = doc.getElementById("zotero-collections-pane");
  if (!collectionsPane || !collectionsPane.parentNode) return null;

  const btn = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as HTMLElement;
  btn.id = TOGGLE_BTN_ID;
  btn.title = getString("vertical-tabs-expand");

  // Icon
  const icon = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "img",
  ) as HTMLImageElement;
  icon.src = `chrome://${config.addonRef}/content/icons/favicon.png`;
  icon.style.width = "16px";
  icon.style.height = "16px";
  btn.appendChild(icon);

  btn.addEventListener("click", () => {
    dispatchVtEvent(doc, "vertical-tabs:expand");
  });

  // Insert into the library pane layout — same parent as sidebar, before collections pane
  collectionsPane.parentNode.insertBefore(btn, collectionsPane);
  _toggleBtn = btn;
  return btn;
}

function removeToggleButton(_doc: Document): void {
  if (_toggleBtn) {
    _toggleBtn.remove();
    _toggleBtn = null;
  }
}

export function getToggleButton(_doc: Document): HTMLElement | null {
  return _toggleBtn;
}

export function destroySidebar(doc: Document): void {
  const sidebar = getSidebar(doc);
  if (sidebar) sidebar.remove();
  removeToggleButton(doc);
  removeStyles(doc);
}

export { SIDEBAR_ID, TOGGLE_BTN_ID };
