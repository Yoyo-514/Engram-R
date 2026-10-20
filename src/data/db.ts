/** 按聊天隔离的 IndexedDB 数据库。 */

import { Dexie, type Table, type Transaction } from 'dexie';

import { getRequestHeaders, getSTContext } from '@/integrations/tavern';
import type { DatabaseBindStatus, DatabaseStats, DatabaseSummary } from '@/types/database';

import { DATABASE_OPTIONS } from '../../engram.config';
import { Logger } from '../core/logger';
import type { EntityNode, EventNode } from '../types/graph';

/**
 * 每个聊天的元数据存储
 */
interface ChatMeta {
  key: string;
  value: unknown;
}

const MODULE = 'Database';

/**
 * ChatDatabase - 单个聊天的数据库类
 */
export class ChatDatabase extends Dexie {
  events!: Table<EventNode, string>;
  entities!: Table<EntityNode, string>;
  meta!: Table<ChatMeta, string>;

  constructor(chatId: string) {
    // 数据库名格式: Engram_{chatId}
    super(`Engram_${chatId}`);

    this.version(3).stores({
      // Events: 核心记忆单元
      events: 'id, timestamp, significance_score, level, is_archived, is_embedded',
      // Entities: 图谱实体
      entities: 'id, type, name, *aliases, is_archived',
      // Meta: 状态存储 (lastSummarizedFloor 等)
      meta: 'key',
    });

    this.version(4).stores({
      events: 'id, timestamp, significance_score, level, is_archived, is_embedded',
      entities: 'id, type, name, *aliases, is_archived, is_embedded',
      meta: 'key',
    });

    // 每个成功提交的事务仅通知一次，回滚不触发。
    const changedTransactions = new WeakSet<Transaction>();
    const handleChange = () => {
      const transaction = Dexie.currentTransaction!;
      if (changedTransactions.has(transaction)) return;
      changedTransactions.add(transaction);
      transaction.on('complete', () => this.updateLastModified());
    };

    this.events.hook('creating', handleChange);
    this.events.hook('updating', handleChange);
    this.events.hook('deleting', handleChange);

    this.entities.hook('creating', handleChange);
    this.entities.hook('updating', handleChange);
    this.entities.hook('deleting', handleChange);
  }

  private lastUpdateTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * 合并短时间内的提交，写入修改时间并调度上传。
   */
  private updateLastModified() {
    // 同一窗口只保留一次写入。
    if (this.lastUpdateTimer) return;

    this.lastUpdateTimer = setTimeout(() => {
      this.lastUpdateTimer = null;

      // 使用 ignoreTransaction 脱离当前 Hooks 事务，
      // 防止在只读或特定表的事务中写 meta 表导致 Dexie 报错。
      void Dexie.ignoreTransaction(async () => {
        try {
          await this.meta.put({ key: 'lastModified', value: Date.now() });
        } catch (err) {
          Logger.error(MODULE, '异步更新 lastModified 失败', err);
        }
      });
    }, DATABASE_OPTIONS.changeDelayMs);
  }
}

// ======================== 数据库工厂 ========================

// 导出数据接口
export interface ChatDataDump {
  events: EventNode[];
  entities: EntityNode[];
  meta: Record<string, unknown>;
}

/**
 * 导出数据库所有数据
 */
export async function exportChatData(db: ChatDatabase): Promise<ChatDataDump> {
  const events = await db.events.toArray();
  const entities = await db.entities.toArray();
  const metaArr = await db.meta.toArray();
  const meta = Object.fromEntries(metaArr.map(({ key, value }) => [key, value]));

  // 元数据放在文件头部，导出文件的时间戳一目了然。
  return { meta, events, entities };
}

/**
 * 导入数据到数据库（覆盖）
 */
