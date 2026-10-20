import * as jsonpatch from 'fast-json-patch';
import { z } from 'zod';

import { EntityType } from '@/config/memory/defaults';
import { Logger } from '@/core/logger';
import { deepClone, isRecord, stringifyYaml } from '@/core/utils';
import { parseJson } from '@/core/utils/JsonParser';
import { useMemoryStore } from '@/state/memoryStore';
import type { EntityNode } from '@/types/graph';
import { type JobContext } from '@/types/job_context';
import type { IStep } from '@/types/step';

// 统一 JSON Patch 格式
// 新实体: { op: "add", path: "/entities/{name}", value: {...} }
// 更新:   { op: "replace/add/remove", path: "/entities/{name}/profile/{key}", value: ... }
//
// 输入只接受两种形态：审阅后的 { newEntities, updatedEntities }，或模型给出的 patches。
// 实体身份只按主名称和完整别名做精确匹配，匹配不到、命中多个或路径不存在都直接失败，
// 不再猜测模型本意去纠偏路径或挑选「最像」的实体。

const PatchOpSchema = z.object({
  op: z.enum(['add', 'replace', 'remove', 'copy', 'move', 'test']),
  path: z.string().startsWith('/entities/'),
  value: z.unknown().optional(),
  from: z.string().optional(),
});

const UnifiedPatchSchema = z.object({
  patches: z.array(PatchOpSchema),
});

const ReviewedEntitySchema = z.looseObject({
  id: z.string().optional(),
  name: z.string(),
  type: z.string().optional(),
  aliases: z.array(z.string()).optional(),
  profile: z.record(z.string(), z.unknown()).optional(),
  description: z.string().optional(),
  embedding: z.array(z.number()).optional(),
  is_archived: z.boolean().optional(),
  is_embedded: z.boolean().optional(),
  is_locked: z.boolean().optional(),
  layout_x: z.number().optional(),
  layout_y: z.number().optional(),
  last_updated_at: z.number().optional(),
});

const ProcessedResultSchema = z
  .object({
    newEntities: z.array(ReviewedEntitySchema).optional(),
    updatedEntities: z.array(ReviewedEntitySchema).optional(),
  })
  .refine((result) => result.newEntities !== undefined || result.updatedEntities !== undefined);

type EntityStore = ReturnType<typeof useMemoryStore.getState>;
type PatchOperation = z.infer<typeof PatchOpSchema>;
type EntityProfile = Record<string, unknown>;
type EntityDraft = Omit<EntityNode, 'id' | 'last_updated_at'>;
type EntitySource = Partial<Record<keyof EntityDraft, unknown>> & {
  id?: string;
  last_updated_at?: number;
};
type DiffOperation = jsonpatch.Operation & { oldValue?: unknown };
type EntityPatchDocument = EntityNode & {
  _original?: EntityNode;
  diff?: DiffOperation[];
};
type RootPatchValue = {
  type?: unknown;
  aliases?: unknown;
  profile?: unknown;
  description?: unknown;
};

type EntityIndexes = {
  byName: Map<string, EntityNode>;
  byAlias: Map<string, EntityNode[]>;
};

export class SaveEntity implements IStep {
  name = 'SaveEntity';
  private config: { dryRun?: boolean };

  constructor(config?: { dryRun?: boolean }) {
    this.config = config || {};
  }

  private readExistingEntities(value: unknown): EntityNode[] | undefined {
    return Array.isArray(value) ? (value as EntityNode[]) : undefined;
  }

  private normalizeEntityType(value: unknown): EntityType {
    return Object.values(EntityType).includes(value as EntityType)
      ? (value as EntityType)
      : EntityType.Unknown;
  }

  private normalizeAliases(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((alias): alias is string => typeof alias === 'string')
      : [];
  }

  private normalizeProfile(value: unknown): EntityProfile {
    return isRecord(value) ? { ...value } : {};
  }

  private buildEntityDraft(name: string, source: EntitySource): EntityDraft {
    const type = this.normalizeEntityType(source.type);
    const profile = this.normalizeProfile(source.profile);
    const draft: EntityDraft = {
      name,
      type,
      aliases: this.normalizeAliases(source.aliases),
      profile,
      description:
        typeof source.description === 'string'
          ? source.description
          : this.profileToYaml(name, type, profile),
    };

    if (Array.isArray(source.embedding)) {
      draft.embedding = source.embedding.filter(
        (item): item is number => typeof item === 'number' && Number.isFinite(item)
      );
    }
    if (typeof source.is_archived === 'boolean') draft.is_archived = source.is_archived;
    if (typeof source.is_embedded === 'boolean') draft.is_embedded = source.is_embedded;
    if (typeof source.is_locked === 'boolean') draft.is_locked = source.is_locked;
    if (typeof source.layout_x === 'number') draft.layout_x = source.layout_x;
    if (typeof source.layout_y === 'number') draft.layout_y = source.layout_y;

    return draft;
  }

