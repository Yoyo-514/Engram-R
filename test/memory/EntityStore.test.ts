import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EntityType } from '@/config/memory/defaults';
import { saveEntities } from '@/modules/memory/EntityStore';
import type { useMemoryStore } from '@/state/memoryStore';
import type { EntityNode } from '@/types/graph';

type EntityStore = ReturnType<typeof useMemoryStore.getState>;
const store = vi.hoisted(() => ({
  getAllEntities: vi.fn<EntityStore['getAllEntities']>(),
  saveEntity: vi.fn<EntityStore['saveEntity']>(),
  updateEntity: vi.fn<EntityStore['updateEntity']>(),
}));
vi.mock('@/state/memoryStore', () => ({ useMemoryStore: { getState: () => store } }));
vi.mock('@/core/logger', async () => ({
  ...(await import('@/core/logger/LogModule')),
  Logger: {
    debug: vi.fn<(...args: unknown[]) => void>(),
    info: vi.fn<(...args: unknown[]) => void>(),
    warn: vi.fn<(...args: unknown[]) => void>(),
    error: vi.fn<(...args: unknown[]) => void>(),
  },
}));

function preview(source: unknown, rawExistingEntities?: EntityNode[]) {
  return saveEntities(source, { dryRun: true, rawExistingEntities });
}

function commit(source: unknown, rawExistingEntities?: EntityNode[]) {
  return saveEntities(source, { dryRun: false, rawExistingEntities });
}

function entity(overrides: Partial<EntityNode> = {}): EntityNode {
  return {
    id: 'existing',
    name: 'Alex',
    type: EntityType.Character,
    aliases: [],
    profile: { role: 'knight' },
    description: '旧描述',
    last_updated_at: 10,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  store.getAllEntities.mockResolvedValue([]);
  store.saveEntity.mockImplementation(async (draft) => ({
    ...draft,
    id: 'saved',
    last_updated_at: 100,
  }));
  store.updateEntity.mockResolvedValue(undefined);
});

describe('实体写入与预演', () => {
  it.each(['Alex', '青/石'])('预演新实体仅生成结果，不写库：%s', async (name) => {
    const result = await preview({
      patches: [
        {
          op: 'add',
          path: `/entities/${encodeURIComponent(name)}`,
          value: { type: 'char', aliases: ['别名'], profile: { role: 'mage' } },
        },
      ],
    });

    expect(result.newEntities).toHaveLength(1);
    expect(result.newEntities[0]).toMatchObject({
      name,
      type: 'char',
      aliases: ['别名'],
      profile: { role: 'mage' },
    });
    expect(result.newEntities[0].id).toMatch(/^temp-/);
    expect(result.newEntities[0].description).toContain('role: mage');
    expect(store.saveEntity).not.toHaveBeenCalled();
    expect(store.updateEntity).not.toHaveBeenCalled();
  });

  it('真实新增使用草稿字段，并返回存储层生成的实体', async () => {
    const result = await commit({
      patches: [
        { op: 'add', path: '/entities/Alex', value: { type: 'char', profile: { role: 'mage' } } },
      ],
    });

    const draft = store.saveEntity.mock.calls[0][0];
    expect(draft).toMatchObject({ name: 'Alex', type: 'char', profile: { role: 'mage' } });
    expect(draft).not.toHaveProperty('id');
    expect(draft).not.toHaveProperty('last_updated_at');
    expect(result.newEntities[0]).toMatchObject({ id: 'saved', last_updated_at: 100 });
  });

  it('预演更新保留原对象，附带旧值与原始实体供审阅', async () => {
    const original = entity();
    store.getAllEntities.mockResolvedValue([original]);

    const result = await preview({
      patches: [{ op: 'replace', path: '/entities/Alex/profile/role', value: 'king' }],
    });

    const updated = result.updatedEntities[0] as EntityNode & {
      diff?: unknown[];
      _original?: EntityNode;
    };
    expect(updated.profile).toEqual({ role: 'king' });
    expect(updated.diff).toContainEqual({
      op: 'replace',
      path: '/profile/role',
      value: 'king',
      oldValue: 'knight',
    });
    expect(updated._original).toEqual(original);
    expect(original.profile).toEqual({ role: 'knight' });
    expect(store.updateEntity).not.toHaveBeenCalled();
  });

  it('实际更新解除归档，并保留更新后的输出', async () => {
    store.getAllEntities.mockResolvedValue([entity({ is_archived: true })]);

    const result = await commit({
      patches: [{ op: 'replace', path: '/entities/Alex/profile/role', value: 'king' }],
    });

    expect(store.updateEntity).toHaveBeenCalledWith(
      'existing',
      expect.objectContaining({
        name: 'Alex',
        profile: { role: 'king' },
        is_archived: false,
      })
    );
    expect(result.updatedEntities[0].is_archived).toBe(false);
  });

  it('已有实体由调用方提供时复用该列表', async () => {
    const result = await preview(
      { patches: [{ op: 'replace', path: '/entities/Alex/profile/role', value: 'king' }] },
      [entity()]
    );

    expect(result.updatedEntities[0].profile.role).toBe('king');
    expect(store.getAllEntities).not.toHaveBeenCalled();
  });

  it('直接保存审阅修改结果，不再扫描实体库', async () => {
    const result = await commit({
      newEntities: [
        { name: 'Edited', type: 'char', profile: { role: 'mage' }, description: '人工描述' },
      ],
      updatedEntities: [entity({ profile: { role: 'king' }, is_archived: true })],
    });

    expect(store.saveEntity).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Edited',
        description: '人工描述',
        profile: { role: 'mage' },
      })
    );
    expect(store.updateEntity).toHaveBeenCalledWith(
      'existing',
      expect.objectContaining({ profile: { role: 'king' }, is_archived: false })
    );
    expect(result.newEntities[0].id).toBe('saved');
    expect(store.getAllEntities).not.toHaveBeenCalled();
  });

  it('重新预演已处理实体时保留其 ID 与时间戳', async () => {
    const result = await preview({
      newEntities: [entity({ id: 'draft-id', last_updated_at: 42 })],
    });

    expect(result.newEntities[0]).toMatchObject({ id: 'draft-id', last_updated_at: 42 });
    expect(store.saveEntity).not.toHaveBeenCalled();
  });

  it.each([undefined, 'temp-123'])('跳过缺少正式 ID 的审阅更新：%s', async (id) => {
    const result = await commit({ updatedEntities: [{ name: 'Alex', id, profile: {} }] });

    expect(result.updatedEntities).toEqual([]);
    expect(store.updateEntity).not.toHaveBeenCalled();
  });

  it.each([
    { newEntities: [], updatedEntities: [] },
    { newEntities: [] },
    { updatedEntities: [] },
    { patches: [] },
  ])('空结果有效且不读写实体库：%j', async (source) => {
    const result = await preview(source);

    expect(result).toEqual({ newEntities: [], updatedEntities: [] });
    expect(store.getAllEntities).not.toHaveBeenCalled();
    expect(store.saveEntity).not.toHaveBeenCalled();
    expect(store.updateEntity).not.toHaveBeenCalled();
  });

  it.each([
    { patches: [{ op: 'add', path: '/wrong/Alex', value: {} }] },
    { newEntities: [{ name: 123 }] },
  ])('拒绝无效输入且不落库：%j', async (source) => {
    await expect(preview(source)).rejects.toThrow('Validation Failed');
    expect(store.saveEntity).not.toHaveBeenCalled();
    expect(store.updateEntity).not.toHaveBeenCalled();
  });

  it('预演结果可直接作为落库输入，Patch 只解释一次', async () => {
    const source = {
      patches: [{ op: 'add', path: '/entities/Alex', value: { profile: { role: 'mage' } } }],
    };
    const previewResult = await preview(source);
    const saved = await commit(previewResult);

    expect(store.getAllEntities).toHaveBeenCalledTimes(1);
    expect(store.saveEntity).toHaveBeenCalledTimes(1);
    expect(saved.newEntities[0]).toMatchObject({ id: 'saved', name: 'Alex' });
  });
});

