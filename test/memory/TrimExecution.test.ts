import { beforeEach, describe, expect, it, vi } from 'vitest';

import { regexProcessor } from '@/core/regex';
import { stopGeneration } from '@/integrations/tavern/generation';
import { requestCompletion } from '@/modules/llm/Completion';
import { buildPrompt } from '@/modules/llm/PromptBuilder';
import { trimEvents } from '@/modules/memory/TrimExecution';
import type { useMemoryStore } from '@/state/memoryStore';
import type { EventNode } from '@/types/graph';

type MemoryStore = ReturnType<typeof useMemoryStore.getState>;
const store = vi.hoisted(() => ({
  getEventsToMerge: vi.fn<MemoryStore['getEventsToMerge']>(),
  saveEvent: vi.fn<MemoryStore['saveEvent']>(),
  archiveEvents: vi.fn<MemoryStore['archiveEvents']>(),
  markEventsAsEmbedded: vi.fn<MemoryStore['markEventsAsEmbedded']>(),
}));
vi.mock('@/state/memoryStore', () => ({ useMemoryStore: { getState: () => store } }));
vi.mock('@/integrations/tavern/generation', () => ({
  stopGeneration: vi.fn<(...args: unknown[]) => Promise<void>>(),
}));
vi.mock('@/modules/llm/PromptBuilder', () => ({
  buildPrompt: vi.fn<(input: unknown, options: unknown) => Promise<unknown>>(),
}));
vi.mock('@/modules/llm/Completion', () => ({
  requestCompletion: vi.fn<(prompt: unknown, options: unknown) => Promise<unknown>>(),
}));
vi.mock('@/core/regex', () => ({
  regexProcessor: { process: vi.fn<(content: string) => string>((content) => content) },
}));
vi.mock('@/config/settings', () => ({
  get: vi.fn<() => unknown>(() => ({ embeddingConfig: { enabled: false } })),
}));
vi.mock('@/integrations/tavern', () => ({
  refreshCache: vi.fn<(...args: unknown[]) => Promise<void>>(),
}));
vi.mock('@/modules/rag', () => ({
  embeddingService: {
    setConfig: vi.fn<(...args: unknown[]) => void>(),
    embedEvents: vi.fn<(...args: unknown[]) => Promise<void>>(),
  },
}));
vi.mock('@/ui/services/NotificationService', () => ({
  notificationService: { warning: vi.fn<(message: string, title?: string) => void>() },
}));
vi.mock('@/core/logger', async () => ({
  ...(await import('@/core/logger/LogModule')),
  Logger: {
    debug: vi.fn<(...args: unknown[]) => void>(),
    info: vi.fn<(...args: unknown[]) => void>(),
    warn: vi.fn<(...args: unknown[]) => void>(),
    error: vi.fn<(...args: unknown[]) => void>(),
    success: vi.fn<(...args: unknown[]) => void>(),
  },
}));

function event(overrides: Partial<EventNode>): EventNode {
  return {
    id: 'e',
    summary: '事件',
    structured_kv: {
      time_anchor: '',
      role: [],
      location: [],
      event: '',
      logic: [],
      causality: '',
    },
    significance_score: 0.5,
    level: 0,
    is_embedded: false,
    is_archived: false,
    timestamp: 0,
    source_range: { start_index: 0, end_index: 0 },
    ...overrides,
  };
}

const older = event({
  id: 'a',
  summary: '旧事件',
  timestamp: 100,
  significance_score: 0.4,
  structured_kv: {
    time_anchor: '清晨',
    role: ['A'],
    location: ['营地'],
    event: '出发',
    logic: ['计划'],
    causality: '命令',
  },
  source_range: { start_index: 1, end_index: 2 },
});

const newer = event({
  id: 'b',
  summary: '新事件',
  timestamp: 200,
  significance_score: 0.9,
  structured_kv: {
    time_anchor: '黄昏',
    role: ['B'],
    location: ['森林'],
    event: '遭遇',
    logic: ['突袭'],
    causality: '伏击',
  },
  source_range: { start_index: 3, end_index: 4 },
});

beforeEach(() => {
  vi.clearAllMocks();
  store.getEventsToMerge.mockResolvedValue([older, newer]);
  store.saveEvent.mockImplementation(async (draft) => ({
    ...draft,
    id: 'merged',
    is_archived: false,
    timestamp: 0,
  }));
  store.archiveEvents.mockResolvedValue(undefined);
  store.markEventsAsEmbedded.mockResolvedValue(undefined);
  vi.mocked(buildPrompt).mockResolvedValue({
    system: 'system',
    user: 'user',
    templateId: 'builtin_trim',
    presetId: null,
  });
  vi.mocked(requestCompletion).mockResolvedValue({
    content:
      '{"events":[{"summary":"合并摘要","meta":{"time_anchor":"清晨","location":["营地"]}}]}',
  });
});

describe('事件精简链', () => {
  it('自动模式事件不足时直接跳过', async () => {
    store.getEventsToMerge.mockResolvedValueOnce([older]);

    const result = await trimEvents({ manual: false, keepRecentCount: 3 });

    expect(result).toBeNull();
    expect(requestCompletion).not.toHaveBeenCalled();
    expect(stopGeneration).toHaveBeenCalledOnce();
  });

  it('手动模式事件不足时明确报错', async () => {
    store.getEventsToMerge.mockResolvedValueOnce([]);

    await expect(trimEvents({ manual: true, keepRecentCount: 3 })).rejects.toThrow(
      '待合并的事件不足'
    );
  });

  it('合并事件并归档原始事件', async () => {
    const result = await trimEvents({ manual: true, keepRecentCount: 2 });

    expect(store.getEventsToMerge).toHaveBeenCalledWith(2);
    expect(buildPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ targetSummaries: expect.stringContaining('旧事件') }),
      expect.objectContaining({ templateId: 'builtin_trim', category: 'trim' })
    );
    expect(regexProcessor.process).toHaveBeenCalledWith(
      expect.stringContaining('"合并摘要"'),
      'output'
    );

    const draft = store.saveEvent.mock.calls[0][0];
    expect(draft).toMatchObject({
      summary: '合并摘要',
      level: 1,
      timestamp: 99,
      significance_score: 0.9,
      source_range: { start_index: 1, end_index: 4 },
      structured_kv: {
        time_anchor: '清晨',
        role: ['A', 'B'],
        location: ['营地'],
        event: '精简合并',
        logic: ['计划', '突袭'],
        causality: 'Chain',
      },
    });
    expect(store.archiveEvents).toHaveBeenCalledExactlyOnceWith(['a', 'b']);
    expect(result?.newEvent.id).toBe('merged');
    expect(result?.sourceEventIds).toEqual(['a', 'b']);
  });

  it('解析失败时不落库', async () => {
    vi.mocked(requestCompletion).mockResolvedValueOnce({ content: 'not json' });

    await expect(trimEvents({ manual: true, keepRecentCount: 2 })).rejects.toThrow('JSON 解析失败');
    expect(store.saveEvent).not.toHaveBeenCalled();
    expect(store.archiveEvents).not.toHaveBeenCalled();
  });
});