  private buildEntityDocument(name: string, source: EntitySource): EntityPatchDocument {
    const draft = this.buildEntityDraft(name, source);
    return {
      ...draft,
      id: typeof source.id === 'string' ? source.id : `temp-${Date.now()}`,
      last_updated_at:
        typeof source.last_updated_at === 'number' ? source.last_updated_at : Date.now(),
    };
  }

  private readRootPatchValue(value: unknown): RootPatchValue {
    if (!isRecord(value)) {
      return {};
    }

    const result: RootPatchValue = {};
    if ('type' in value) result.type = value.type;
    if ('aliases' in value) result.aliases = value.aliases;
    if ('profile' in value) result.profile = value.profile;
    if ('description' in value) result.description = value.description;
    return result;
  }

  private buildEntityUpdate(entity: EntityPatchDocument): Partial<EntityNode> {
    return {
      profile: entity.profile,
      aliases: entity.aliases,
      description: this.profileToYaml(entity.name, entity.type, entity.profile || {}),
      name: entity.name,
      type: entity.type,
    };
  }

  private buildDiffOperations(
    operations: jsonpatch.Operation[],
    original: EntityNode
  ): DiffOperation[] {
    return operations.map((operation) => {
      if (operation.op !== 'replace' && operation.op !== 'remove') {
        return operation;
      }

      const oldValue = jsonpatch.getValueByPointer(original, operation.path) as unknown;
      return { ...operation, oldValue };
    });
  }

  async execute(context: JobContext): Promise<void> {
    const store = useMemoryStore.getState();
    let sourceContent: unknown = context.parsedData;

    // 审阅结果优先于模型原始输出。
    if (typeof context.output === 'string') {
      sourceContent = parseJson(context.output);
      if (!sourceContent) {
        throw new Error(
          `SaveEntity: Failed to re-parse user modified content - JSON 解析失败，请检查格式`
        );
      }
    } else if (context.output && typeof context.output === 'object') {
      sourceContent = context.output;
    }

    if (!sourceContent) return;

    const newEntities: EntityNode[] = [];
    const updatedEntities: EntityNode[] = [];
    const isDryRun = this.config.dryRun ?? context.config.dryRun === true;

    // 空数组也是有效的审阅结果，例如用户删除了全部候选实体。
    const processedResult = ProcessedResultSchema.safeParse(sourceContent);
    if (processedResult.success) {
      Logger.debug('SaveEntity', 'Detected processed data structure, bypassing extraction logic');
      await this.saveProcessedEntities(
        processedResult.data,
        store,
        isDryRun,
        newEntities,
        updatedEntities
      );
    } else {
      const unifiedResult = UnifiedPatchSchema.safeParse(sourceContent);

      if (!unifiedResult.success) {
        throw new Error('SaveEntity: Zod Validation Failed - 无法解析为统一 Patch 格式');
      }

      if (unifiedResult.data.patches.length > 0) {
        const existingEntities =
          this.readExistingEntities(context.input.rawExistingEntities) ??
          (await store.getAllEntities());
        await this.processUnifiedPatches(
          unifiedResult.data.patches,
          existingEntities,
          store,
          isDryRun,
          newEntities,
          updatedEntities
        );
      }
    }

    context.output = { newEntities, updatedEntities };
    Logger.info(
      'SaveEntity',
      `完成: 新增 ${newEntities.length}, 更新 ${updatedEntities.length} (DryRun: ${isDryRun})`
    );
  }

