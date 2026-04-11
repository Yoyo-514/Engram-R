import { SettingsManager } from '@/config/settings';
import { Logger, LogModule } from '@/core/logger';
import { getSTContext } from '@/integrations/tavern';
import { callPopup } from '@/integrations/tavern';
import { WorldInfoService } from '@/integrations/tavern/worldbook';
import { notificationService } from '@/ui/services/NotificationService';

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
 * CharacterDeleteService - 联动删除服务
 *
 * 监听角色删除和聊天删除事件，同步删除 Engram 世界书
 */
export class CharacterDeleteService {
  private static isInitialized = false;

  static init() {
    if (this.isInitialized) return;

    try {
      const context = getSTContext();
      if (!context?.eventSource || !context?.event_types) {
        Logger.warn(LogModule.DATA_CLEANUP, '无法获取事件系统');
        return;
      }

      // 监听角色删除事件
      if (context.event_types.CHARACTER_DELETED) {
        context.eventSource.on(context.event_types.CHARACTER_DELETED, (data) => {
          if (!isCharacterDeletedEventPayload(data)) {
            Logger.warn(LogModule.DATA_CLEANUP, '收到无效的角色删除事件数据', data);
            return;
          }

          void this.onCharacterDeleted(data);
        });
        Logger.debug(LogModule.DATA_CLEANUP, '监听 CHARACTER_DELETED 事件');
      }

      // 监听聊天删除事件
      if (context.event_types.CHAT_DELETED) {
        context.eventSource.on(context.event_types.CHAT_DELETED, (data) => {
          if (typeof data !== 'string') {
            Logger.warn(LogModule.DATA_CLEANUP, '收到无效的聊天删除事件数据', data);
            return;
          }

          void this.onChatDeleted(data);
        });
        Logger.debug(LogModule.DATA_CLEANUP, '监听 CHAT_DELETED 事件');
      }

      // 监听群聊删除事件
      if (context.event_types.GROUP_CHAT_DELETED) {
        context.eventSource.on(context.event_types.GROUP_CHAT_DELETED, (data) => {
          if (typeof data !== 'string') {
            Logger.warn(LogModule.DATA_CLEANUP, '收到无效的群聊删除事件数据', data);
            return;
          }

          void this.onChatDeleted(data);
        });
        Logger.debug(LogModule.DATA_CLEANUP, '监听 GROUP_CHAT_DELETED 事件');
      }

      this.isInitialized = true;
    } catch (e) {
      Logger.error(LogModule.DATA_CLEANUP, '初始化失败', e);
    }
  }

  /**
   * 角色删除回调
   */
  private static async onCharacterDeleted(data: CharacterDeletedEventPayload) {
    const settings = SettingsManager.getSettings().linkedDeletion;
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

    await this.deleteEngramWorldbooks(characterName, '角色', settings.showConfirmation);
  }

  /**
   * 聊天删除回调
   * @param chatId 聊天 ID，格式通常为 "CharName - 2024-1-1@12h30m" 或类似
   */
  private static async onChatDeleted(chatId: string) {
    const settings = SettingsManager.getSettings().linkedDeletion;
    if (!settings?.enabled) return;

    Logger.debug(LogModule.DATA_CLEANUP, '检测到聊天删除', { chatId });

    // 1. 删除 IndexedDB (V0.6+ Sharding)
    // 只要启用了联动删除，就清理该聊天的数据库，因为它是隔离的，不会影响其他聊天
    try {
      const { databaseExists, deleteDatabase } = await import('@/data/db');
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
      const { syncService } = await import('@/data/sync/SyncService');
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
    const characterName = this.extractCharacterNameFromChatId(chatId);

    if (!characterName) {
      Logger.debug(LogModule.DATA_CLEANUP, `无法从 chatId 解析角色名`);
      return;
    }

    await this.deleteEngramWorldbooks(characterName, '聊天', settings.showConfirmation);
  }

  /**
   * 从 chatId 提取角色名
   */
  private static extractCharacterNameFromChatId(chatId: string): string | null {
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
  private static async deleteEngramWorldbooks(
    characterName: string,
    source: '角色' | '聊天',
    showConfirmation: boolean
  ) {
    const candidates = new Set<string>();

    // Engram 标准命名规则
    candidates.add(`[Engram] ${characterName}`);
    candidates.add(`Engram_${characterName}`);

    // 获取所有世界书并验证
    const allWorldbooks = await WorldInfoService.getWorldbookNames();
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

    Logger.info(LogModule.DATA_CLEANUP, `准备删除关联世界书`, {
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

    for (const wbName of booksToDelete) {
      try {
        const success = await WorldInfoService.deleteWorldbook(wbName);
        if (success) {
          deletedCount++;
          Logger.debug(LogModule.DATA_CLEANUP, `已删除世界书: ${wbName}`);
        } else {
          failedBooks.push(wbName);
        }
      } catch (e) {
        Logger.error(LogModule.DATA_CLEANUP, `删除世界书 ${wbName} 失败`, e);
        failedBooks.push(wbName);
      }
    }

    if (deletedCount > 0) {
      notificationService.success(`已清理 ${deletedCount} 个关联记忆库`, 'Engram');
    }

    if (failedBooks.length > 0) {
      notificationService.warning(`部分记忆库删除失败: ${failedBooks.join(', ')}`, 'Engram');
    }
  }
}
