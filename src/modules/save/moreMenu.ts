import { config } from "../../../package.json";
import { getString } from "../../utils/locale";
import { getContextMenuColors, isDarkMode } from "../render/colorUtils";
import { getPopupStyleSheet } from "../render/popupStyleUtils";
import { dispatchVtEvent } from "../core/events";
import { importIcon, plusIcon, settingIcon } from "../ui/iconSvgs";
import {
  scheduleCollapse,
  setContextMenuOpen,
  SIDEBAR_ID,
} from "../sidebar/sidebar";

function iconHtml(svg: string): string {
  return `<span style="display:flex;align-items:center;justify-content:center;width:16px;height:16px;">${svg}</span>`;
}

export function showMoreMenu(doc: Document, anchorEl: HTMLElement): void {
  const existing = doc.getElementById("vertical-tabs-more-menu");
  if (existing) {
    return;
  }

  const mc = getContextMenuColors(doc);
  const rect = anchorEl.getBoundingClientRect();
  const iconColor = isDarkMode(doc) ? "#A2A2A2" : "#6C6C6C";

  const menu = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as HTMLElement;
  menu.id = "vertical-tabs-more-menu";
  menu.className = "vertical-tabs-more-menu";
  menu.style.cssText = `
    position: fixed;
    left: ${rect.left}px;
    top: ${rect.bottom + 4}px;
    z-index: 100000;
    padding: 4px 0;
    min-width: 160px;
    font-family: message-box;
    ${getPopupStyleSheet(doc)}
  `;

  const items: {
    icon: string;
    label: string;
    action: () => void;
    divider?: boolean;
  }[] = [
    {
      icon: iconHtml(plusIcon(iconColor)),
      label: getString("vertical-tabs-add-category"),
      action: () => dispatchVtEvent(doc, "vertical-tabs:add-category"),
    },
    {
      icon: iconHtml(importIcon(iconColor)),
      label: getString("vertical-tabs-import-category"),
      action: () => dispatchVtEvent(doc, "vertical-tabs:show-import-dialog"),
    },
    {
      divider: true,
      icon: "",
      label: "",
      action: () => {},
    },
    {
      icon: iconHtml(settingIcon(iconColor)),
      label: getString("vertical-tabs-plugin-settings"),
      action: () => dispatchVtEvent(doc, "vertical-tabs:open-preferences"),
    },
  ];

  for (const item of items) {
    if (item.divider) {
      const divider = doc.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "div",
      ) as HTMLElement;
      divider.style.cssText = `
        height: 1px;
        margin: 4px 12px;
        background: ${isDarkMode(doc) ? "#555" : "#DBDBDB"};
        pointer-events: none;
      `;
      menu.appendChild(divider);
      continue;
    }

    const row = doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    ) as HTMLElement;
    row.className = "vertical-tabs-more-menu-item";
    row.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      cursor: pointer;
      white-space: nowrap;
      font-family: message-box;
    `;
    row.addEventListener("mouseenter", () => {
      row.style.background = mc.hoverBg;
    });
    row.addEventListener("mouseleave", () => {
      row.style.background = "";
    });

    const iconWrapper = doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "span",
    ) as HTMLElement;
    iconWrapper.style.cssText =
      "display:flex;align-items:center;justify-content:center;width:16px;height:16px;";
    iconWrapper.innerHTML = item.icon;
    row.appendChild(iconWrapper);

    const labelEl = doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "span",
    ) as HTMLElement;
    labelEl.textContent = item.label;
    row.appendChild(labelEl);

    row.addEventListener("click", () => {
      closeMoreMenu(true);
      item.action();
    });

    menu.appendChild(row);
  }

  doc.documentElement?.appendChild(menu);
  setContextMenuOpen(doc, true);

  let leaveTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleClose = () => {
    if (leaveTimer) return;
    leaveTimer = setTimeout(() => {
      leaveTimer = null;
      closeMoreMenu(true);
    }, 150);
  };
  const cancelClose = () => {
    if (leaveTimer) {
      clearTimeout(leaveTimer);
      leaveTimer = null;
    }
  };

  const onAnchorEnter = cancelClose;
  const onAnchorLeave = scheduleClose;
  const onMenuEnter = cancelClose;
  const onMenuLeave = scheduleClose;

  anchorEl.addEventListener("mouseenter", onAnchorEnter);
  anchorEl.addEventListener("mouseleave", onAnchorLeave);
  menu.addEventListener("mouseenter", onMenuEnter);
  menu.addEventListener("mouseleave", onMenuLeave);

  const sidebar = doc.getElementById(SIDEBAR_ID);

  const closeMoreMenu = (animate: boolean): void => {
    if (!menu.isConnected) return;
    anchorEl.removeEventListener("mouseenter", onAnchorEnter);
    anchorEl.removeEventListener("mouseleave", onAnchorLeave);
    menu.removeEventListener("mouseenter", onMenuEnter);
    menu.removeEventListener("mouseleave", onMenuLeave);
    doc.removeEventListener("mousedown", closeMenu, true);
    if (leaveTimer) {
      clearTimeout(leaveTimer);
      leaveTimer = null;
    }
    if (!animate) {
      menu.remove();
      setContextMenuOpen(doc, false);
      return;
    }
    menu.classList.add("vertical-tabs-more-menu-leaving");
    const onLeaveEnd = () => {
      menu.removeEventListener("animationend", onLeaveEnd);
      if (menu.isConnected) {
        menu.remove();
        setContextMenuOpen(doc, false);
      }
    };
    menu.addEventListener("animationend", onLeaveEnd);
  };

  const closeMenu = (e: MouseEvent) => {
    if (!menu.isConnected) {
      doc.removeEventListener("mousedown", closeMenu, true);
      return;
    }
    const target = e.target as Node;
    if (menu.contains(target)) return;
    if (sidebar?.contains(target)) {
      closeMoreMenu(true);
      return;
    }
    closeMoreMenu(true);
    scheduleCollapse(doc);
  };

  setTimeout(() => {
    if (!menu.isConnected) return;
    doc.addEventListener("mousedown", closeMenu, true);
  }, 150);
}
