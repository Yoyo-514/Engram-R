/**
 * EventBus - 事件总线
 *
 * 简洁的发布/订阅实现，用于模块间的松耦合通信。
 */

// 事件类型定义
export type EngramEventType =
  | 'INGESTION_START'
  | 'INGESTION_COMPLETE'
  | 'ENTITY_CREATED'
  | 'MEMORY_STORED'
  | 'RETRIEVAL_START'
  | 'RETRIEVAL_COMPLETE'
  | 'ENTITY_ARCHIVED' // 自动/手动归档完成
  | 'UI_NAVIGATE_REQUEST' // 通知系统触发 UI 跳转
  | 'WORKFLOW_FAILED'
  | 'REVIEW_REQUESTED';

export interface EngramEvent<T = unknown> {
  type: EngramEventType;
  payload: T;
  timestamp?: number;
}

type EventListener = (event: EngramEvent) => void;

const listeners = new Set<EventListener>();

/** 事件总线 */
export const engramEventBus = {
  /** 发布事件 */
  emit<T>(event: EngramEvent<T>): void {
    const full: EngramEvent = { ...event, timestamp: Date.now() };
    // 直接迭代 Set：监听器在回调中退订是安全的
    for (const listener of listeners) {
      listener(full);
    }
  },

  /** 订阅所有事件 */
  subscribe(callback: EventListener): { unsubscribe: () => void } {
    listeners.add(callback);
    return {
      unsubscribe: () => {
        listeners.delete(callback);
      },
    };
  },

  /** 订阅特定类型的事件 */
  on<T>(type: EngramEventType, callback: (payload: T) => void): { unsubscribe: () => void } {
    const listener: EventListener = (event) => {
      if (event.type === type) {
        callback(event.payload as T);
      }
    };
    listeners.add(listener);
    return {
      unsubscribe: () => {
        listeners.delete(listener);
      },
    };
  },
};
