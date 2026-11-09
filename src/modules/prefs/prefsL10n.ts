/**
 * 预置窗口的动态文案助手。
 *
 * preferences.ftl 由 xhtml 片段里的 <linkset> 注册到该窗口的 document.l10n；
 * 静态节点可用 data-l10n-id，但状态条/弹层是运行时构建的，所以这里在初始化时
 * 一次性预载需要的 id，之后同步读取。
 *
 * 注意：构建期会把插件 FTL 的消息 id 统一加上 `${addonRef}-` 前缀（与
 * data-l10n-id 的处理一致），所以这里查表时必须自己补前缀——脚本里仍写
 * ftl 文件中的原始 id，便于对照。
 */

import { config } from "../../../package.json";

/** 状态条与弹层用到的全部文案 id（写 ftl 原文，不带前缀）。 */
export const PREFS_STRING_IDS = [
  "pref-version-refresh",
  "pref-version-latest",
  "pref-version-checking",
  "pref-version-outdated",
  "pref-version-error",
  "pref-changelog-open",
  "pref-features-open",
  "pref-changelog-title",
  "pref-changelog-close",
  "pref-changelog-current",
  "pref-changelog-type-new",
  "pref-changelog-type-optimize",
  "pref-changelog-type-fix",
  "pref-changelog-full",
  "pref-changelog-last-checked",
  "pref-changelog-never-checked",
  "pref-changelog-empty",
  "pref-changelog-new-version-hint",
  "pref-version-update-hint",
  "pref-version-downloading",
  "pref-version-installing",
  "pref-version-update-error",
  "pref-version-updated",
  "pref-version-update-manual",
  "pref-version-network-delay",
] as const;

export class PrefsL10n {
  private readonly doc: Document;
  private readonly strings = new Map<string, string>();

  constructor(doc: Document) {
    this.doc = doc;
  }

  /** ftl 原始 id → 运行时消息 id。 */
  private key(id: string): string {
    return `${config.addonRef}-${id}`;
  }

  /** 预载一批文案；失败的 id 在 get() 时回落到 id 本身。 */
  async load(ids: readonly string[]): Promise<void> {
    const l10n = this.doc.l10n;
    if (!l10n) return;
    try {
      const values = await l10n.formatValues(
        ids.map((id) => ({ id: this.key(id) })),
      );
      ids.forEach((id, index) => {
        const value = values[index];
        if (value) this.strings.set(id, value);
      });
    } catch (error) {
      ztoolkit.log("Prefs: failed to load localized strings", error);
    }
  }

  get(id: string): string {
    return this.strings.get(id) ?? this.key(id);
  }

  /** 带参数的文案（如「上次检查 { $time }」）。 */
  async format(
    id: string,
    args: Record<string, string | number>,
  ): Promise<string> {
    const l10n = this.doc.l10n;
    if (!l10n) return this.get(id);
    try {
      const values = await l10n.formatValues([{ id: this.key(id), args }]);
      return values[0] || this.get(id);
    } catch {
      return this.get(id);
    }
  }
}
