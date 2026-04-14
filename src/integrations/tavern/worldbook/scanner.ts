import { Logger } from '@/core/logger';
import type { WorldbookConfig } from '@/types/prompt';
import { getSettings } from '@/config/settings';
import { processEJSMacros } from '../prompt/ejsProcessor';
import { eventBus, events } from '../core/events';
import { getEntries, type WorldbookEntryWithWorld } from './crud';
import { getScopes } from './engram';

const MODULE = 'Worldbook';
const ENGRAM_WORLDBOOK_PREFIX = '[Engram]';

interface WorldInfoScanDonePayload {
  activated?: {
    text?: string;
    entries?: Map<`${string}.${string}`, SillyTavern.FlattenedWorldInfoEntry>;
  };
}

interface ContextualWorldInfoOptions {
  floorRange?: [number, number];
  extraWorldbooks?: string[];
}

const CONTEXTUAL_WORLD_INFO_CACHE_LIMIT = 32;

interface LiveActivatedWorldInfoEntry {
  world: string;
  entry: SillyTavern.FlattenedWorldInfoEntry;
}

let latestActivatedWorldInfoText = '';
let latestActivatedWorldInfoEntries: LiveActivatedWorldInfoEntry[] = [];
let hasActivatedWorldInfoCache = false;
let worldInfoScanListenerInitialized = false;
let unsubscribeWorldInfoScanListener: (() => void) | null = null;
const unsubscribeWorldInfoCacheInvalidators: Array<() => void> = [];
const contextualWorldInfoCache = new Map<string, string>();

function clearLiveWorldInfoCache(reason: string): void {
  latestActivatedWorldInfoText = '';
  latestActivatedWorldInfoEntries = [];
  hasActivatedWorldInfoCache = false;
  Logger.debug(MODULE, 'Cleared live world info cache', { reason });
}

function clearContextualWorldInfoCache(reason: string): void {
  if (contextualWorldInfoCache.size === 0) {
    return;
  }

  contextualWorldInfoCache.clear();
  Logger.debug(MODULE, 'Cleared contextual world info cache', { reason });
}

function clearWorldInfoCaches(reason: string): void {
  clearLiveWorldInfoCache(reason);
  clearContextualWorldInfoCache(reason);
}

function normalizeExtraWorldbooks(extraWorldbooks?: string[]): string[] {
  return [...new Set((extraWorldbooks || []).filter((name): name is string => !!name))];
}

function normalizeLiveEntryWorld(entryKey: string): string {
  const separatorIndex = entryKey.lastIndexOf('.');
  return separatorIndex === -1 ? entryKey : entryKey.slice(0, separatorIndex);
}

function ensureWorldInfoScanListener(): void {
  if (worldInfoScanListenerInitialized || !eventBus.isAvailable()) {
    return;
  }

  unsubscribeWorldInfoScanListener = eventBus.on(
    events.WORLDINFO_SCAN_DONE,
    (eventData: unknown) => {
      const payload = eventData as WorldInfoScanDonePayload;
      latestActivatedWorldInfoText = payload.activated?.text || '';
      latestActivatedWorldInfoEntries = Array.from(payload.activated?.entries?.entries() || []).map(
        ([entryKey, entry]) => ({
          world: normalizeLiveEntryWorld(entryKey),
          entry,
        })
      );
      hasActivatedWorldInfoCache = true;

      Logger.debug(MODULE, 'Updated activated world info cache from Tavern event', {
        textLength: latestActivatedWorldInfoText.length,
        entryCount: latestActivatedWorldInfoEntries.length,
      });
    }
  );

  unsubscribeWorldInfoCacheInvalidators.push(
    eventBus.on(events.CHAT_CHANGED, () => {
      clearWorldInfoCaches('chat_changed');
    })
  );
  unsubscribeWorldInfoCacheInvalidators.push(
    eventBus.on(events.SETTINGS_UPDATED, () => {
      clearWorldInfoCaches('settings_updated');
    })
  );
  unsubscribeWorldInfoCacheInvalidators.push(
    eventBus.on(events.WORLDINFO_UPDATED, () => {
      clearWorldInfoCaches('worldinfo_updated');
    })
  );
  unsubscribeWorldInfoCacheInvalidators.push(
    eventBus.on(events.WORLDINFO_SETTINGS_UPDATED, () => {
      clearWorldInfoCaches('worldinfo_settings_updated');
    })
  );

  worldInfoScanListenerInitialized = true;
}

function loadFilteringState() {
  const { global, chat } = getScopes();
  const settings = getSettings();
  const config: WorldbookConfig | undefined = settings.apiSettings?.worldbookConfig;

  return {
    config,
    globalWorldbooks: global,
    chatWorldbooks: chat,
    disabledGlobalBooks: config?.disabledWorldbooks || [],
    disabledEntries: config?.disabledEntries || {},
  };
}

function isWorldbookFeatureEnabled(config?: WorldbookConfig): boolean {
  return config?.enabled !== false;
}

