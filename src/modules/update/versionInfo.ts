/**
 * 版本信息：线上最新 release ↔ 本地版本。
 *
 * - 结果缓存进 prefs，24h 内不重复联网；
 * - 手动刷新（force）绕过节流；
 * - 失败只返回 error 状态，保留缓存；
 * - 状态变化时向所有主窗口广播 `vertical-tabs:update-state-changed`，
 *   侧边栏「⋯」红点靠它刷新；
 * - 启动后延迟检查（`scheduleStartupUpdateCheck`），不拖启动。
 */

import { version as PLUGIN_VERSION } from "../../../package.json";
import { dispatchVtEvent } from "../core/events";
import { getPref, setPref } from "../../utils/prefs";

const REPO = "LightWindW/zotero-better-vertical-tabs";
const LATEST_RELEASE_API = `https://api.github.com/repos/${REPO}/releases/latest`;
const RELEASES_PAGE = `https://github.com/${REPO}/releases`;

/** 自动检查的最小间隔（24h）。 */
export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** 同上，以分钟为单位存进 pref（int pref 只有 32 位，毫秒时间戳会被截断）。 */
const CHECK_INTERVAL_MINUTES = 24 * 60;
/** 启动后延迟检查的时间，避开 Zotero 起动高峰。 */
export const STARTUP_CHECK_DELAY_MS = 5000;

export const UPDATE_STATE_EVENT = "vertical-tabs:update-state-changed";

/** 状态条可能展示的最终状态（checking 由 UI 本地维护）。 */
export type VersionState = "idle" | "latest" | "outdated" | "error";

export interface VersionStatus {
  state: VersionState;
  /** 线上最新版本，已去掉前导 v；未检查过时为空串 */
  latestVersion: string;
  releaseUrl: string;
  /** 最新 release 里 xpi 资产的下载地址；没有时为空串 */
  downloadUrl: string;
  /** 上次成功检查的毫秒时间戳；0 = 从未检查 */
  checkedAt: number;
}

export { PLUGIN_VERSION, RELEASES_PAGE };

function normalizeVersion(raw: string): string {
  return raw.trim().replace(/^v/i, "");
}

/** 比较两个版本号；非法版本返回 null。 */
function compareVersions(latest: string): number | null {
  try {
    return Zotero.Utilities.semverCompare(latest, PLUGIN_VERSION);
  } catch {
    return null;
  }
}

function deriveState(latestVersion: string): VersionState {
  if (!latestVersion) return "idle";
  const result = compareVersions(latestVersion);
  if (result === null) return "idle";
  return result > 0 ? "outdated" : "latest";
}

/** 只读缓存，不联网。主窗口红点/首选项状态条都走这里。 */
export function getCachedStatus(): VersionStatus {
  const latestVersion = normalizeVersion(getPref("versionCheck.latestVersion"));
  const releaseUrl = getPref("versionCheck.latestReleaseUrl") || RELEASES_PAGE;
  const downloadUrl = getPref("versionCheck.latestDownloadUrl") || "";
  const checkedAt = getLastCheckMinutes() * 60 * 1000;
  return {
    state: deriveState(latestVersion),
    latestVersion,
    releaseUrl,
    downloadUrl,
    checkedAt,
  };
}

/**
 * 上次检查时间以「分钟」存：int pref 只有 32 位，直接存 `Date.now()` 会溢出成
 * 负数，导致 24h 节流永远判定「已到期」。分钟级精度对 24h 节流绰绰有余。
 */
function getLastCheckMinutes(): number {
  const value = getPref("versionCheck.lastCheckMinutes");
  return typeof value === "number" && value > 0 ? value : 0;
}

/** 是否已过自动检查间隔。 */
export function isCheckDue(): boolean {
  return Date.now() / 60000 - getLastCheckMinutes() >= CHECK_INTERVAL_MINUTES;
}

/** 向所有主窗口广播状态，侧边栏红点据此刷新。 */
function broadcastStatus(status: VersionStatus): void {
  for (const win of Zotero.getMainWindows()) {
    dispatchVtEvent(win.document, UPDATE_STATE_EVENT, status);
  }
}

let inFlight: Promise<VersionStatus> | null = null;

/**
 * 检查最新版本。`force = true` 时忽略 24h 节流（刷新按钮）。
 * 并发调用共用同一个请求。
 */
export function checkLatestVersion(force = false): Promise<VersionStatus> {
  if (inFlight) return inFlight;
  const cached = getCachedStatus();
  if (!force && !isCheckDue()) return Promise.resolve(cached);

  inFlight = requestLatestRelease()
    .then((status) => {
      inFlight = null;
      broadcastStatus(status);
      return status;
    })
    .catch((error) => {
      inFlight = null;
      ztoolkit.log("Version check failed:", error);
      const status: VersionStatus = { ...cached, state: "error" as const };
      broadcastStatus(status);
      return status;
    });
  return inFlight;
}

let startupCheckTimer: ReturnType<typeof setTimeout> | null = null;

/** 启动后延迟检查一次（节流内不联网）。 */
export function scheduleStartupUpdateCheck(): void {
  if (startupCheckTimer) return;
  startupCheckTimer = setTimeout(() => {
    startupCheckTimer = null;
    try {
      if (!isCheckDue()) return;
      void checkLatestVersion(false);
    } catch (error) {
      ztoolkit.log("Startup version check failed:", error);
    }
  }, STARTUP_CHECK_DELAY_MS);
}

async function requestLatestRelease(): Promise<VersionStatus> {
  const xhr = await Zotero.HTTP.request("GET", LATEST_RELEASE_API, {
    responseType: "json",
    timeout: 10000,
    noCache: true,
    headers: { Accept: "application/vnd.github+json" },
  });
  const data = xhr.response as {
    tag_name?: unknown;
    html_url?: unknown;
    assets?: unknown;
  } | null;
  const tag =
    typeof data?.tag_name === "string" ? normalizeVersion(data.tag_name) : "";
  if (!tag) throw new Error("GitHub release has no valid tag_name");
  const comparison = compareVersions(tag);
  if (comparison === null) throw new Error(`Invalid release version: ${tag}`);

  const checkedAt = Date.now();
  const releaseUrl =
    typeof data?.html_url === "string" ? data.html_url : RELEASES_PAGE;
  const downloadUrl = pickXpiDownloadUrl(data?.assets);
  const status: VersionStatus = {
    state: comparison > 0 ? "outdated" : "latest",
    latestVersion: tag,
    releaseUrl,
    downloadUrl,
    checkedAt,
  };
  setPref("versionCheck.lastCheckMinutes", Math.floor(checkedAt / 60000));
  setPref("versionCheck.latestVersion", tag);
  setPref("versionCheck.latestReleaseUrl", releaseUrl);
  setPref("versionCheck.latestDownloadUrl", downloadUrl);
  return status;
}

function pickXpiDownloadUrl(assets: unknown): string {
  if (!Array.isArray(assets)) return "";
  for (const asset of assets) {
    if (!asset || typeof asset !== "object") continue;
    const candidate = asset as {
      name?: unknown;
      browser_download_url?: unknown;
    };
    if (
      typeof candidate.name === "string" &&
      /\.xpi$/i.test(candidate.name) &&
      typeof candidate.browser_download_url === "string"
    ) {
      return candidate.browser_download_url;
    }
  }
  return "";
}
