import { getSettings } from '@/config/settings';
import { Logger, LogModule } from '@/core/logger';
import { getSTContext } from '@/integrations/tavern';
import { notificationService } from '@/ui/services/NotificationService';

import { databaseExists, deleteDatabase, listAllChatIds } from './db';
import { syncService } from './SyncService';

type Unsubscribe = () => void;

type CharacterDeletedPayload = {
  id: string;
  character?: {
    name?: string;
    avatar?: string;
    chat?: string;
    [key: string]: unknown;
  };
};

let isCharacterDeleteServiceInitialized = false;
let unsubscribeChatDeleted: Unsubscribe | null = null;
let unsubscribeCharacterDeleted: Unsubscribe | null = null;

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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeCharacterName(payload: CharacterDeletedPayload): string {
  const rawName = payload.character?.name;
  return typeof rawName === 'string' ? rawName.trim() : '';
}

async function findRelatedChatIdsByCharacterName(characterName: string): Promise<string[]> {
  const trimmedName = characterName.trim();
  if (!trimmedName) {
    return [];
  }

  const allChatIds = await listAllChatIds();
  const escapedName = escapeRegExp(trimmedName);
  const nameRegex = new RegExp(`^${escapedName}(?:\\s|-|_|$)`, 'i');

  return allChatIds.filter((chatId) => nameRegex.test(chatId));
}

async function handleCharacterDeleted(payload: CharacterDeletedPayload): Promise<void> {
  const settings = getSettings().linkedDeletion;
  if (!settings?.enabled || !settings.deleteIndexedDB) return;

  const characterName = normalizeCharacterName(payload);
  if (!characterName) {
    Logger.warn(LogModule.DATA_CLEANUP, '角色删除事件缺少角色名称', payload);
    return;
  }

  Logger.info(LogModule.DATA_CLEANUP, '检测到角色删除', {
    characterId: payload.id,
    characterName,
  });

  let matchedChatIds: string[] = [];
  try {
    matchedChatIds = await findRelatedChatIdsByCharacterName(characterName);
  } catch (error) {
    Logger.error(LogModule.DATA_CLEANUP, '扫描角色关联聊天数据库失败', error);
    return;
  }

  if (matchedChatIds.length === 0) {
    Logger.info(LogModule.DATA_CLEANUP, '未发现角色关联聊天数据库', {
      characterName,
    });
    return;
  }

  if (settings.showConfirmation) {
    Logger.info(LogModule.DATA_CLEANUP, '角色联动清理命中候选聊天', {
      characterName,
      matchedChatIds,
    });
  }

  let deletedCount = 0;
  for (const chatId of matchedChatIds) {
    try {
      if (await databaseExists(chatId)) {
        await deleteDatabase(chatId);
        deletedCount += 1;
      }
    } catch (error) {
      Logger.error(LogModule.DATA_CLEANUP, `删除角色关联数据库失败: ${chatId}`, error);
      continue;
    }

    try {
      await syncService.purge(chatId);
    } catch (error) {
      Logger.warn(LogModule.DATA_CLEANUP, `清理角色关联同步残留失败: ${chatId}`, error);
    }
  }

  if (deletedCount > 0) {
    notificationService.success(`已清理 ${deletedCount} 个角色关联聊天数据库`, 'Engram');
  }
}

/**
 * CharacterDeleteService - 联动清理服务
 *
 * 当前支持聊天删除时清理数据库残留，并在角色删除时清理可能关联的聊天数据库与同步残留。
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

    if (context.eventTypes.CHARACTER_DELETED) {
      const characterDeletedHandler = (data: unknown) => {
        if (!data || typeof data !== 'object' || !('id' in data)) {
          Logger.warn(LogModule.DATA_CLEANUP, '收到无效的角色删除事件数据', data);
          return;
        }

        void handleCharacterDeleted(data as CharacterDeletedPayload);
      };

      context.eventSource.on(context.eventTypes.CHARACTER_DELETED, characterDeletedHandler);
      unsubscribeCharacterDeleted = () => {
        context.eventSource.removeListener(
          context.eventTypes.CHARACTER_DELETED,
          characterDeletedHandler
        );
      };

      Logger.debug(LogModule.DATA_CLEANUP, '监听 CHARACTER_DELETED 事件');
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
  unsubscribeCharacterDeleted?.();
  unsubscribeCharacterDeleted = null;

  isCharacterDeleteServiceInitialized = false;
}
