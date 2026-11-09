/**
 * 自定义副标题弹窗的字段组合状态。
 *
 * 唯一负责「当前组合」的增删改与持久化：任何一次变更都立刻写 pref，并向所有
 * 主窗口广播 `vertical-tabs:data-changed`（侧栏据此重渲染），不新增 pref
 * observer。变更成功后同步通知 onChange 订阅者重建 DOM——调用方在做 mutate
 * 之前先捕获几何，渲染完成后再播 FLIP，所以通知必须是同步的。
 *
 * 磁盘语义（见 render/subtitleFields.ts）：键缺失 → 默认三项；空字符串 → 0 个
 * 字段（合法）；其余 → 过滤未知 id、去重保序、截断到 MAX。
 */

import { dispatchVtEvent } from "../../core/events";
import {
  DEFAULT_SUBTITLE_FIELDS,
  MAX_SUBTITLE_FIELDS,
  SUBTITLE_FIELD_IDS,
  setSubtitleFields,
  type SubtitleFieldId,
} from "../../render/subtitleFields";

const DATA_CHANGED_EVENT = "vertical-tabs:data-changed";

export interface SubtitleState {
  get(): SubtitleFieldId[];
  canInsert(): boolean;
  insertAt(field: SubtitleFieldId, index: number): boolean;
  removeAt(index: number): SubtitleFieldId | null;
  move(from: number, to: number): boolean;
  resetDefault(): void;
  /** 立即写盘 + 广播（关闭弹窗时调用，避免防抖窗口内丢配置）。 */
  flushPending(): void;
  onChange(listener: (ids: SubtitleFieldId[]) => void): () => void;
}

function clampIndex(index: number, length: number): number {
  if (!Number.isFinite(index)) return length;
  return Math.max(0, Math.min(length, Math.trunc(index)));
}

function sameIds(
  a: readonly SubtitleFieldId[],
  b: readonly SubtitleFieldId[],
): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/** 入参可能来自旧 pref / 调用方手写，先做一次与 parse 语义一致的清洗。 */
function normalize(initial: readonly SubtitleFieldId[]): SubtitleFieldId[] {
  const result: SubtitleFieldId[] = [];
  for (const field of initial) {
    if (!SUBTITLE_FIELD_IDS.includes(field)) continue;
    if (result.includes(field)) continue;
    result.push(field);
    if (result.length >= MAX_SUBTITLE_FIELDS) break;
  }
  return result;
}

function broadcastDataChanged(): void {
  for (const win of Zotero.getMainWindows()) {
    dispatchVtEvent(win.document, DATA_CHANGED_EVENT);
  }
}

/**
 * 写 pref + 广播主窗口的延迟。
 *
 * 主窗口收到 `vertical-tabs:data-changed` 会**全量重渲染侧栏**——这是同一个
 * 主线程上的重活。若在点击 ✕/恢复默认的同一个任务里同步广播，首个动画帧会被
 * 这次重渲染推迟，观感就是「开头跳帧/卡一下再瞬移」。所以本地状态与弹窗 DOM
 * 立即更新（FLIP 需要），写盘 + 广播合并到最后一次变更后 400ms（尾随防抖，
 * 晚于 220ms 飞行 + 110ms 落位淡出，不打断动画），关闭弹窗时再强制 flush。
 */
const PERSIST_DEBOUNCE_MS = 400;

export function createSubtitleState(
  initial: readonly SubtitleFieldId[],
): SubtitleState {
  let current = normalize(initial);
  const listeners: Array<(ids: SubtitleFieldId[]) => void> = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let dirty = false;

  const snapshot = (): SubtitleFieldId[] => current.slice();

  const flush = (): void => {
    flushTimer = null;
    if (!dirty) return;
    dirty = false;
    setSubtitleFields(current);
    broadcastDataChanged();
  };

  const scheduleFlush = (): void => {
    dirty = true;
    if (flushTimer !== null) return;
    flushTimer = setTimeout(flush, PERSIST_DEBOUNCE_MS);
  };

  /** 只在真的变化时通知（同步）+ 安排写盘/广播（防抖）；返回是否发生变化。 */
  const commit = (next: SubtitleFieldId[]): boolean => {
    if (sameIds(current, next)) return false;
    current = next;
    scheduleFlush();
    for (const listener of listeners.slice()) listener(snapshot());
    return true;
  };

  return {
    get: snapshot,
    canInsert: () => current.length < MAX_SUBTITLE_FIELDS,
    flushPending() {
      if (flushTimer !== null) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      flush();
    },
    insertAt(field, index) {
      if (!SUBTITLE_FIELD_IDS.includes(field)) return false;
      if (current.includes(field)) return false;
      if (current.length >= MAX_SUBTITLE_FIELDS) return false;
      const next = snapshot();
      next.splice(clampIndex(index, next.length), 0, field);
      return commit(next);
    },
    removeAt(index) {
      if (index < 0 || index >= current.length) return null;
      const next = snapshot();
      const [removed] = next.splice(index, 1);
      commit(next);
      return removed ?? null;
    },
    move(from, to) {
      if (from < 0 || from >= current.length) return false;
      if (to < 0 || to >= current.length) return false;
      if (from === to) return false;
      const next = snapshot();
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return commit(next);
    },
    resetDefault() {
      commit([...DEFAULT_SUBTITLE_FIELDS]);
    },
    onChange(listener) {
      listeners.push(listener);
      return () => {
        const index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      };
    },
  };
}