export async function importChatData(db: ChatDatabase, data: ChatDataDump): Promise<void> {
  await db.transaction('rw', db.events, db.entities, db.meta, async () => {
    // 清空
    await db.events.clear();
    await db.entities.clear();
    await db.meta.clear();

    // 批量添加
    await db.events.bulkAdd(data.events);
    await db.entities.bulkAdd(data.entities);

    // 转换 meta 因为它是一个 KV 表
    const metaEntries = Object.entries(data.meta || {}).map(([key, value]) => ({
      key,
      value,
    }));
    await db.meta.bulkAdd(metaEntries);
  });
}

/** 数据库实例缓存 */
const dbCache = new Map<string, ChatDatabase>();

/**
 * 获取某个聊天的数据库实例（带缓存）
 */
export function getDbForChat(chatId: string): ChatDatabase {
  if (!chatId) {
    throw new Error('[Engram DB] chatId is required');
  }

  if (!dbCache.has(chatId)) {
    Logger.debug(MODULE, `Creating database for chat: ${chatId}`);
    dbCache.set(chatId, new ChatDatabase(chatId));
  }
  return dbCache.get(chatId)!;
}

/**
 * 关闭并移除缓存的数据库
 */
function closeDb(chatId: string): void {
  const db = dbCache.get(chatId);
  if (db) {
    db.close();
    dbCache.delete(chatId);
    Logger.debug(MODULE, `Closed database for chat: ${chatId}`);
  }
}

/**
 * 异步检查某个聊天的数据库是否真实存在（不会自动创建）
 */
export async function databaseExists(chatId: string): Promise<boolean> {
  if (!chatId) return false;
  return Dexie.exists(`Engram_${chatId}`);
}

/**
 * 获取数据库实例（如果存在），不自动创建
 */
export function tryGetDbForChat(chatId: string): ChatDatabase | null {
  return dbCache.get(chatId) || null;
}

/**
 * 删除整个聊天的数据库
 */
export async function deleteDatabase(chatId: string): Promise<void> {
  closeDb(chatId);
  await Dexie.delete(`Engram_${chatId}`);
  Logger.info(MODULE, `Deleted database for chat: ${chatId}`);
}

/**
 * 列出所有 Engram 数据库名称
 */
export async function listAllDatabases(): Promise<string[]> {
  const allDbs = await Dexie.getDatabaseNames();
  return allDbs.filter((name) => name.startsWith('Engram_'));
}

/**
 * 获取所有 Engram 数据库的 chatId 列表
 */
export async function listAllChatIds(): Promise<string[]> {
  const dbNames = await listAllDatabases();
  return dbNames.map((name) => name.replace('Engram_', ''));
}

/**
 * 重新绑定数据库：将源聊天库的数据迁移到目标聊天（覆盖），并删除源库
 *
 * 适用场景：聊天被导出后重新导入，chatId 变化导致旧库孤立，
 * 手动把旧库重新绑定到新聊天。IndexedDB 无法改名，因此采用
 * 导出源库 → 覆盖导入目标库 → 删除源库 的方式实现。
 */
export async function rebindDatabase(sourceChatId: string, targetChatId: string): Promise<void> {
  if (!sourceChatId || !targetChatId) {
    throw new Error('[Engram DB] rebind requires valid source and target chatId');
  }
  if (sourceChatId === targetChatId) {
    throw new Error('[Engram DB] rebind source and target chatId must differ');
  }

  Logger.info(MODULE, `Rebinding database: ${sourceChatId} -> ${targetChatId}`);

  const sourceDb = getDbForChat(sourceChatId);
  const dump = await exportChatData(sourceDb);

  const targetDb = getDbForChat(targetChatId);
  await importChatData(targetDb, dump);

  await deleteDatabase(sourceChatId);

  Logger.info(MODULE, `Rebind complete: ${sourceChatId} -> ${targetChatId}`);
}

// ======================== ST 聊天枚举与孤立判定 ========================