function getWorldbooksForContextScan(filterState: ReturnType<typeof loadFilteringState>): string[] {
  const { config, globalWorldbooks, chatWorldbooks, disabledGlobalBooks } = filterState;
  const scopedGlobalBooks = config?.includeGlobal === false ? [] : globalWorldbooks;

  return [...new Set([...scopedGlobalBooks, ...chatWorldbooks])]
    .filter((name): name is string => typeof name === 'string' && name.length > 0)
    .filter((name) => !name.startsWith(ENGRAM_WORLDBOOK_PREFIX))
    .filter((name) => !disabledGlobalBooks.includes(name));
}

function resolveScanMessages(chatMessages?: string[]): string[] {
  return (chatMessages || []).filter(
    (message): message is string => typeof message === 'string' && message.length > 0
  );
}

function buildFilterStateCacheKey(filterState: ReturnType<typeof loadFilteringState>): string {
  const { config, globalWorldbooks, chatWorldbooks, disabledGlobalBooks, disabledEntries } = filterState;

  return JSON.stringify({
    enabled: config?.enabled !== false,
    includeGlobal: config?.includeGlobal !== false,
    globalWorldbooks: [...globalWorldbooks].sort(),
    chatWorldbooks: [...chatWorldbooks].sort(),
    disabledGlobalBooks: [...disabledGlobalBooks].sort(),
    disabledEntries: Object.entries(disabledEntries)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([book, entries]) => [book, [...entries].sort((a, b) => a - b)]),
  });
}

function buildContextualWorldInfoCacheKey(
  messages: string[],
  options: ContextualWorldInfoOptions | undefined,
  filterState: ReturnType<typeof loadFilteringState>
): string {
  return JSON.stringify({
    messages,
    floorRange: options?.floorRange ?? null,
    extraWorldbooks: normalizeExtraWorldbooks(options?.extraWorldbooks),
    filterState: buildFilterStateCacheKey(filterState),
  });
}

function getContextualWorldInfoCache(key: string): string | undefined {
  const cached = contextualWorldInfoCache.get(key);
  if (cached === undefined) {
    return undefined;
  }

  contextualWorldInfoCache.delete(key);
  contextualWorldInfoCache.set(key, cached);
  return cached;
}

function setContextualWorldInfoCache(key: string, value: string): void {
  if (contextualWorldInfoCache.has(key)) {
    contextualWorldInfoCache.delete(key);
  }

  contextualWorldInfoCache.set(key, value);

  if (contextualWorldInfoCache.size > CONTEXTUAL_WORLD_INFO_CACHE_LIMIT) {
    const oldestKey = contextualWorldInfoCache.keys().next().value;
    if (oldestKey) {
      contextualWorldInfoCache.delete(oldestKey);
    }
  }
}

