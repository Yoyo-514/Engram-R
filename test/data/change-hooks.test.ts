import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntityType } from '@/config/memory/defaults';
import { ChatDatabase, importChatData } from '@/data/db';
import type { EntityNode, EventNode } from '@/types/graph';

import { DATA_SYNC_OPTIONS } from '../../engram.config';

const sync = vi.hoisted(() => ({
  isImportingState: false,
  scheduleUpload: vi.fn<(id: string) => void>(),
}));
vi.mock('@/data/SyncService', () => ({ syncService: sync }));
vi.mock('@/integrations/tavern', () => ({
  getSTContext: () => null,
  getRequestHeaders: () => ({}),
}));
vi.mock('@/core/logger', () => ({
  Logger: {
    debug: vi.fn<(...args: unknown[]) => void>(),
    error: vi.fn<(...args: unknown[]) => void>(),
  },
}));
const entity: EntityNode = {
  id: 'entity',
  name: 'A',
  type: EntityType.Character,
  aliases: [],
  description: '',
  profile: {},
  last_updated_at: 1,
};
const event: EventNode = {
  id: 'event',
  summary: 'A',
  structured_kv: { time_anchor: '', role: [], location: [], event: '', logic: [], causality: '' },
  timestamp: 1,
  significance_score: 0.5,
  level: 0,
  source_range: { start_index: 0, end_index: 1 },
  is_embedded: false,
  is_archived: false,
};
let db: ChatDatabase;
let sequence = 0;
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  sync.scheduleUpload.mockClear();
  sync.isImportingState = true;
  db = new ChatDatabase('hooks-' + ++sequence);
  await db.events.add(event);
  await db.entities.add(entity);
  sync.isImportingState = false;
});
afterEach(async () => {
  sync.isImportingState = true;
  vi.clearAllTimers();
  await db.delete();
  vi.useRealTimers();
});
async function flush() {
  await vi.advanceTimersByTimeAsync(DATA_SYNC_OPTIONS.changeDelayMs);
}
describe('数据变更提交边界', () => {
  it.each([
    'event-create',
    'event-update',
    'event-delete',
    'entity-create',
    'entity-update',
    'entity-delete',
  ])('%s 提交后更新元数据并调度一次', async (operation) => {
    if (operation === 'event-create') await db.events.add({ ...event, id: 'new' });
    if (operation === 'event-update') await db.events.update('event', { summary: 'updated' });
    if (operation === 'event-delete') await db.events.delete('event');
    if (operation === 'entity-create') await db.entities.add({ ...entity, id: 'new' });
    if (operation === 'entity-update') await db.entities.update('entity', { name: 'updated' });
    if (operation === 'entity-delete') await db.entities.delete('entity');
    expect(sync.scheduleUpload).not.toHaveBeenCalled();
    await flush();
    await vi.waitFor(() =>
      expect(sync.scheduleUpload).toHaveBeenCalledExactlyOnceWith('hooks-' + sequence)
    );
    expect((await db.meta.get('lastModified'))?.value).toBeTypeOf('number');
  });
  it('回滚事务不产生修改时间或同步任务', async () => {
    await expect(
      db.transaction('rw', db.entities, async () => {
        await db.entities.update('entity', { name: 'aborted' });
        throw new Error('rollback');
      })
    ).rejects.toThrow('rollback');
    await flush();
    expect(await db.meta.get('lastModified')).toBeUndefined();
    expect(sync.scheduleUpload).not.toHaveBeenCalled();
    expect((await db.entities.get('entity'))?.name).toBe('A');
  });
  it('同一事务多表多次变更合并成一次调度', async () => {
    await db.transaction('rw', db.events, db.entities, async () => {
      await db.events.update('event', { summary: 'updated' });
      await db.entities.update('entity', { name: 'B' });
      await db.entities.add({ ...entity, id: 'other' });
    });
    await flush();
    await vi.waitFor(() => expect(sync.scheduleUpload).toHaveBeenCalledTimes(1));
  });
  it('远端导入保留远端元数据，不产生回传', async () => {
    sync.isImportingState = true;
    await importChatData(db, { events: [event], entities: [entity], meta: { lastModified: 123 } });
    sync.isImportingState = false;
    await flush();
    expect((await db.meta.get('lastModified'))?.value).toBe(123);
    expect(sync.scheduleUpload).not.toHaveBeenCalled();
  });
});
