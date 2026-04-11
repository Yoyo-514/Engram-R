import { Logger } from '@/core/logger';
import { RobustJsonParser } from '@/core/utils/JsonParser';
import { type EntityNode, EntityType } from '@/data/types/graph';
import { useMemoryStore } from '@/state/memoryStore';
import * as jsonpatch from 'fast-json-patch';
import * as yaml from 'js-yaml';
import { z } from 'zod';
import { type JobContext } from '../../core/JobContext';
import { type IStep } from '../../core/Step';

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

// 向后兼容的 Legacy Schema
const LegacyEntitySchema = z.object({
  name: z.string(),
  type: z.string(),
  aliases: z.array(z.string()).optional(),
  profile: z.record(z.string(), z.unknown()).optional(),
});

const LegacyPatchSchema = z.object({
  name: z.string(),
  ops: z.array(PatchOpSchema),
});

const LegacySchema = z.object({
  entities: z.array(LegacyEntitySchema).optional(),
  patches: z.array(LegacyPatchSchema).optional(),
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
      sourceContent = RobustJsonParser.parse(context.output);
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
      // 尝试解析为统一 Patch 格式
      const unifiedResult = UnifiedPatchSchema.safeParse(sourceContent);

      if (unifiedResult.success && this.isUnifiedFormat(unifiedResult.data.patches)) {
        // V1.3 统一格式
        await this.processUnifiedPatches(
          unifiedResult.data.patches,
          existingEntities,
          store,
          isDryRun,
          newEntities,
          updatedEntities
        );
      } else {
        // 向后兼容 Legacy 格式
        const legacyResult = LegacySchema.safeParse(sourceContent);
        if (legacyResult.success) {
          await this.processLegacyFormat(
            legacyResult.data,
            existingEntities,
            store,
            isDryRun,
            newEntities,
            updatedEntities
          );
        } else {
          // 如果既不是 Processed，也不是 Patch，也不是 Legacy，那可能是个空对象或者格式错乱
          // 但如果是空对象 (UserReview return empty entities)，legacyResult.success 会是 true (fields optional)
          // 所以只有完全无法解析的才会到这里
          throw new Error(`SaveEntity: Zod Validation Failed - 无法解析为统一或旧版格式`);
        }
      }
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
            await store.updateEntity(normalizedEntity.id, this.buildEntityUpdate(normalizedEntity));
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
        ...structuredClone(existing),
        _original: structuredClone(existing),
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
        await store.updateEntity(existing.id, {
          profile: targetDoc.profile,
          aliases: targetDoc.aliases,
          description,
          name: targetDoc.name,
          type: targetDoc.type,
        });
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

  /** 向后兼容: 处理旧版 entities + patches 格式 */
  private async processLegacyFormat(
    data: z.infer<typeof LegacySchema>,
    existingEntities: EntityNode[],
    store: ReturnType<typeof useMemoryStore.getState>,
    isDryRun: boolean,
    newEntities: EntityNode[],
    updatedEntities: EntityNode[]
  ): Promise<void> {
    const entityIndexes = this.buildEntityIndexes(existingEntities);

    // 1. Process New Entities
    if (data.entities) {
      for (const extracted of data.entities) {
        const exists =
          entityIndexes.byName.get(extracted.name) ||
          this.pickAliasMatch(extracted.name, entityIndexes.byAlias);
        if (exists) continue;

        const entityDraft = this.buildEntityDraft(extracted.name, extracted);

        if (!isDryRun) {
          const saved = await store.saveEntity(entityDraft);
          newEntities.push(saved);
          this.indexEntity(entityIndexes, saved);
        } else {
          const entity = {
            ...entityDraft,
            id: `temp-${Date.now()}`,
            last_updated_at: Date.now(),
          } satisfies EntityNode;
          newEntities.push(entity);
          this.indexEntity(entityIndexes, entity);
        }
      }
    }

    // 2. Process Patches
    if (data.patches) {
      for (const patch of data.patches) {
        if (!patch.name) {
          Logger.warn('SaveEntity', 'Skipping legacy patch due to missing name field', { patch });
          continue;
        }
        const target = entityIndexes.byName.get(patch.name) || entityIndexes.byId.get(patch.name);
        if (!target) continue;

        try {
          const targetDoc: EntityPatchDocument = structuredClone(target);
          jsonpatch.applyPatch(targetDoc, patch.ops as jsonpatch.Operation[]);

          if (!isDryRun) {
            const description = this.profileToYaml(
              targetDoc.name,
              targetDoc.type,
              targetDoc.profile || {}
            );
            await store.updateEntity(target.id, {
              profile: targetDoc.profile,
              aliases: targetDoc.aliases,
              description,
              name: targetDoc.name,
              type: targetDoc.type,
            });
            updatedEntities.push(targetDoc);
          } else {
            // DryRun: Attach diffs with old/new values
            targetDoc._diff = this.buildDiffOperations(patch.ops as jsonpatch.Operation[], target);
            updatedEntities.push(targetDoc);
          }
        } catch (error) {
          Logger.warn('SaveEntity', `Patch failed for ${patch.name}`, error);
        }
      }
    }
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
      const yamlContent = yaml.dump(entityObj, {
        indent: 2,
        lineWidth: -1,
        noRefs: true,
        sortKeys: false,
      });
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