function shouldIncludeEntry(
  entry: WorldbookEntryWithWorld,
  globalWorldbooks: string[],
  disabledGlobalBooks: string[],
  disabledEntries: Record<string, number[]>,
  config?: WorldbookConfig
): boolean {
  if (!isWorldbookFeatureEnabled(config)) {
    return false;
  }

  if (entry.extra?.engram === true) return true;
  if (entry.world?.startsWith(ENGRAM_WORLDBOOK_PREFIX)) return false;

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

function shouldIncludeLiveEntry(
  liveEntry: LiveActivatedWorldInfoEntry,
  filterState: ReturnType<typeof loadFilteringState>
): boolean {
  const { config, globalWorldbooks, disabledGlobalBooks, disabledEntries } = filterState;
  const { world, entry } = liveEntry;

  if (!isWorldbookFeatureEnabled(config)) {
    return false;
  }

  if (entry.extra?.engram === true) {
    return true;
  }

  if (world.startsWith(ENGRAM_WORLDBOOK_PREFIX)) {
    return false;
  }

  if (disabledGlobalBooks.includes(world)) {
    return false;
  }

  if (globalWorldbooks.includes(world) && config?.includeGlobal === false) {
    return false;
  }

  const bookDisabledList = disabledEntries[world];
  if (bookDisabledList?.includes(entry.uid)) {
    return false;
  }

  return !entry.disable;
}

async function buildLiveActivatedWorldInfo(
  filterState: ReturnType<typeof loadFilteringState>
): Promise<string> {
  if (latestActivatedWorldInfoEntries.length === 0) {
    return latestActivatedWorldInfoText;
  }

  const filteredEntries = latestActivatedWorldInfoEntries
    .filter((liveEntry) => shouldIncludeLiveEntry(liveEntry, filterState))
    .sort((a, b) => a.entry.order - b.entry.order || a.entry.uid - b.entry.uid);

  if (filteredEntries.length === 0) {
    return '';
  }

  const processedEntries = await processEJSMacros(
    filteredEntries.map(({ entry }) => entry.content || '')
  );

  return processedEntries.filter(Boolean).join('\n\n');
}

/**
 * 扫描单个世界书，返回命中的条目文本
 */
export async function scanWorldbook(
  worldbookName: string,
  contextText: string,
  options?: { forceInclude?: boolean }
): Promise<string> {
  // Early-exit: check filtering state BEFORE expensive getEntries() API call
  const filterState = loadFilteringState();
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

  const entries = await getEntries(worldbookName);
  if (entries.length === 0) return '';

  const activeEntries: WorldbookEntryWithWorld[] = [];
  const lowerContext = contextText.toLowerCase();

  for (const entry of entries) {
    if (!shouldIncludeEntry(entry, globalWorldbooks, disabledGlobalBooks, disabledEntries, config)) {
      continue;
    }

    if (!entry.enabled) {
      continue;
    }

    if (entry.strategy.type === 'constant') {
      activeEntries.push(entry);
      continue;
    }

    const keys = entry.strategy.keys;
    if (!keys || keys.length === 0) {
      continue;
    }

    const matched = keys.some((key) => {
      const keyStr = typeof key === 'string' ? key : key.source;
      return keyStr && lowerContext.includes(keyStr.toLowerCase());
    });

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

  activeEntries.sort((a, b) => a.position.order - b.position.order);
  return activeEntries.map((entry) => entry.content).join('\n\n');
}

/**
 * 获取当前 Tavern 已激活的世界书文本
 */
export async function getLiveActivatedWorldInfo(): Promise<string> {
  try {
    ensureWorldInfoScanListener();

    const filterState = loadFilteringState();
    const { config } = filterState;
    if (!isWorldbookFeatureEnabled(config)) {
      Logger.debug(MODULE, 'Worldbook feature disabled, skipping live world info');
      return '';
    }

    if (!hasActivatedWorldInfoCache) {
      Logger.debug(MODULE, 'Activated world info cache is not ready yet');
      return '';
    }

    const resolvedWorldInfo = await buildLiveActivatedWorldInfo(filterState);

    Logger.debug(MODULE, 'Using Tavern activated world info cache', {
      textLength: resolvedWorldInfo.length,
      sourceEntryCount: latestActivatedWorldInfoEntries.length,
    });

    return resolvedWorldInfo;
  } catch (error) {
    Logger.error(MODULE, 'Failed to get live activated worldbooks', error);
    return '';
  }
}

export async function getContextualWorldInfo(
  chatMessages: string[],
  options?: ContextualWorldInfoOptions
): Promise<string> {
  try {
    ensureWorldInfoScanListener();

    const filterState = loadFilteringState();
    const { config } = filterState;

    if (!isWorldbookFeatureEnabled(config)) {
      Logger.debug(MODULE, 'Worldbook feature disabled, skipping contextual world info');
      return '';
    }

    const messages = resolveScanMessages(chatMessages);
    const cacheKey = buildContextualWorldInfoCacheKey(messages, options, filterState);
    const cached = getContextualWorldInfoCache(cacheKey);
    if (cached !== undefined) {
      Logger.debug(MODULE, 'Using contextual world info cache', {
        messageCount: messages.length,
        extraWorldbooksCount: normalizeExtraWorldbooks(options?.extraWorldbooks).length,
      });
      return cached;
    }

    const contextText = messages.join('\n');
    const extraWorldbooks = normalizeExtraWorldbooks(options?.extraWorldbooks);
    const defaultWorldbooks = getWorldbooksForContextScan(filterState);
    const standardWorldbooks = defaultWorldbooks.filter(
      (worldbookName) => !extraWorldbooks.includes(worldbookName)
    );

    if (!contextText && standardWorldbooks.length === 0 && extraWorldbooks.length === 0) {
      setContextualWorldInfoCache(cacheKey, '');
      return '';
    }

    const extraScanResults = await Promise.all(
      extraWorldbooks.map((worldbookName) =>
        scanWorldbook(worldbookName, contextText, { forceInclude: true })
      )
    );
    const scanResults = await Promise.all(
      standardWorldbooks.map((worldbookName) => scanWorldbook(worldbookName, contextText))
    );

    const rawResult = [...extraScanResults, ...scanResults].filter(Boolean).join('\n\n');
    const [result = ''] = await processEJSMacros([rawResult]);
    setContextualWorldInfoCache(cacheKey, result);

    Logger.debug(MODULE, 'Resolved world info via contextual scan', {
      hasFloorRange: Boolean(options?.floorRange),
      extraWorldbooksCount: extraWorldbooks.length,
      matchedCount: result ? result.split('\n\n').length : 0,
      messageCount: messages.length,
      cacheSize: contextualWorldInfoCache.size,
    });

    return result;
  } catch (error) {
    Logger.error(MODULE, 'Failed to get contextual worldbooks', error);
    return '';
  }
}

/**
 * 重置已激活世界书缓存与监听状态
 * 用于测试、热重载或需要重新建立监听的场景
 */
export function resetWorldInfoScanCache(): void {
  unsubscribeWorldInfoScanListener?.();
  unsubscribeWorldInfoScanListener = null;
  for (const unsubscribe of unsubscribeWorldInfoCacheInvalidators.splice(0)) {
    unsubscribe();
  }
  clearWorldInfoCaches('manual_reset');
  worldInfoScanListenerInitialized = false;
}
