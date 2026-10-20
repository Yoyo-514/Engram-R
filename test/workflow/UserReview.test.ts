import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { engramEventBus } from '@/core/events/event-bus';
import { reviewService, type ReviewRequest, type ReviewResult } from '@/core/events/ReviewService';
import { countWorldbookTokens } from '@/integrations/tavern';
import { UserReview } from '@/modules/workflow/steps/interaction/UserReview';
import type { JobContext } from '@/types/job_context';
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
vi.mock('@/integrations/tavern', () => ({
  countWorldbookTokens: vi.fn<(content: string) => Promise<number>>(),
}));
vi.mock('@/ui/services/NotificationService', () => ({
  notificationService: { info: vi.fn<(message: string, title?: string) => void>() },
}));

function context(): JobContext {
  return {
    id: 'review-job',
    trigger: 'manual',
    config: { previewEnabled: true },
    input: { range: [1, 5] },
    cleanedContent: '生成的正文',
    llmResponse: { content: '原始响应', success: true },
    metadata: { startTime: 0, stepsExecuted: [] },
  };
}
let captured: ReviewRequest | undefined;
let reply: ReviewResult;
let subscription: { unsubscribe: () => void };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(countWorldbookTokens).mockResolvedValue(42);
  captured = undefined;
  reply = { action: 'confirm', content: '修订后的正文' };
  subscription = engramEventBus.on<ReviewRequest>('REVIEW_REQUESTED', (request) => {
    captured = request;
    request.onResult(reply);
  });
});
afterEach(() => {
  subscription.unsubscribe();
  vi.restoreAllMocks();
});

describe('审阅类型与请求数据', () => {
  it.each(['text', 'json', 'summary'] as const)('%s 类型不被已解析 JSON 覆盖', async (type) => {
    const job = context();
    job.parsedData = { arbitrary: 'JSON' };
    await new UserReview({ title: '审阅', type }).execute(job);
    expect(captured?.type).toBe(type);
    expect(captured?.data).toBe(type === 'json' ? job.parsedData : undefined);
  });

  it.each(['text', 'json', 'summary'] as const)('%s 类型不被实体形状的输出覆盖', async (type) => {
    const job = context();
    job.output = { newEntities: [], updatedEntities: [] };
    job.parsedData = { arbitrary: 'JSON' };
    await new UserReview({ title: '审阅', type }).execute(job);
    expect(captured?.type).toBe(type);
    expect(captured?.data).toBe(type === 'json' ? job.parsedData : undefined);
  });

  it('未指定类型时使用文本视图', async () => {
    const job = context();
    job.parsedData = { arbitrary: 'JSON' };
    await new UserReview({ title: '审阅' }).execute(job);
    expect(captured?.type).toBe('text');
    expect(captured?.data).toBeUndefined();
  });

  it('实体视图优先展示预演结果，保留请求描述和全部操作', async () => {
    const job = context();
    const preview = { newEntities: [{ name: '审阅后的实体' }] };
    job.output = preview;
    job.parsedData = { patches: [] };
    await new UserReview({ title: '实体确认', description: '人工描述', type: 'entity' }).execute(
      job
    );
    expect(captured).toMatchObject({
      title: '实体确认',
      description: '人工描述',
      content: '生成的正文',
      type: 'entity',
      actions: ['confirm', 'fill', 'reject', 'reroll', 'cancel'],
    });
    expect(captured?.data).toBe(preview);
    expect(countWorldbookTokens).toHaveBeenCalledWith('生成的正文');
  });

  it('实体视图也接受 parsedData 入口', async () => {
    const job = context();
    const parsed = { newEntities: [{ name: '实体' }] };
    job.parsedData = parsed;
    await new UserReview({ title: '实体', type: 'entity' }).execute(job);
    expect(captured?.data).toBe(parsed);
  });

  it('关闭预览时跳过审阅，文本流程保留清洗正文', async () => {
    const job = context();
    job.config.previewEnabled = false;
    await new UserReview({ title: '审阅', type: 'summary' }).execute(job);
    expect(captured).toBeUndefined();
    expect(job.output).toBe('生成的正文');
  });

  it('关闭预览时实体流程保留结构化预演结果', async () => {
    const job = context();
    job.config.previewEnabled = false;
    const previewResult = { newEntities: [], updatedEntities: [] };
    job.output = previewResult;
    await new UserReview({ title: '实体', type: 'entity' }).execute(job);
    expect(captured).toBeUndefined();
    expect(job.output).toBe(previewResult);
  });

  it('正文可来自原始模型响应，并生成范围与 Token 描述', async () => {
    const job = context();
    job.cleanedContent = undefined;
    await new UserReview({ title: '审阅' }).execute(job);
    expect(captured).toMatchObject({
      content: '原始响应',
      description: '范围: 1 - 5 楼 | Token: 42',
    });
  });

  it('空正文在请求审阅前报错', async () => {
    const job = context();
    job.cleanedContent = '   ';
    await expect(new UserReview({ title: '审阅' }).execute(job)).rejects.toThrow('内容为空');
    expect(captured).toBeUndefined();
    expect(countWorldbookTokens).not.toHaveBeenCalled();
  });
});

describe('审阅结果协议', () => {
  it('确认空实体结果后将同一份结果交给落库步骤', async () => {
    const job = context();
    reply.data = { newEntities: [], updatedEntities: [] };
    await new UserReview({ title: '实体', type: 'entity' }).execute(job);
    expect(job.parsedData).toBe(reply.data);
    expect(job.output).toBe(reply.data);
  });

  it('拒绝无效实体编辑字段并保留正文', async () => {
    const job = context();
    reply.data = { newEntities: {} };
    await new UserReview({ title: '审阅' }).execute(job);
    expect(job.output).toBe(reply.content);
  });

  it('填充直接结束流程并标记跳过专用处理', async () => {
    const job = context();
    reply.action = 'fill';
    expect(await new UserReview({ title: '审阅' }).execute(job)).toEqual({ action: 'finish' });
    expect(job.output).toBe(reply.content);
    expect(job.metadata.skipToInjection).toBe(true);
  });

  it.each(['reroll', 'reject'] as const)('%s 清除旧响应并跳回提示构建', async (action) => {
    const job = context();
    job.output = { newEntities: [] };
    job.parsedData = { patches: [] };
    reply = { action, content: '旧响应', feedback: '修订意见' };
    expect(await new UserReview({ title: '审阅' }).execute(job)).toMatchObject({
      action: 'jump',
      targetStep: 'BuildPrompt',
    });
    expect(job.input.feedback).toBe(action === 'reject' ? '修订意见' : '');
    expect(job.input.previousOutput).toBe(action === 'reject' ? '生成的正文' : undefined);
    expect(job.output).toBeUndefined();
    expect(job.parsedData).toBeUndefined();
    expect(job.llmResponse?.content).toBe('');
  });

  it('显式取消保留取消信号并提示用户', async () => {
    reply.action = 'cancel';
    await expect(new UserReview({ title: '审阅' }).execute(context())).rejects.toThrow(
      'UserCancelled'
    );
    expect(notificationService.info).toHaveBeenCalledExactlyOnceWith('已取消操作', '操作取消');
  });

  it('审阅服务失败原样传出，不发送取消提示', async () => {
    const failure = new Error('审阅服务故障');
    vi.spyOn(reviewService, 'requestReview').mockRejectedValueOnce(failure);
    await expect(new UserReview({ title: '审阅' }).execute(context())).rejects.toBe(failure);
    expect(notificationService.info).not.toHaveBeenCalled();
  });
});
