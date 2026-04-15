import { getSettings } from '@/config/settings';
import { Logger, LogModule } from '@/core/logger';
import { getSTContext } from '@/integrations/tavern';
import { notificationService } from '@/ui/services/NotificationService';

import { databaseExists, deleteDatabase } from './db';
import { syncService } from './SyncService';

type Unsubscribe = () => void;

let isCharacterDeleteServiceInitialized = false;
let unsubscribeChatDeleted: Unsubscribe | null = null;

/**
 * 聊天删除回调
 * @param chatId 聊天 ID
 */
async function handleChatDeleted(chatId: string): Promise<void> {
  const settings = getSettings().linkedDeletion;
  if (!settings?.enabled) return;

  Logger.debug(LogModule.DATA_CLEANUP, '检测到聊天删除', { chatId });

  // 1. 删除 IndexedDB 分片
  try {
    if (await databaseExists(chatId)) {
      await deleteDatabase(chatId);
      Logger.info(LogModule.DATA_CLEANUP, `已删除 IndexedDB: ${chatId}`);
      notificationService.info('已清理关联的 Engram 数据库', 'Engram');
    }
  } catch (e) {
    Logger.error(LogModule.DATA_CLEANUP, `删除数据库失败: ${chatId}`, e);
  }

  // 2. 删除同步残留文件
  try {
    await syncService.purge(chatId);
    Logger.debug(LogModule.DATA_CLEANUP, `已触发同步文件清理: ${chatId}`);
  } catch (e) {
    Logger.warn(LogModule.DATA_CLEANUP, `清理同步文件失败: ${chatId}`, e);
  }
}

/**
 * CharacterDeleteService - 联动清理服务
 *
 * 当前仅在聊天删除时清理 Engram IndexedDB 与同步残留文件。
 */
export function initCharacterDeleteService(): void {
  if (isCharacterDeleteServiceInitialized) return;

  try {
    const context = getSTContext();
    if (!context?.eventSource || !context?.eventTypes) {
      Logger.warn(LogModule.DATA_CLEANUP, '无法获取事件系统');
      return;
    }

    if (context.eventTypes.CHAT_DELETED) {
      const chatDeletedHandler = (data: unknown) => {
        if (typeof data !== 'string') {
          Logger.warn(LogModule.DATA_CLEANUP, '收到无效的聊天删除事件数据', data);
          return;
        }

        void handleChatDeleted(data);
      };

      context.eventSource.on(context.eventTypes.CHAT_DELETED, chatDeletedHandler);
      unsubscribeChatDeleted = () => {
        context.eventSource.removeListener(context.eventTypes.CHAT_DELETED, chatDeletedHandler);
      };

      Logger.debug(LogModule.DATA_CLEANUP, '监听 CHAT_DELETED 事件');
    }

    isCharacterDeleteServiceInitialized = true;
  } catch (e) {
    Logger.error(LogModule.DATA_CLEANUP, '初始化失败', e);
  }
}

/**
 * 检查服务是否已初始化
 */
export function isCharacterDeleteServiceReady(): boolean {
  return isCharacterDeleteServiceInitialized;
}

/**
 * 重置状态并解绑事件
 * 用于测试、热重载或重新初始化场景
 */
export function resetCharacterDeleteService(): void {
  unsubscribeChatDeleted?.();
  unsubscribeChatDeleted = null;

  isCharacterDeleteServiceInitialized = false;
}
