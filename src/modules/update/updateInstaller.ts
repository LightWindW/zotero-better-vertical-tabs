/**
 * 一键更新：下载最新 release 的 xpi，交给 AddonManager 安装。
 *
 * 时序说明：Zotero 的 addon listener 会在安装开始时 shutdown 旧插件、安装
 * 完成后 startup 新插件（热重载），所以"安装成功"回调很可能来不及在新代码
 * 生效前执行。调用方不要依赖成功回调：首选项窗口会随新插件重新注册面板
 * 自动刷新，这里只负责下载、安装和失败上报。
 *
 * 失败分级：
 * - `network-delay`：下载超过 5 分钟（XHR timeout）→ UI 提示"网络延迟，请稍后重试"
 * - `download-failed`：HTTP 4xx/5xx、断网、空响应等
 * - `install-failed`：AddonManager 拒绝安装/安装失败
 *
 * 注意 `errorDelayMax: 0`：Zotero.HTTP.request 默认会对 5xx 自动重试（最长 1
 * 小时），GitHub release 端点返回 504 时会让进度条一直停在 100%（每次重试
 * 下载的是 92 字节错误页），必须关掉。
 */

import { getCachedStatus } from "./versionInfo";

export type UpdatePhase = "downloading" | "installing";

export type UpdateErrorReason =
  | "network-delay"
  | "download-failed"
  | "install-failed";

export interface UpdateProgress {
  onPhase?: (phase: UpdatePhase) => void;
  onDownloadProgress?: (received: number, total: number) => void;
  onError?: (reason: UpdateErrorReason) => void;
}

/** 下载总时长上限：超过视为网络延迟。 */
const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;

interface AddonInstallLike {
  addListener(listener: {
    onInstallEnded?: () => void;
    onInstallFailed?: () => void;
    onDownloadFailed?: () => void;
  }): void;
  install(): void;
}

interface AddonManagerLike {
  getInstallForFile(
    file: unknown,
    mimetype?: string,
  ): Promise<AddonInstallLike | null>;
}

class UpdateFailure extends Error {
  readonly reason: UpdateErrorReason;

  constructor(reason: UpdateErrorReason) {
    super(reason);
    this.reason = reason;
  }
}

let updating = false;

export function isUpdateInProgress(): boolean {
  return updating;
}

export async function installLatestRelease(
  progress: UpdateProgress = {},
): Promise<void> {
  if (updating) return;
  const status = getCachedStatus();
  if (status.state !== "outdated") return;
  if (!status.downloadUrl) {
    progress.onError?.("download-failed");
    return;
  }
  updating = true;
  try {
    progress.onPhase?.("downloading");
    const bytes = await downloadXpi(status.downloadUrl, progress);
    progress.onPhase?.("installing");
    await installXpi(bytes);
  } catch (error) {
    ztoolkit.log("Plugin update failed:", error);
    progress.onError?.(classifyError(error));
  } finally {
    updating = false;
  }
}

function classifyError(error: unknown): UpdateErrorReason {
  if (error instanceof UpdateFailure) return error.reason;
  if (isTimeoutError(error)) return "network-delay";
  return "download-failed";
}

/** Zotero.HTTP.TimeoutException 没暴露在类型里，按 message 判定。 */
function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && /timed out/i.test(error.message);
}

async function downloadXpi(
  url: string,
  progress: UpdateProgress,
): Promise<Uint8Array> {
  let xhr: XMLHttpRequest;
  try {
    xhr = await Zotero.HTTP.request("GET", url, {
      responseType: "arraybuffer",
      timeout: DOWNLOAD_TIMEOUT_MS,
      followRedirects: true,
      noCache: true,
      // 关掉 Zotero 对 5xx 的自动重试（默认会重试到 1 小时，表现为卡 100%）。
      errorDelayMax: 0,
      requestObserver: (request: XMLHttpRequest) => {
        request.addEventListener("progress", (event: ProgressEvent) => {
          if (event.lengthComputable && event.total > 0) {
            progress.onDownloadProgress?.(event.loaded, event.total);
          }
        });
      },
    });
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new UpdateFailure("network-delay");
    }
    throw new UpdateFailure("download-failed");
  }

  const buffer = xhr.response as ArrayBuffer | null;
  if (!buffer || buffer.byteLength === 0) {
    throw new UpdateFailure("download-failed");
  }
  return new Uint8Array(buffer);
}

async function installXpi(bytes: Uint8Array): Promise<void> {
  const module = ChromeUtils.importESModule(
    "resource://gre/modules/AddonManager.sys.mjs",
  ) as unknown as { AddonManager: AddonManagerLike };

  const xpiFile = Zotero.getTempDirectory();
  xpiFile.append(`better-vertical-tabs-update-${Date.now()}.xpi`);
  await IOUtils.write(xpiFile.path, bytes);

  const install = await module.AddonManager.getInstallForFile(
    xpiFile,
    "application/x-xpinstall",
  );
  if (!install) throw new UpdateFailure("install-failed");

  await new Promise<void>((resolve, reject) => {
    install.addListener({
      onInstallEnded: () => resolve(),
      onInstallFailed: () => reject(new UpdateFailure("install-failed")),
      onDownloadFailed: () => reject(new UpdateFailure("download-failed")),
    });
    install.install();
  });
}
