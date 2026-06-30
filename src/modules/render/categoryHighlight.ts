const HIGHLIGHT_CLASS = "has-active-reader-folded";

export function updateActiveCategoryHighlight(doc: Document): void {
  // Reset all categories first.
  doc
    .querySelectorAll(`.vertical-tabs-category.${HIGHLIGHT_CLASS}`)
    .forEach((el: Element) => {
      el.classList.remove(HIGHLIGHT_CLASS);
    });

  const activeItem = doc.querySelector(
    ".vertical-tabs-item.active",
  ) as HTMLElement | null;
  if (!activeItem) return;

  const tabType = activeItem.dataset.tabType ?? "";
  if (!tabType.startsWith("reader")) return;

  const category = activeItem.closest(
    ".vertical-tabs-category",
  ) as HTMLElement | null;
  if (!category || !category.classList.contains("collapsed")) return;

  category.classList.add(HIGHLIGHT_CLASS);
}
