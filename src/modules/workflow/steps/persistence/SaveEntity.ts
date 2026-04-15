import * as jsonpatch from 'fast-json-patch';
import { z } from 'zod';

import { EntityType } from '@/config/memory/defaults';
import { Logger } from '@/core/logger';
import { deepClone, stringifyYaml } from '@/core/utils';
import { parseJson } from '@/core/utils/JsonParser';
import { useMemoryStore } from '@/state/memoryStore';
import type { EntityNode } from '@/types/graph';
import { type JobContext } from '@/types/job_context';
import type { IStep } from '@/types/step';

// V1.3: 统一 JSON Patch 格式
// 新实体: { op: "add", path: "/entities/{name}", value: {...} }
// 更新:   { op: "replace/add/remove", path: "/entities/{name}/profile/{key}", value: ... }

const PatchOpSchema = z.object({
  op: z.enum(['add', 'replace', 'remove', 'copy', 'move', 'test']),
  path: z.string(),
  value: z.unknown().optional(),
  from: z.string().optional(),
});

const UnifiedPatchSchema = z.object({
  patches: z.array(PatchOpSchema),
});

const ProcessedResultSchema = z.object({
  newEntities: z
    .array(
      z
        .object({
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
        })
        .passthrough()
    )
    .optional(),
  updatedEntities: z
    .array(
      z
        .object({
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
        })
        .passthrough()
    )
    .optional(),
});

type EntityStore = ReturnType<typeof useMemoryStore.getState>;
type PatchOperation = z.infer<typeof PatchOpSchema>;
type EntityProfile = Record<string, unknown>;
type EntityDraft = Omit<EntityNode, 'id' | 'last_updated_at'>;
type DiffOperation = jsonpatch.Operation & { oldValue?: unknown };
type EntityPatchDocument = EntityNode & {
  _original?: EntityNode;
  _diff?: DiffOperation[];
};
type RootPatchValue = {
  type?: unknown;
  aliases?: unknown;
  profile?: unknown;
  description?: unknown;
  name?: unknown;
};

