import { getSettings } from '@/config/settings';
import { Logger, LogModule } from '@/core/logger';
import { getSTContext, callPopup } from '@/integrations/tavern';
import { deleteWorldbook, getWorldbookNames } from '@/integrations/tavern/worldbook';
import { notificationService } from '@/ui/services/NotificationService';

import { databaseExists, deleteDatabase } from './db';
import { syncService } from './SyncService';

interface DeletedCharacterLike {
  name?: string;
  avatar?: string;
  ch_name?: string;
  data?: {
    name?: string;
  };
}

interface CharacterDeletedEventPayload {
  id: number;
  character: DeletedCharacterLike;
}

type Unsubscribe = () => void;

let isCharacterDeleteServiceInitialized = false;
let unsubscribeCharacterDeleted: Unsubscribe | null = null;
let unsubscribeChatDeleted: Unsubscribe | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function isDeletedCharacterLike(value: unknown): value is DeletedCharacterLike {
  if (!isRecord(value)) {
    return false;
  }

  const data = value.data;
  return (
    (value.name === undefined || typeof value.name === 'string') &&
    (value.avatar === undefined || typeof value.avatar === 'string') &&
    (value.ch_name === undefined || typeof value.ch_name === 'string') &&
    (data === undefined ||
      (isRecord(data) && (data.name === undefined || typeof data.name === 'string')))
  );
}

function isCharacterDeletedEventPayload(value: unknown): value is CharacterDeletedEventPayload {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.id === 'number' && isDeletedCharacterLike(value.character);
}

/**
 * 从 chatId 提取角色名
 */
function extractCharacterNameFromDeletedChatId(chatId: string): string | null {
  if (!chatId) return null;

  // 尝试多种分隔符模式
  // Pattern 1: "CharName - 2024-1-1@12h30m"
  let match = chatId.match(/^(.+?)\s*-\s*\d{4}/);
  if (match) return match[1].trim();

  // Pattern 2: "CharName_2024-1-1"
  match = chatId.match(/^(.+?)_\d{4}/);
  if (match) return match[1].trim();

  // Pattern 3: 没有日期后缀，整个就是名字
  // 但这种情况下我们不确定，返回 null 更安全
  return null;
}

/**
 * 删除 Engram 世界书
 */
async function deleteLinkedEngramWorldbooks(
  characterName: string,
  source: '角色' | '聊天',
  showConfirmation: boolean
): Promise<void> {
  const candidates = new Set<string>();

  // Engram 标准命名规则
  candidates.add(`[Engram] ${characterName}`);
  candidates.add(`Engram_${characterName}`);

  // 获取所有世界书并验证
  const allWorldbooks = await getWorldbookNames();
  const allWorldbooksSet = new Set(allWorldbooks);

  const booksToDelete = Array.from(candidates).filter((name) => {
    if (!allWorldbooksSet.has(name)) return false;

    const isEngramBook = name.toLowerCase().includes('engram');
    if (!isEngramBook) {
      Logger.debug(LogModule.DATA_CLEANUP, `跳过非 Engram 世界书: ${name}`);
    }

    return isEngramBook;
  });

  if (booksToDelete.length === 0) {
    Logger.debug(LogModule.DATA_CLEANUP, `未找到 "${characterName}" 关联的 Engram 世界书`);
    return;
  }

  Logger.info(LogModule.DATA_CLEANUP, '准备删除关联世界书', {
    books: booksToDelete,
  });

  // 确认删除
  if (showConfirmation) {
    const confirmHtml = `
      <div style="font-size: 0.9em;">
        <h3>🧹 Engram 联动清理</h3>
        <p>检测到${source} <b>${characterName}</b> 已被删除。</p>
        <p>发现以下关联的 Engram 记忆库：</p>
        <ul style="max-height: 100px; overflow-y: auto; background: var(--black50a); padding: 5px; border-radius: 4px; list-style: none; margin: 10px 0;">
          ${booksToDelete.map((name) => `<li style="padding: 2px 0;">• ${name}</li>`).join('')}
        </ul>
        <p>是否一并删除？</p>
        <small style="opacity: 0.7;">这将永久删除这些记忆库及其包含的所有摘要。</small>
      </div>
    `;

    const confirmed = (await callPopup(confirmHtml, 'confirm')) === true;
    if (!confirmed) {
      Logger.info(LogModule.DATA_CLEANUP, '用户取消删除关联世界书');
      return;
    }
  }

  // 执行删除
  let deletedCount = 0;
  const failedBooks: string[] = [];

  notificationService.info('正在清理 Engram 记忆库...', 'Engram');

  for (const worldbookName of booksToDelete) {
    try {
      const success = await deleteWorldbook(worldbookName);
      if (success) {
        deletedCount++;
        Logger.debug(LogModule.DATA_CLEANUP, `已删除世界书: ${worldbookName}`);
      } else {
        failedBooks.push(worldbookName);
      }
    } catch (e) {
      Logger.error(LogModule.DATA_CLEANUP, `删除世界书 ${worldbookName} 失败`, e);
      failedBooks.push(worldbookName);
    }
  }

  if (deletedCount > 0) {
    notificationService.success(`已清理 ${deletedCount} 个关联记忆库`, 'Engram');
  }

  if (failedBooks.length > 0) {
    notificationService.warning(`部分记忆库删除失败: ${failedBooks.join(', ')}`, 'Engram');
  }
}

