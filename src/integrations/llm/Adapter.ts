/**
 * 统一封装 TavernHelper 的文本生成调用。
 *
 * 该适配器负责：
 * - 串行化请求，避免共享运行时配置被并发请求交叉污染；
 * - 解析 Engram 侧预设，并映射到 TavernHelper 所需参数；
 * - 处理取消、预处理与基础遥测。
 */

import { getSettings, incrementStatistic } from '@/config/settings';
import { Logger } from '@/core/logger';
import { getTavernHelper, yieldToMainThread } from '@/core/utils';
import { regexProcessor } from '@/modules/workflow';
import type { LLMPreset } from '@/types/llm';

const MODULE = 'LLMAdapter';

interface RequestSignal {
  cancelled: boolean;
  reason?: string;
  generationId?: string;
}

/** LLM 生成请求 */
interface LLMRequest {
  /** 系统提示词 */
  systemPrompt: string;
  /** 用户提示词 */
  userPrompt: string;
  /** 预设 ID */
  presetId?: string;
  /** 是否为内部请求 (不触发预处理/脚本) */
  internal?: boolean;
  /** 取消信号 */
  signal?: RequestSignal;
  /** 当前请求的生成 ID，用于精准取消 */
  generationId?: string;
}

/** LLM 生成响应 */
interface LLMResponse {
  /** 生成内容 */
  content: string;
  /** 是否成功 */
  success: boolean;
  /** 错误信息 */
  error?: string;
  /** Token 使用量 */
  tokenUsage?: {
    prompt: number;
    completion: number;
    total: number;
  };
}

/** 队列中的请求项 */
interface QueuedRequest {
  request: LLMRequest;
  resolve: (value: LLMResponse) => void;
  reject: (reason: unknown) => void;
}

/**
 * 构造统一的取消异常，便于上层区分业务失败与用户中断。
 */
function createCancellationError(reason?: string): Error & { isCancellation: true } {
  const error = new Error(reason) as Error & { isCancellation: true };
  error.name = 'UserCancelled';
  error.isCancellation = true;
  if (reason) {
    error.message = `\nreason: ${reason}`;
  }
  return error;
}

function isCancellationError(error: unknown): error is Error & { isCancellation?: boolean } {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message === 'UserCancelled' ||
    error.name === 'UserCancelled' ||
    ('isCancellation' in error && error.isCancellation === true)
  );
}

/**
 * 以单执行器模型调度生成请求，确保底层调用顺序可控。
 */
class LLMAdapter {
  /** 执行锁 */
  private isExecuting = false;

  /** 请求队列 */
  private requestQueue: QueuedRequest[] = [];

  private throwIfCancelled(signal?: RequestSignal): void {
    if (signal?.cancelled) {
      throw createCancellationError(signal.reason);
    }
  }

  private async requestStop(generationId?: string): Promise<void> {
    try {
      const helper = getTavernHelper();
      if (!helper) {
        return;
      }

      if (generationId && typeof helper.stopGenerationById === 'function') {
        const stopped = await helper.stopGenerationById(generationId);
        if (stopped) {
          return;
        }
      }

      if (typeof helper.stopAllGeneration === 'function') {
        const stoppedAll = await helper.stopAllGeneration();
        if (stoppedAll) {
          return;
        }
      }
    } catch (error) {
      Logger.debug(MODULE, '请求取消底层生成失败', error);
    }
  }

  private watchForCancellation(signal?: RequestSignal, generationId?: string): () => void {
    if (!signal) {
      return () => undefined;
    }

    let stopRequested = false;
    const timer = globalThis.setInterval(() => {
      if (!signal.cancelled || stopRequested) {
        return;
      }

      stopRequested = true;
      void this.requestStop(generationId || signal.generationId);
    }, 100);

    return () => {
      globalThis.clearInterval(timer);
    };
  }

  /**
   * 根据请求上下文解析最终生效的预设。
   */
  private resolvePreset(request: LLMRequest): LLMPreset | undefined {
    const settings = getSettings();
    const presets = settings.runtimeSettings?.llmPresets;

    if (request.presetId) {
      const matchedPreset = presets?.find((preset) => preset.id === request.presetId);
      if (matchedPreset) {
        return matchedPreset;
      }
    }

    const selectedPresetId = settings.runtimeSettings?.selectedPresetId;
    if (!selectedPresetId) {
      return undefined;
    }

    return presets?.find((preset) => preset.id === selectedPresetId);
  }

