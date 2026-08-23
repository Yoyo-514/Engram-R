/**
 * db.ts 数据层测试
 *
 * 环境说明：Node 环境下 IndexedDB 由 fake-indexeddb 提供；
 * 酒馆上下文与同步服务通过 vi.mock 隔离，避免引入浏览器依赖链。
 */
import { Dexie } from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EntityType } from '@/config/memory/defaults';
import type { EntityNode, EventNode } from '@/types/graph';

vi.mock('@/data/SyncService', () => ({
  syncService: {
    isImportingState: false,
    scheduleUpload: vi.fn<() => void>(),
  },
}));

vi.mock('@/integrations/tavern', () => ({
  getSTContext: vi.fn<() => null>(),
  getRequestHeaders: vi.fn<() => Record<string, string>>(() => ({
    'Content-Type': 'application/json',
    'X-CSRF-TOKEN': 'test-token',
  })),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

/** 构造最小合法的测试事件节点 */
function makeEvent(id: string): EventNode {
  return {
    id,
    summary: `event ${id}`,
    structured_kv: {
      time_anchor: '2025-01-01',
      role: ['角色A'],
      location: ['地点'],
      event: '测试事件',
      logic: [],
      causality: '',
    },
    is_embedded: false,
    is_archived: false,
    significance_score: 0.5,
    level: 0,
    source_range: { start_index: 0, end_index: 1 },
    timestamp: Date.now(),
  };
}

/** 构造最小合法的测试实体节点 */
function makeEntity(id: string): EntityNode {
  return {
    id,
    name: `entity ${id}`,
    type: EntityType.Character,
    aliases: [],
    description: '',
    profile: {},
    last_updated_at: Date.now(),
  };
}

describe('extractChatIdsFromApiChats', () => {
  it('parses new format with chat_id fields', async () => {
    const { extractChatIdsFromApiChats } = await import('@/data/db');
    const ids = extractChatIdsFromApiChats({
      角色A: [
        { chat_id: 'uuid-1', file_name: 'a.jsonl' },
        { chat_id: 'uuid-2', file_name: 'b.jsonl' },
      ],
      角色B: [{ chat_id: 'uuid-3' }],
    });
    expect(ids).toEqual(new Set(['uuid-1', 'uuid-2', 'uuid-3']));
  });

  it('parses legacy format with file names', async () => {
    const { extractChatIdsFromApiChats } = await import('@/data/db');
    const ids = extractChatIdsFromApiChats({
      角色A: ['角色A - 2025-01-01 @12h 00m.jsonl', '角色A - 2025-01-02.jsonl'],
    });
    expect(ids.has('角色A - 2025-01-01 @12h 00m')).toBe(true);
    expect(ids.has('角色A - 2025-01-02')).toBe(true);
  });

  it('ignores invalid payloads gracefully', async () => {
    const { extractChatIdsFromApiChats } = await import('@/data/db');
    expect(extractChatIdsFromApiChats(null).size).toBe(0);
    expect(extractChatIdsFromApiChats('string').size).toBe(0);
    expect(extractChatIdsFromApiChats({ x: 'not-array' }).size).toBe(0);
    expect(extractChatIdsFromApiChats({ x: [42, null] }).size).toBe(0);
  });
});

describe('listTavernChatIds', () => {
  it('returns null when chat enumeration fails', async () => {
    vi.resetModules();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      })
    );

    const { listTavernChatIds } = await import('@/data/db');
    expect(await listTavernChatIds()).toBeNull();
  });

  it('enumerates chat ids from /api/chats and classifies orphaned chats', async () => {
    vi.resetModules();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ 角色A: ['角色A - 2025-01-01.jsonl'] }), { status: 200 })
      )
    );

    const { classifyChatStatus, listTavernChatIds } = await import('@/data/db');
    const ids = await listTavernChatIds();
    expect(ids).not.toBeNull();
    expect(ids!.has('角色A - 2025-01-01')).toBe(true);

    expect(await classifyChatStatus('角色A - 2025-01-01')).toBe('active');
    expect(await classifyChatStatus('ghost-chat')).toBe('orphaned');
  });
});

describe('rebindDatabase', () => {
  it('migrates source data to target and deletes the source', async () => {
    const { databaseExists, getDbForChat, rebindDatabase } = await import('@/data/db');
    const sourceId = 'rebind-src-test';
    const targetId = 'rebind-tgt-test';

    await Dexie.delete(`Engram_${sourceId}`);
    await Dexie.delete(`Engram_${targetId}`);

    const source = getDbForChat(sourceId);
    await source.events.bulkAdd([makeEvent('e1'), makeEvent('e2')]);
    await source.entities.bulkAdd([makeEntity('n1')]);
    await source.meta.put({ key: 'lastSummarizedFloor', value: 5 });

    await rebindDatabase(sourceId, targetId);

    expect(await databaseExists(sourceId)).toBe(false);

    const target = getDbForChat(targetId);
    expect(await target.events.count()).toBe(2);
    expect(await target.entities.count()).toBe(1);
    expect((await target.meta.get('lastSummarizedFloor'))?.value).toBe(5);
  });

  it('rejects invalid rebind arguments', async () => {
    const { rebindDatabase } = await import('@/data/db');
    await expect(rebindDatabase('', 'tgt')).rejects.toThrow(
      'rebind requires valid source and target chatId'
    );
    await expect(rebindDatabase('same', 'same')).rejects.toThrow(
      'rebind source and target chatId must differ'
    );
  });
});
