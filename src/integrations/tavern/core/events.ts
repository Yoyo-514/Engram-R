import { Logger } from '@/core/logger';
import { getTavernContext } from '@/core/utils';

/**
 * EventBus - 事件总线封装
 *
 * 提供类型安全的事件订阅/取消订阅接口
 */
/**
 * 酒馆事件常量 — 值与 @types/event.d.ts 中 tavern_events 保持一致
 *
 * 仅收录 Engram 当前消费 / 近期需要的事件；
 * 内部自定义事件统一以 ENGRAM_ 前缀。
 */
export const events = {
  // -- Chat -------------------------------------------------------------------
  CHAT_CHANGED: 'chat_id_changed',

  // -- Message ----------------------------------------------------------------
  MESSAGE_RECEIVED: 'message_received',
  MESSAGE_EDITED: 'message_edited',

  // -- Generation -------------------------------------------------------------
  GENERATION_STARTED: 'generation_started',
  GENERATION_ENDED: 'generation_ended',
  GENERATION_AFTER_COMMANDS: 'GENERATION_AFTER_COMMANDS',

  // -- Settings ---------------------------------------------------------------
  SETTINGS_UPDATED: 'settings_updated',

  // -- World info -------------------------------------------------------------
  WORLD_INFO_ACTIVATED: 'world_info_activated',
  WORLDINFO_ENTRIES_LOADED: 'worldinfo_entries_loaded',
  WORLDINFO_SCAN_DONE: 'worldinfo_scan_done',
  WORLDINFO_SETTINGS_UPDATED: 'worldinfo_settings_updated',
  WORLDINFO_UPDATED: 'worldinfo_updated',

  // -- Engram (internal) ------------------------------------------------------
  ENGRAM_REQUEST_REVIEW: 'engram:request_review',
} as const;

export type EventType = (typeof events)[keyof typeof events];

/** 事件回调函数类型 */
export type EventCallback = (...args: unknown[]) => void | Promise<void>;

/** 取消订阅函数类型 */
export type Unsubscribe = () => void;

const MODULE = 'TavernEventBus';

/**
 * 获取 SillyTavern 的 eventSource
 * 注意：这个函数需要在运行时调用，因为 SillyTavern 的模块是动态加载的
 */
function getEventSource(): {
  on: (event: string, callback: EventCallback) => void;
  once: (event: string, callback: EventCallback) => void;
  emit: (event: string, ...args: unknown[]) => unknown;
  removeListener: (event: string, callback: EventCallback) => void;
} | null {
  try {
    const context = getTavernContext();
    return context?.eventSource || null;
  } catch {
    Logger.warn(MODULE, '无法获取 SillyTavern eventSource');
    return null;
  }
}

/**
 * 创建 EventBus
 * 封装 SillyTavern 事件系统，提供类型安全的 API
 */
export function createEventBus() {
  const listeners = new Map<string, Set<EventCallback>>();

  function trackListener(event: string, callback: EventCallback): void {
    if (!listeners.has(event)) {
      listeners.set(event, new Set());
    }

    listeners.get(event)!.add(callback);
  }

  function untrackListener(event: string, callback: EventCallback): void {
    const callbacks = listeners.get(event);
    if (!callbacks) {
      return;
    }

    callbacks.delete(callback);

    if (callbacks.size === 0) {
      listeners.delete(event);
    }
  }

  /**
   * 订阅事件
   * @param event 事件名称
   * @param callback 回调函数
   * @returns 取消订阅函数
   */
  function on(event: string, callback: EventCallback): Unsubscribe {
    const eventSource = getEventSource();

    if (eventSource) {
      eventSource.on(event, callback);
    }

    // 本地存储以便清理
    trackListener(event, callback);

    // 返回取消订阅函数
    return () => {
      off(event, callback);
    };
  }

  /**
   * 一次性订阅事件（触发后自动取消）
   * @param event 事件名称
   * @param callback 回调函数
   */
  function once(event: string, callback: EventCallback): Unsubscribe {
    const wrappedCallback: EventCallback = (...args) => {
      off(event, wrappedCallback);
      return callback(...args);
    };

    const eventSource = getEventSource();

    if (eventSource) {
      eventSource.on(event, wrappedCallback);
    }

    // 无论底层是否支持 once，都统一走本地包装，确保 listeners 可追踪
    trackListener(event, wrappedCallback);

    return () => {
      off(event, wrappedCallback);
    };
  }

  /**
   * 取消订阅事件
   * @param event 事件名称
   * @param callback 回调函数
   */
  function off(event: string, callback: EventCallback): void {
    const eventSource = getEventSource();

    if (eventSource) {
      eventSource.removeListener(event, callback);
    }

    // 从本地存储移除
    untrackListener(event, callback);
  }

  /**
   * 触发事件
   * @param event 事件名称
   * @param args 参数
   */
  async function emit(event: string, ...args: unknown[]): Promise<unknown> {
    const eventSource = getEventSource();

    if (eventSource) {
      return eventSource.emit(event, ...args);
    }

    return undefined;
  }

  /**
   * 清除所有已注册的监听器
   * 在扩展卸载时调用
   */
  function clearAll(): void {
    const eventSource = getEventSource();

    for (const [event, callbacks] of listeners) {
      for (const callback of callbacks) {
        if (eventSource) {
          eventSource.removeListener(event, callback);
        }
      }
    }

    listeners.clear();
  }

  /**
   * 检查 EventBus 是否可用
   */
  function isAvailable(): boolean {
    return getEventSource() !== null;
  }

  return {
    on,
    once,
    off,
    emit,
    clearAll,
    isAvailable,
  };
}

/** 默认实例 */
export const eventBus = createEventBus();