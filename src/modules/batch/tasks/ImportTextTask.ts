import { get } from '@/config/settings';
import { Logger, LogModule } from '@/core/logger';
import { generateShortUUID } from '@/core/utils';
import { getErrorMessage } from '@/core/utils/error';
import { parseJson } from '@/core/utils/JsonParser';
import { chunkText, summarizeChunk } from '@/modules/batch/utils/BatchUtils';
import { extractEntitiesFromText } from '@/modules/memory/EntityExtraction';
import { saveEvents } from '@/modules/memory/EventSave';
import { embeddingService } from '@/modules/rag/embedding/EmbeddingService';
import type { BatchTask, IBatchTaskHandler, ImportMode } from '@/types/batch';

/** 外部导入配置 */
export interface ImportConfig {
  mode: ImportMode;
  chunkSize: number;
  overlapSize: number;
}

/**
 * 导入外部大文本的任务处理器
 * 负责分片小说/生肉、送去大模型摘要并通过 Workflow 落地
 */
export class ImportTextTask implements IBatchTaskHandler {
  readonly type = 'import';

  constructor(
    private text: string,
    private config: ImportConfig
  ) {}

  /**
   * 第一步：分片并预估需要创建的 Task 数
   */
  async estimate(): Promise<BatchTask[]> {
    const chunks = chunkText(this.text, this.config.chunkSize, this.config.overlapSize);
    if (chunks.length === 0) return [];

    // 我们对于 Import 这个行为，就只构建一个宏观级的任务单元
    const mainTask: BatchTask = {
      id: generateShortUUID('imp_'),
      type: 'import',
      status: 'pending',
      name: `导入外部文本 (${chunks.length} 个片段)`,
      progress: { current: 0, total: chunks.length },
    };

    return [mainTask];
  }

  /**
   * 第二步：在 BatchEngine 的循环 tick 里逐个执行
   */
  async *execute(
    tasks: BatchTask[],
    checkStopSignal: () => boolean,
    updateContext: (taskIndex: number, progressCurrent: number) => void
  ): AsyncGenerator<void, void, unknown> {
    // ImportText 只有一个宏观任务定义在 tasks[0]
    const mainTask = tasks[0];
    const chunks = chunkText(this.text, this.config.chunkSize, this.config.overlapSize);
    let success = 0;

    for (let i = 0; i < chunks.length; i++) {
      // Engine 防治机制：外部随时可能要求中断
      if (checkStopSignal()) {
        mainTask.status = 'skipped';
        // Trigger an exit loop.
        return;
      }

      let chunk = chunks[i];

      try {
        if (this.config.mode === 'detailed') {
          // 调用 LLM 生成结构化摘要
          const llmResult = await summarizeChunk(chunk, i);
          if (checkStopSignal()) return;

          if (llmResult) {
            const parsed = parseJson<Record<string, unknown>>(llmResult);
            if (!parsed) {
              throw new Error('ParseJson: JSON 解析失败');
            }

            const savedEvents = await saveEvents(parsed, { range: [i, i], isImport: true });
            if (checkStopSignal()) return;

            if (Array.isArray(savedEvents) && savedEvents.length > 0) {
              // Pipeline 已处理存储，只需嵌入
              // 联动嵌入前确保配置已加载
              const vectorConfig = get('runtimeSettings')?.vectorConfig;
              if (vectorConfig) {
                embeddingService.setConfig(vectorConfig);
              }

              for (const evt of savedEvents) {
                await embeddingService.embedEvent(evt);
              }

              // 外部导入文本直接抽取实体，不读取聊天记录
              try {
                await extractEntitiesFromText(chunk, [i, i]);
              } catch (entError: unknown) {
                Logger.error(LogModule.BATCH, `分块 ${i} 实体提取异常`, {
                  error: getErrorMessage(entError),
                });
              }

              success++;
              updateContext(0, i + 1);
              yield; // 通知 Engine 我们可以推进进度
              continue; // 跳过后续的直接存储逻辑
            }
          }

          // 降级保护：如果 LLM 返回了数据，尝试抢救 partial summary 复用
          let fallbackSummary = chunk;
          if (llmResult && typeof llmResult === 'string') {
            const summaryMatch = llmResult.match(/"summary"\s*:\s*"(.*?[^\\])"/);
            if (summaryMatch && summaryMatch[1]) {
              fallbackSummary = summaryMatch[1];
              Logger.info(LogModule.BATCH, `分块 ${i} 抢救提取了部分 summary 字段成功`);
            }
          }

          // 降级：LLM 失败或 Pipeline 解析失败，使用原文/抢救文
          Logger.warn(LogModule.BATCH, `分块 ${i} 回退为原文/抢救文`);
          chunk = fallbackSummary;
        }

        // 快速模式 或 降级：直接存储原文/抢救文
        const fallbackEvents = await saveEvents(
          {
            events: [
              {
                summary: chunk,
                time_anchor: new Date().toISOString(),
                role: ['(import)'],
                location: ['(import)'],
                event: '(import)',
                logic: [],
                causality: '',
              },
            ],
          },
          { range: [i, i], isImport: true }
        );
        if (checkStopSignal()) return;

        if (Array.isArray(fallbackEvents) && fallbackEvents.length > 0) {
          const vectorConfig = get('runtimeSettings')?.vectorConfig;
          if (vectorConfig) {
            embeddingService.setConfig(vectorConfig);
          }
          for (const evt of fallbackEvents) {
            await embeddingService.embedEvent(evt);
          }
          success++;
        }
      } catch (e: unknown) {
        Logger.error(LogModule.BATCH, `处理分块 ${i} 失败`, { error: getErrorMessage(e) });
        // We keep moving even if a chunk falls through, but we update UI
      }

      // 每次循环末尾通知 Engine 并更新 UI
      updateContext(0, i + 1);
      yield;
    }

    Logger.info(LogModule.BATCH, `外部导入结束: ${success}/${chunks.length} 成功`);
  }
}
