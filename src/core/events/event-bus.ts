/**
 * EventBus - 事件总线
 *
 * 基于 RxJS Subject 实现的发布/订阅模式
 * 用于模块间的松耦合通信
 */

import type { Observable } from 'rxjs';
import { Subject, filter } from 'rxjs';

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

// 全局事件流
const engramEventSubject = new Subject<EngramEvent>();

/**
 * 事件总线
 */
export const engramEventBus = {
  /**
   * 发布事件
   */
  emit<T>(event: EngramEvent<T>): void {
    engramEventSubject.next({
      ...event,
      timestamp: Date.now(),
    });
  },

  /**
   * 订阅所有事件
   */
  subscribe(callback: (event: EngramEvent) => void): { unsubscribe: () => void } {
    const subscription = engramEventSubject.subscribe(callback);
    return {
      unsubscribe: () => subscription.unsubscribe(),
    };
  },

  /**
   * 订阅特定类型的事件
   */
  on<T>(type: EngramEventType, callback: (payload: T) => void): { unsubscribe: () => void } {
    const subscription = engramEventSubject
      .pipe(filter((e) => e.type === type))
      .subscribe((e) => callback(e.payload as T));
    return {
      unsubscribe: () => subscription.unsubscribe(),
    };
  },

  /**
   * 获取事件流（用于 RxJS 操作符）
   */
  asObservable(): Observable<EngramEvent> {
    return engramEventSubject.asObservable();
  },
};