/**
 * 角色删除回调
 */
async function handleCharacterDeleted(data: CharacterDeletedEventPayload): Promise<void> {
  const settings = getSettings().linkedDeletion;
  if (!settings?.enabled || !settings?.deleteWorldbook) return;

  Logger.debug(LogModule.DATA_CLEANUP, '检测到角色删除', data);

  const characterData = data.character;
  const characterName =
    characterData?.name ||
    characterData?.avatar ||
    characterData?.ch_name ||
    characterData?.data?.name;

  if (!characterName) {
    Logger.warn(LogModule.DATA_CLEANUP, '无法获取已删除角色的名称');
    return;
  }

  await deleteLinkedEngramWorldbooks(characterName, '角色', settings.showConfirmation);
}

/**
 * 聊天删除回调
 * @param chatId 聊天 ID，格式通常为 "CharName - 2024-1-1@12h30m" 或类似
 */
async function handleChatDeleted(chatId: string): Promise<void> {
  const settings = getSettings().linkedDeletion;
  if (!settings?.enabled) return;

  Logger.debug(LogModule.DATA_CLEANUP, '检测到聊天删除', { chatId });

  // 1. 删除 IndexedDB (V0.6+ Sharding)
  // 只要启用了联动删除，就清理该聊天的数据库，因为它是隔离的，不会影响其他聊天
  try {
    if (await databaseExists(chatId)) {
      await deleteDatabase(chatId);
      Logger.info(LogModule.DATA_CLEANUP, `已删除 IndexedDB: ${chatId}`);
      notificationService.info('已清理关联的 Engram 数据库', 'Engram');
    }
  } catch (e) {
    Logger.error(LogModule.DATA_CLEANUP, `删除数据库失败: ${chatId}`, e);
  }

  // 2. 删除 Sync 本地文件 (Engram_sync_*.json)
  // 即使 sync 未启用，如果有残留文件也应清理
  try {
    await syncService.purge(chatId);
    Logger.debug(LogModule.DATA_CLEANUP, `已触发同步文件清理: ${chatId}`);
  } catch (e) {
    Logger.warn(LogModule.DATA_CLEANUP, `清理同步文件失败: ${chatId}`, e);
  }

  // 3. 删除 Worldbook (旧逻辑 / 宏占位)
  // 仅在明确启用 deleteChatWorldbook 时执行，因为如果是共享世界书，可能会误删
  if (!settings.deleteChatWorldbook) return;

  // 从 chatId 解析角色名
  // 常见格式: "CharName - 2024-1-1@12h30m" 或 "CharName_2024-1-1@12h30m"
  const characterName = extractCharacterNameFromDeletedChatId(chatId);

  if (!characterName) {
    Logger.debug(LogModule.DATA_CLEANUP, '无法从 chatId 解析角色名');
    return;
  }

  await deleteLinkedEngramWorldbooks(characterName, '聊天', settings.showConfirmation);
}

/**
 * CharacterDeleteService - 联动删除服务
 *
 * 监听角色删除和聊天删除事件，同步删除 Engram 世界书
 */
export function initCharacterDeleteService(): void {
  if (isCharacterDeleteServiceInitialized) return;

  try {
    const context = getSTContext();
    if (!context?.eventSource || !context?.eventTypes) {
      Logger.warn(LogModule.DATA_CLEANUP, '无法获取事件系统');
      return;
    }

    // 监听角色删除事件
    if (context.eventTypes.CHARACTER_DELETED) {
      const characterDeletedHandler = (data: unknown) => {
        if (!isCharacterDeletedEventPayload(data)) {
          Logger.warn(LogModule.DATA_CLEANUP, '收到无效的角色删除事件数据', data);
          return;
        }

        void handleCharacterDeleted(data);
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

    // 监听聊天删除事件
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
  unsubscribeCharacterDeleted?.();
  unsubscribeCharacterDeleted = null;

  unsubscribeChatDeleted?.();
  unsubscribeChatDeleted = null;

  isCharacterDeleteServiceInitialized = false;
}