  /** 保存已审阅的实体，不再重放 Patch 或扫描实体库。 */
  private async saveProcessedEntities(
    data: z.infer<typeof ProcessedResultSchema>,
    store: EntityStore,
    isDryRun: boolean,
    outNewEntities: EntityNode[],
    outUpdatedEntities: EntityNode[]
  ): Promise<void> {
    if (data.newEntities) {
      for (const entity of data.newEntities) {
        outNewEntities.push(await this.createNewEntity(entity.name, entity, store, isDryRun));
      }
    }

    if (data.updatedEntities) {
      for (const entity of data.updatedEntities) {
        const normalizedEntity = this.buildEntityDocument(entity.name, entity);

        if (!isDryRun) {
          if (normalizedEntity.id && !normalizedEntity.id.startsWith('temp-')) {
            const updatePayload = this.buildEntityUpdate(normalizedEntity);

            if (normalizedEntity.is_archived === true) {
              updatePayload.is_archived = false;
              normalizedEntity.is_archived = false;
              Logger.info(
                'SaveEntity',
                `🔓 Auto-unarchived entity "${normalizedEntity.name}" after review confirmation`
              );
            }

            await store.updateEntity(normalizedEntity.id, updatePayload);
            outUpdatedEntities.push(normalizedEntity);
          } else {
            Logger.warn(
              'SaveEntity',
              'Skipping update for entity without valid ID',
              normalizedEntity
            );
          }
        } else {
          outUpdatedEntities.push(normalizedEntity);
        }
      }
    }
  }

  /** 按实体分组应用 JSON Patch。 */
  private async processUnifiedPatches(
    patches: z.infer<typeof PatchOpSchema>[],
    existingEntities: EntityNode[],
    store: EntityStore,
    isDryRun: boolean,
    newEntities: EntityNode[],
    updatedEntities: EntityNode[]
  ): Promise<void> {
    const entityIndexes = this.buildEntityIndexes(existingEntities);
    const patchesByEntity = new Map<string, z.infer<typeof PatchOpSchema>[]>();

    for (const patch of patches) {
      const match = patch.path.match(/^\/entities\/([^/]+)/);
      if (!match) continue;

      const entityName = decodeURIComponent(match[1]);
      const entityPatches = patchesByEntity.get(entityName) ?? [];
      entityPatches.push(patch);
      patchesByEntity.set(entityName, entityPatches);
    }

    for (const [entityName, entityPatches] of patchesByEntity) {
      const existing = this.resolveExistingEntity(entityName, entityIndexes);
      const addRootPatch = entityPatches.find(
        (p) => p.op === 'add' && this.isEntityRootPath(p.path, entityName)
      );

      if (addRootPatch) {
        if (existing) {
          throw new Error(
            `SaveEntity: 实体 "${entityName}" 已存在，新增请求与现有实体冲突，请改用 replace`
          );
        }

        newEntities.push(
          await this.createNewEntity(
            entityName,
            this.readRootPatchValue(addRootPatch.value),
            store,
            isDryRun
          )
        );
        continue;
      }

      if (!existing) {
        throw new Error(`SaveEntity: 未找到实体 "${entityName}"，无法应用更新 Patch`);
      }

      await this.applyMergePatches(
        entityName,
        existing,
        entityPatches,
        store,
        isDryRun,
        updatedEntities
      );
    }
  }

  /** 实体身份只认主名称与唯一别名；歧义时交由调用方改用主名称。 */
  private resolveExistingEntity(
    entityName: string,
    entityIndexes: EntityIndexes
  ): EntityNode | undefined {
    const exactMatch = entityIndexes.byName.get(entityName);
    if (exactMatch) {
      return exactMatch;
    }

    const aliasMatches = entityIndexes.byAlias.get(entityName) ?? [];
    if (aliasMatches.length > 1) {
      throw new Error(
        `SaveEntity: 别名 "${entityName}" 命中多个实体（${aliasMatches
          .map((entity) => entity.name)
          .join('、')}），请改用实体主名称`
      );
    }

    return aliasMatches[0];
  }

  private async createNewEntity(
    entityName: string,
    source: EntitySource,
    store: EntityStore,
    isDryRun: boolean
  ): Promise<EntityNode> {
    return isDryRun
      ? this.buildEntityDocument(entityName, source)
      : store.saveEntity(this.buildEntityDraft(entityName, source));
  }

  private async applyMergePatches(
    entityName: string,
    existing: EntityNode,
    entityPatches: PatchOperation[],
    store: EntityStore,
    isDryRun: boolean,
    updatedEntities: EntityNode[]
  ): Promise<void> {
    const targetDoc: EntityPatchDocument = {
      ...deepClone(existing),
      _original: deepClone(existing),
    };

    const relativeOps = this.buildRelativePatches(entityName, entityPatches);

    if (relativeOps.length === 0) {
      return;
    }

    Logger.debug('SaveEntity', `Applying ${relativeOps.length} patches to ${entityName}`, {
      ops: relativeOps,
    });
    this.assertTargetsExist(targetDoc, relativeOps);
    jsonpatch.applyPatch(targetDoc, relativeOps);

    if (!isDryRun) {
      const updatePayload = this.buildEntityUpdate(targetDoc);
      // 当合并目标为已归档实体时，自动解除归档使其重新可见。
      const wasArchived = existing.is_archived === true;
      if (wasArchived) {
        updatePayload.is_archived = false;
        targetDoc.is_archived = false;
        Logger.info(
          'SaveEntity',
          `🔓 Auto-unarchived entity "${entityName}" — it was updated via merge patch`
        );
      }

      await store.updateEntity(existing.id, updatePayload);
      updatedEntities.push(targetDoc);
      return;
    }

    targetDoc.description = this.profileToYaml(
      targetDoc.name,
      targetDoc.type,
      targetDoc.profile || {}
    );
    targetDoc.diff = this.buildDiffOperations(relativeOps, existing);
    updatedEntities.push(targetDoc);
  }

