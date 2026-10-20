import { requestOutputReview } from '@/core/events/OutputReview';
import { Logger, LogModule } from '@/core/logger';
import { parseJson } from '@/core/utils/JsonParser';
import { requestCompletion, type CompletionSignal } from '@/modules/llm/Completion';
import { buildPrompt } from '@/modules/llm/PromptBuilder';
import { saveEntities, type EntitySaveResult } from '@/modules/memory/EntityStore';
import { fetchMemoryContext, type MemoryContext } from '@/modules/memory/MemoryContext';
import { regexProcessor } from '@/modules/workflow/steps/text/RegexProcessor';
import { useMemoryStore } from '@/state/memoryStore';
import type { EntityNode } from '@/types/graph';
import type { PromptCategory } from '@/types/prompt';
import { notificationService } from '@/ui/services/NotificationService';

const ENTITY_CATEGORY: PromptCategory = 'entity_extraction';

export interface EntityExtractionOptions {
  memory: MemoryContext;
  rawExistingEntities: EntityNode[];
  previewEnabled: boolean;
  signal?: CompletionSignal;
  templateId?: string;
  range?: [number, number];
}

export interface EntityExtractionResult extends EntitySaveResult {}

async function runOnce(options: EntityExtractionOptions): Promise<EntitySaveResult> {
  let previousOutput = '';
  let feedback = '';
  const jobId = `entity_${Date.now()}`;

  for (;;) {
    if (options.signal?.cancelled) {
      throw new Error('UserCancelled');
    }

    const prompt = await buildPrompt(
      { ...options.memory, previousOutput, feedback },
      { templateId: options.templateId, category: ENTITY_CATEGORY }
    );

    const response = await requestCompletion(prompt, {
      logType: 'entity_extraction',
      jobId,
      signal: options.signal,
      range: options.range,
    });

    const cleaned = regexProcessor.process(response.content, 'output');
    const parsed = parseJson<Record<string, unknown>>(cleaned);
    if (!parsed) {
      throw new Error('实体提取: JSON 解析失败');
    }

    // 关闭审阅时直接把模型结果落库，不再经过预演。
    if (!options.previewEnabled) {
      return saveEntities(parsed, {
        dryRun: false,
        rawExistingEntities: options.rawExistingEntities,
      });
    }

    const preview = await saveEntities(parsed, {
      dryRun: true,
      rawExistingEntities: options.rawExistingEntities,
    });

    const review = await requestOutputReview(cleaned, {
      title: '实体提取确认',
      type: 'entity',
      description: '请确认提取的实体列表 (JSON/YAML)。您可以直接编辑以修正错误。',
      range: options.range,
      data: preview,
    });

    if (review.action === 'cancel') {
      notificationService.info('已取消操作', '操作取消');
      throw new Error('UserCancelled');
    }

    if (review.action === 'reroll') {
      Logger.info(LogModule.MEMORY_ENTITY, '用户选择重抽');
      previousOutput = '';
      feedback = '';
      continue;
    }

    if (review.action === 'reject') {
      Logger.info(LogModule.MEMORY_ENTITY, '用户选择打回重生成');
      previousOutput = cleaned;
      feedback = review.feedback ?? '';
      continue;
    }

    if (review.action === 'fill') {
      // 与旧流程一致：填充正文后不再落库。
      Logger.info(LogModule.MEMORY_ENTITY, '用户选择填充，跳过落库');
      return { newEntities: [], updatedEntities: [] };
    }

    return saveEntities(review.data ?? review.content, {
      dryRun: false,
      rawExistingEntities: options.rawExistingEntities,
    });
  }
}

/** 从已读取的记忆上下文提取实体，按审阅结果决定是否落库。 */
export async function extractEntities(
  options: EntityExtractionOptions
): Promise<EntityExtractionResult> {
  return runOnce(options);
}

/** 导入外部文本时的实体提取：直接使用原文，不读取聊天记录。 */
export async function extractEntitiesFromText(
  text: string,
  range: [number, number]
): Promise<EntitySaveResult> {
  const memory = await fetchMemoryContext(
    { isImport: true, text, chatHistory: text, range },
    { trigger: 'batch', category: ENTITY_CATEGORY }
  );
  const rawExistingEntities = await useMemoryStore.getState().getAllEntities();

  return runOnce({
    memory,
    rawExistingEntities,
    previewEnabled: false,
    range,
  });
}
