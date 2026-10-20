import { type StateCreator } from 'zustand';

import { generateShortUUID } from '@/core/utils';
import { renderEntityStates } from '@/modules/memory/EntityStates';
import type { EntityNode } from '@/types/graph';

import type { MemoryState } from '../types';
import { getCurrentDb, tryGetCurrentDb } from './coreSlice';

export interface EntityState {
  // 实体相关
  getAllEntities: () => Promise<EntityNode[]>;
  saveEntity: (entity: Omit<EntityNode, 'id' | 'last_updated_at'>) => Promise<EntityNode>;
  saveEntities: (entities: Omit<EntityNode, 'id' | 'last_updated_at'>[]) => Promise<EntityNode[]>;
  updateEntity: (entityId: string, updates: Partial<EntityNode>) => Promise<void>;
  updateEntities: (updates: { id: string; updates: Partial<EntityNode> }[]) => Promise<void>;
  deleteEntity: (entityId: string) => Promise<void>;
  deleteEntities: (entityIds: string[]) => Promise<void>;
  findEntityByName: (name: string) => Promise<EntityNode | null>;
  archiveEntities: (entityIds: string[]) => Promise<void>;
  toggleEntityLock: (entityId: string) => Promise<boolean>;
  getEntityStates: (ids?: string[]) => Promise<string>;
}

export const createEntitySlice: StateCreator<MemoryState, [], [], EntityState> = (_set, _get) => ({
  getAllEntities: async () => {
    const db = getCurrentDb();
    if (!db) return [];

    try {
      return await db.entities.toArray();
    } catch (e) {
      console.error('[MemoryStore] Failed to get all entities:', e);
      return [];
    }
  },

  saveEntity: async (entityData) => {
    const db = getCurrentDb();
    if (!db) throw new Error('[MemoryStore] No current chat');

    const entity: EntityNode = {
      ...entityData,
      id: generateShortUUID('ent_'),
      last_updated_at: Date.now(),
      aliases: entityData.aliases || [],
      profile: entityData.profile || {},
    };

    await db.entities.add(entity);
    console.log(`[MemoryStore] Saved entity: ${entity.name}`);
    return entity;
  },

  saveEntities: async (entitiesData) => {
    const db = getCurrentDb();
    if (!db) throw new Error('[MemoryStore] No current chat');
    if (entitiesData.length === 0) return [];

    const entities: EntityNode[] = entitiesData.map((data) => ({
      ...data,
      id: generateShortUUID('ent_'),
      last_updated_at: Date.now(),
      aliases: data.aliases || [],
      profile: data.profile || {},
    }));

    await db.entities.bulkAdd(entities);
    console.log(`[MemoryStore] Bulk saved ${entities.length} entities`);
    return entities;
  },

  updateEntity: async (entityId, updates) => {
    if (!entityId) return;
    const db = getCurrentDb();
    if (!db) return;

    try {
      const { id: _id, ...safeUpdates } = updates;

      const existing = await db.entities.get(entityId);
      if (!existing) {
        console.warn(`[MemoryStore] Entity not found for update: ${entityId}`);
        return;
      }

      const merged = {
        ...existing,
        ...safeUpdates,
        last_updated_at: Date.now(),
      };

      await db.entities.put(merged);
      console.log(`[MemoryStore] Put completed for entity: ${entityId}`);
    } catch (e) {
      console.error('[MemoryStore] Failed to update entity:', e);
      throw e;
    }
  },

  updateEntities: async (updatesList) => {
    if (updatesList.length === 0) return;
    const db = getCurrentDb();
    if (!db) return;

    try {
      await db.transaction('rw', db.entities, async () => {
        const now = Date.now();
        for (const { id, updates } of updatesList) {
          const { id: _id, ...safeUpdates } = updates;
          const existing = await db.entities.get(id);
          if (existing) {
            await db.entities.put({
              ...existing,
              ...safeUpdates,
              last_updated_at: now,
            });
          }
        }
      });
      console.log(`[MemoryStore] Batch updated ${updatesList.length} entities`);
    } catch (e) {
      console.error('[MemoryStore] Failed to batch update entities:', e);
      throw e;
    }
  },

  deleteEntity: async (entityId) => {
    if (!entityId) return;
    const db = getCurrentDb();
    if (!db) return;

    try {
      await db.entities.bulkDelete([entityId]);
      console.log(`[MemoryStore] Deleted entity: ${entityId}`);
    } catch (e) {
      console.error('[MemoryStore] Failed to delete entity:', e);
      throw e;
    }
  },

  deleteEntities: async (entityIds: string[]) => {
    if (entityIds.length === 0) return;
    const db = getCurrentDb();
    if (!db) return;

    try {
      await db.entities.bulkDelete(entityIds);
      console.log(`[MemoryStore] Deleted ${entityIds.length} entities`);
    } catch (e) {
      console.error('[MemoryStore] Failed to delete entities:', e);
      throw e;
    }
  },

  findEntityByName: async (name) => {
    const db = getCurrentDb();
    if (!db) return null;

    try {
      const exactMatch = await db.entities.where('name').equals(name).first();
      if (exactMatch) return exactMatch;

      const aliasMatch = await db.entities.where('aliases').equals(name).first();
      return aliasMatch || null;
    } catch (e) {
      console.error('[MemoryStore] Failed to find entity by name:', e);
      return null;
    }
  },

  archiveEntities: async (entityIds: string[]) => {
    if (entityIds.length === 0) return;
    const db = getCurrentDb();
    if (!db) return;
    try {
      await db.entities.where('id').anyOf(entityIds).modify({ is_archived: true });
      console.log(`[MemoryStore] Archived ${entityIds.length} entities`);
    } catch (e) {
      console.error('[MemoryStore] Failed to archive entities:', e);
    }
  },

  toggleEntityLock: async (entityId: string) => {
    if (!entityId) return false;
    const db = getCurrentDb();
    if (!db) return false;

    try {
      const existing = await db.entities.get(entityId);
      if (!existing) return false;

      const newLockState = !existing.is_locked;
      await db.entities.update(entityId, { is_locked: newLockState });
      console.log(`[MemoryStore] Toggled entity lock: ${entityId} -> ${newLockState}`);
      return newLockState;
    } catch (e) {
      console.error('[MemoryStore] Failed to toggle entity lock:', e);
      return false;
    }
  },

  getEntityStates: async (ids?: string[]) => {
    const db = tryGetCurrentDb();
    if (!db) return '';

    try {
      const entities = await db.entities.toArray();
      return renderEntityStates(entities, { recalledIds: ids });
    } catch (e) {
      console.error('[MemoryStore] Failed to get entity states:', e);
      return '';
    }
  },
});