/**
 * 从 /api/chats 响应中解析全部 chatId（纯函数，便于测试）
 *
 * 兼容两种格式：
 * - 新格式（ST 1.12+）：{ 角色名: [{ chat_id: 'uuid', ... }] }
 * - 旧格式（<1.12）：{ 角色名: ['角色名 - 日期.jsonl', ...] }，旧版 chatId 即文件名
 */
export function extractChatIdsFromApiChats(payload: unknown): Set<string> {
  const ids = new Set<string>();
  if (!payload || typeof payload !== 'object') {
    return ids;
  }

  for (const value of Object.values(payload as Record<string, unknown>)) {
    if (!Array.isArray(value)) {
      continue;
    }
    for (const item of value) {
      if (typeof item === 'string') {
        const id = item.replace(/\.jsonl?$/i, '');
        if (id) {
          ids.add(id);
        }
      } else if (item && typeof item === 'object') {
        const chatId = (item as Record<string, unknown>).chat_id;
        if (typeof chatId === 'string' && chatId) {
          ids.add(chatId);
        }
      }
    }
  }

  return ids;
}

// /api/chats 响应缓存 (30s TTL，避免每次刷新列表都请求)
let tavernChatIdsCache: { ts: number; ids: Set<string> | null } | null = null;
const TAVERN_CHATS_CACHE_TTL_MS = 30_000;

/**
 * 从本地上下文收集已知 chatId（同步、无网络）：
 * 当前聊天 + 各角色活跃聊天 + ST 1.12+ 的 context.chats
 */
function listLocalChatIds(ctx: ReturnType<typeof getSTContext>): Set<string> {
  const ids = new Set<string>();
  if (ctx?.chatId) {
    ids.add(ctx.chatId);
  }

  for (const character of ctx?.characters ?? []) {
    if (character?.chat) {
      ids.add(character.chat);
    }
  }

  const chats = (ctx as Record<string, unknown> | null | undefined)?.chats;
  if (Array.isArray(chats)) {
    for (const item of chats) {
      if (item && typeof item === 'object') {
        const chatId = (item as Record<string, unknown>).chat_id;
        if (typeof chatId === 'string' && chatId) {
          ids.add(chatId);
        }
      }
    }
  }

  return ids;
}

/**
 * 枚举 ST 中所有聊天 ID
 *
 * 返回 null 表示无法可靠枚举（旧版酒馆且 API 不可用），
 * 调用方不应据此判定孤立，避免误删风险。
 */
export async function listTavernChatIds(): Promise<Set<string> | null> {
  const ctx = getSTContext();
  const localIds = listLocalChatIds(ctx);

  // ST 1.12+：context.chats 非空即视为可靠完整来源
  const chats = (ctx as Record<string, unknown> | null | undefined)?.chats;
  if (Array.isArray(chats) && chats.length > 0) {
    return localIds;
  }

  // 缓存命中
  const now = Date.now();
  if (tavernChatIdsCache && now - tavernChatIdsCache.ts < TAVERN_CHATS_CACHE_TTL_MS) {
    return tavernChatIdsCache.ids === null
      ? null
      : new Set([...localIds, ...tavernChatIdsCache.ids]);
  }

  // HTTP 回退：GET /api/chats
  try {
    const response = await fetch('/api/chats', { headers: getRequestHeaders() });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload: unknown = await response.json();
    const remoteIds = extractChatIdsFromApiChats(payload);
    tavernChatIdsCache = { ts: now, ids: remoteIds };
    return new Set([...localIds, ...remoteIds]);
  } catch (error) {
    Logger.warn(MODULE, '无法枚举酒馆聊天列表，孤立判定降级为 unknown', error);
    tavernChatIdsCache = { ts: now, ids: null };
    return null;
  }
}

/**
 * 判定单个聊天库与 ST 聊天的绑定状态
 */
