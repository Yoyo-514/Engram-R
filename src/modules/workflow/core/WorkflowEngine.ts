import { Logger, LogModule } from '@/core/logger';
import { generateShortUUID, sleep } from '@/core/utils/common';
import { getErrorMessage } from '@/core/utils/error';
import type { JobContext } from '@/types/job_context';
import type { IStep, StepResult } from '@/types/step';

export interface WorkflowDefinition {
  name: string;
  steps: IStep[];
}

const MAX_JUMPS = 50;

function isCancellation(error: unknown, context: JobContext): boolean {
  return (
    Boolean(context.signal?.cancelled) ||
    getErrorMessage(error) === 'UserCancelled' ||
    (typeof error === 'object' &&
      error !== null &&
      'isCancellation' in error &&
      error.isCancellation === true)
  );
}

async function executeWithRetry(step: IStep, context: JobContext): Promise<StepResult> {
  const retry = step.retry;
  if (!retry || retry.maxAttempts <= 1) return step.execute(context);

  let delay = retry.delay;
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await step.execute(context);
    } catch (error) {
      if (isCancellation(error, context)) throw error;
      const shouldRetry = retry.retryIf ? retry.retryIf(error) : true;
      if (!shouldRetry || attempt >= retry.maxAttempts) throw error;

      Logger.warn(
        LogModule.RAG_INJECT,
        `步骤重试: ${step.name} (${attempt}/${retry.maxAttempts})`,
        { error: getErrorMessage(error), delay }
      );
      await sleep(delay);
      if (isCancellation(error, context)) throw error;
      if (retry.backoff === 'exponential') delay *= 2;
    }
  }
}

/** 顺序执行步骤，审阅跳转、重试与取消均在此处理。 */
export async function runWorkflow(
  workflow: WorkflowDefinition,
  initialContext: Partial<JobContext>
): Promise<JobContext> {
  const context: JobContext = {
    id: initialContext.id || generateShortUUID('wf_'),
    trigger: initialContext.trigger || 'manual',
    config: initialContext.config || {},
    input: initialContext.input || {},
    signal: initialContext.signal,
    metadata: { startTime: Date.now(), stepsExecuted: [], ...initialContext.metadata },
  };
  // 实体流程含同名写入步骤，目标仍按定义中的最后一次出现解析。
  const stepIndices = new Map(workflow.steps.map((step, index) => [step.name, index]));
  Logger.info(LogModule.RAG_INJECT, `开始执行工作流: ${workflow.name}`, {
    jobId: context.id,
    trigger: context.trigger,
  });

  try {
    for (let index = 0; index < workflow.steps.length; index += 1) {
      if (context.signal?.cancelled) throw new Error('UserCancelled');
      const step = workflow.steps[index];
      context.metadata.currentStep = step.name;
      Logger.debug(LogModule.RAG_INJECT, `执行步骤: ${step.name}`, { jobId: context.id });
      const start = Date.now();

      try {
        const result = await executeWithRetry(step, context);
        // 异步步骤返回后再次检查，取消不能进入后续步骤或成功出口。
        if (context.signal?.cancelled) throw new Error('UserCancelled');
        context.metadata.stepsExecuted.push(step.name);
        Logger.debug(LogModule.RAG_INJECT, `步骤完成: ${step.name}`, {
          duration: Date.now() - start,
          jobId: context.id,
        });

        if (result?.action === 'finish') break;
        if (result?.action === 'abort') throw new Error(result.reason || 'Step requested abort');
        if (result?.action === 'jump') {
          const target = stepIndices.get(result.targetStep);
          if (target === undefined) throw new Error(`Jump target not found: ${result.targetStep}`);
          context.metadata.jumpCount = (context.metadata.jumpCount || 0) + 1;
          if (context.metadata.jumpCount > MAX_JUMPS) {
            throw new Error(
              `Workflow detected infinite loop: jumped ${MAX_JUMPS} times. Last jump: ${step.name} -> ${result.targetStep}`
            );
          }
          Logger.debug(LogModule.RAG_INJECT, `跳转步骤: ${step.name} -> ${result.targetStep}`, {
            reason: result.reason,
            jumpCount: context.metadata.jumpCount,
          });
          index = target - 1;
        }
      } catch (error) {
        if (isCancellation(error, context) || !step.ignoreFailure) throw error;
        Logger.warn(LogModule.RAG_INJECT, `忽略步骤失败: ${step.name}`, {
          error: getErrorMessage(error),
          jobId: context.id,
        });
      }
    }

    if (context.signal?.cancelled) throw new Error('UserCancelled');
    Logger.debug(LogModule.RAG_INJECT, `工作流执行成功: ${workflow.name}`, {
      jobId: context.id,
      duration: Date.now() - context.metadata.startTime,
      steps: context.metadata.stepsExecuted.length,
    });
    return context;
  } catch (error) {
    const cancelled = isCancellation(error, context);
    const failure = cancelled
      ? Object.assign(new Error('UserCancelled'), { isCancellation: true })
      : error instanceof Error
        ? error
        : new Error(getErrorMessage(error));
    context.metadata.error = failure;
    if (cancelled) {
      Logger.info(LogModule.RAG_INJECT, `工作流已由用户取消: ${workflow.name}`, {
        jobId: context.id,
        step: context.metadata.currentStep,
      });
    } else {
      Logger.error(LogModule.RAG_INJECT, `工作流执行异常: ${workflow.name}`, {
        jobId: context.id,
        step: context.metadata.currentStep,
        error: failure.message,
      });
    }
    throw failure;
  }
}
