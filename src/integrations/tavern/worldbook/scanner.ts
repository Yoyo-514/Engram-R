import { Logger } from '@/core/logger';
import type { WorldbookConfig } from '@/config/types/prompt';
import { getSTContext } from '@/integrations/tavern';
import { getTavernHelper } from './adapter';
import { getEntries } from './crud';
import { type WorldInfoEntry } from './types';

const MODULE = 'Worldbook';

async function loadFilteringState() {
  const helper = getTavernHelper();
  const globalWorldbooks = helper?.getGlobalWorldbookNames?.() || [];
  const charBooks = helper?.getCharWorldbookNames?.('current');
  const chatWorldbooks = charBooks
    ? ([...(charBooks.additional || []), charBooks.primary].filter(Boolean) as string[])
    : [];

  const { SettingsManager } = await import('@/config/settings');
  const settings = SettingsManager.getSettings();
  const config: WorldbookConfig | undefined = settings.apiSettings?.worldbookConfig;

  return {
    config,
    globalWorldbooks,
    chatWorldbooks,
    disabledGlobalBooks: config?.disabledWorldbooks || [],
    disabledEntries: config?.disabledEntries || {},
  };
}

function isWorldbookFeatureEnabled(config?: WorldbookConfig): boolean {
  return config?.enabled !== false;
}

function shouldIncludeEntry(
  entry: WorldInfoEntry,
  globalWorldbooks: string[],
  disabledGlobalBooks: string[],
  disabledEntries: Record<string, number[]>,
  config?: WorldbookConfig
): boolean {
  if (!isWorldbookFeatureEnabled(config)) {
    return false;
  }

  if (entry.extra?.engram === true) return true;
  if (entry.world?.startsWith('[Engram]')) return false;

  if (entry.world && disabledGlobalBooks.includes(entry.world)) {
    return false;
  }

  if (entry.world && globalWorldbooks.includes(entry.world) && config?.includeGlobal === false) {
    return false;
  }

  if (entry.world && entry.uid) {
    const bookDisabledList = disabledEntries[entry.world];
    if (bookDisabledList && bookDisabledList.includes(entry.uid)) {
      return false;
    }
  }

  return true;
}

function getWorldbooksForContextScan(
  filterState: Awaited<ReturnType<typeof loadFilteringState>>
): string[] {
  const { config, globalWorldbooks, chatWorldbooks, disabledGlobalBooks } = filterState;

  const scopedGlobalBooks = config?.includeGlobal === false ? [] : globalWorldbooks;

  return [...new Set([...scopedGlobalBooks, ...chatWorldbooks])]
    .filter((name): name is string => typeof name === 'string' && name.length > 0)
    .filter((name) => !name.startsWith('[Engram]'))
    .filter((name) => !disabledGlobalBooks.includes(name));
}

function resolveScanMessages(
  chatMessages?: string[],
  options?: { floorRange?: [number, number] }
): string[] {
  const DEFAULT_SCAN_LIMIT = 4;
  let messages = chatMessages;

  const context = getSTContext();

  if (options?.floorRange) {
    const [startFloor, endFloor] = options.floorRange;
    if (context?.chat && Array.isArray(context.chat)) {
      const rangeChat = context.chat.slice(startFloor - 1, endFloor);
      messages = rangeChat.map((message) => message.mes || '').reverse();
      const rangeMessages = messages ?? [];
      if (rangeMessages.length > 0) {
        Logger.debug(MODULE, 'Using floor range scan', {
          floorRange: options.floorRange,
          messageCount: rangeMessages.length,
        });
      }
    }
  } else if (!messages || messages.length === 0) {
    if (context?.chat && Array.isArray(context.chat)) {
      const recentChat = context.chat.slice(-DEFAULT_SCAN_LIMIT);
      messages = recentChat.map((message) => message.mes || '').reverse();
      const recentMessages = messages ?? [];
      if (recentMessages.length > 0) {
        Logger.debug(MODULE, 'Using recent messages scan', {
          scanLimit: DEFAULT_SCAN_LIMIT,
          messageCount: recentMessages.length,
        });
      }
    }
  }

  return messages || [];
}

export class WorldbookScannerService {
  static async scanWorldbook(
    worldbookName: string,
    contextText: string,
    options?: { forceInclude?: boolean }
  ): Promise<string> {
    const entries = await getEntries(worldbookName);
    if (entries.length === 0) return '';

    const filterState = await loadFilteringState();
    let { disabledGlobalBooks } = filterState;
    const { disabledEntries, globalWorldbooks, config } = filterState;

    if (!isWorldbookFeatureEnabled(config)) {
      Logger.debug(MODULE, 'Worldbook feature disabled, skipping scan', {
        worldbook: worldbookName,
      });
      return '';
    }

    const isDisabled = disabledGlobalBooks.includes(worldbookName);
    if (isDisabled && !options?.forceInclude) {
      Logger.debug(MODULE, `Worldbook [${worldbookName}] is disabled`, { forceInclude: false });
      return '';
    }

    if (options?.forceInclude) {
      disabledGlobalBooks = disabledGlobalBooks.filter((name) => name !== worldbookName);
    }

    const activeEntries: WorldInfoEntry[] = [];
    const lowerContext = contextText.toLowerCase();

    for (const entry of entries) {
      if (
        !shouldIncludeEntry(entry, globalWorldbooks, disabledGlobalBooks, disabledEntries, config)
      ) {
        continue;
      }

      if (!entry.enabled) {
        continue;
      }

      if (entry.constant) {
        activeEntries.push(entry);
        continue;
      }

      if (!entry.keys || entry.keys.length === 0) {
        continue;
      }

      const matched = entry.keys.some(
        (key: string) => key && lowerContext.includes(key.toLowerCase())
      );
      if (matched) {
        activeEntries.push(entry);
      }
    }

    if (activeEntries.length === 0) {
      Logger.debug(MODULE, `No matching entries for [${worldbookName}]`, {
        total: entries.length,
        reason: 'No keys matched or no constant entries',
      });
      return '';
    }

    Logger.debug(MODULE, `Scanned worldbook [${worldbookName}]`, {
      total: entries.length,
      matched: activeEntries.length,
      matchedEntries: activeEntries.map((entry) => entry.name),
    });

    activeEntries.sort((a, b) => a.order - b.order);
    return activeEntries.map((entry) => entry.content).join('\n\n');
  }

  static async getActivatedWorldInfo(
    chatMessages?: string[],
    options?: { floorRange?: [number, number] }
  ): Promise<string> {
    try {
      const filterState = await loadFilteringState();
      const { config } = filterState;

      if (!isWorldbookFeatureEnabled(config)) {
        Logger.debug(MODULE, 'Worldbook feature disabled, skipping activated scan');
        return '';
      }

      const messages = resolveScanMessages(chatMessages, options);
      const contextText = messages.join('\n');
      const worldbooksToScan = getWorldbooksForContextScan(filterState);

      if (worldbooksToScan.length === 0) {
        return '';
      }

      const scanResults = await Promise.all(
        worldbooksToScan.map((worldbookName) => this.scanWorldbook(worldbookName, contextText))
      );

      const activeContents = scanResults.filter(Boolean);

      Logger.info(MODULE, 'Activated worldbook scan completed', {
        books: worldbooksToScan.length,
        matched: activeContents.length,
        includeGlobal: config?.includeGlobal !== false,
      });

      return activeContents.join('\n\n');
    } catch (error) {
      Logger.error(MODULE, 'Failed to get activated worldbooks', error);
      return '';
    }
  }
}
