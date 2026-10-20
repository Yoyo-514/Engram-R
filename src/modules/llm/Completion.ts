import { get } from '@/config/settings';
import { Logger } from '@/core/logger';
import { ModelLogger, type ModelLogType } from '@/core/logger/ModelLogger';
import { getErrorMessage } from '@/core/utils/error';
import { withRetry, type RetryPolicy } from '@/core/utils/retry';
import { llmAdapter } from '@/integrations/llm/Adapter';
import { getCurrentCharacter, getCurrentModel } from '@/integrations/tavern';
import type { BuiltPrompt } from '@/modules/llm/PromptBuilder';
import type { LLMPreset } from '@/types/llm';

export interface CompletionSignal {
  cancelled: boolean;
  reason?: string;
  generationId?: string;
}

export interface CompletionOptions {
  logType?: ModelLogType;
  jobId: string;
  signal?: CompletionSignal;
  range?: [number, number];
  presetId?: string | null;
}

export interface CompletionResult {
  content: string;
  tokenUsage?: unknown;
}

function isCancellation(error: unknown): boolean {
  if (typeof error === 'object' && error !== null) {
    if ('isCancellation' in error && error.isCancellation === true) {
      return true;
    }
    if ('message' in error && error.message === 'UserCancelled') {
      return true;
    }
  }

  return error === 'UserCancelled';
}

function completionRetryPolicy(): RetryPolicy {
  const runtimeSettings = get('runtimeSettings');
  const presets = runtimeSettings?.llmPresets || [];
  const activePresetId = runtimeSettings?.selectedPresetId;
  const activePreset =
    presets.find((preset: LLMPreset) => preset.id === activePresetId) || presets[0];
  const custom = activePreset?.retryConfig;

  return {
    maxAttempts: custom?.maxAttempts ?? 3,
    delayMs: custom?.retryDelay ?? 2000,
    backoff: 'exponential',
    retryIf: (error: unknown) => {
      if (isCancellation(error)) return false;
      const message =
        error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
      return (
        message.includes('429') ||
        message.includes('rate limit') ||
        message.includes('timeout') ||
        message.includes('network') ||
        message.includes('failed to fetch')
      );
    },
  };
}

/** 调用内部 LLM 预设，记录收发日志并按预设配置重试。 */
export async function requestCompletion(
  prompt: BuiltPrompt,
  options: CompletionOptions
): Promise<CompletionResult> {
  const generationId = `engram_${options.jobId}_${Date.now()}`;

  if (options.signal) {
    options.signal.generationId = generationId;
  }

  const attempt = async (): Promise<CompletionResult> => {
    const logId = ModelLogger.logSend({
      type: options.logType || 'other',
      systemPrompt: prompt.system,
      userPrompt: prompt.user,
      model: getCurrentModel() || 'Unknown',
      character: getCurrentCharacter()?.name,
      floorRange: options.range,
    });

    const startTime = Date.now();

    try {
      const response = await llmAdapter.generate({
        systemPrompt: prompt.system,
        userPrompt: prompt.user,
        signal: options.signal,
        generationId,
        presetId: prompt.presetId ?? options.presetId ?? undefined,
        internal: true, // 标记为内部请求，跳过召回注入
      });

      ModelLogger.logReceive(logId, {
        response: response.content,
        status: response.success ? 'success' : 'error',
        error: response.error,
        duration: Date.now() - startTime,
      });

      if (!response.success) {
        throw new Error(response.error || 'LLM Generation Failed');
      }

      Logger.debug('Completion', 'LLM 请求成功', { duration: Date.now() - startTime });
      return { content: response.content, tokenUsage: response.tokenUsage };
    } catch (error) {
      const cancelled = isCancellation(error);
      ModelLogger.logReceive(logId, {
        status: cancelled ? 'cancelled' : 'error',
        error: cancelled ? '用户手动取消' : getErrorMessage(error),
        duration: Date.now() - startTime,
      });
      throw error;
    }
  };

  try {
    return await withRetry(attempt, completionRetryPolicy(), 'LLM 请求');
  } finally {
    if (options.signal?.generationId === generationId) {
      delete options.signal.generationId;
    }
  }
}
