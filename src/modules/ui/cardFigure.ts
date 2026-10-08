import { dispatchVtEvent } from "../core/events";

const CARD_FIGURES_DIR = "cardFigs";
let nativeScreenshotUnavailableLogged = false;

function getFiguresDirectory(): string {
  return PathUtils.join(Zotero.getStorageDirectory().path, CARD_FIGURES_DIR);
}

function getFigurePath(itemId: number): string {
  return PathUtils.join(getFiguresDirectory(), `${itemId}.png`);
}

/** Return the stable ID used by card figures. */
export function getCardFigureItemId(
  itemId: number,
  knownParentItemId?: number,
): number {
  let item: Zotero.Item | false | undefined;
  try {
    item = Zotero.Items.get(itemId) as Zotero.Item | false;
    if (
      item &&
      typeof item.isAttachment === "function" &&
      item.isAttachment() &&
      typeof item.parentItemID === "number" &&
      item.parentItemID > 0
    ) {
      return item.parentItemID;
    }
  } catch (error) {
    ztoolkit.log("Failed to resolve card figure item:", error);
  }
  // The tab tracker may know an attachment's parent even while Zotero's item
  // cache is unavailable. Never apply this fallback to a successfully loaded
  // note or ordinary item, whose own ID is the stable key.
  if (!item && knownParentItemId && knownParentItemId > 0) {
    return knownParentItemId;
  }
  return itemId;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function dataUrlToBytes(dataUrl: string): Uint8Array | null {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  try {
    const binary = atob(dataUrl.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function isPng(bytes: Uint8Array): boolean {
  if (bytes.length < 24) return false;
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < signature.length; i++) {
    if (bytes[i] !== signature[i]) return false;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getUint32(16) > 0 && view.getUint32(20) > 0;
}

async function normalizeScreenshot(value: unknown): Promise<Uint8Array | null> {
  if (typeof value === "string") {
    return value.startsWith("data:image/") ? dataUrlToBytes(value) : null;
  }
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (
    typeof Blob !== "undefined" &&
    value instanceof Blob &&
    typeof value.arrayBuffer === "function"
  ) {
    return new Uint8Array(await value.arrayBuffer());
  }

  const candidate = value as {
    bytes?: unknown;
    data?: unknown;
    dataURL?: unknown;
    dataUrl?: unknown;
    image?: unknown;
  } | null;
  if (!candidate) return null;
  for (const key of ["bytes", "data", "dataURL", "dataUrl", "image"] as const) {
    if (candidate[key] === undefined) continue;
    const result = await normalizeScreenshot(candidate[key]);
    if (result) return result;
  }
  return null;
}

async function tryNativeScreenshot(win: Window): Promise<Uint8Array | null> {
  try {
    const importESModule = (globalThis as any).ChromeUtils?.importESModule;
    if (typeof importESModule !== "function") return null;
    const module = importESModule(
      "resource:///modules/ScreenshotsUtils.sys.mjs",
    );
    const capture =
      module?.captureScreenshot || module?.ScreenshotsUtils?.captureScreenshot;
    if (typeof capture !== "function") return null;
    const result = await capture(win);
    const bytes = await normalizeScreenshot(result);
    return bytes && isPng(bytes) ? bytes : null;
  } catch (error) {
    if (!nativeScreenshotUnavailableLogged) {
      nativeScreenshotUnavailableLogged = true;
      ztoolkit.log(
        "Native card screenshot unavailable; using selection fallback:",
        error,
      );
    }
    return null;
  }
}

function captureWithSelection(doc: Document): Promise<Uint8Array | null> {
  const win = doc.defaultView;
  if (!win) return Promise.resolve(null);

  return new Promise((resolve) => {
    const overlay = doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    ) as HTMLElement;
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:2147483647;cursor:crosshair;background:rgba(0,0,0,.08);";
    const selection = doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    ) as HTMLElement;
    selection.style.cssText =
      "position:fixed;border:2px solid #4a90e2;background:rgba(74,144,226,.15);display:none;pointer-events:none;box-sizing:border-box;";
    overlay.appendChild(selection);
    doc.documentElement?.appendChild(overlay);

    let startX = 0;
    let startY = 0;
    let dragging = false;
    let finished = false;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish(null);
    };
    const finish = (bytes: Uint8Array | null) => {
      if (finished) return;
      finished = true;
      win.removeEventListener("keydown", onKeyDown, true);
      overlay.remove();
      resolve(bytes);
    };
    const cancel = () => finish(null);
    const updateSelection = (x: number, y: number) => {
      selection.style.left = `${Math.min(startX, x)}px`;
      selection.style.top = `${Math.min(startY, y)}px`;
      selection.style.width = `${Math.abs(x - startX)}px`;
      selection.style.height = `${Math.abs(y - startY)}px`;
    };

    win.addEventListener("keydown", onKeyDown, true);
    overlay.addEventListener("mousedown", (event: MouseEvent) => {
      if (event.button !== 0) return;
      startX = event.clientX;
      startY = event.clientY;
      dragging = true;
      selection.style.display = "block";
      updateSelection(startX, startY);
    });
    overlay.addEventListener("mousemove", (event: MouseEvent) => {
      if (dragging) updateSelection(event.clientX, event.clientY);
    });
    overlay.addEventListener("mouseup", (event: MouseEvent) => {
      if (!dragging) return;
      dragging = false;
      const x = Math.min(startX, event.clientX);
      const y = Math.min(startY, event.clientY);
      const width = Math.abs(event.clientX - startX);
      const height = Math.abs(event.clientY - startY);
      if (width < 4 || height < 4) {
        cancel();
        return;
      }
      try {
        const canvas = doc.createElementNS(
          "http://www.w3.org/1999/xhtml",
          "canvas",
        ) as HTMLCanvasElement;
        canvas.width = Math.round(width);
        canvas.height = Math.round(height);
        const context = canvas.getContext(
          "2d",
        ) as CanvasRenderingContext2D | null;
        const drawWindow = (context as any)?.drawWindow;
        if (!context || typeof drawWindow !== "function") {
          cancel();
          return;
        }
        overlay.style.visibility = "hidden";
        drawWindow.call(context, win, x, y, width, height, "#fff");
        const bytes = dataUrlToBytes(canvas.toDataURL("image/png"));
        finish(bytes && isPng(bytes) ? bytes : null);
      } catch (error) {
        ztoolkit.log("Card selection screenshot failed:", error);
        cancel();
      }
    });
    overlay.addEventListener("contextmenu", (event: MouseEvent) => {
      event.preventDefault();
      cancel();
    });
  });
}

async function savePng(itemId: number, bytes: Uint8Array): Promise<void> {
  const directory = getFiguresDirectory();
  await IOUtils.makeDirectory(directory, {
    createAncestors: true,
    ignoreExisting: true,
  });
  const path = getFigurePath(getCardFigureItemId(itemId));
  await IOUtils.write(path, bytes);
  const written = await IOUtils.read(path);
  if (!isPng(written)) throw new Error("Saved card figure is not a valid PNG");
}

export async function getCardFigureDataUrl(
  itemId: number,
): Promise<string | null> {
  const path = getFigurePath(getCardFigureItemId(itemId));
  try {
    if (!(await IOUtils.exists(path))) return null;
    const bytes = await IOUtils.read(path);
    if (!isPng(bytes)) return null;
    return `data:image/png;base64,${bytesToBase64(bytes)}`;
  } catch (error) {
    ztoolkit.log("Failed to read card figure:", error);
    return null;
  }
}

export async function hasCardFigure(itemId: number): Promise<boolean> {
  if (!Number.isInteger(itemId) || itemId <= 0) return false;
  const path = getFigurePath(getCardFigureItemId(itemId));
  try {
    return await IOUtils.exists(path);
  } catch (error) {
    ztoolkit.log("Failed to check card figure:", error);
    return false;
  }
}

export async function deleteCardFigure(itemId: number): Promise<boolean> {
  if (!Number.isInteger(itemId) || itemId <= 0) return false;
  const path = getFigurePath(getCardFigureItemId(itemId));
  try {
    if (await IOUtils.exists(path)) await IOUtils.remove(path);
    return true;
  } catch (error) {
    ztoolkit.log("Failed to delete card figure:", error);
    return false;
  }
}

export async function clearCardFigures(): Promise<number[]> {
  const ids: number[] = [];
  try {
    const paths = await IOUtils.getChildren(getFiguresDirectory());
    for (const path of paths) {
      if (!path.toLowerCase().endsWith(".png")) continue;
      const name = PathUtils.filename(path);
      const id = Number(name.slice(0, -4));
      if (Number.isInteger(id) && id > 0) ids.push(id);
      try {
        await IOUtils.remove(path);
      } catch (error) {
        ztoolkit.log("Failed to remove card figure:", error);
      }
    }
  } catch (error) {
    if ((error as any)?.name !== "NotFoundError") {
      ztoolkit.log("Failed to list card figures:", error);
    }
  }
  return ids;
}

export async function captureCardFigure(
  doc: Document,
  itemId: number,
): Promise<boolean> {
  if (!doc.defaultView || !Number.isInteger(itemId) || itemId <= 0) {
    return false;
  }
  try {
    const bytes =
      (await tryNativeScreenshot(doc.defaultView)) ||
      (await captureWithSelection(doc));
    if (!bytes || !isPng(bytes)) {
      ztoolkit.log("Card figure capture returned no valid PNG");
      return false;
    }
    const stableItemId = getCardFigureItemId(itemId);
    await savePng(stableItemId, bytes);
    dispatchVtEvent(doc, "vertical-tabs:card-figure-updated", {
      itemId: stableItemId,
    });
    return true;
  } catch (error) {
    ztoolkit.log("Failed to capture card figure:", error);
    return false;
  }
}
