import { beforeEach, describe, expect, it, vi } from 'vitest';

import { saveEvents } from '@/modules/memory/EventSave';
import type { useMemoryStore } from '@/state/memoryStore';

type MemoryStore = ReturnType<typeof useMemoryStore.getState>;
const store = vi.hoisted(() => ({
  initChat: vi.fn<MemoryStore['initChat']>(),
  saveEvent: vi.fn<MemoryStore['saveEvent']>(),
  setLastSummarizedFloor: vi.fn<MemoryStore['setLastSummarizedFloor']>(),
}));
vi.mock('@/state/memoryStore', () => ({ useMemoryStore: { getState: () => store } }));
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
vi.mock('@/integrations/tavern', () => ({
  hideMessageRange: vi.fn<(...args: unknown[]) => Promise<void>>(),
  refreshEngramCache: vi.fn<(...args: unknown[]) => Promise<void>>(),
}));
vi.mock('@/ui/services/NotificationService', () => ({
  notificationService: {
    success: vi.fn<(message: string, title?: string) => void>(),
    warning: vi.fn<(message: string, title?: string) => void>(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  store.initChat.mockResolvedValue({} as never);
  store.saveEvent.mockImplementation(async (draft) => ({ ...draft, id: 'saved', timestamp: 0 }));
  store.setLastSummarizedFloor.mockResolvedValue(undefined);
});

describe('事件保存', () => {
  it('解析 JSON 文本并补全结构化字段', async () => {
    const saved = await saveEvents(
      JSON.stringify({
        events: [
          {
            summary: '两人结盟',
            significance_score: 0.8,
            structured_kv: {
              event: '结盟',
              causality: '共同敌人',
              logic: ['信任'],
              role: 'A',
              characters: 'B',
              location: '营地',
              time_anchor: '黄昏',
            },
          },
        ],
      }),
      { range: [1, 5] }
    );

    const draft = store.saveEvent.mock.calls[0][0];
    expect(draft.summary).toContain('结盟 (共同敌人 | 信任)');
    expect(draft.summary).toContain('(黄昏 | 营地 | A) 两人结盟');
    expect(draft.structured_kv).toEqual({
      time_anchor: '黄昏',
      role: ['A'],
      location: ['营地'],
      event: '结盟',
      logic: ['信任'],
      causality: '共同敌人',
    });
    expect(draft.significance_score).toBe(0.8);
    expect(draft.source_range).toEqual({ start_index: 1, end_index: 5 });
    expect(saved).toHaveLength(1);
    expect(store.setLastSummarizedFloor).toHaveBeenCalledWith(5);
  });

  it('直接接受事件对象，导入模式不更新总结楼层', async () => {
    await saveEvents({ events: [{ summary: '原文导入' }] }, { range: [2, 2], isImport: true });

    expect(store.saveEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: '原文导入',
        significance_score: 0.5,
        source_range: { start_index: 2, end_index: 2 },
      })
    );
    expect(store.setLastSummarizedFloor).not.toHaveBeenCalled();
  });

  it('缺少事件时明确报错', async () => {
    await expect(saveEvents('not json', { range: [1, 1] })).rejects.toThrow(
      'failed to parse events JSON'
    );
    await expect(saveEvents(undefined, { range: [1, 1] })).rejects.toThrow(
      'missing output content'
    );
    expect(store.saveEvent).not.toHaveBeenCalled();
  });
});
