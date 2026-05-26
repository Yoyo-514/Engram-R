export * from './crud';
export * from './engram';
export * from './metrics';
export * from './scanner';
export * from './slot';

import { getTavernHelper } from '@/core/utils';
import type { WorldbookStructure } from '@/types/worldbook_structure';

import { getEntries } from './crud';
import { getScopes } from './engram';
import { countTokens, isNativeTokenCountAvailable } from './metrics';

export async function countWorldbookTokens(text: string): Promise<number> {
  return countTokens(text);
}

export function isWorldInfoAvailable(): boolean {
  return getTavernHelper() !== null;
}

export async function isNativeWorldbookTokenCountAvailable(): Promise<boolean> {
  return isNativeTokenCountAvailable();
}

export function getWorldbookScopes() {
  return getScopes();
}

/**
 * 聚合世界书结构（用于 UI 展示等）
 */
export async function getWorldbookStructure(): Promise<WorldbookStructure> {
  const helper = getTavernHelper();
  if (!helper) {
    return {};
  }

  const { installed, chat } = getScopes();
  const targetBooks = Array.from(new Set([...installed, ...chat])).sort();

  const structure: WorldbookStructure = {};

  for (const book of targetBooks) {
    try {
      const entries = await getEntries(book);
      structure[book] = entries.map((entry) => ({
        uid: entry.uid,
        name: entry.name,
        keys: entry.strategy.keys.map((key) => (typeof key === 'string' ? key : key.source)),
        constant: entry.strategy.type === 'constant',
        disabled: entry.enabled === false,
        comment: '',
        content: `${entry.content?.substring(0, 50) || ''}...`,
      }));
    } catch {
      structure[book] = [];
    }
  }

  return structure;
}
