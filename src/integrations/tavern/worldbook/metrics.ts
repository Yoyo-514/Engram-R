import { Logger } from '@/core/logger';
import { getSTContext } from '@/integrations/tavern';
import { getEntries } from '@/integrations/tavern/worldbook/crud';
import { type WorldInfoEntry, type WorldInfoTokenStats } from './types';

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

export class WorldbookMetricsService {
  static async countTokens(text: string): Promise<number> {
    return getTokenCountAsync(text);
  }

  static async countTokensBatch(texts: string[]): Promise<number[]> {
    return Promise.all(texts.map((text) => getTokenCountAsync(text)));
  }

  static async getWorldbookTokenStats(worldbookName: string): Promise<WorldInfoTokenStats> {
    const entries = await getEntries(worldbookName);

    const entriesWithTokens = await Promise.all(
      entries.map(async (entry: WorldInfoEntry) => ({
        name: entry.name,
        tokens: await this.countTokens(entry.content),
      }))
    );

    const totalTokens = entriesWithTokens.reduce((sum, entry) => sum + entry.tokens, 0);

    return {
      totalTokens,
      entryCount: entries.length,
      entries: entriesWithTokens,
    };
  }

  static async isNativeTokenCountAvailable(): Promise<boolean> {
    try {
      const context = getSTContext();
      return typeof context?.getTokenCountAsync === 'function';
    } catch {
      return false;
    }
  }
}
