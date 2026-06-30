/**
 * 弹窗磨砂/背景降级工具
 *
 * 集中处理所有自定义弹窗的背景、边框、阴影与 backdrop-filter 策略：
 * - 主页面 + 支持 backdrop-filter：半透明背景 + blur
 * - reader 页面 + 支持 backdrop-filter：更浓半透明 fallback（跨 browser 边界真正模糊受限）
 * - 不支持 backdrop-filter 或用户手动禁用：纯色不透明背景
 */

import { config } from "../../../package.json";
import { getContextMenuColors, isDarkMode } from "./colorUtils";

const PREF_NAMESPACE = config.prefsPrefix;

/**
 * 检测当前运行时是否支持 CSS backdrop-filter。
 * 旧版 Zotero（如基于 Firefox 60 ESR 的 Zotero 6）通常不支持。
 */
export function isBackdropFilterSupported(doc: Document): boolean {
  try {
    const win = doc.defaultView;
    if (!win) return false;
    return win.CSS.supports("backdrop-filter", "blur(1px)");
  } catch {
    return false;
  }
}

/**
 * 用户是否启用了磨砂效果。
 */
export function isBlurEnabledByUser(): boolean {
  try {
    return Zotero.Prefs.get(
      `${PREF_NAMESPACE}.verticalTabs.enableBlur`,
      false,
    ) as boolean;
  } catch {
    return false;
  }
}

/**
 * 判断当前活动 tab 是否为 reader。
 */
export function isReaderActive(): boolean {
  try {
    const win = Zotero.getMainWindows()[0] as
      | _ZoteroTypes.MainWindow
      | undefined;
    const ztabs = win?.Zotero_Tabs;
    if (!ztabs) return false;
    return ztabs.selectedType === "reader";
  } catch {
    return false;
  }
}

export interface PopupStyleOptions {
  /** 弹窗类型，决定默认模糊半径与背景不透明度。 */
  kind?: "menu" | "hover" | "dialog";
  /** 额外追加到 cssText 的样式，优先级高于工具生成的样式。 */
  extra?: string;
}

interface ResolvedColors {
  background: string;
  border: string;
  text: string;
  shadow: string;
  backdropFilter: string;
}

function resolveColors(
  doc: Document,
  kind: NonNullable<PopupStyleOptions["kind"]>,
): ResolvedColors {
  const base = getContextMenuColors(doc);
  const dark = isDarkMode(doc);
  const readerAlpha = 0.9;
  const blurRadius = kind === "hover" ? "12px" : "20px";

  // Dialogs should always be opaque for readability.
  if (kind === "dialog") {
    return {
      background: base.solidBackground,
      border: base.solidBorder,
      text: base.text,
      shadow: base.shadow,
      backdropFilter: "none",
    };
  }

  // Reader fallback: same hue, higher opacity so the card still looks "frosted"
  // when backdrop-filter cannot blur the <browser> layer beneath it.
  const readerBg = dark
    ? `rgba(42, 42, 42, ${readerAlpha})`
    : `rgba(242, 242, 242, ${readerAlpha})`;

  const supported = isBackdropFilterSupported(doc);
  const enabled = isBlurEnabledByUser();
  const reader = isReaderActive();

  if (!supported || !enabled) {
    return {
      background: base.solidBackground,
      border: base.solidBorder,
      text: base.text,
      shadow: base.shadow,
      backdropFilter: "none",
    };
  }

  if (reader) {
    return {
      background: base.solidBackground,
      border: base.solidBorder,
      text: base.text,
      shadow: base.shadow,
      backdropFilter: "none",
    };
  }

  return {
    background: base.background,
    border: base.border,
    text: base.text,
    shadow: base.shadow,
    backdropFilter: `blur(${blurRadius})`,
  };
}

/**
 * 返回可直接赋值给 element.style.cssText 的弹窗公共样式字符串。
 * 包含 background、border、box-shadow、backdrop-filter、color、border-radius、font-size。
 * 调用方仍需自行设置 position / left / top / width / z-index / padding 等尺寸与位置样式。
 */
export function getPopupColors(
  doc: Document,
  kind: NonNullable<PopupStyleOptions["kind"]> = "menu",
): ResolvedColors {
  return resolveColors(doc, kind);
}

export function getPopupStyleSheet(
  doc: Document,
  options: PopupStyleOptions = {},
): string {
  const { kind = "menu", extra = "" } = options;
  const colors = resolveColors(doc, kind);

  return `
    background: ${colors.background};
    border: ${colors.border};
    border-radius: ${kind === "dialog" ? "8px" : "6px"};
    box-shadow: ${colors.shadow};
    ${colors.backdropFilter === "none" ? "" : `backdrop-filter: ${colors.backdropFilter};`}
    ${colors.backdropFilter === "none" ? "" : `-webkit-backdrop-filter: ${colors.backdropFilter};`}
    color: ${colors.text};
    font-size: 13px;
    ${extra}
  `.trim();
}

/**
 * 返回导入对话框的完整背景样式字符串（不含位置/尺寸）。
 */
export function getDialogStyleSheet(doc: Document): string {
  return getPopupStyleSheet(doc, {
    kind: "dialog",
    extra:
      "min-width: 400px; max-width: 500px; max-height: 500px; display: flex; flex-direction: column; overflow: hidden;",
  });
}

/**
 * 返回 hover card 的完整背景样式字符串（不含位置/尺寸）。
 */
export function getHoverCardStyleSheet(doc: Document): string {
  return getPopupStyleSheet(doc, {
    kind: "hover",
    extra:
      "width: 320px; padding: 12px; pointer-events: none; transition: opacity 0.15s ease-out, left 0.1s ease-out, top 0.1s ease-out, width 0.25s ease-out, height 0.25s ease-out;",
  });
}