export async function classifyChatStatus(chatId: string): Promise<DatabaseBindStatus> {
  const ids = await listTavernChatIds();
  if (ids === null) {
    return 'unknown';
  }
  return ids.has(chatId) ? 'active' : 'orphaned';
}

function buildChatCharacterNameMap(): Map<string, string> {
  const ctx = getSTContext();
  const map = new Map<string, string>();

  if (!ctx?.characters || !Array.isArray(ctx.characters)) {
    return map;
  }

  for (const character of ctx.characters) {
    if (!character?.chat || !character?.name) {
      continue;
    }
    map.set(character.chat, character.name);
  }

  return map;
}

export async function listDatabaseSummaries(currentChatId?: string): Promise<DatabaseSummary[]> {
  const dbNames = await listAllDatabases();
  const chatCharacterMap = buildChatCharacterNameMap();
  const tavernChatIds = await listTavernChatIds();

  const summaries = await Promise.all(
    dbNames.map(async (name) => {
      const chatId = name.replace('Engram_', '');
      const db = getDbForChat(chatId);
      const lastModifiedMeta = await db.meta.get('lastModified');
      const [eventCount, entityCount] = await Promise.all([db.events.count(), db.entities.count()]);

      const status: DatabaseBindStatus =
        tavernChatIds === null ? 'unknown' : tavernChatIds.has(chatId) ? 'active' : 'orphaned';

      return {
        name,
        chatId,
        characterName: chatCharacterMap.get(chatId) ?? null,
        isCurrent: currentChatId === chatId,
        lastModified: typeof lastModifiedMeta?.value === 'number' ? lastModifiedMeta.value : null,
        status,
        eventCount,
        entityCount,
      };
    })
  );

  const statusRank: Record<DatabaseBindStatus, number> = {
    orphaned: 0,
    unknown: 1,
    active: 2,
  };

  return summaries.toSorted((a, b) => {
    if (a.isCurrent !== b.isCurrent) {
      return a.isCurrent ? -1 : 1;
    }

    // 孤立库置顶，方便发现与处理
    const statusDiff = statusRank[a.status] - statusRank[b.status];
    if (statusDiff !== 0) {
      return statusDiff;
    }

    const aGroup = a.characterName ?? a.chatId;
    const bGroup = b.characterName ?? b.chatId;
    if (aGroup !== bGroup) {
      return aGroup.localeCompare(bGroup, 'zh-CN');
    }

    return (b.lastModified ?? 0) - (a.lastModified ?? 0);
  });
}

export async function getDatabaseStats(chatId: string): Promise<DatabaseStats> {
  const db = getDbForChat(chatId);

  const countByFlag = async <T extends object>(
    table: Table<T, string>,
    field: keyof T & string
  ): Promise<number> => {
    try {
      return await (table as Table<T, string>)
        .where(field as string)
        .equals(1 as never)
        .count();
    } catch (error) {
      Logger.warn(MODULE, `Falling back to full scan for ${field} in Engram_${chatId}`, error);
      const rows = await table.toArray();
      return rows.filter((row) => row?.[field] === true || row?.[field] === 1).length;
    }
  };

  const [
    eventCount,
    entityCount,
    archivedEventCount,
    archivedEntityCount,
    embeddedEventCount,
    embeddedEntityCount,
    lastModifiedMeta,
  ] = await Promise.all([
    db.events.count(),
    db.entities.count(),
    countByFlag(db.events, 'is_archived'),
    countByFlag(db.entities, 'is_archived'),
    countByFlag(db.events, 'is_embedded'),
    countByFlag(db.entities, 'is_embedded'),
    db.meta.get('lastModified'),
  ]);

  return {
    name: `Engram_${chatId}`,
    chatId,
    eventCount,
    entityCount,
    archivedEventCount,
    archivedEntityCount,
    embeddedEventCount,
    embeddedEntityCount,
    lastModified: typeof lastModifiedMeta?.value === 'number' ? lastModifiedMeta.value : null,
  };
}
