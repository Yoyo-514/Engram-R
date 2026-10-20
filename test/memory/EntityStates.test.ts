import { describe, expect, it } from 'vitest';

import { EntityType } from '@/config/memory/defaults';
import { renderEntityStates } from '@/modules/memory/EntityStates';
import type { EntityNode } from '@/types/graph';

function entity(overrides: Partial<EntityNode> = {}): EntityNode {
  return {
    id: 'id',
    name: 'Name',
    type: EntityType.Character,
    aliases: [],
    profile: {},
    description: 'Name\nprofile: {}',
    last_updated_at: 0,
    ...overrides,
  };
}

describe('实体状态渲染', () => {
  it('活跃实体完整展开，归档实体保留类型与别名', () => {
    const output = renderEntityStates([
      entity({
        id: 'alex',
        name: 'Alex',
        aliases: ['A'],
        description: 'Alex\nprofile:\n  role: 骑士',
      }),
      entity({
        id: 'bob',
        name: 'Bob',
        type: EntityType.Location,
        aliases: ['B'],
        is_archived: true,
        profile: { identity: '村庄', description: '旧地点' },
      }),
    ]);

    expect(output).toContain('<character_state>');
    expect(output).toContain('Alex\nprofile:\n  role: 骑士');
    expect(output).toContain('<archived_entities>');
    expect(output).toContain('Bob:');
    expect(output).toContain('aliases: ["B"]');
    expect(output).toContain('type: loc');
    expect(output).toContain('identity: 村庄');
  });

  it('召回的归档实体展开为完整描述', () => {
    const output = renderEntityStates(
      [
        entity({
          id: 'bob',
          name: 'Bob',
          is_archived: true,
          description: 'Bob\nprofile:\n  role: 铁匠',
        }),
      ],
      { recalledIds: ['bob'] }
    );

    expect(output).toContain('Bob\nprofile:\n  role: 铁匠');
    expect(output).not.toContain('<archived_entities>');
  });

  it('超出字符预算时从最旧实体开始降级为索引', () => {
    const output = renderEntityStates(
      [
        entity({ id: 'old', name: 'Old', last_updated_at: 100, description: 'O'.repeat(500) }),
        entity({ id: 'new', name: 'New', last_updated_at: 200, description: 'N'.repeat(500) }),
      ],
      { maxChars: 700 }
    );

    expect(output).toContain('N'.repeat(500));
    expect(output).not.toContain('O'.repeat(500));
    expect(output).toContain('<entity_index>');
    expect(output).toContain('Old:');
  });

  it('没有实体时返回空串', () => {
    expect(renderEntityStates([])).toBe('');
  });
});
