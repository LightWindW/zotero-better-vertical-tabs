import { getString } from "../../utils/locale";
import { dispatchVtEvent } from "../core/events";
import { isDarkMode } from "../render/colorUtils";
import {
  deleteSavedCategory,
  loadSavedCategories,
  renameSavedCategory,
  saveSavedCategories,
  SavedCategory,
  SavedCategoryCollection,
} from "./savedCategoryStore";

const OVERLAY_ID = "vt-import-dialog-overlay";

function yesIconHtml(color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="${color}" width="16" height="16"><polygon points="40.6,12.1 17,35.7 7.4,26.1 4.6,29 17,41.3 43.4,14.9"/></svg>`;
}

function getThemeColors(doc: Document) {
  const dark = isDarkMode(doc);
  return {
    badgeBorder: dark ? "#555" : "#DBDBDB",
    badgeBg: dark ? "#3a3a3a" : "#E4E4E4",
    text: dark ? "#eee" : "#333",
    icon: dark ? "#aaa" : "#6C6C6C",
    dialogBg: dark ? "rgba(42, 42, 42, 0.95)" : "rgba(255, 255, 255, 0.95)",
    dialogBorder: dark
      ? "1px solid rgba(85, 85, 85, 0.5)"
      : "1px solid rgba(182, 182, 182, 0.5)",
  };
}

async function refreshList(
  doc: Document,
  listContainer: HTMLElement,
): Promise<void> {
  const collection = await loadSavedCategories();
  renderSavedCategoryList(doc, listContainer, collection);
}

function renderSavedCategoryList(
  doc: Document,
  container: HTMLElement,
  collection: SavedCategoryCollection,
): void {
  container.innerHTML = "";
  const colors = getThemeColors(doc);

  if (collection.categories.length === 0) {
    const empty = doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    ) as HTMLElement;
    empty.className = "vt-import-dialog-empty";
    empty.textContent = getString("vertical-tabs-no-saved-categories");
    empty.style.cssText = `
      padding: 24px;
      text-align: center;
      color: ${colors.icon};
      font-size: 13px;
    `;
    container.appendChild(empty);
    return;
  }

  for (const savedCat of collection.categories) {
    const row = createSavedCategoryRow(doc, savedCat);
    container.appendChild(row);
  }
}

function createSavedCategoryRow(
  doc: Document,
  savedCat: SavedCategory,
): HTMLElement {
  const colors = getThemeColors(doc);

  const row = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as HTMLElement;
  row.className = "vt-saved-category-row";
  row.style.cssText = `
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
  `;

  const badge = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as HTMLElement;
  badge.className = "vt-saved-category-badge";
  badge.style.cssText = `
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border: 1px solid ${colors.badgeBorder};
    border-radius: 6px;
    background: ${colors.badgeBg};
    min-width: 0;
  `;

  const nameSpan = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "span",
  ) as HTMLElement;
  nameSpan.className = "vt-saved-category-name";
  nameSpan.textContent = savedCat.name;
  nameSpan.style.cssText = `
    flex: 1;
    font-size: 13px;
    color: ${colors.text};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  `;
  badge.appendChild(nameSpan);

  const countSpan = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "span",
  ) as HTMLElement;
  countSpan.className = "vt-saved-category-count";
  countSpan.textContent = String(savedCat.itemIds.length);
  countSpan.style.cssText = `
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: ${colors.icon};
    color: ${colors.badgeBg};
    font-size: 11px;
    flex-shrink: 0;
  `;
  badge.appendChild(countSpan);

  row.appendChild(badge);

  const actions = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as HTMLElement;
  actions.className = "vt-saved-category-actions";
  actions.style.cssText = "display: flex; gap: 4px;";

  const actionBtn = (html: string, title: string): HTMLElement => {
    const btn = doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "button",
    ) as HTMLElement;
    btn.className = "vt-action-btn";
    btn.title = title;
    btn.style.cssText = `
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
    `;
    const wrapper = doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "span",
    ) as HTMLElement;
    wrapper.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      color: ${colors.icon};
    `;
    wrapper.innerHTML = html;
    btn.appendChild(wrapper);
    btn.addEventListener("mouseenter", () => {
      btn.style.background =
        "var(--material-button-hover, rgba(0, 0, 0, 0.06))";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.background = "";
    });
    return btn;
  };

  const applyBtn = actionBtn(
    yesIconHtml(colors.icon),
    getString("vertical-tabs-apply-category"),
  );
  applyBtn.addEventListener("click", () => {
    closeImportDialog(doc);
    dispatchVtEvent(doc, "vertical-tabs:import-category", {
      savedCategoryId: savedCat.id,
    });
  });

  const renameBtn = actionBtn(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="currentColor" width="16" height="16"><path d="M345.994,42.019,179.531,208.481A646.3,646.3,0,0,0,25.325,456.521a24.845,24.845,0,0,0,6,25.708l.087.087a24.84,24.84,0,0,0,17.611,7.342,25.172,25.172,0,0,0,8.1-1.344,646.283,646.283,0,0,0,248.04-154.207L471.62,167.646A88.831,88.831,0,0,0,345.994,42.019ZM282.531,311.48A614.445,614.445,0,0,1,60.419,453.221,614.435,614.435,0,0,1,202.158,231.108l99.162-99.161,80.372,80.372ZM448.993,145.019l-44.674,44.673L323.947,109.32l44.674-44.674a56.832,56.832,0,1,1,80.372,80.373Z"/></svg>`,
    getString("vertical-tabs-rename-saved-category"),
  );
  renameBtn.addEventListener("click", () => {
    enableRenameMode(doc, badge, savedCat.id);
  });

  const deleteBtn = actionBtn(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M0 0h24v24H0z" fill="none"/><line x1="4" y1="7" x2="20" y2="7" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" /><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" /></svg>`,
    getString("vertical-tabs-delete-saved-category"),
  );
  deleteBtn.addEventListener("click", async () => {
    const collection = await loadSavedCategories();
    const newCollection = deleteSavedCategory(collection, savedCat.id);
    await saveSavedCategories(newCollection);

    const rowHeight = row.offsetHeight;
    row.style.maxHeight = `${rowHeight}px`;
    row.style.overflow = "hidden";
    doc.defaultView?.requestAnimationFrame(() => {
      row.classList.add("vt-saved-category-row-removing");
    });

    row.addEventListener(
      "transitionend",
      (e: TransitionEvent) => {
        if (e.propertyName !== "max-height") return;
        const listContainer = doc.querySelector(
          ".vt-import-dialog-list",
        ) as HTMLElement | null;
        if (listContainer) {
          void refreshList(doc, listContainer);
        }
      },
      { once: true },
    );
  });

  actions.appendChild(applyBtn);
  actions.appendChild(renameBtn);
  actions.appendChild(deleteBtn);
  row.appendChild(actions);

  return row;
}