  /**
   * 将请求放入串行队列，避免底层共享状态被并发访问。
   */
  async generate(request: LLMRequest): Promise<LLMResponse> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ request, resolve, reject });
      void this.processQueue();
    });
  }

  /**
   * 消费队列头部请求，并在完成后继续拉取后续任务。
   */
  private async processQueue(): Promise<void> {
    if (this.isExecuting || this.requestQueue.length === 0) {
      return;
    }

    this.isExecuting = true;
    const { request, resolve, reject } = this.requestQueue.shift()!;

    try {
      const result = await this.executeRequest(request);
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.isExecuting = false;
      // 递归处理下一个请求
      void this.processQueue();
    }
  }

  /**
   * 执行单次生成请求，并按预设类型分派到底层实现。
   */
  private async executeRequest(request: LLMRequest): Promise<LLMResponse> {
    const helper = getTavernHelper();

    this.throwIfCancelled(request.signal);
    if (request.signal && request.generationId) {
      request.signal.generationId = request.generationId;
    }

    if (!helper?.generateRaw && !helper?.generate) {
      return {
        success: false,
        content: '',
        error: 'TavernHelper 不可用',
      };
    }

    try {
      const preset = this.resolvePreset(request);

      return await this.callTavernHelper(request, helper, preset);
    } catch (error) {
      if (request.signal?.cancelled) {
        throw createCancellationError(request.signal.reason);
      }

      if (isCancellationError(error)) {
        throw error;
      }

      const errorMsg = error instanceof Error ? error.message : String(error);
      Logger.error(MODULE, '调用失败', error);

      return {
        success: false,
        content: '',
        error: errorMsg,
      };
    }
  }

  /**
   * 将预设转换为 TavernHelper 可识别的覆盖参数。
   */
  private buildPresetOverrides(preset?: LLMPreset): Record<string, unknown> | undefined {
    if (!preset) {
      return undefined;
    }

    const parameterOverrides = {
      temperature: preset.parameters?.temperature,
      max_tokens: preset.parameters?.maxTokens,
      top_p: preset.parameters?.topP,
      top_k: preset.parameters?.topK,
      frequency_penalty: preset.parameters?.frequencyPenalty,
      presence_penalty: preset.parameters?.presencePenalty,
      max_context: preset.parameters?.maxContext,
    };

    if (preset.source === 'custom' && preset.custom) {
      Logger.info(MODULE, `使用自定义 API: ${preset.name}`);
      return {
        apiurl: preset.custom.apiUrl,
        key: preset.custom.apiKey,
        model: preset.custom.model,
        source: 'openai', // TavernHelper 的 custom_api 入口按 OpenAI 兼容协议组装请求。
        stream: preset.stream ?? false,
        ...parameterOverrides,
      };
    }

    if (preset.source === 'tavern') {
      return {
        ...(preset.modelOverride ? { model: preset.modelOverride } : {}),
        ...parameterOverrides,
      };
    }

    return undefined;
  }

  /**
   * 组装 TavernHelper 级别的生成选项。
   */
  private createGenerationOptions(request: LLMRequest, preset?: LLMPreset) {
    return {
      should_stream: preset?.stream ?? false,
      should_silence: true,
      generation_id: request.generationId,
      _engram_internal: request.internal,
    };
  }

  private async callTavernHelper(
    request: LLMRequest,
    helper: NonNullable<ReturnType<typeof getTavernHelper>>,
    preset?: LLMPreset
  ): Promise<LLMResponse> {
    const finalSystemPrompt = request.systemPrompt || '';
    let finalUserPrompt = request.userPrompt || '';

    // 仅对真实用户输入执行正则流水线。内部总结/实体提取请求的 prompt 往往很长，
    // 对整段构造后 prompt 同步跑输入正则容易造成主界面卡顿。
    if (!request.internal) {
      finalUserPrompt = regexProcessor.process(finalUserPrompt, 'input');
    }
    this.throwIfCancelled(request.signal);

    const generationOptions = this.createGenerationOptions(request, preset);
    const presetOverrides = this.buildPresetOverrides(preset);
    const maxChatHistory = preset?.context?.maxChatHistory ?? 0;

    let generationResult: string | GenerateToolCallResult;
    const stopWatching = this.watchForCancellation(request.signal, request.generationId);

    try {
      await yieldToMainThread();

      if (helper.generateRaw) {
        const prompts: Array<{ role: 'system' | 'user'; content: string }> = [];

        // 严格遵循：System -> User 顺序
        if (finalSystemPrompt) {
          prompts.push({ role: 'system', content: finalSystemPrompt });
        }

        // 直接将用户内容作为 user 角色推入，不再使用 'user_input' 占位符
        // 这样酒馆就不会在末尾自动追加多余的内容
        prompts.push({ role: 'user', content: finalUserPrompt });

        generationResult = await helper.generateRaw({
          ordered_prompts: prompts,
          ...(presetOverrides ? { custom_api: presetOverrides } : {}),
          ...generationOptions,
        });
      } else if (helper.generate) {
        generationResult = await helper.generate({
          user_input: finalUserPrompt,
          max_chat_history: maxChatHistory,
          ...(presetOverrides ? { custom_api: presetOverrides } : {}),
          ...generationOptions,
        });
      } else {
        throw new Error('无可用的生成 API');
      }
    } finally {
      stopWatching();
    }

    const content =
      typeof generationResult === 'string' ? generationResult : generationResult.content || '';

    this.throwIfCancelled(request.signal);

    // 更新全局遥测计数，用于观测总调用量与粗略 Token 消耗。
    incrementStatistic('totalLlmCalls', 1);
    const estimatedPromptTokens = this.estimateTokens(finalSystemPrompt + finalUserPrompt);
    const estimatedCompletionTokens = this.estimateTokens(content);
    incrementStatistic('totalTokens', estimatedPromptTokens + estimatedCompletionTokens);

    return {
      success: true,
      content: content || '',
      tokenUsage: {
        prompt: estimatedPromptTokens,
        completion: estimatedCompletionTokens,
        total: estimatedPromptTokens + estimatedCompletionTokens,
      },
    };
  }

  /**
   * 检查当前运行环境是否暴露任一可用的生成接口。
   */
  isAvailable(): boolean {
    const helper = getTavernHelper();
    return !!(helper?.generate || helper?.generateRaw);
  }

  /**
   * 估算文本 Token 数（简单估算）
   * @param text 文本
   */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 3);
  }

  /**
   * 获取队列长度 (调试用)
   */
  getQueueLength(): number {
    return this.requestQueue.length;
  }

  /**
   * 是否正在执行 (调试用)
   */
  isBusy(): boolean {
    return this.isExecuting;
  }
}

/** 默认实例 */
export const llmAdapter = new LLMAdapter();
