import { Logger } from '@/core/logger';
import { getSTContext } from '@/integrations/tavern';
import { getEntries } from '@/integrations/tavern/worldbook/crud';

const MODULE = 'Worldbook';

async function getTokenCountAsync(text: string): Promise<number> {
  try {
    const context = getSTContext();
    if (context?.getTokenCountAsync) {
      return await context.getTokenCountAsync(text);
    }

    return Math.ceil(text.length / 4);
  } catch {
    Logger.warn(MODULE, '无法使用酒馆 Token 计数，回退到字符估算');
    return Math.ceil(text.length / 4);
  }
}

/**
 * 统计单段文本 token 数
 */
export async function countTokens(text: string): Promise<number> {
  return getTokenCountAsync(text);
}

/**
 * 批量统计文本 token 数
 */
export async function countTokensBatch(texts: string[]): Promise<number[]> {
  return Promise.all(texts.map((text) => getTokenCountAsync(text)));
}

/**
 * 获取世界书 token 统计信息
 */
export async function getWorldbookTokenStats(worldbookName: string): Promise<{
  totalTokens: number;
  entryCount: number;
  entries: Array<{ name: string; tokens: number }>;
}> {
  const entries = await getEntries(worldbookName);

  const entriesWithTokens = await Promise.all(
    entries.map(async (entry) => ({
      name: entry.name,
      tokens: await countTokens(entry.content),
    }))
  );

  const totalTokens = entriesWithTokens.reduce((sum, entry) => sum + entry.tokens, 0);

  return {
    totalTokens,
    entryCount: entries.length,
    entries: entriesWithTokens,
  };
}

/**
 * 检查是否可用原生 token 计数接口
 */
export async function isNativeTokenCountAvailable(): Promise<boolean> {
  try {
    const context = getSTContext();
    return typeof context?.getTokenCountAsync === 'function';
  } catch {
    return false;
  }
}
