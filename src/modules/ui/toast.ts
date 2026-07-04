import { isDarkMode } from "../render/colorUtils";

const TOAST_ID = "vertical-tabs-toast";

interface ToastState {
  container: HTMLElement | null;
  timer: ReturnType<typeof setTimeout> | null;
}

const state: ToastState = {
  container: null,
  timer: null,
};

function ensureContainer(doc: Document): HTMLElement {
  if (
    state.container &&
    state.container.ownerDocument === doc &&
    state.container.isConnected
  ) {
    return state.container;
  }

  const container = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as HTMLElement;
  container.id = TOAST_ID;
  container.style.cssText = `
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 100001;
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-end;
    pointer-events: none;
  `;
  doc.documentElement?.appendChild(container);
  state.container = container;
  return container;
}

function removeToast(el: HTMLElement): void {
  el.style.opacity = "0";
  el.style.transform = "translateY(8px)";
  setTimeout(() => {
    el.remove();
  }, 250);
}

/**
 * Show a short toast notification at the bottom-right of the document.
 * Multiple calls stack vertically. The toast auto-dismisses after `duration` ms.
 */
export function showToast(
  doc: Document,
  message: string,
  duration = 3000,
): void {
  const container = ensureContainer(doc);
  const dark = isDarkMode(doc);

  const toast = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as HTMLElement;
  toast.textContent = message;
  toast.style.cssText = `
    max-width: 320px;
    padding: 10px 14px;
    border-radius: 6px;
    font-family: message-box;
    font-size: 13px;
    line-height: 1.4;
    color: ${dark ? "#F2F2F2" : "#1A1A1A"};
    background: ${dark ? "rgba(50, 50, 50, 0.95)" : "rgba(255, 255, 255, 0.95)"};
    border: 1px solid ${dark ? "#555" : "#DBDBDB"};
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    opacity: 0;
    transform: translateY(8px);
    transition: opacity 200ms ease, transform 200ms ease;
    pointer-events: auto;
  `;

  container.appendChild(toast);

  // Trigger reflow to enable transition
  void toast.offsetWidth;
  toast.style.opacity = "1";
  toast.style.transform = "translateY(0)";

  setTimeout(() => {
    removeToast(toast);
  }, duration);
}

/**
 * Remove any active toast from the document.
 */
export function clearToast(): void {
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  if (state.container) {
    state.container.remove();
    state.container = null;
  }
}
