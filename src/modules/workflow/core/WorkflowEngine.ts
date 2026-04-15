import { Logger, LogModule } from '@/core/logger';
import { generateShortUUID, sleep } from '@/core/utils';
import type { JobContext } from '@/types/job_context';
import type { IStep, StepResult } from '@/types/step';

export interface WorkflowDefinition {
  name: string;
  steps: IStep[];
}

const MAX_JUMPS = 50;

function isCancelled(context: JobContext): boolean {
  return Boolean(context.signal?.cancelled);
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function createInitialContext(initialContext: Partial<JobContext>): JobContext {
  const startTime = Date.now();

  return {
    id: initialContext.id || generateShortUUID('wf_'),
    trigger: initialContext.trigger || 'manual',
    config: initialContext.config || {},
    input: initialContext.input || {},
    signal: initialContext.signal,
    metadata: {
      startTime,
      stepsExecuted: [],
      ...initialContext.metadata,
    },
  };
}

function createStepIndexMap(steps: IStep[]): Map<string, number> {
  return new Map(steps.map((step, index) => [step.name, index]));
}

async function executeWithRetry(step: IStep, context: JobContext): Promise<StepResult> {
  const retryConfig = step.retry;

  if (!retryConfig || retryConfig.maxAttempts <= 1) {
    return step.execute(context);
  }

  let attempt = 1;
  let delay = retryConfig.delay;

  while (true) {
    try {
      return await step.execute(context);
    } catch (error) {
      if (isCancelled(context)) {
        throw error;
      }

      const shouldRetry = retryConfig.retryIf ? retryConfig.retryIf(error) : true;
      const noAttemptsLeft = attempt >= retryConfig.maxAttempts;

      if (!shouldRetry || noAttemptsLeft) {
        throw error;
      }

      Logger.warn(
        LogModule.RAG_INJECT,
        `[Retry] Step ${step.name} failed (${attempt}/${retryConfig.maxAttempts}), retrying in ${delay}ms...`,
        {
          error: error instanceof Error ? error.message : String(error),
        }
      );

      await sleep(delay);

      if (isCancelled(context)) {
        throw error;
      }

      if (retryConfig.backoff === 'exponential') {
        delay *= 2;
      }

      attempt += 1;
    }
  }
}

function handleStepResult(
  result: StepResult | undefined,
  step: IStep,
  context: JobContext,
  stepIndexMap: Map<string, number>
): number | null {
  if (!result) {
    return null;
  }

  if (result.action === 'finish') {
    Logger.debug(LogModule.RAG_INJECT, `工作流提前结束: ${step.name}`, {
      reason: 'Step requested finish',
    });
    return Number.POSITIVE_INFINITY;
  }

  if (result.action === 'abort') {
    throw new Error(result.reason || 'Step requested abort');
  }

  if (result.action === 'jump') {
    const targetIndex = stepIndexMap.get(result.targetStep);
    if (targetIndex === undefined) {
      throw new Error(`Jump target not found: ${result.targetStep}`);
    }

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

    return targetIndex;
  }

  return null;
}

async function executeStep(
  step: IStep,
  context: JobContext,
  stepIndexMap: Map<string, number>
): Promise<number | null> {
  context.metadata.currentStep = step.name;

  Logger.debug(LogModule.RAG_INJECT, `执行步骤: ${step.name}`, { jobId: context.id });

  const stepStart = Date.now();

  try {
    const result = await executeWithRetry(step, context);
    const duration = Date.now() - stepStart;

    context.metadata.stepsExecuted.push(step.name);

    Logger.debug(LogModule.RAG_INJECT, `步骤完成: ${step.name}`, {
      duration,
      jobId: context.id,
    });

    return handleStepResult(result, step, context, stepIndexMap);
  } catch (error) {
    if (step.ignoreFailure) {
      Logger.warn(
        LogModule.RAG_INJECT,
        `步骤执行彻底失败，但配置了忽略错误，继续流转: ${step.name}`,
        {
          error: error instanceof Error ? error.message : String(error),
          jobId: context.id,
        }
      );
      return null;
    }

    Logger.error(LogModule.RAG_INJECT, `步骤执行崩溃: ${step.name}`, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      jobId: context.id,
    });

    throw error;
  }
}

function handleWorkflowError(
  workflow: WorkflowDefinition,
  context: JobContext,
  error: unknown
): never {
  const normalizedError = normalizeError(error);
  context.metadata.error = normalizedError;

  if (isCancelled(context)) {
    Logger.info(LogModule.RAG_INJECT, `工作流已由用户取消: ${workflow.name}`, {
      jobId: context.id,
      step: context.metadata.currentStep,
    });

    const abortError = new Error('UserCancelled');
    (abortError as Error & { isCancellation?: boolean }).isCancellation = true;
    throw abortError;
  }

  Logger.error(LogModule.RAG_INJECT, `工作流执行异常: ${workflow.name}`, {
    jobId: context.id,
    step:
      context.metadata.currentStep ||
      context.metadata.stepsExecuted[context.metadata.stepsExecuted.length - 1],
    error: normalizedError.message,
  });

  throw normalizedError;
}

/**
 * 执行一个工作流
 * @param workflow 工作流定义
 * @param initialContext 初始上下文 (部分)
 */
export async function runWorkflow(
  workflow: WorkflowDefinition,
  initialContext: Partial<JobContext>
): Promise<JobContext> {
  const context = createInitialContext(initialContext);
  const stepIndexMap = createStepIndexMap(workflow.steps);

  Logger.info(LogModule.RAG_INJECT, `开始执行工作流: ${workflow.name}`, {
    jobId: context.id,
    trigger: context.trigger,
  });

  try {
    for (let i = 0; i < workflow.steps.length; i++) {
      if (isCancelled(context)) {
        Logger.warn(LogModule.RAG_INJECT, '工作流被中途取消', { jobId: context.id });
        break;
      }

      const step = workflow.steps[i];
      const nextIndex = await executeStep(step, context, stepIndexMap);

      if (nextIndex === Number.POSITIVE_INFINITY) {
        break;
      }

      if (typeof nextIndex === 'number') {
        i = nextIndex - 1;
      }
    }

    Logger.debug(LogModule.RAG_INJECT, `工作流执行成功: ${workflow.name}`, {
      jobId: context.id,
      duration: Date.now() - context.metadata.startTime,
      steps: context.metadata.stepsExecuted.length,
    });

    return context;
  } catch (error) {
    handleWorkflowError(workflow, context, error);
  }
}
