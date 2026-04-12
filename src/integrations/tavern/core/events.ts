import { Logger } from '@/core/logger';
import { getTavernContext } from '@/core/utils';

/**
 * EventBus - 事件总线封装
 *
 * 提供类型安全的事件订阅/取消订阅接口
 */
export const events = {
  CHAT_CHANGED: 'chat_id_changed',
  MESSAGE_RECEIVED: 'message_received',
  MESSAGE_EDITED: 'message_edited',
  GENERATION_STARTED: 'generation_started',
  GENERATION_ENDED: 'generation_ended',
  GENERATION_AFTER_COMMANDS: 'GENERATION_AFTER_COMMANDS',
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
  emit: (event: string, ...args: unknown[]) => void;
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
 * EventBus 类
 * 封装 SillyTavern 事件系统，提供类型安全的 API
 */
export class EventBus {
  private static listeners = new Map<string, Set<EventCallback>>();

  /**
   * 订阅事件
   * @param event 事件名称
   * @param callback 回调函数
   * @returns 取消订阅函数
   */
  static on(event: string, callback: EventCallback): Unsubscribe {
    const eventSource = getEventSource();

    if (eventSource) {
      eventSource.on(event, callback);
    }

    // 本地存储以便清理
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    // 返回取消订阅函数
    return () => {
      this.off(event, callback);
    };
  }

  /**
   * 一次性订阅事件（触发后自动取消）
   * @param event 事件名称
   * @param callback 回调函数
   */
  static once(event: string, callback: EventCallback): void {
    const eventSource = getEventSource();

    if (eventSource) {
      eventSource.once(event, callback);
    } else {
      // fallback: 自己实现 once
      const wrappedCallback: EventCallback = (...args) => {
        this.off(event, wrappedCallback);
        callback(...args);
      };
      this.on(event, wrappedCallback);
    }
  }

  /**
   * 取消订阅事件
   * @param event 事件名称
   * @param callback 回调函数
   */
  static off(event: string, callback: EventCallback): void {
    const eventSource = getEventSource();

    if (eventSource) {
      eventSource.removeListener(event, callback);
    }

    // 从本地存储移除
    this.listeners.get(event)?.delete(callback);
  }

  /**
   * 触发事件
   * @param event 事件名称
   * @param args 参数
   */
  static async emit(event: string, ...args: unknown[]): Promise<any> {
    const eventSource = getEventSource();

    if (eventSource) {
      return eventSource.emit(event, ...args);
    }
  }

  /**
   * 清除所有已注册的监听器
   * 在扩展卸载时调用
   */
  static clearAll(): void {
    const eventSource = getEventSource();

    for (const [event, callbacks] of this.listeners) {
      for (const callback of callbacks) {
        if (eventSource) {
          eventSource.removeListener(event, callback);
        }
      }
    }

    this.listeners.clear();
  }

  /**
   * 检查 EventBus 是否可用
   */
  static isAvailable(): boolean {
    return getEventSource() !== null;
  }
}