  /** 把 /entities/{name}/... 路径翻译成实体文档内的相对路径。 */
  private buildRelativePatches(
    entityName: string,
    entityPatches: PatchOperation[]
  ): jsonpatch.Operation[] {
    const relativeOps: jsonpatch.Operation[] = [];

    for (const patch of entityPatches) {
      if (this.isEntityRootPath(patch.path, entityName)) {
        if (patch.op === 'add') {
          continue;
        }

        if (patch.op !== 'replace' && patch.op !== 'test') {
          throw new Error(`SaveEntity: 根路径不支持 ${patch.op} 操作`);
        }

        const rootValue = this.readRootPatchValue(patch.value);
        if (rootValue.profile !== undefined) {
          relativeOps.push({ op: patch.op, path: '/profile', value: rootValue.profile });
        }
        if (rootValue.type !== undefined) {
          relativeOps.push({ op: patch.op, path: '/type', value: rootValue.type });
        }
        if (rootValue.aliases !== undefined) {
          relativeOps.push({ op: patch.op, path: '/aliases', value: rootValue.aliases });
        }
        continue;
      }

      relativeOps.push({
        ...patch,
        path: this.stripEntityPrefix(patch.path, entityName),
      } as jsonpatch.Operation);
    }

    return relativeOps;
  }

  /** 校验 replace / remove 的目标路径确实存在，避免 Patch 静默新增字段。 */
  private assertTargetsExist(document: unknown, operations: jsonpatch.Operation[]): void {
    for (const operation of operations) {
      if (operation.op !== 'replace' && operation.op !== 'remove') {
        continue;
      }

      if (!this.hasPointer(document, operation.path)) {
        throw new Error(`SaveEntity: Patch 目标不存在 ${operation.path}`);
      }
    }
  }

  private hasPointer(document: unknown, pointer: string): boolean {
    let current: unknown = document;

    for (const segment of pointer.split('/').slice(1)) {
      const key = segment.replace(/~1/g, '/').replace(/~0/g, '~');

      if (Array.isArray(current)) {
        if (!/^\d+$/.test(key) || Number(key) >= current.length) {
          return false;
        }
        current = current[Number(key)];
        continue;
      }

      if (!isRecord(current) || !(key in current)) {
        return false;
      }
      current = current[key];
    }

    return true;
  }

  private buildEntityIndexes(entities: EntityNode[]): EntityIndexes {
    const indexes: EntityIndexes = {
      byName: new Map(),
      byAlias: new Map(),
    };

    for (const entity of entities) {
      indexes.byName.set(entity.name, entity);

      for (const alias of entity.aliases || []) {
        const aliasMatches = indexes.byAlias.get(alias);
        if (aliasMatches) {
          aliasMatches.push(entity);
        } else {
          indexes.byAlias.set(alias, [entity]);
        }
      }
    }

    return indexes;
  }

  private isEntityRootPath(path: string, entityName: string): boolean {
    const match = path.match(/^\/entities\/([^/]+)$/);
    return !!match && decodeURIComponent(match[1]) === entityName;
  }

  private stripEntityPrefix(path: string, entityName: string): string {
    const match = path.match(/^\/entities\/([^/]+)(\/.*)?$/);
    if (!match || decodeURIComponent(match[1]) !== entityName) {
      return path;
    }

    return match[2] || '';
  }

  private profileToYaml(name: string, type: string, profile: EntityProfile): string {
    try {
      const entityObj = { profile };
      const yamlContent = stringifyYaml(entityObj);
      return `${name}\n${yamlContent.trim()}`;
    } catch (error) {
      Logger.warn('SaveEntity', 'YAML Dump failed', error);
      return `${name} (${type})\n${JSON.stringify(profile, null, 2)}`;
    }
  }
}
