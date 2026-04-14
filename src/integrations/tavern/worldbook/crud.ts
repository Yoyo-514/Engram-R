import { Logger } from '@/core/logger';
import { getTavernHelper } from '@/core/utils';

const MODULE = 'Worldbook';

/** WorldbookEntry 带 world 名称 (Engram 注入的辅助字段) */
export type WorldbookEntryWithWorld = WorldbookEntry & { world: string };

/**
 * 获取世界书的所有条目
 *
 * TavernHelper.getWorldbook 已返回结构化的 WorldbookEntry[]，
 * 这里只注入 world 字段方便下游按书名过滤。
 */
export async function getEntries(worldbookName: string): Promise<WorldbookEntryWithWorld[]> {
  const helper = getTavernHelper();
  if (!helper?.getWorldbook) {
    Logger.warn(MODULE, 'TavernHelper 不可用');
    return [];
  }

  try {
    const entries = await helper.getWorldbook(worldbookName);
    if (!Array.isArray(entries)) return [];

    return entries.map((entry) => ({
      ...entry,
      world: worldbookName,
    }));
  } catch (e) {
    Logger.error(MODULE, '获取世界书条目失败', e);
    return [];
  }
}

/**
 * 获取所有世界书名称
 */
export function getWorldbookNames(): string[] {
  const helper = getTavernHelper();
  try {
    return helper?.getWorldbookNames?.() ?? [];
  } catch (e) {
    Logger.error(MODULE, '获取世界书列表失败', e);
    return [];
  }
}

/**
 * 删除世界书
 */
export async function deleteWorldbook(worldbookName: string): Promise<boolean> {
  const helper = getTavernHelper();
  if (!helper?.deleteWorldbook) {
    Logger.warn(MODULE, 'TavernHelper.deleteWorldbook 不可用');
    return false;
  }

  try {
    const success = await helper.deleteWorldbook(worldbookName);
    if (success) {
      Logger.info(MODULE, '已删除世界书', worldbookName);
    }
    return success;
  } catch (e) {
    Logger.error(MODULE, '删除世界书失败', e);
    return false;
  }
}

/**
 * 创建新的世界书条目
 *
 * 直接传递 Partial<WorldbookEntry> 给 TavernHelper，
 * 未设置的字段由酒馆给默认值。
 */
export async function createEntry(
  worldbookName: string,
  params: Partial<WorldbookEntry> & { name: string; content: string }
): Promise<boolean> {
  try {
    const helper = getTavernHelper();
    if (!helper?.createWorldbookEntries) {
      Logger.error(MODULE, 'TavernHelper.createWorldbookEntries 不可用');
      return false;
    }

    const entryData: Partial<WorldbookEntry> = {
      ...params,
      extra: { engram: true, ...params.extra },
    };

    Logger.debug(MODULE, '创建条目', {
      worldbook: worldbookName,
      name: params.name,
      contentLength: params.content.length,
    });

    await helper.createWorldbookEntries(worldbookName, [entryData]);

    Logger.info(MODULE, '条目已保存到世界书', worldbookName);
    return true;
  } catch (e) {
    Logger.error(MODULE, '创建世界书条目失败', e);
    return false;
  }
}

/**
 * 更新世界书条目
 *
 * 使用 updateWorldbookWith 的 updater 模式，直接合并字段。
 */
export async function updateEntry(
  worldbookName: string,
  uid: number,
  updates: Partial<WorldbookEntry>
): Promise<boolean> {
  const helper = getTavernHelper();
  if (!helper?.updateWorldbookWith) {
    Logger.warn(MODULE, 'TavernHelper.updateWorldbookWith 不可用');
    return false;
  }

  try {
    await helper.updateWorldbookWith(worldbookName, (entries) => {
      const index = entries.findIndex((e) => e.uid === uid);
      if (index !== -1) {
        entries[index] = { ...entries[index], ...updates };
        Logger.debug(MODULE, '条目已更新', { uid, name: entries[index].name });
      } else {
        Logger.warn(MODULE, 'updateEntry 未找到条目', uid);
      }
      return entries;
    });
    return true;
  } catch (e) {
    Logger.error(MODULE, '更新世界书条目失败', e);
    return false;
  }
}

/**
 * 删除指定的世界书条目
 */
export async function deleteEntry(worldbookName: string, uid: number): Promise<boolean> {
  const helper = getTavernHelper();
  if (!helper?.deleteWorldbookEntries) {
    Logger.warn(MODULE, 'TavernHelper.deleteWorldbookEntries 不可用');
    return false;
  }

  try {
    await helper.deleteWorldbookEntries(worldbookName, (entry) => entry.uid === uid);
    Logger.debug(MODULE, '已删除条目', { worldbook: worldbookName, uid });
    return true;
  } catch (e) {
    Logger.error(MODULE, '删除世界书条目失败', e);
    return false;
  }
}

/**
 * 批量删除世界书条目
 */
export async function deleteEntries(worldbookName: string, uids: number[]): Promise<boolean> {
  const helper = getTavernHelper();
  if (!helper?.deleteWorldbookEntries) {
    Logger.warn(MODULE, 'TavernHelper.deleteWorldbookEntries 不可用');
    return false;
  }

  try {
    const uidSet = new Set(uids);
    await helper.deleteWorldbookEntries(worldbookName, (entry) => uidSet.has(entry.uid));
    Logger.debug(MODULE, '已批量删除条目', { worldbook: worldbookName, count: uids.length });
    return true;
  } catch (e) {
    Logger.error(MODULE, '批量删除世界书条目失败', e);
    return false;
  }
}

/**
 * 根据 Key 或名称查找条目
 */
export async function findEntryByKey(
  worldbookName: string,
  key: string
): Promise<WorldbookEntryWithWorld | null> {
  const entries = await getEntries(worldbookName);

  // 先按 strategy.keys 数组查找
  let found = entries.find((e) =>
    e.strategy.keys.some((k) => (typeof k === 'string' ? k === key : k.source === key))
  );

  // 兼容旧逻辑：按名称查找
  if (!found) {
    found = entries.find(
      (e) => e.name === key || (key === '__ENGRAM_STATE__' && e.name === 'Engram System State')
    );
  }

  return found ?? null;
}

