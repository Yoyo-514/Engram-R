/**
 * EventWatcher - 通用事件监听器
 *
 * 位于 L5 基础层，可被多个模块共用：
 * - SummarizerService (总结触发)
 * - Injector (上下文刷新)
 * - RAG (检索触发)
 *
 * 基于 tavern/TavernEvents.ts 的 eventBus 进行封装
 */

import { eventBus, events, type Unsubscribe } from '@/integrations/tavern';

/** 监听回调类型 */
interface WatcherCallbacks {
  /** 收到消息时触发 (用户或 AI) */
  onMessageReceived?: () => void | Promise<void>;
  /** 聊天切换时触发 */
  onChatChanged?: () => void | Promise<void>;
  /** 生成开始时触发 */
  onGenerationStarted?: () => void | Promise<void>;
  /** 生成结束时触发 */
  onGenerationEnded?: () => void | Promise<void>;
}

type WatcherEvent = keyof WatcherCallbacks;
type Callback = () => void | Promise<void>;

const eventMap: Record<WatcherEvent, string> = {
  onMessageReceived: 'messageReceived',
  onChatChanged: 'chatChanged',
  onGenerationStarted: 'generationStarted',
  onGenerationEnded: 'generationEnded',
};

/**
 * EventWatcher
 * 统一管理事件订阅，避免重复监听
 */
export function createEventWatcher() {
  let unsubscribers: Unsubscribe[] = [];
  const callbacks = new Map<string, Set<Callback>>();

  const emit = (eventKey: string): void => {
    const cbs = callbacks.get(eventKey);
    if (!cbs) return;

    cbs.forEach((cb) => {
      Promise.resolve(cb()).catch((e) => {
        console.error(`[EventWatcher] Callback error for ${eventKey}:`, e);
      });
    });
  };

  const start = (): void => {
    if (unsubscribers.length > 0) {
      console.info('[EventWatcher] Already started.');
      return;
    }

    unsubscribers.push(
      eventBus.on(events.MESSAGE_RECEIVED, () => emit('messageReceived')),
      eventBus.on(events.CHAT_CHANGED, () => emit('chatChanged')),
      eventBus.on(events.GENERATION_STARTED, () => emit('generationStarted')),
      eventBus.on(events.GENERATION_ENDED, () => emit('generationEnded'))
    );

    console.info('[EventWatcher] Started, listening to core events.');
  };

  const stop = (): void => {
    unsubscribers.forEach((unsub) => unsub());
    unsubscribers = [];
    console.info('[EventWatcher] Stopped.');
  };

  const on = (event: WatcherEvent, callback: Callback): Unsubscribe => {
    const eventKey = eventMap[event];

    if (!callbacks.has(eventKey)) {
      callbacks.set(eventKey, new Set());
    }

    callbacks.get(eventKey)!.add(callback);

    return () => {
      callbacks.get(eventKey)?.delete(callback);
    };
  };

  return {
    start,
    stop,
    on,
  };
}

/** 默认实例 */
export const eventWatcher = createEventWatcher();
