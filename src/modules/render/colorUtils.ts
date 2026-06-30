/**
 * 颜色工具模块 — 深浅色转换
 *
 * 将 functionC.py 的 light_to_dark() 用 TypeScript 完整移植。
 * 算法：HEX → RGB → HSL → 明度/饱和度变换 → RGB → HEX
 *
 * also exports dark-mode detection & real-time watching helpers.
 */

// ── HEX ↔ RGB (0-1) ──

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16) / 255,
    parseInt(h.substring(2, 4), 16) / 255,
    parseInt(h.substring(4, 6), 16) / 255,
  ];
}

// ── RGB (0-1) ↔ HSL ──

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const M = Math.max(r, g, b);
  const m = Math.min(r, g, b);
  const C = M - m;
  const L = (M + m) / 2;

  let H = 0;
  let S = 0;

  if (C !== 0) {
    S = C / (1 - Math.abs(2 * L - 1));

    if (M === r) {
      H = 60 * (((g - b) / C) % 6);
    } else if (M === g) {
      H = 60 * ((b - r) / C + 2);
    } else {
      H = 60 * ((r - g) / C + 4);
    }
  }

  if (H < 0) H += 360;

  return [H, S, L];
}

function hslToRgb(H: number, S: number, L: number): [number, number, number] {
  const C = S * (1 - Math.abs(2 * L - 1));
  const X = C * (1 - Math.abs(((H / 60) % 2) - 1));
  const m = L - C / 2;

  let R1: number, G1: number, B1: number;

  if (H < 60) {
    [R1, G1, B1] = [C, X, 0];
  } else if (H < 120) {
    [R1, G1, B1] = [X, C, 0];
  } else if (H < 180) {
    [R1, G1, B1] = [0, C, X];
  } else if (H < 240) {
    [R1, G1, B1] = [0, X, C];
  } else if (H < 300) {
    [R1, G1, B1] = [X, 0, C];
  } else {
    [R1, G1, B1] = [C, 0, X];
  }

  return [(R1 + m) * 255, (G1 + m) * 255, (B1 + m) * 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const hex = (v: number) =>
    clamp(v).toString(16).padStart(2, "0").toUpperCase();
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

// ── 浅色 → 深色 ──

/**
 * 将浅色 HEX 转换为深色 HEX。
 * 参数与 functionC.py 保持一致：
 *   base      = 0.20  明度下限
 *   scale     = 0.35  明度压缩率
 *   sat_boost = 1.30  饱和度增益
 */
export function lightToDark(
  hex: string,
  base: number = 0.2,
  scale: number = 0.35,
  satBoost: number = 1.3,
): string {
  const [r, g, b] = hexToRgb(hex);
  const [H, S, L] = rgbToHsl(r, g, b);

  const Lnew = base + (1.0 - L) * scale;
  const Snew = Math.min(S * satBoost, 1.0);

  const [R, G, B] = hslToRgb(H, Snew, Lnew);
  return rgbToHex(R, G, B);
}

// ── 深色模式检测 ──

/**
 * 返回指定文档当前是否处于深色模式。
 * 在 Reader 沙箱上下文中同样有效。
 */
export function isDarkMode(doc: Document): boolean {
  try {
    const mq = doc.defaultView?.matchMedia("(prefers-color-scheme: dark)");
    return mq?.matches ?? false;
  } catch {
    return false;
  }
}

/**
 * 注册深色模式监听器。
 * 回调参数 `isDark` 标识当前状态。
 * 返回 `() => void` 用于注销。
 * 若 doc 不可用则返回空函数。
 */
export function watchDarkMode(
  doc: Document,
  callback: (isDark: boolean) => void,
): () => void {
  try {
    const mq = doc.defaultView?.matchMedia("(prefers-color-scheme: dark)");
    if (!mq) return () => {};

    const handler = (e: MediaQueryListEvent) => callback(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  } catch {
    return () => {};
  }
}

// ── 右键菜单/上下文菜单配色 ──

export interface ContextMenuColors {
  background: string;
  solidBackground: string;
  border: string;
  solidBorder: string;
  text: string;
  shadow: string;
  hoverBg: string;
  swatchBorder: string;
  swatchBorderSelected: string;
  backdropFilter: string;
}

/**
 * 根据当前文档的主题返回右键菜单配色方案。
 * 浅色模式遵循 Zotero 原生菜单风格，深色模式使用反相配色。
 */
export function getContextMenuColors(doc: Document): ContextMenuColors {
  if (isDarkMode(doc)) {
    return {
      background: "rgba(42, 42, 42, 0.5)",
      solidBackground: "#2a2a2a",
      border: "1px solid rgba(85, 85, 85, 0.5)",
      solidBorder: "1px solid #555",
      text: "#eee",
      shadow: "0 2px 8px rgba(0,0,0,0.3)",
      hoverBg: "rgba(255,255,255,0.08)",
      swatchBorder: "1px solid #666",
      swatchBorderSelected: "1.5px solid #aaa",
      backdropFilter: "blur(20px)",
    };
  }
  return {
    background: "rgba(242, 242, 242, 0.5)",
    solidBackground: "#f2f2f2",
    border: "1px solid rgba(182, 182, 182, 0.5)",
    solidBorder: "1px solid #b6b6b6",
    text: "#333",
    shadow: "0 2px 8px rgba(0,0,0,0.12)",
    hoverBg: "rgba(0,0,0,0.06)",
    swatchBorder: "1px solid #999",
    swatchBorderSelected: "1.5px solid #6C6C6C",
    backdropFilter: "blur(20px)",
  };
}
