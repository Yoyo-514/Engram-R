import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_ENTITY_INJECT_LIMIT } from '@/config/rag/defaults';
import { recallEntities } from '@/modules/rag/retrieval/EntityRecall';
import type { EntityNode } from '@/types/graph';

const { entities, db } = vi.hoisted(() => {
  const store = new Map<string, EntityNode>();
  return {
    entities: store,
    db: {
      entities: {
        bulkGet: vi.fn<(ids: string[]) => Promise<(EntityNode | undefined)[]>>(async (ids) =>
          ids.map((id) => store.get(id))
        ),
      },
    },
  };
});

vi.mock('@/data/db', () => ({ tryGetDbForChat: () => db }));
vi.mock('@/integrations/tavern', () => ({ getCurrentChatId: () => 'chat-1' }));
vi.mock('@/core/logger', async () => ({
  ...(await import('@/core/logger/LogModule')),
  Logger: {
    debug: vi.fn<(...args: unknown[]) => void>(),
    info: vi.fn<(...args: unknown[]) => void>(),
    warn: vi.fn<(...args: unknown[]) => void>(),
    error: vi.fn<(...args: unknown[]) => void>(),
  },
}));

function entity(id: string): EntityNode {
  return {
    id,
    name: id,
    type: 'char',
    aliases: [],
    description: id,
    profile: {},
    last_updated_at: 0,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  entities.clear();
});

describe('实体召回', () => {
  it('按得分降序截断到注入上限', async () => {
    const refs = Array.from({ length: 12 }, (_, index) => ({
      id: `e${index}`,
      score: (index + 1) / 12,
    }));
    refs.forEach((ref) => entities.set(ref.id, entity(ref.id)));

    const recalled = await recallEntities(refs);

    expect(recalled).toHaveLength(DEFAULT_ENTITY_INJECT_LIMIT);
    expect(recalled.map((item) => item.id)).toEqual([
      'e11',
      'e10',
      'e9',
      'e8',
      'e7',
      'e6',
      'e5',
      'e4',
      'e3',
      'e2',
    ]);
    expect(recalled[0].recallScore).toBeCloseTo(1);
  });

  it('跳过库中不存在的实体并保留真实得分', async () => {
    entities.set('kept', entity('kept'));

    const recalled = await recallEntities([
      { id: 'missing', score: 0.9 },
      { id: 'kept', score: 0.8 },
    ]);

    expect(recalled.map((item) => [item.id, item.recallScore])).toEqual([['kept', 0.8]]);
  });

  it('没有可用引用时不查询数据库', async () => {
    const recalled = await recallEntities([]);

    expect(recalled).toEqual([]);
    expect(db.entities.bulkGet).not.toHaveBeenCalled();
  });
});