type EntityIndexes = {
  byName: Map<string, EntityNode>;
  byId: Map<string, EntityNode>;
  byAlias: Map<string, EntityNode[]>;
  byLowerName: Map<string, EntityNode>;
  byLowerAlias: Map<string, EntityNode[]>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

export class SaveEntity implements IStep {
  name = 'SaveEntity';
  private config: { dryRun?: boolean };

  // V1.2.7: 支持构造函数配置 dryRun，用于预览模式
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

  private buildEntityDraft(
    name: string,
    source: {
      type?: unknown;
      aliases?: unknown;
      profile?: unknown;
      description?: unknown;
      embedding?: unknown;
      is_archived?: unknown;
      is_embedded?: unknown;
      is_locked?: unknown;
      layout_x?: unknown;
      layout_y?: unknown;
    }
  ): EntityDraft {
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

  private buildEntityDocument(
    name: string,
    source: {
      id?: string;
      last_updated_at?: number;
      type?: unknown;
      aliases?: unknown;
      profile?: unknown;
      description?: unknown;
      embedding?: unknown;
      is_archived?: unknown;
      is_embedded?: unknown;
      is_locked?: unknown;
      layout_x?: unknown;
      layout_y?: unknown;
    }
  ): EntityPatchDocument {
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
    if ('name' in value) result.name = value.name;
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
      let oldValue: unknown;
      try {
        if (operation.op === 'replace' || operation.op === 'remove') {
          oldValue = jsonpatch.getValueByPointer(original, operation.path) as unknown;
        }
      } catch {
        oldValue = undefined;
      }

      return { ...operation, oldValue };
    });
  }

  async execute(context: JobContext): Promise<void> {
    const store = useMemoryStore.getState();
    const rawExistingEntities = this.readExistingEntities(
      (context.input as Record<string, unknown>)._rawExistingEntities
    );
    const existingEntities = rawExistingEntities || (await store.getAllEntities());

    let sourceContent: unknown = context.parsedData;

    // Handle UserReview modifications
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
    // V1.2.7: 优先使用构造函数配置，其次是 context.config
    const isDryRun = this.config.dryRun ?? context.config.dryRun === true;

    // V1.3.1: 检查是否为已处理的数据 (来自 DryRun + UserReview)
    const processedResult = ProcessedResultSchema.safeParse(sourceContent);
    const hasProcessedData =
      processedResult.success &&
      ((processedResult.data.newEntities?.length ?? 0) > 0 ||
        (processedResult.data.updatedEntities?.length ?? 0) > 0);

    if (hasProcessedData) {
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

      if (!unifiedResult.success || !this.isUnifiedFormat(unifiedResult.data.patches)) {
        throw new Error('SaveEntity: Zod Validation Failed - 无法解析为统一 Patch 格式');
      }

      await this.processUnifiedPatches(
        unifiedResult.data.patches,
        existingEntities,
        store,
        isDryRun,
        newEntities,
        updatedEntities
      );
    }

    context.output = { newEntities, updatedEntities };
    Logger.info(
      'SaveEntity',
      `完成: 新增 ${newEntities.length}, 更新 ${updatedEntities.length} (DryRun: ${isDryRun})`
    );
  }

  /** V1.3.1: 直接保存已处理的实体 (来自 UserReview) */
  private async saveProcessedEntities(
    data: z.infer<typeof ProcessedResultSchema>,
    store: EntityStore,
    isDryRun: boolean,
    outNewEntities: EntityNode[],
    outUpdatedEntities: EntityNode[]
  ): Promise<void> {
    if (data.newEntities) {
      for (const entity of data.newEntities) {
        const normalizedEntity = this.buildEntityDocument(entity.name, entity);

        if (!isDryRun) {
          const saved = await store.saveEntity(this.buildEntityDraft(entity.name, entity));
          outNewEntities.push(saved);
        } else {
          outNewEntities.push(normalizedEntity);
        }
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

  /** 检测是否为统一格式 (patches 数组包含 path 字段) */
  private isUnifiedFormat(patches: PatchOperation[]): boolean {
    return patches.length > 0 && patches.every((patch) => patch.path.startsWith('/entities/'));
  }

  /** V1.3: 处理统一 JSON Patch 格式 */
  private async processUnifiedPatches(
    patches: z.infer<typeof PatchOpSchema>[],
    existingEntities: EntityNode[],
    store: ReturnType<typeof useMemoryStore.getState>,
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
      if (!patchesByEntity.has(entityName)) {
        patchesByEntity.set(entityName, []);
      }
      patchesByEntity.get(entityName)!.push(patch);
    }

    for (const [entityName, entityPatches] of patchesByEntity) {
      let existing = this.resolveEntityIdentity(entityName, entityIndexes);

      const addRootPatch = entityPatches.find(
        (p) => p.op === 'add' && this.isEntityRootPath(p.path, entityName)
      );

      if (addRootPatch) {
        // 如果发现新实体声明，但名字发生冲突
        const conflict = this.findCaseInsensitiveConflict(entityName, entityIndexes);

        if (!conflict) {
          await this.createNewEntity(entityName, addRootPatch.value, store, isDryRun, newEntities);
          continue;
        } else {
          existing = conflict;
          Logger.debug(
            'SaveEntity',
            `🔭 Duplicate entity detected for "${entityName}", redirecting to merge mode.`
          );
          this.convertRootAddToPatches(entityName, addRootPatch.value, entityPatches);
        }
      }

      if (existing) {
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
  }

  /** 消除别名歧义匹配 */
  private resolveEntityIdentity(
    entityName: string,
    entityIndexes: EntityIndexes
  ): EntityNode | undefined {
    // 1. 精确匹配名称优先
    const exactMatch = entityIndexes.byName.get(entityName);
    if (exactMatch) return exactMatch;

    // 2. 别名匹配（可能冲突）
    return this.pickAliasMatch(entityName, entityIndexes.byAlias);
  }

  private async createNewEntity(
    entityName: string,
    value: unknown,
    store: EntityStore,
    isDryRun: boolean,
    newEntities: EntityNode[]
  ): Promise<void> {
    const entityDraft = this.buildEntityDraft(entityName, this.readRootPatchValue(value));

    if (!isDryRun) {
      const saved = await store.saveEntity(entityDraft);
      newEntities.push(saved);
      return;
    }

    newEntities.push({
      ...entityDraft,
      id: `temp-${Date.now()}`,
      last_updated_at: Date.now(),
    });
  }

  private convertRootAddToPatches(
    entityName: string,
    value: unknown,
    entityPatches: PatchOperation[]
  ): void {
    const rootValue = this.readRootPatchValue(value);

    if (rootValue.profile !== undefined) {
      entityPatches.push({
        op: 'add',
        path: this.getEntityPath(entityName, '/profile'),
        value: rootValue.profile,
      });
    }
    if (rootValue.type !== undefined) {
      entityPatches.push({
        op: 'replace',
        path: this.getEntityPath(entityName, '/type'),
        value: rootValue.type,
      });
    }
    if (rootValue.aliases !== undefined) {
      entityPatches.push({
        op: 'add',
        path: this.getEntityPath(entityName, '/aliases'),
        value: rootValue.aliases,
      });
    }
  }

  private async applyMergePatches(
    entityName: string,
    existing: EntityNode,
    entityPatches: PatchOperation[],
    store: EntityStore,
    isDryRun: boolean,
    updatedEntities: EntityNode[]
  ): Promise<void> {
    try {
      const targetDoc: EntityPatchDocument = {
        ...deepClone(existing),
        _original: deepClone(existing),
      };

      const relativeOps = this.buildRelativePatches(entityName, entityPatches, targetDoc);

      if (relativeOps.length === 0) {
        return;
      }

      Logger.debug('SaveEntity', `Applying ${relativeOps.length} patches to ${entityName}`, {
        ops: relativeOps,
      });
      jsonpatch.applyPatch(targetDoc, relativeOps);

      if (!isDryRun) {
        const description = this.profileToYaml(
          targetDoc.name,
          targetDoc.type,
          targetDoc.profile || {}
        );

        // 当合并目标为已归档实体时，自动解除归档使其重新可见
        const wasArchived = existing.is_archived === true;
        const updatePayload: Partial<EntityNode> = {
          profile: targetDoc.profile,
          aliases: targetDoc.aliases,
          description,
          name: targetDoc.name,
          type: targetDoc.type,
        };
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
      targetDoc._diff = this.buildDiffOperations(relativeOps, existing);
      updatedEntities.push(targetDoc);
    } catch (error) {
      Logger.warn('SaveEntity', `Patch failed for ${entityName}`, error);
    }
  }

  private buildRelativePatches(
    entityName: string,
    entityPatches: PatchOperation[],
    targetDoc: EntityPatchDocument
  ): jsonpatch.Operation[] {
    const relativeOps: jsonpatch.Operation[] = [];
    const genericKeys = new Set([
      'profile',
      'type',
      'description',
      'desc',
      'value',
      'name',
      'id',
      'status',
      'features',
      'traits',
    ]);

    for (const patch of entityPatches) {
      const isRoot = this.isEntityRootPath(patch.path, entityName);
      if (isRoot && patch.op === 'add') {
        continue;
      }

      if (isRoot && (patch.op === 'replace' || patch.op === 'test')) {
        const rootValue = this.readRootPatchValue(patch.value);
        if (rootValue.profile !== undefined) {
          relativeOps.push({
            op: patch.op,
            path: '/profile',
            value: rootValue.profile,
          } as jsonpatch.Operation);
        }
        if (rootValue.type !== undefined) {
          relativeOps.push({
            op: patch.op,
            path: '/type',
            value: rootValue.type,
          } as jsonpatch.Operation);
        }
        if (rootValue.aliases !== undefined) {
          relativeOps.push({
            op: patch.op,
            path: '/aliases',
            value: rootValue.aliases,
          } as jsonpatch.Operation);
        }
        continue;
      }

      if (isRoot) {
        continue;
      }

      let relativePath = this.stripEntityPrefix(patch.path, entityName);
      const parts = relativePath.split('/').filter(Boolean);

      let anchorKey = '';
      let anchorIndex = -1;
      for (let i = parts.length - 1; i >= 0; i--) {
        if (!genericKeys.has(parts[i])) {
          anchorKey = parts[i];
          anchorIndex = i;
          break;
        }
      }

      if (anchorKey) {
        const foundPaths = this.findUniquePath(targetDoc.profile || {}, anchorKey, '/profile');
        if (foundPaths.length === 1) {
          const realAnchorPath = foundPaths[0];
          const suffix = parts.slice(anchorIndex + 1).join('/');
          const redirectedPath = suffix ? `${realAnchorPath}/${suffix}` : realAnchorPath;
          if (redirectedPath !== relativePath) {
            Logger.debug(
              'SaveEntity',
              `🔭 Smart Pointer Redirect: ${relativePath} -> ${redirectedPath}`
            );
            relativePath = redirectedPath;
          }
        }
      }

      relativeOps.push({ ...patch, path: relativePath } as jsonpatch.Operation);
    }

    return relativeOps;
  }

  private buildEntityIndexes(entities: EntityNode[]): EntityIndexes {
    const indexes: EntityIndexes = {
      byName: new Map(),
      byId: new Map(),
      byAlias: new Map(),
      byLowerName: new Map(),
      byLowerAlias: new Map(),
    };

    for (const entity of entities) {
      this.indexEntity(indexes, entity);
    }

    return indexes;
  }

  private indexEntity(indexes: EntityIndexes, entity: EntityNode): void {
    indexes.byName.set(entity.name, entity);
    indexes.byId.set(entity.id, entity);
    indexes.byLowerName.set(entity.name.toLowerCase(), entity);

    for (const alias of entity.aliases || []) {
      const aliasMatches = indexes.byAlias.get(alias);
      if (aliasMatches) {
        aliasMatches.push(entity);
      } else {
        indexes.byAlias.set(alias, [entity]);
      }

      const lowerAlias = alias.toLowerCase();
      const lowerAliasMatches = indexes.byLowerAlias.get(lowerAlias);
      if (lowerAliasMatches) {
        lowerAliasMatches.push(entity);
      } else {
        indexes.byLowerAlias.set(lowerAlias, [entity]);
      }
    }
  }

  private pickAliasMatch(
    entityName: string,
    aliasIndex: Map<string, EntityNode[]>
  ): EntityNode | undefined {
    const aliasMatches = aliasIndex.get(entityName) || [];
    if (aliasMatches.length === 1) {
      return aliasMatches[0];
    }

    if (aliasMatches.length > 1) {
      Logger.warn(
        'SaveEntity',
        `⚠️ Alias conflict detected for "${entityName}". Multiple entities share this alias. Falling back to first match to avoid crash, but data overwrite may occur.`,
        {
          matches: aliasMatches.map((entity) => entity.name),
        }
      );
      return aliasMatches[0];
    }

    return undefined;
  }

  private findCaseInsensitiveConflict(
    entityName: string,
    entityIndexes: EntityIndexes
  ): EntityNode | undefined {
    const normalizedName = entityName.toLowerCase();
    return (
      entityIndexes.byLowerName.get(normalizedName) ||
      this.pickAliasMatch(normalizedName, entityIndexes.byLowerAlias)
    );
  }

  private getEntityPath(entityName: string, suffix: string = ''): string {
    return `/entities/${encodeURIComponent(entityName)}${suffix}`;
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

  /**
   * V1.6: Universal Smart Pointer (Deep Search)
   * Recursively search for a key in the object structure.
   * Returns the relative path (slash-separated) to the key if found uniquely.
   */
  private findUniquePath(obj: unknown, targetKey: string, currentPath: string = ''): string[] {
    if (!isRecord(obj)) {
      return [];
    }

    let results: string[] = [];

    for (const [key, value] of Object.entries(obj)) {
      const newPath = currentPath ? `${currentPath}/${key}` : key;

      if (key === targetKey) {
        results.push(newPath);
      }

      if (isRecord(value)) {
        results = results.concat(this.findUniquePath(value, targetKey, newPath));
      }
    }

    return results;
  }
}
