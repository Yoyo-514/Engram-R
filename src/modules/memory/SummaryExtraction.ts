import { requestOutputReview } from '@/core/events/OutputReview';
import { Logger, LogModule } from '@/core/logger';
import { regexProcessor } from '@/core/regex';
import { stopGeneration } from '@/integrations/tavern/generation';
import { requestCompletion, type CompletionSignal } from '@/modules/llm/Completion';
import { buildPrompt } from '@/modules/llm/PromptBuilder';
import { saveEvents } from '@/modules/memory/EventSave';
import { fetchMemoryContext } from '@/modules/memory/MemoryContext';
import type { PromptCategory } from '@/types/prompt';
import { notificationService } from '@/ui/services/NotificationService';

const SUMMARY_CATEGORY: PromptCategory = 'summary';

export interface SummaryExtractionOptions {
  range: [number, number];
  manual: boolean;
  previewEnabled: boolean;
  autoHide: boolean;
  signal?: CompletionSignal;
  templateId?: string;
}

export interface SummaryExtractionResult {
  content: string;
}

/** 执行一次剧情总结：读取上下文、请求模型、审阅并按结果落库。 */
export async function extractSummary(
  options: SummaryExtractionOptions
): Promise<SummaryExtractionResult> {
  const memory = await fetchMemoryContext(
    { range: options.range },
    {
      trigger: options.manual ? 'manual' : 'auto',
      templateId: options.templateId,
      category: SUMMARY_CATEGORY,
    }
  );

  // 手动总结先终止当前生成，避免与模型输出抢占
  if (options.manual) {
    await stopGeneration(options.signal);
  }

  const jobId = `summary_${Date.now()}`;
  let previousOutput = '';
  let feedback = '';

  for (;;) {
    if (options.signal?.cancelled) {
      throw new Error('UserCancelled');
    }

    const prompt = await buildPrompt(
      { ...memory, previousOutput, feedback },
      { templateId: options.templateId, category: SUMMARY_CATEGORY }
    );

    const response = await requestCompletion(prompt, {
      logType: 'summarize',
      jobId,
      signal: options.signal,
      range: options.range,
    });

    const cleaned = regexProcessor.process(response.content, 'output');

    if (!options.previewEnabled) {
      await saveEvents(cleaned, { range: options.range, autoHide: options.autoHide });
      return { content: cleaned };
    }

    const review = await requestOutputReview(cleaned, {
      title: '剧情摘要修订',
      type: 'summary',
      range: options.range,
    });

    if (review.action === 'cancel') {
      notificationService.info('已取消操作', '操作取消');
      throw new Error('UserCancelled');
    }

    if (review.action === 'fill') {
      // 填充正文后跳过落库，与旧流程一致
      Logger.info(LogModule.MEMORY_SUMMARY, '用户选择填充，跳过落库');
      return { content: cleaned };
    }

    if (review.action === 'reroll') {
      Logger.info(LogModule.MEMORY_SUMMARY, '用户选择重抽');
      previousOutput = '';
      feedback = '';
      continue;
    }

    if (review.action === 'reject') {
      Logger.info(LogModule.MEMORY_SUMMARY, '用户选择打回重生成');
      previousOutput = cleaned;
      feedback = review.feedback ?? '';
      continue;
    }

    await saveEvents(review.content, { range: options.range, autoHide: options.autoHide });
    return { content: review.content };
  }
}
