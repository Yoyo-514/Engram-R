import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsManager } from '@/config/settings';
import { EntityType } from '@/data/types/graph';
import { type JobContext } from '@/modules/workflow/core/JobContext';
import { KeywordRetrieveStep } from '@/modules/workflow/steps/rag/KeywordRetrieveStep';
import { useMemoryStore } from '@/state/memoryStore';

vi.mock('@/integrations/tavern', () => ({
  getCurrentChatId: vi.fn(() => 'test_keyword_chat'),
}));

describe('KeywordRetrieveStep Integration', () => {
  let step: KeywordRetrieveStep;

  beforeEach(async () => {
    step = new KeywordRetrieveStep();

    await useMemoryStore.getState().initChat();
    await useMemoryStore.getState().clearChatDatabase();

    vi.spyOn(SettingsManager, 'get').mockReturnValue({
      recallConfig: {
        useKeywordRecall: true,
        enableEntityKeyword: true,
        enableEventKeyword: true,
        keywordTopK: { entities: 10, events: 10 },
      },
    });
  });

  it('retrieves entities even when there are no archived events', async () => {
    const store = useMemoryStore.getState();

    await store.saveEntity({
      name: '秋青子',
      type: EntityType.Character,
      aliases: [],
      description: '一位关键角色',
      profile: {},
    });

    const context: JobContext = {
      id: 'test_wf',
      trigger: 'manual',
      config: {},
      input: { query: '秋青子是谁？' },
      metadata: { startTime: Date.now(), stepsExecuted: [] },
      data: {},
    };

    await step.execute(context);

    expect(context.data?.keywordEntityIds).toBeDefined();
    expect(context.data?.keywordEntityIds.length).toBeGreaterThan(0);

    const hit = context.data?.keywordEntityIds.find(
      (entry: { score: number }) => entry.score > 0.8
    );
    expect(hit).toBeDefined();
    expect(context.data?.keywordCandidates.length).toBe(0);
  });

  it('matches entities via the lightweight keyword index', async () => {
    const store = useMemoryStore.getState();

    await store.saveEntity({
      name: '苹果',
      type: EntityType.Item,
      aliases: ['Apple'],
      description: '',
      profile: {},
    });
    await store.saveEntity({
      name: '香蕉',
      type: EntityType.Item,
      aliases: [],
      description: '',
      profile: {},
    });

    const context: JobContext = {
      id: 'test_wf',
      trigger: 'manual',
      config: {},
      input: { query: '我想要一个 Apple' },
      metadata: { startTime: Date.now(), stepsExecuted: [] },
      data: {},
    };

    await step.execute(context);

    expect(context.data?.keywordEntityIds.length).toBe(1);
  });
});
