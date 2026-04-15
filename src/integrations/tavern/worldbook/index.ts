export * from './crud';
export * from './engram';
export * from './metrics';
export * from './scanner';
export * from './slot';

// Facade Implementation moved here
import { getTavernHelper } from '@/core/utils';

import {
  createEntry,
  deleteEntries,
  deleteEntry,
  deleteWorldbook,
  findEntryByKey,
  getEntries,
  getWorldbookNames,
  updateEntry,
} from './crud';
import { findExistingWorldbook, getOrCreateWorldbook, getScopes } from './engram';
import {
  countTokens,
  countTokensBatch,
  getWorldbookTokenStats,
  isNativeTokenCountAvailable,
} from './metrics';
import {
  getContextualWorldInfo as getContextualWorldInfoInternal,
  getLiveActivatedWorldInfo as getLiveActivatedWorldInfoInternal,
  scanWorldbook,
} from './scanner';

/**
 * WorldInfoService (Facade)
 *
 * 聚合各个分散模块的功能，提供统一的静态方法访问接口
 */

// =========================================================================
// Metrics 代理 (metrics.ts)
// =========================================================================

export async function countWorldbookTokens(text: string): Promise<number> {
  return countTokens(text);
}

export async function countWorldbookTokensBatch(texts: string[]): Promise<number[]> {
  return countTokensBatch(texts);
}

export async function getWorldbookStats(worldbookName: string): Promise<{
  totalTokens: number;
  entryCount: number;
  entries: Array<{ name: string; tokens: number }>;
}> {
  return getWorldbookTokenStats(worldbookName);
}

export function isWorldInfoAvailable(): boolean {
  return getTavernHelper() !== null;
}

export async function isNativeWorldbookTokenCountAvailable(): Promise<boolean> {
  return isNativeTokenCountAvailable();
}

// =========================================================================
// CRUD 代理 (crud.ts)
// =========================================================================

export async function getWorldbookEntries(worldbookName: string) {
  return getEntries(worldbookName);
}

export async function getAllWorldbookNames(): Promise<string[]> {
  return getWorldbookNames();
}

export async function removeWorldbook(worldbookName: string): Promise<boolean> {
  return deleteWorldbook(worldbookName);
}

export async function createWorldbookEntry(
  worldbookName: string,
  params: Partial<WorldbookEntry> & { name: string; content: string }
): Promise<boolean> {
  return createEntry(worldbookName, params);
}

export async function updateWorldbookEntry(
  worldbookName: string,
  uid: number,
  updates: Partial<WorldbookEntry>
): Promise<boolean> {
  return updateEntry(worldbookName, uid, updates);
}

export async function removeWorldbookEntry(worldbookName: string, uid: number): Promise<boolean> {
  return deleteEntry(worldbookName, uid);
}

export async function removeWorldbookEntries(
  worldbookName: string,
  uids: number[]
): Promise<boolean> {
  return deleteEntries(worldbookName, uids);
}

export async function findWorldbookEntryByKey(worldbookName: string, key: string) {
  return findEntryByKey(worldbookName, key);
}

// =========================================================================
// Scanner 代理 (scanner.ts)
// =========================================================================

export async function getLiveActivatedWorldbookInfo(): Promise<string> {
  return getLiveActivatedWorldInfoInternal();
}

export async function getContextualWorldbookInfo(
  chatMessages: string[],
  options?: {
    floorRange?: [number, number];
    extraWorldbooks?: string[];
  }
): Promise<string> {
  return getContextualWorldInfoInternal(chatMessages, options);
}

export async function scanSingleWorldbook(
  worldbookName: string,
  contextText: string,
  options?: { forceInclude?: boolean }
): Promise<string> {
  return scanWorldbook(worldbookName, contextText, options);
}

export function getWorldbookScopes() {
  return getScopes();
}

/**
 * 聚合世界书结构（用于 UI 展示等）
 */
export async function getWorldbookStructure(): Promise<Record<string, any[]>> {
  const helper = getTavernHelper();
  if (!helper) {
    return {};
  }

  // 优化：
  // 直接复用 engram.ts 的 getScopes()，避免重复维护“当前角色世界书”的判定逻辑
  const { installed, chat } = getScopes();
  const targetBooks = Array.from(new Set([...installed, ...chat])).sort();

  const structure: Record<string, any[]> = {};

  for (const book of targetBooks) {
    try {
      const entries = await getEntries(book);
      structure[book] = entries.map((entry) => ({
        uid: entry.uid,
        name: entry.name,
        keys: entry.strategy.keys.map((key) => (typeof key === 'string' ? key : key.source)),
        constant: entry.strategy.type === 'constant',
        comment: '',
        content: `${entry.content?.substring(0, 50) || ''}...`,
      }));
    } catch {
      structure[book] = [];
    }
  }

  return structure;
}

// =========================================================================
// Engram 业务逻辑代理 (engram.ts)
// =========================================================================

export function findEngramWorldbook(): string | null {
  return findExistingWorldbook();
}

export async function ensureEngramWorldbook(): Promise<string | null> {
  return getOrCreateWorldbook();
}

export async function getChatWorldbook(): Promise<string | null> {
  return getOrCreateWorldbook();
}
