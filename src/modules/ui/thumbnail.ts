const THUMBNAIL_SCALE = 0.25;
const JPEG_QUALITY = 0.7;

interface PDFViewerApplicationLike {
  pdfViewer?: {
    currentPageNumber: number;
    pdfDocument?: _ZoteroTypes.Reader.PDFDocumentProxy;
  };
}

interface PDFViewerWindowLike extends Window {
  PDFViewerApplication?: PDFViewerApplicationLike;
}

function getPDFViewer(
  reader: _ZoteroTypes.ReaderInstance,
): PDFViewerApplicationLike["pdfViewer"] | null {
  const primaryView = reader._internalReader?._primaryView as
    | _ZoteroTypes.Reader.PDFView
    | undefined;
  const iframeWindow = primaryView?._iframeWindow as
    | PDFViewerWindowLike
    | undefined;
  return iframeWindow?.PDFViewerApplication?.pdfViewer ?? null;
}

export async function getCurrentPageThumbnail(
  tabId: string,
): Promise<string | null> {
  try {
    const reader = Zotero.Reader.getByTabID(tabId);
    if (!reader) {
      ztoolkit.log("[vt-thumb] no reader for tab " + tabId);
      return null;
    }

    const win = reader._window;
    if (!win) {
      ztoolkit.log("[vt-thumb] reader has no _window");
      return null;
    }

    // Access PDFViewerApplication via the reader's iframe window
    const iframeDoc = win.document;
    const iframeWin = iframeDoc?.defaultView as any;
    const pdfApp = iframeWin?.PDFViewerApplication;
    if (!pdfApp?.pdfViewer) {
      ztoolkit.log(
        "[vt-thumb] PDFViewerApplication not found, keys=" +
          (iframeWin
            ? Object.keys(iframeWin)
                .filter((k) => k.includes("PDF"))
                .join(",")
            : "no iframeWin"),
      );
      return null;
    }

    const pdfViewer = pdfApp.pdfViewer;
    const pageNumber = pdfViewer.currentPageNumber;
    const pdfDocument = pdfViewer.pdfDocument;
    if (!pdfDocument || pageNumber < 1) {
      ztoolkit.log(
        "[vt-thumb] no pdfDocument or invalid pageNumber=" + pageNumber,
      );
      return null;
    }

    const page = await pdfDocument.getPage(pageNumber);
    const viewport = page.getViewport({ scale: THUMBNAIL_SCALE });

    const canvas = win.document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "canvas",
    ) as HTMLCanvasElement;
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const context = canvas.getContext("2d") as CanvasRenderingContext2D | null;
    if (!context) return null;

    await page.render({
      canvasContext: context,
      canvas,
      viewport,
    }).promise;
    return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  } catch (error) {
    ztoolkit.log("[vt-thumb] error: " + String(error));
    return null;
  }
}

export async function getItemThumbnail(itemId: number): Promise<string | null> {
  try {
    // Zotero_Tabs is a Window property in Zotero 8+, not a global
    const win = Zotero.getMainWindows()[0] as
      | _ZoteroTypes.MainWindow
      | undefined;
    const tabs = win?.Zotero_Tabs;
    const tabId = tabs?.getTabIDByItemID(itemId);
    if (!tabId) return null;
    return await getCurrentPageThumbnail(tabId);
  } catch (error) {
    ztoolkit.log("Failed to get item thumbnail:", error);
    return null;
  }
}
