import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Logger } from '@/core/logger';
import { runWorkflow } from '@/modules/workflow/core/WorkflowEngine';
import type { JobContext } from '@/types/job_context';
import type { IStep, RetryConfig, StepResult } from '@/types/step';

vi.mock('@/core/logger', async () => ({
  ...(await import('@/core/logger/LogModule')),
  Logger: {
    debug: vi.fn<(...args: unknown[]) => void>(),
    info: vi.fn<(...args: unknown[]) => void>(),
    warn: vi.fn<(...args: unknown[]) => void>(),
    error: vi.fn<(...args: unknown[]) => void>(),
  },
}));

function step(name: string, execute: IStep['execute']): IStep {
  return { name, execute };
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('工作流执行协议', () => {
  it('按顺序传递共享上下文，并保留入口与元数据', async () => {
    const input = { text: '正文' };
    const config = { previewEnabled: true };
    const history = ['existing'];
    let shared: JobContext | undefined;
    const result = await runWorkflow(
      {
        name: 'pipeline',
        steps: [
          step('first', async (context) => {
            shared = context;
            context.data = { text: context.input.text };
          }),
          step('second', async (context) => {
            expect(context).toBe(shared);
            context.output = context.data?.text;
            return { action: 'next' };
          }),
        ],
      },
      {
        id: 'job',
        trigger: 'auto',
        input,
        config,
        metadata: {
          startTime: 123,
          stepsExecuted: history,
          label: 'preserved',
        },
      }
    );
    expect(result).toBe(shared);
    expect(result).toMatchObject({ id: 'job', trigger: 'auto', output: '正文' });
    expect(result.input).toBe(input);
    expect(result.config).toBe(config);
    expect(result.metadata).toMatchObject({
      startTime: 123,
      label: 'preserved',
      currentStep: 'second',
    });
    expect(result.metadata.stepsExecuted).toBe(history);
    expect(history).toEqual(['existing', 'first', 'second']);
  });

  it('空流程保留默认入口格式', async () => {
    const result = await runWorkflow({ name: 'empty', steps: [] }, {});
    expect(result.id).toMatch(/^wf_/);
    expect(result.trigger).toBe('manual');
    expect(result.config).toEqual({});
    expect(result.input).toEqual({});
    expect(result.metadata.startTime).toBeTypeOf('number');
    expect(result.metadata.stepsExecuted).toEqual([]);
  });

  it('finish 返回当前结果并跳过后续步骤', async () => {
    const skipped = vi.fn<IStep['execute']>().mockResolvedValue(undefined);
    const result = await runWorkflow(
      {
        name: 'finish',
        steps: [
          step('finish', async (context) => {
            context.output = 'done';
            return { action: 'finish' };
          }),
          step('skipped', skipped),
        ],
      },
      {}
    );
    expect(result.output).toBe('done');
    expect(result.metadata.stepsExecuted).toEqual(['finish']);
    expect(skipped).not.toHaveBeenCalled();
  });

  it.each([
    { reason: 'rejected', message: 'rejected' },
    { reason: undefined, message: 'Step requested abort' },
  ])('abort 拒绝流程：$message', async ({ reason, message }) => {
    await expect(
      runWorkflow(
        { name: 'abort', steps: [step('abort', async () => ({ action: 'abort', reason }))] },
        {}
      )
    ).rejects.toThrow(message);
  });

  it('失败统一成 Error、记录到上下文，并只记录一次错误日志', async () => {
    let shared: JobContext | undefined;
    const fail = vi.fn<IStep['execute']>().mockRejectedValue('primitive failure');
    await expect(
      runWorkflow(
        {
          name: 'failed',
          steps: [
            step('capture', async (context) => {
              shared = context;
            }),
            step('failed', fail),
          ],
        },
        {}
      )
    ).rejects.toThrow('primitive failure');
    expect(shared?.metadata.error).toBeInstanceOf(Error);
    expect(shared?.metadata.error?.message).toBe('primitive failure');
    expect(shared?.metadata.stepsExecuted).toEqual(['capture']);
    expect(Logger.error).toHaveBeenCalledTimes(1);
  });

  it('jump 重跑指定步骤，并保留执行历史与跳转次数', async () => {
    let attempts = 0;
    const result = await runWorkflow(
      {
        name: 'reroll',
        steps: [
          step('BuildPrompt', async () => {
            attempts += 1;
          }),
          step('Review', async () =>
            attempts === 1
              ? { action: 'jump', targetStep: 'BuildPrompt', reason: 'reroll' }
              : { action: 'next' }
          ),
          step('Save', async (context) => {
            context.output = attempts;
          }),
        ],
      },
      {}
    );
    expect(result.output).toBe(2);
    expect(result.metadata.stepsExecuted).toEqual([
      'BuildPrompt',
      'Review',
      'BuildPrompt',
      'Review',
      'Save',
    ]);
    expect(result.metadata.jumpCount).toBe(1);
  });

  it('同名跳转目标使用最后一个步骤', async () => {
    const visited: string[] = [];
    await runWorkflow(
      {
        name: 'duplicate names',
        steps: [
          step('Review', async () => ({ action: 'jump', targetStep: 'Save' })),
          step('Save', async () => {
            visited.push('first');
          }),
          step('middle', async () => {
            visited.push('middle');
          }),
          step('Save', async () => {
            visited.push('last');
          }),
        ],
      },
      {}
    );
    expect(visited).toEqual(['last']);
  });

  it('跳转到不存在的步骤时报告目标错误', async () => {
    await expect(
      runWorkflow(
        {
          name: 'missing target',
          steps: [step('Review', async () => ({ action: 'jump', targetStep: 'missing' }))],
        },
        {}
      )
    ).rejects.toThrow('Jump target not found: missing');
  });

  it('循环跳转超过现有上限后停止', async () => {
    const execute = vi
      .fn<IStep['execute']>()
      .mockResolvedValue({ action: 'jump', targetStep: 'loop' });
    await expect(runWorkflow({ name: 'loop', steps: [step('loop', execute)] }, {})).rejects.toThrow(
      'Workflow detected infinite loop'
    );
    expect(execute).toHaveBeenCalledTimes(51);
  });

  it.each(['execute', 'abort'] as const)('ignoreFailure 保留后续执行：%s', async (failure) => {
    const execute =
      failure === 'execute'
        ? vi.fn<IStep['execute']>().mockRejectedValue(new Error('ignored'))
        : vi.fn<IStep['execute']>().mockResolvedValue({ action: 'abort', reason: 'ignored' });
    const result = await runWorkflow(
      {
        name: 'ignore',
        steps: [
          { name: 'ignored', ignoreFailure: true, execute },
          step('next', async (context) => {
            context.output = 'continued';
          }),
        ],
      },
      {}
    );
    expect(result.output).toBe('continued');
    expect(result.metadata.error).toBeUndefined();
  });
});

describe('步骤重试', () => {
  it.each([
    { backoff: 'linear' as const, secondDelay: 10 },
    { backoff: 'exponential' as const, secondDelay: 20 },
    { backoff: undefined, secondDelay: 10 },
  ])('保留退避间隔与尝试次数：$backoff', async ({ backoff, secondDelay }) => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const attempts: number[] = [];
    const retryIf = vi.fn<(error: unknown) => boolean>().mockReturnValue(true);
    const execute = vi.fn<IStep['execute']>().mockImplementation(async () => {
      attempts.push(Date.now());
      if (attempts.length < 3) throw new Error('temporary failure');
    });
    const result = runWorkflow(
      {
        name: 'retry',
        steps: [
          { name: 'request', execute, retry: { maxAttempts: 3, delay: 10, backoff, retryIf } },
        ],
      },
      {}
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(attempts).toEqual([0]);
    await vi.advanceTimersByTimeAsync(10);
    expect(attempts).toEqual([0, 10]);
    await vi.advanceTimersByTimeAsync(secondDelay);
    expect((await result).metadata.stepsExecuted).toEqual(['request']);
    expect(attempts).toEqual([0, 10, 10 + secondDelay]);
    expect(retryIf).toHaveBeenCalledTimes(2);
  });

  it('重试耗尽后抛出原错误，且最后一次也执行重试判定', async () => {
    vi.useFakeTimers();
    const error = new Error('exhausted');
    const execute = vi.fn<IStep['execute']>().mockRejectedValue(error);
    const retryIf = vi.fn<(error: unknown) => boolean>().mockReturnValue(true);
    const result = runWorkflow(
      {
        name: 'exhausted',
        steps: [
          {
            name: 'request',
            execute,
            retry: { maxAttempts: 3, delay: 10, backoff: 'linear', retryIf },
          },
        ],
      },
      {}
    ).catch((caught: unknown) => caught);
    await vi.runAllTimersAsync();
    expect(await result).toBe(error);
    expect(execute).toHaveBeenCalledTimes(3);
    expect(retryIf).toHaveBeenCalledTimes(3);
  });

  it('retryIf 拒绝的错误不重试', async () => {
    vi.useFakeTimers();
    const error = new Error('permanent failure');
    const execute = vi.fn<IStep['execute']>().mockRejectedValue(error);
    const retryIf = vi.fn<(error: unknown) => boolean>().mockReturnValue(false);
    const result = runWorkflow(
      {
        name: 'not retryable',
        steps: [{ name: 'request', execute, retry: { maxAttempts: 3, delay: 10, retryIf } }],
      },
      {}
    ).catch((caught: unknown) => caught);
    await vi.runAllTimersAsync();
    expect(await result).toBe(error);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(retryIf).toHaveBeenCalledWith(error);
    expect(Logger.warn).not.toHaveBeenCalled();
  });

  it('最大尝试次数为 1 时不进入重试判定', async () => {
    const error = new Error('one attempt');
    const execute = vi.fn<IStep['execute']>().mockRejectedValue(error);
    const retryIf = vi.fn<(error: unknown) => boolean>().mockReturnValue(true);
    const retry: RetryConfig = { maxAttempts: 1, delay: 10, retryIf };
    await expect(
      runWorkflow({ name: 'one attempt', steps: [{ name: 'request', execute, retry }] }, {})
    ).rejects.toBe(error);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(retryIf).not.toHaveBeenCalled();
  });
});

describe('统一取消出口', () => {
  it.each([false, true])('开始前取消直接拒绝流程，包含空流程：有步骤=%s', async (hasStep) => {
    const execute = vi.fn<IStep['execute']>().mockResolvedValue(undefined);
    const steps = hasStep ? [step('unused', execute)] : [];
    await expect(
      runWorkflow({ name: 'cancelled', steps }, { signal: { cancelled: true } })
    ).rejects.toMatchObject({ message: 'UserCancelled', isCancellation: true });
    expect(execute).not.toHaveBeenCalled();
    expect(Logger.error).not.toHaveBeenCalled();
  });

  it.each(['next', 'finish'] as const)('步骤执行期间取消，返回 %s 也按取消处理', async (action) => {
    const signal = { cancelled: false };
    let shared: JobContext | undefined;
    const skipped = vi.fn<IStep['execute']>().mockResolvedValue(undefined);
    await expect(
      runWorkflow(
        {
          name: 'cancel during step',
          steps: [
            {
              ...step('active', async (context) => {
                shared = context;
                await Promise.resolve();
                signal.cancelled = true;
                return { action } as StepResult;
              }),
              ignoreFailure: true,
            },
            step('skipped', skipped),
          ],
        },
        { signal }
      )
    ).rejects.toMatchObject({ message: 'UserCancelled', isCancellation: true });
    expect(skipped).not.toHaveBeenCalled();
    expect(shared?.metadata.error).toMatchObject({
      message: 'UserCancelled',
      isCancellation: true,
    });
    expect(Logger.error).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'Error 消息', error: new Error('UserCancelled') },
    { label: '字符串消息', error: 'UserCancelled' },
    { label: '取消标记', error: { message: 'aborted', isCancellation: true } },
  ])('无共享 signal 时识别 $label，取消不重试也不被忽略', async ({ error }) => {
    vi.useFakeTimers();
    const execute = vi.fn<IStep['execute']>().mockRejectedValue(error);
    const retryIf = vi.fn<(error: unknown) => boolean>().mockReturnValue(true);
    const result = runWorkflow(
      {
        name: 'cancel without signal',
        steps: [
          {
            name: 'review',
            execute,
            ignoreFailure: true,
            retry: { maxAttempts: 3, delay: 10, retryIf },
          },
        ],
      },
      {}
    ).catch((caught: unknown) => caught);
    await vi.runAllTimersAsync();
    expect(await result).toMatchObject({ message: 'UserCancelled', isCancellation: true });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(retryIf).not.toHaveBeenCalled();
    expect(Logger.error).not.toHaveBeenCalled();
  });

  it('退避等待期间取消后不再请求下一次执行', async () => {
    vi.useFakeTimers();
    const signal = { cancelled: false };
    const execute = vi.fn<IStep['execute']>().mockRejectedValue(new Error('network failure'));
    const result = runWorkflow(
      {
        name: 'cancel backoff',
        steps: [{ name: 'request', execute, retry: { maxAttempts: 3, delay: 100 } }],
      },
      { signal }
    ).catch((caught: unknown) => caught);
    await vi.advanceTimersByTimeAsync(0);
    expect(execute).toHaveBeenCalledTimes(1);
    signal.cancelled = true;
    await vi.advanceTimersByTimeAsync(100);
    expect(await result).toMatchObject({ message: 'UserCancelled', isCancellation: true });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(Logger.error).not.toHaveBeenCalled();
  });
});
