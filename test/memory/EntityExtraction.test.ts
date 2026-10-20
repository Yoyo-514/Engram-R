import { beforeEach, describe, expect, it, vi } from 'vitest';

import { requestOutputReview } from '@/core/events/OutputReview';
import type { ReviewResult } from '@/core/events/ReviewService';
import { requestCompletion } from '@/modules/llm/Completion';
import { buildPrompt } from '@/modules/llm/PromptBuilder';
import { extractEntities } from '@/modules/memory/EntityExtraction';
import { saveEntities } from '@/modules/memory/EntityStore';
import type { MemoryContext } from '@/modules/memory/MemoryContext';
import type { EntityNode } from '@/types/graph';
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
vi.mock('@/modules/memory/EntityStore', () => ({
  saveEntities:
    vi.fn<
      (
        content: unknown,
        options: { dryRun: boolean }
      ) => Promise<{ newEntities: EntityNode[]; updatedEntities: EntityNode[] }>
    >(),
}));
vi.mock('@/modules/workflow/steps/text/RegexProcessor', () => ({
  regexProcessor: { process: vi.fn<(content: string) => string>((content) => content) },
}));

const memory: MemoryContext = {
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

const rawExistingEntities: EntityNode[] = [];
const committed: EntityNode[] = [{ id: 'saved', name: 'Alex' } as EntityNode];
const previewResult = { newEntities: [], updatedEntities: [] };

function options(previewEnabled = true) {
  return {
    memory,
    rawExistingEntities,
    previewEnabled,
    templateId: 'builtin_entity_extraction',
    range: [1, 2] as [number, number],
  };
}

function reviewResult(overrides: Partial<ReviewResult>): ReviewResult {
  return { action: 'confirm', content: '{"patches":[]}', ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(buildPrompt).mockResolvedValue({
    system: 'system',
    user: 'user',
    templateId: 'builtin_entity_extraction',
    presetId: null,
  });
  vi.mocked(requestCompletion).mockResolvedValue({ content: '{"patches":[]}' });
  vi.mocked(saveEntities).mockImplementation(async (_content, saveOptions) =>
    saveOptions.dryRun ? previewResult : { newEntities: committed, updatedEntities: [] }
  );
});

describe('实体提取链', () => {
  it('关闭预览时直接落库，不进入审阅', async () => {
    const result = await extractEntities(options(false));

    expect(requestOutputReview).not.toHaveBeenCalled();
    expect(saveEntities).toHaveBeenCalledExactlyOnceWith(
      { patches: [] },
      {
        dryRun: false,
        rawExistingEntities,
      }
    );
    expect(result.newEntities).toBe(committed);
  });

  it('打回后携带反馈重新生成，确认后提交最终结果', async () => {
    vi.mocked(requestOutputReview)
      .mockResolvedValueOnce(reviewResult({ action: 'reject', feedback: '补全别名' }))
      .mockResolvedValueOnce(
        reviewResult({ action: 'confirm', data: { newEntities: [], updatedEntities: [] } })
      );

    const result = await extractEntities(options());

    expect(buildPrompt).toHaveBeenCalledTimes(2);
    expect(buildPrompt).toHaveBeenLastCalledWith(
      expect.objectContaining({ feedback: '补全别名', previousOutput: '{"patches":[]}' }),
      expect.objectContaining({ category: 'entity_extraction' })
    );
    expect(saveEntities).toHaveBeenLastCalledWith(
      { newEntities: [], updatedEntities: [] },
      { dryRun: false, rawExistingEntities }
    );
    expect(result.newEntities).toBe(committed);
  });

  it('重抽后清空反馈，再次取消则终止提取', async () => {
    vi.mocked(requestOutputReview)
      .mockResolvedValueOnce(reviewResult({ action: 'reroll' }))
      .mockResolvedValueOnce(reviewResult({ action: 'cancel' }));

    await expect(extractEntities(options())).rejects.toThrow('UserCancelled');

    expect(buildPrompt).toHaveBeenLastCalledWith(
      expect.objectContaining({ feedback: '', previousOutput: '' }),
      expect.anything()
    );
    expect(notificationService.info).toHaveBeenCalledExactlyOnceWith('已取消操作', '操作取消');
    expect(saveEntities).not.toHaveBeenCalledWith(expect.anything(), {
      dryRun: false,
      rawExistingEntities,
    });
  });

  it('填充正文时跳过落库', async () => {
    vi.mocked(requestOutputReview).mockResolvedValueOnce(
      reviewResult({ action: 'fill', content: '人工补充的实体' })
    );

    const result = await extractEntities(options());

    expect(result).toEqual({ newEntities: [], updatedEntities: [] });
    expect(saveEntities).toHaveBeenCalledExactlyOnceWith(
      { patches: [] },
      {
        dryRun: true,
        rawExistingEntities,
      }
    );
  });

  it('JSON 解析失败时明确报错，不进入审阅', async () => {
    vi.mocked(requestCompletion).mockResolvedValueOnce({ content: 'not json' });

    await expect(extractEntities(options())).rejects.toThrow('JSON 解析失败');
    expect(requestOutputReview).not.toHaveBeenCalled();
    expect(saveEntities).not.toHaveBeenCalled();
  });
});
