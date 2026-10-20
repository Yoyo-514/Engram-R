import { beforeEach, describe, expect, it, vi } from 'vitest';

import { requestOutputReview } from '@/core/events/OutputReview';
import type { ReviewResult } from '@/core/events/ReviewService';
import { stopGeneration } from '@/integrations/tavern/generation';
import { requestCompletion } from '@/modules/llm/Completion';
import { buildPrompt } from '@/modules/llm/PromptBuilder';
import { saveEvents } from '@/modules/memory/EventSave';
import { fetchMemoryContext } from '@/modules/memory/MemoryContext';
import { extractSummary } from '@/modules/memory/SummaryExtraction';
import { notificationService } from '@/ui/services/NotificationService';

vi.mock('@/core/logger', async () => ({
  ...(await import('@/core/logger/LogModule')),
  Logger: {
    debug: vi.fn<(...args: unknown[]) => void>(),
    info: vi.fn<(...args: unknown[]) => void>(),
    warn: vi.fn<(...args: unknown[]) => void>(),
    error: vi.fn<(...args: unknown[]) => void>(),
  },
}));
vi.mock('@/ui/services/NotificationService', () => ({
  notificationService: { info: vi.fn<(message: string, title?: string) => void>() },
}));
vi.mock('@/modules/llm/PromptBuilder', () => ({
  buildPrompt: vi.fn<(input: unknown, options: unknown) => Promise<unknown>>(),
}));
vi.mock('@/modules/llm/Completion', () => ({
  requestCompletion: vi.fn<(prompt: unknown, options: unknown) => Promise<unknown>>(),
}));
vi.mock('@/core/events/OutputReview', () => ({
  requestOutputReview: vi.fn<(content: string, options: unknown) => Promise<unknown>>(),
}));
vi.mock('@/modules/memory/EventSave', () => ({
  saveEvents: vi.fn<(content: unknown, options: unknown) => Promise<unknown[]>>(),
}));
vi.mock('@/modules/memory/MemoryContext', () => ({
  fetchMemoryContext: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}));
vi.mock('@/core/regex', () => ({
  regexProcessor: { process: vi.fn<(content: string) => string>((content) => content) },
}));
vi.mock('@/integrations/tavern/generation', () => ({
  stopGeneration: vi.fn<(...args: unknown[]) => Promise<void>>(),
}));

const memory = {
  charName: 'Char',
  charPersona: '',
  userName: 'User',
  userPersona: '',
  chatHistory: '聊天记录',
  worldbookContext: '',
  context: '',
  engramSummaries: '',
  engramEntityStates: '',
  extraWorldbooks: [],
};

function options(overrides: Partial<Parameters<typeof extractSummary>[0]> = {}) {
  return {
    range: [1, 5] as [number, number],
    manual: false,
    previewEnabled: true,
    autoHide: false,
    ...overrides,
  };
}

function reviewResult(overrides: Partial<ReviewResult>): ReviewResult {
  return { action: 'confirm', content: '{"events":[]}', ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchMemoryContext).mockResolvedValue(memory);
  vi.mocked(buildPrompt).mockResolvedValue({
    system: 'system',
    user: 'user',
    templateId: 'builtin_summary',
    presetId: null,
  });
  vi.mocked(requestCompletion).mockResolvedValue({ content: '{"events":[]}' });
});

describe('剧情总结链', () => {
  it('关闭预览时直接落库，不进入审阅', async () => {
    const result = await extractSummary(options({ previewEnabled: false }));

    expect(requestOutputReview).not.toHaveBeenCalled();
    expect(saveEvents).toHaveBeenCalledExactlyOnceWith('{"events":[]}', {
      range: [1, 5],
      autoHide: false,
    });
    expect(result.content).toBe('{"events":[]}');
  });

  it('手动总结先中止当前生成，自动总结不中止', async () => {
    await extractSummary(options({ previewEnabled: false }));
    expect(stopGeneration).not.toHaveBeenCalled();

    const signal = { cancelled: false };
    await extractSummary(options({ previewEnabled: false, manual: true, signal }));
    expect(stopGeneration).toHaveBeenCalledExactlyOnceWith(signal);
  });

  it('确认后保存审阅文本并返回编辑后的内容', async () => {
    vi.mocked(requestOutputReview).mockResolvedValueOnce(
      reviewResult({ action: 'confirm', content: '{"events":[{"summary":"edited"}]}' })
    );

    const result = await extractSummary(options());

    expect(saveEvents).toHaveBeenCalledExactlyOnceWith('{"events":[{"summary":"edited"}]}', {
      range: [1, 5],
      autoHide: false,
    });
    expect(result.content).toBe('{"events":[{"summary":"edited"}]}');
  });

  it('打回后携带反馈重生成', async () => {
    vi.mocked(requestOutputReview)
      .mockResolvedValueOnce(reviewResult({ action: 'reject', feedback: '时间线不对' }))
      .mockResolvedValueOnce(reviewResult({ action: 'confirm', content: 'final' }));

    const result = await extractSummary(options());

    expect(buildPrompt).toHaveBeenCalledTimes(2);
    expect(buildPrompt).toHaveBeenLastCalledWith(
      expect.objectContaining({ feedback: '时间线不对', previousOutput: '{"events":[]}' }),
      expect.objectContaining({ category: 'summary' })
    );
    expect(result.content).toBe('final');
  });

  it('取消时终止并提示', async () => {
    vi.mocked(requestOutputReview).mockResolvedValueOnce(reviewResult({ action: 'cancel' }));

    await expect(extractSummary(options())).rejects.toThrow('UserCancelled');
    expect(notificationService.info).toHaveBeenCalledExactlyOnceWith('已取消操作', '操作取消');
    expect(saveEvents).not.toHaveBeenCalled();
  });
});
