/**
 * Inline SVG icon strings.
 *
 * These icons are embedded directly into the DOM instead of being loaded via
 * `<img src="chrome://...">`. This avoids broken/missing icons when the plugin
 * is loaded on another machine, and lets us control the icon color dynamically
 * through the parent's `color` style.
 */

/**
 * Parse an inline SVG string into a real SVG-namespace element.
 *
 * Used INSTEAD of assigning innerHTML: Zotero's innerHTML sanitizer strips
 * the xmlns attribute from <svg> and logs a warning ("Removed unsafe
 * attribute"), and without the xmlns it no longer recognises the node as
 * SVG and flattens it ("Flattening unsafe node") — the icon disappears.
 * DOMParser with image/svg+xml bypasses the sanitizer entirely and always
 * yields a properly-namespaced element.
 */
export function svgElement(doc: Document, svg: string): Element | null {
  if (!svg.trim()) return null;
  const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = parsed.documentElement;
  if (!root || root.tagName === "parsererror") return null;
  return doc.importNode(root, true) as Element;
}

export function pinIcon(color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="${color}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1 0 .707c-.48.48-1.072.588-1.503.588-.177 0-.335-.018-.46-.039l-3.134 3.134a5.927 5.927 0 0 1 .16 1.013c.046.702-.032 1.687-.72 2.375a.5.5 0 0 1-.707 0l-2.829-2.828-3.182 3.182c-.195.195-1.219.902-1.414.707-.195-.195.512-1.22.707-1.414l3.182-3.182-2.828-2.829a.5.5 0 0 1 0-.707c.688-.688 1.673-.767 2.375-.72a5.922 5.922 0 0 1 1.013.16l3.134-3.133a2.772 2.772 0 0 1-.04-.461c0-.43.108-1.022.589-1.503a.5.5 0 0 1 .353-.146z"/></svg>`;
}

export function pinFillIcon(color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="${color}" viewBox="0 0 16 16"><path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1 0 .707c-.48.48-1.072.588-1.503.588-.177 0-.335-.018-.46-.039l-3.134 3.134a5.927 5.927 0 0 1 .16 1.013c.046.702-.032 1.687-.72 2.375a.5.5 0 0 1-.707 0l-2.829-2.828-3.182 3.182c-.195.195-1.219.902-1.414.707-.195-.195.512-1.22.707-1.414l3.182-3.182-2.828-2.829a.5.5 0 0 1 0-.707c.688-.688 1.673-.767 2.375-.72a5.922 5.922 0 0 1 1.013.16l3.134-3.133a2.772 2.772 0 0 1-.04-.461c0-.43.108-1.022.589-1.503a.5.5 0 0 1 .353-.146z"/></svg>`;
}

export function importIcon(color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="${color}" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M11.5 21h-4.5a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v5m-5 6h7m-3 -3l3 3l-3 3"/></svg>`;
}

export function settingIcon(color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="${color}" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z"/><circle cx="12" cy="12" r="3"/></svg>`;
}

export function saveIcon(color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 512 512" fill="${color}"><path d="M472.971,122.344,373.656,23.029A23.838,23.838,0,0,0,356.687,16H56A24.028,24.028,0,0,0,32,40V472a24.028,24.028,0,0,0,24,24H456a24.028,24.028,0,0,0,24-24V139.313A23.838,23.838,0,0,0,472.971,122.344ZM320,48v96H176V48ZM448,464H64V48h80V176H352V48h1.373L448,142.627Z"/><path d="M252,224a92,92,0,1,0,92,92A92.1,92.1,0,0,0,252,224Zm0,152a60,60,0,1,1,60-60A60.068,60.068,0,0,1,252,376Z"/></svg>`;
}

export function renameIcon(color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 512 512" fill="${color}"><path d="M345.994,42.019,179.531,208.481A646.3,646.3,0,0,0,25.325,456.521a24.845,24.845,0,0,0,6,25.708l.087.087a24.84,24.84,0,0,0,17.611,7.342,25.172,25.172,0,0,0,8.1-1.344,646.283,646.283,0,0,0,248.04-154.207L471.62,167.646A88.831,88.831,0,0,0,345.994,42.019ZM282.531,311.48A614.445,614.445,0,0,1,60.419,453.221,614.435,614.435,0,0,1,202.158,231.108l99.162-99.161,80.372,80.372ZM448.993,145.019l-44.674,44.673L323.947,109.32l44.674-44.674a56.832,56.832,0,1,1,80.372,80.373Z"/></svg>`;
}

export function trashIcon(color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="${color}" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><line x1="4" y1="7" x2="20" y2="7"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12"/><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3"/></svg>`;
}

export function yesIcon(color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 48 48" fill="${color}"><polygon points="40.6,12.1 17,35.7 7.4,26.1 4.6,29 17,41.3 43.4,14.9"/></svg>`;
}

export function plusIcon(color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
}

export function helpIcon(color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="${color}"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/><path d="M5.255 5.786a.237.237 0 0 0 .241.247h.825c.138 0 .248-.113.266-.25.09-.656.54-1.134 1.342-1.134.686 0 1.314.343 1.314 1.168 0 .635-.374.927-.965 1.371-.673.489-1.206 1.06-1.168 1.987l.003.217a.25.25 0 0 0 .25.246h.811a.25.25 0 0 0 .25-.25v-.105c0-.718.273-.927 1.01-1.486.609-.463 1.244-.977 1.244-2.056 0-1.511-1.276-2.241-2.673-2.241-1.267 0-2.655.59-2.75 2.286zm1.557 5.763c0 .533.425.927 1.01.927.609 0 1.028-.394 1.028-.927 0-.552-.42-.94-1.029-.94-.584 0-1.009.388-1.009.94z"/></svg>`;
}

/**
 * Category collapse/expand arrow (from addon/content/icons/arrow.svg).
 *
 * Unlike the other icons this one uses `currentColor` instead of a color
 * parameter: the chevron's color is driven by CSS (`color: #6C6C6C`, with a
 * `#A2A2A2` override inside the dark-mode @media block), so theme switching
 * stays pure CSS and needs no re-render.
 *
 * The source file's group/matrix transforms are folded into the path
 * coordinates, so the chevron (a right-pointing ">") sits centered in the
 * 159x159 viewBox. Rotate via CSS for the expanded (down) state.
 */
export function arrowIcon(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="6.5" height="6.5" viewBox="0 0 159 159" fill="none" stroke="currentColor" stroke-width="12.6042" stroke-linecap="round" stroke-miterlimit="8"><path d="M6.5 6.5 152.142 79.32"/><path d="M6.5 152.32 152.142 79.4988"/></svg>`;
}

/** Tab-bar glyph used by the "hide/show native tabs" more-menu entry. */
export function tabsIcon(color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="${color}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12V5.5a2 2 0 0 1 2-2h2.6l1.4 2h3a2 2 0 0 1 2 2V12"/><line x1="1.5" y1="12.5" x2="14.5" y2="12.5"/></svg>`;
}