describe('实体 Patch 匹配契约', () => {
  it('名称匹配优先于其它实体的别名', async () => {
    store.getAllEntities.mockResolvedValue([
      entity({ id: 'alias', name: 'Other', aliases: ['Alex'] }),
      entity(),
    ]);

    await commit({ patches: [{ op: 'add', path: '/entities/Alex/profile/title', value: 'king' }] });

    expect(store.updateEntity).toHaveBeenCalledWith(
      'existing',
      expect.objectContaining({ profile: { role: 'knight', title: 'king' } })
    );
  });

  it.each(['Alex', 'Captain'])('根新增与现有实体冲突时明确失败：%s', async (name) => {
    store.getAllEntities.mockResolvedValue([entity({ aliases: ['Captain'] })]);

    await expect(
      commit({
        patches: [{ op: 'add', path: `/entities/${name}`, value: { profile: { role: 'king' } } }],
      })
    ).rejects.toThrow('已存在');
    expect(store.saveEntity).not.toHaveBeenCalled();
    expect(store.updateEntity).not.toHaveBeenCalled();
  });

  it('别名命中多个实体时明确失败', async () => {
    store.getAllEntities.mockResolvedValue([
      entity({ id: 'first', name: 'Alex', aliases: ['队长'] }),
      entity({ id: 'second', name: 'Bob', aliases: ['队长'] }),
    ]);

    await expect(
      commit({ patches: [{ op: 'replace', path: '/entities/队长/profile/role', value: 'king' }] })
    ).rejects.toThrow('别名');
    expect(store.updateEntity).not.toHaveBeenCalled();
  });

  it('未知字段路径明确失败，不再猜嵌套位置', async () => {
    store.getAllEntities.mockResolvedValue([entity({ profile: { stats: { age: 20 } } })]);

    await expect(
      preview({ patches: [{ op: 'replace', path: '/entities/Alex/profile/age', value: 21 }] })
    ).rejects.toThrow('目标不存在');
    expect(store.updateEntity).not.toHaveBeenCalled();
    expect(store.saveEntity).not.toHaveBeenCalled();
  });

  it('保留 add、replace、test、copy、move、remove 六种操作', async () => {
    store.getAllEntities.mockResolvedValue([
      entity({ profile: { source: 'v', obsolete: 'x', status: 'old' } }),
    ]);

    const result = await preview({
      patches: [
        { op: 'add', path: '/entities/Alex/profile/new', value: 'n' },
        { op: 'replace', path: '/entities/Alex/profile/status', value: 'ready' },
        { op: 'test', path: '/entities/Alex/profile/status', value: 'ready' },
        { op: 'copy', from: '/profile/source', path: '/entities/Alex/profile/cloned' },
        { op: 'move', from: '/profile/new', path: '/entities/Alex/profile/moved' },
        { op: 'remove', path: '/entities/Alex/profile/obsolete' },
      ],
    });

    expect(result.updatedEntities[0].profile).toEqual({
      source: 'v',
      status: 'ready',
      cloned: 'v',
      moved: 'n',
    });
  });
});
