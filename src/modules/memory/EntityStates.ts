import type { EntityNode } from '@/types/graph';

/** 实体状态注入的默认字符预算，超出后从最旧实体开始降级。 */
export const ENTITY_STATES_MAX_CHARS = 30_000;

export interface RenderEntityStatesOptions {
  /** 本轮召回实体，归档实体命中时展开完整描述 */
  recalledIds?: string[];
  /** 字符预算，省略时不截断 */
  maxChars?: number;
}

const TYPE_TAGS: Record<string, string> = {
  char: 'character_state',
  loc: 'scene_state',
  item: 'item_state',
  concept: 'concept_state',
  unknown: 'entity_state',
};

function toYamlScalar(value: unknown, fallback: string): string {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (value == null) {
    return fallback;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

function renderFullSections(entities: EntityNode[]): string[] {
  const groups: Record<string, EntityNode[]> = {
    char: [],
    loc: [],
    item: [],
    concept: [],
    unknown: [],
  };

  for (const entity of entities) {
    const typeKey = entity.type || 'unknown';
    if (groups[typeKey]) {
      groups[typeKey].push(entity);
    } else {
      groups.unknown.push(entity);
    }
  }

  const sections: string[] = [];
  for (const [typeKey, entityList] of Object.entries(groups)) {
    if (entityList.length === 0) continue;

    const contents = entityList
      .map((entity) => entity.description || `# ${entity.name}\n(无详细信息)`)
      .join('\n---\n');
    sections.push(`<${TYPE_TAGS[typeKey]}>\n${contents}\n</${TYPE_TAGS[typeKey]}>`);
  }

  return sections;
}

function renderArchived(entities: EntityNode[]): string {
  const lines = [
    '<archived_entities>',
    '以下实体目前未出场，但需要你保持对其设定的认知，请勿重复创建新实体:',
  ];

  for (const entity of entities) {
    lines.push(`${entity.name}:`);
    lines.push(`  type: ${entity.type}`);
    lines.push(`  aliases: ${JSON.stringify(entity.aliases ?? [])}`);
    lines.push(`  identity: ${toYamlScalar(entity.profile?.identity ?? '未知身份', '未知')}`);
    lines.push(
      `  description: ${toYamlScalar(entity.profile?.description ?? '无具体备注', '暂无描述')}`
    );
  }

  lines.push('</archived_entities>');
  return lines.join('\n');
}

function renderIndex(entities: EntityNode[]): string {
  const lines = ['<entity_index>', '以下实体因篇幅未展开，仅保留名称、类型与别名，请勿重复创建:'];

  for (const entity of entities) {
    lines.push(`${entity.name}:`);
    lines.push(`  type: ${entity.type}`);
    lines.push(`  aliases: ${JSON.stringify(entity.aliases ?? [])}`);
  }

  lines.push('</entity_index>');
  return lines.join('\n');
}

/** 把实体表渲染成注入文本；超出预算时按最后更新时间从旧到新降级为索引。 */
export function renderEntityStates(
  entities: EntityNode[],
  options: RenderEntityStatesOptions = {}
): string {
  const recalledIds = options.recalledIds ?? [];
  const hasRecall = recalledIds.length > 0;
  const maxChars = options.maxChars ?? Number.POSITIVE_INFINITY;

  let fullEntities = entities.filter(
    (entity) => !entity.is_archived || (hasRecall && recalledIds.includes(entity.id))
  );
  const archivedEntities = entities.filter(
    (entity) => entity.is_archived && !(hasRecall && recalledIds.includes(entity.id))
  );

  if (fullEntities.length === 0 && archivedEntities.length === 0) {
    return '';
  }

  const render = () =>
    [
      ...renderFullSections(fullEntities),
      ...(archivedEntities.length > 0 ? [renderArchived(archivedEntities)] : []),
    ].join('\n\n');

  let output = render();
  if (output.length <= maxChars) {
    return output;
  }

  // 从最旧的活跃实体开始降级，直到回到预算内
  const degradationOrder = fullEntities.toSorted(
    (a, b) => (a.last_updated_at ?? 0) - (b.last_updated_at ?? 0)
  );
  const degraded: EntityNode[] = [];

  for (const candidate of degradationOrder) {
    if (output.length <= maxChars) break;

    fullEntities = fullEntities.filter((entity) => entity.id !== candidate.id);
    degraded.push(candidate);

    output = [
      ...renderFullSections(fullEntities),
      ...(degraded.length > 0 ? [renderIndex(degraded)] : []),
      ...(archivedEntities.length > 0 ? [renderArchived(archivedEntities)] : []),
    ].join('\n\n');
  }

  return output;
}
