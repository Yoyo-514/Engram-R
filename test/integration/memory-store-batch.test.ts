import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityType } from '@/data/types/graph';
import { useMemoryStore } from '@/state/memoryStore';

vi.mock('@/integrations/tavern', async () => {
  const actual = (await vi.importActual('@/integrations/tavern')) as object;
  return {
    ...actual,
    getCurrentChatId: vi.fn(() => 'test_batch_chat'),
  };
});

const createEventInput = (summary: string, significanceScore: number) => ({
  summary,
  level: 0,
  significance_score: significanceScore,
  is_archived: false,
  is_embedded: false,
  structured_kv: {
    time_anchor: '',
    role: [],
    location: [],
    event: '',
    logic: [],
    causality: '',
  },
  source_range: { start_index: 0, end_index: 0 },
});

describe('MemoryStore Batch Operations', () => {
  beforeEach(async () => {
    await useMemoryStore.getState().initChat();
    await useMemoryStore.getState().clearChatDatabase();
  });

  describe('Event Batch Updates', () => {
    it('updates multiple events in a single transaction', async () => {
      const store = useMemoryStore.getState();

      const event1 = await store.saveEvent(createEventInput('Old Event 1', 0.5));
      const event2 = await store.saveEvent(createEventInput('Old Event 2', 0.6));

      await store.updateEvents([
        { id: event1.id, updates: { summary: 'Updated Event 1', significance_score: 0.9 } },
        { id: event2.id, updates: { summary: 'Updated Event 2', significance_score: 0.1 } },
      ]);

      const allEvents = await store.getAllEvents();
      const updated1 = allEvents.find((event) => event.id === event1.id);
      const updated2 = allEvents.find((event) => event.id === event2.id);

      expect(updated1?.summary).toBe('Updated Event 1');
      expect(updated1?.significance_score).toBe(0.9);
      expect(updated2?.summary).toBe('Updated Event 2');
      expect(updated2?.significance_score).toBe(0.1);
    });

    it('handles an empty update list gracefully', async () => {
      const store = useMemoryStore.getState();
      await expect(store.updateEvents([])).resolves.not.toThrow();
    });
  });

  describe('Entity Batch Updates', () => {
    it('updates multiple entities and refreshes last_updated_at', async () => {
      const store = useMemoryStore.getState();

      const ent1 = await store.saveEntity({
        name: 'Role A',
        type: EntityType.Character,
        aliases: [],
        description: 'Old Desc A',
        profile: {},
      });
      const ent2 = await store.saveEntity({
        name: 'Loc B',
        type: EntityType.Location,
        aliases: [],
        description: 'Old Desc B',
        profile: {},
      });

      const oldTime1 = ent1.last_updated_at;
      const oldTime2 = ent2.last_updated_at;

      await new Promise((resolve) => setTimeout(resolve, 10));

      await store.updateEntities([
        { id: ent1.id, updates: { description: 'New Desc A' } },
        { id: ent2.id, updates: { description: 'New Desc B' } },
      ]);

      const allEntities = await store.getAllEntities();
      const updated1 = allEntities.find((entity) => entity.id === ent1.id);
      const updated2 = allEntities.find((entity) => entity.id === ent2.id);

      expect(updated1?.description).toBe('New Desc A');
      expect(updated1?.last_updated_at).toBeGreaterThan(oldTime1);
      expect(updated2?.description).toBe('New Desc B');
      expect(updated2?.last_updated_at).toBeGreaterThan(oldTime2);
    });
  });
});
