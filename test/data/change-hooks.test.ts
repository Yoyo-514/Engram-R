import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntityType } from '@/config/memory/defaults';
import { ChatDatabase, importChatData } from '@/data/db';
import type { EntityNode, EventNode } from '@/types/graph';

import { DATABASE_OPTIONS } from '../../engram.config';

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
  db = new ChatDatabase('hooks-' + ++sequence);
  await db.events.add(event);
  await db.entities.add(entity);
  // 落掉初始化写入，保证每个用例从没有修改时间开始
  await flush();
  await db.meta.delete('lastModified');
});
afterEach(async () => {
  vi.clearAllTimers();
  await db.delete();
  vi.useRealTimers();
});
async function flush() {
  await vi.advanceTimersByTimeAsync(DATABASE_OPTIONS.changeDelayMs);
}
describe('数据变更提交边界', () => {
  it.each([
    'event-create',
    'event-update',
    'event-delete',
    'entity-create',
    'entity-update',
    'entity-delete',
  ])('%s 提交后更新元数据', async (operation) => {
    if (operation === 'event-create') await db.events.add({ ...event, id: 'new' });
    if (operation === 'event-update') await db.events.update('event', { summary: 'updated' });
    if (operation === 'event-delete') await db.events.delete('event');
    if (operation === 'entity-create') await db.entities.add({ ...entity, id: 'new' });
    if (operation === 'entity-update') await db.entities.update('entity', { name: 'updated' });
    if (operation === 'entity-delete') await db.entities.delete('entity');
    expect(await db.meta.get('lastModified')).toBeUndefined();
    await flush();
    await vi.waitFor(async () =>
      expect((await db.meta.get('lastModified'))?.value).toBeTypeOf('number')
    );
  });
  it('回滚事务不产生修改时间', async () => {
    await expect(
      db.transaction('rw', db.entities, async () => {
        await db.entities.update('entity', { name: 'aborted' });
        throw new Error('rollback');
      })
    ).rejects.toThrow('rollback');
    await flush();
    expect(await db.meta.get('lastModified')).toBeUndefined();
    expect((await db.entities.get('entity'))?.name).toBe('A');
  });
  it('同一事务多次变更只写一次修改时间', async () => {
    const putSpy = vi.spyOn(db.meta, 'put');
    await db.transaction('rw', db.events, db.entities, async () => {
      await db.events.update('event', { summary: 'updated' });
      await db.entities.update('entity', { name: 'B' });
      await db.entities.add({ ...entity, id: 'other' });
    });
    await flush();
    await vi.waitFor(() => expect(putSpy).toHaveBeenCalledTimes(1));
  });
  it('导入数据后修改时间更新为当前时间', async () => {
    await importChatData(db, { events: [event], entities: [entity], meta: { lastModified: 123 } });
    await flush();
    expect((await db.meta.get('lastModified'))?.value).toBeGreaterThan(123);
  });
});