function enableRenameMode(
  doc: Document,
  badgeEl: HTMLElement,
  savedCategoryId: string,
): void {
  const nameSpan = badgeEl.querySelector(
    ".vt-saved-category-name",
  ) as HTMLElement | null;
  if (!nameSpan) return;

  const currentName = nameSpan.textContent || "";
  const countSpan = badgeEl.querySelector(
    ".vt-saved-category-count",
  ) as HTMLElement | null;

  const input = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "input",
  ) as HTMLInputElement;
  input.type = "text";
  input.value = currentName;
  input.style.cssText = `
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    font-size: 13px;
    font-family: inherit;
    color: inherit;
    padding: 0;
    margin: 0;
    min-width: 0;
  `;

  nameSpan.replaceWith(input);
  input.focus();
  input.select();

  const finish = async () => {
    const newName = input.value.trim();
    if (newName && newName !== currentName) {
      const collection = await loadSavedCategories();
      const newCollection = renameSavedCategory(
        collection,
        savedCategoryId,
        newName,
      );
      await saveSavedCategories(newCollection);
    }
    const newSpan = doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "span",
    ) as HTMLElement;
    newSpan.className = "vt-saved-category-name";
    newSpan.textContent = newName || currentName;
    newSpan.style.cssText = nameSpan.style.cssText;
    input.replaceWith(newSpan);
    if (countSpan) {
      badgeEl.appendChild(countSpan);
    }
    doc.removeEventListener("mousedown", onClickOutside, true);
  };

  const onClickOutside = (e: MouseEvent) => {
    if (!input.contains(e.target as Node)) {
      void finish();
    }
  };

  input.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void finish();
    } else if (e.key === "Escape") {
      e.preventDefault();
      const newSpan = doc.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "span",
      ) as HTMLElement;
      newSpan.className = "vt-saved-category-name";
      newSpan.textContent = currentName;
      newSpan.style.cssText = nameSpan.style.cssText;
      input.replaceWith(newSpan);
      if (countSpan) {
        badgeEl.appendChild(countSpan);
      }
      doc.removeEventListener("mousedown", onClickOutside, true);
    }
  });

  setTimeout(() => doc.addEventListener("mousedown", onClickOutside, true), 0);
}

function closeImportDialog(doc: Document): void {
  const overlay = doc.getElementById(OVERLAY_ID) as HTMLElement | null;
  if (!overlay || overlay.classList.contains("vt-import-dialog-leaving"))
    return;
  overlay.classList.add("vt-import-dialog-leaving");
  const onLeaveEnd = (e: AnimationEvent) => {
    if (e.target !== overlay) return;
    overlay.removeEventListener("animationend", onLeaveEnd);
    overlay.remove();
  };
  overlay.addEventListener("animationend", onLeaveEnd);
}

export async function showImportCategoryDialog(doc: Document): Promise<void> {
  closeImportDialog(doc);

  const collection = await loadSavedCategories();
  const colors = getThemeColors(doc);

  const overlay = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as HTMLElement;
  overlay.id = OVERLAY_ID;
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.3);
    z-index: 100001;
    display: flex;
    align-items: center;
    justify-content: center;
  `;

  const dialog = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as HTMLElement;
  dialog.className = "vt-import-dialog";
  dialog.style.cssText = `
    background: ${colors.dialogBg};
    border: ${colors.dialogBorder};
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.2);
    min-width: 400px;
    max-width: 500px;
    max-height: 500px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
  `;

  const header = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as HTMLElement;
  header.className = "vt-import-dialog-header";
  header.textContent = getString("vertical-tabs-import-dialog-title");
  header.style.cssText = `
    padding: 16px 20px;
    font-size: 15px;
    font-weight: 600;
    border-bottom: ${colors.dialogBorder};
    color: ${colors.text};
  `;
  dialog.appendChild(header);

  const listContainer = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as HTMLElement;
  listContainer.className = "vt-import-dialog-list";
  listContainer.style.cssText = `
    padding: 8px 0;
    overflow-y: auto;
    flex: 1;
  `;
  renderSavedCategoryList(doc, listContainer, collection);
  dialog.appendChild(listContainer);

  overlay.appendChild(dialog);
  doc.documentElement?.appendChild(overlay);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      closeImportDialog(doc);
    }
  });
}
