/**
 * EmbeddingService V0.7
 *
 * 通用向量化 Pipeline 组件
 * - 支持并发队列处理
 * - 适配多种向量 API (OpenAI, Ollama, vLLM, Cohere, Jina, Voyage)
 * - 可用于 EventNode 和 EntityNode
 */

import type { VectorConfig } from '@/types/rag';
import { Logger, LogModule } from '@/core/logger';
import { getDbForChat, tryGetDbForChat } from '@/data/db';
import type { EventNode } from '@/types/graph';
import { callEmbeddingAPI } from '@/integrations/embedding/EmbeddingClient';
import { getCurrentChatId } from '@/integrations/tavern';

// ==================== 类型定义 ====================

/**
 * 嵌入请求
 */
interface EmbedRequest {
  id: string;
  text: string;
}

/**
 * 嵌入结果
 */
interface EmbedResult {
  id: string;
  embedding: number[];
  error?: string;
}

/**
 * 嵌入进度回调
 */
type EmbedProgressCallback = (current: number, total: number, errors: number) => void;

// ==================== 常量 ====================

/**
 * 默认并发数
 */
const DEFAULT_CONCURRENCY = 5;

function normalizeConcurrency(value: number): number {
  return Math.max(1, Math.min(20, Math.floor(value)));
}

function filterEventsByRange<
  T extends { source_range: { start_index: number; end_index: number } },
>(events: T[], range?: { start?: number; end?: number }): T[] {
  if (!range) {
    return events;
  }

  return events.filter((event) => {
    const { start_index, end_index } = event.source_range;
    if (range.start !== undefined && start_index < range.start) return false;
    if (range.end !== undefined && end_index > range.end) return false;
    return true;
  });
}

async function persistEventEmbedding(
  eventId: string,
  embedding: number[],
  chatId?: string | null
): Promise<void> {
  const resolvedChatId = chatId ?? getCurrentChatId();
  if (!resolvedChatId) {
    return;
  }

  const db = tryGetDbForChat(resolvedChatId);
  if (!db) {
    return;
  }

  await db.events.update(eventId, {
    embedding,
    is_embedded: true,
  });
}

// ==================== EmbeddingService ====================

export function createEmbeddingService() {
  let config: VectorConfig | null = null;
  let concurrency = DEFAULT_CONCURRENCY;
  let stopSignal = false;

  /**
   * 设置向量配置
   */
  function setConfig(nextConfig: VectorConfig): void {
    config = nextConfig;
  }

  /**
   * 设置并发数
   */
  function setConcurrency(n: number): void {
    concurrency = normalizeConcurrency(n);
  }

  /**
   * 停止当前进行的嵌入任务
   */
  function stop(): void {
    stopSignal = true;
  }

  /**
   * 重置停止信号
   */
  function reset(): void {
    stopSignal = false;
  }

  // ==================== 核心嵌入方法 ====================

  /**
   * 调用嵌入 API
   */
  async function recallEmbeddingAPI(text: string): Promise<number[]> {
    if (!config) {
      throw new Error('EmbeddingService: config not set');
    }

    return callEmbeddingAPI(text, config);
  }

  /**
   * 生成单个文本的嵌入向量
   */
  async function embed(text: string): Promise<number[]> {
    if (!config) {
      throw new Error('EmbeddingService: config not set');
    }

    const results = await embedBatch([{ id: 'single', text }]);
    const firstResult = results[0];

    if (!firstResult) {
      throw new Error('EmbeddingService: no embedding result returned');
    }

    if (firstResult.error) {
      throw new Error(firstResult.error);
    }

    return firstResult.embedding;
  }

  /**
   * 批量生成嵌入 (支持并发控制)
   */
  async function embedBatch(
    requests: EmbedRequest[],
    onProgress?: EmbedProgressCallback
  ): Promise<EmbedResult[]> {
    if (!config) {
      throw new Error('EmbeddingService: config not set');
    }

    stopSignal = false;
    const results: EmbedResult[] = Array.from({ length: requests.length });
    let completed = 0;
    let errors = 0;

    // 并发处理
    const worker = async (index: number) => {
      if (index >= requests.length || stopSignal) return;

      const req = requests[index];
      try {
        const embedding = await recallEmbeddingAPI(req.text);
        results[index] = { id: req.id, embedding };
      } catch (error: unknown) {
        errors++;
        const message = error instanceof Error ? error.message : String(error);
        results[index] = { id: req.id, embedding: [], error: message };
        Logger.warn(LogModule.RAG_EMBED, `嵌入失败: ${req.id}`, { error: message });
      } finally {
        completed++;
        onProgress?.(completed, requests.length, errors);
      }
    };

    // 分批并发
    for (let i = 0; i < requests.length; i += concurrency) {
      if (stopSignal) break;

      const batch = Array.from({ length: Math.min(concurrency, requests.length - i) }, (_, j) =>
        worker(i + j)
      );
      await Promise.all(batch);
    }

    return results;
  }

  // ==================== EventNode 批量嵌入 ====================

  /**
   * 为未嵌入的 EventNode 生成嵌入
   * @param onProgress 进度回调
   * @returns 成功嵌入的数量
   */
  async function embedUnprocessedEvents(
    onProgress?: EmbedProgressCallback,
    range?: { start?: number; end?: number }
  ): Promise<{ success: number; failed: number }> {
    const chatId = getCurrentChatId();
    if (!chatId) {
      throw new Error('No current chat');
    }

    const db = getDbForChat(chatId);

    // 获取未嵌入的事件 (V1.2.2: 仅处理 Level 0 事件，大纲节点不进行向量化)
    let events = await db.events
      .filter((event) => event.level === 0 && !event.is_embedded && !event.embedding)
      .toArray();

    // 应用范围过滤
    events = filterEventsByRange(events, range);

    if (events.length === 0) {
      return { success: 0, failed: 0 };
    }

    Logger.info(LogModule.RAG_EMBED, `开始嵌入 ${events.length} 个事件`);

    // 构建请求
    const requests: EmbedRequest[] = events.map((event) => ({
      id: event.id,
      text: event.summary,
    }));

    // 批量嵌入
    const results = await embedBatch(requests, onProgress);

    // 更新数据库
    let success = 0;
    let failed = 0;

    for (const result of results) {
      if (!result || result.error || result.embedding.length === 0) {
        failed++;
        continue;
      }

      await db.events.update(result.id, {
        embedding: result.embedding,
        is_embedded: true,
      });
      success++;
    }

    Logger.info(LogModule.RAG_EMBED, `嵌入完成: ${success} 成功, ${failed} 失败`);
    return { success, failed };
  }

  /**
   * 为指定的事件列表生成嵌入
   */
  async function embedEvents(
    events: EventNode[],
    onProgress?: EmbedProgressCallback
  ): Promise<{ success: number; failed: number }> {
    if (events.length === 0) {
      return { success: 0, failed: 0 };
    }

    const chatId = getCurrentChatId();
    if (!chatId) {
      throw new Error('No current chat');
    }

    // 构建请求
    const requests: EmbedRequest[] = events.map((event) => ({
      id: event.id,
      text: event.summary,
    }));

    // 批量嵌入
    const results = await embedBatch(requests, onProgress);

    // 更新数据库
    let success = 0;
    let failed = 0;

    for (const result of results) {
      if (!result || result.error || result.embedding.length === 0) {
        failed++;
        continue;
      }

      await persistEventEmbedding(result.id, result.embedding, chatId);
      success++;
    }

    return { success, failed };
  }

  /**
   * 为指定的 EventNode 生成嵌入
   */
  async function embedEvent(event: EventNode): Promise<number[]> {
    const embedding = await embed(event.summary);
    await persistEventEmbedding(event.id, embedding);
    return embedding;
  }

  /**
   * 重新嵌入所有事件 (模型切换后使用)
   */
  async function reembedAllEvents(
    onProgress?: EmbedProgressCallback,
    range?: { start?: number; end?: number }
  ): Promise<{ success: number; failed: number }> {
    const chatId = getCurrentChatId();
    if (!chatId) {
      throw new Error('No current chat');
    }

    const db = getDbForChat(chatId);

    // 获取所有事件 (V1.2.2: 仅处理 Level 0 事件)
    let events = await db.events.filter((event) => event.level === 0).toArray();

    // 应用范围过滤
    events = filterEventsByRange(events, range);

    if (events.length === 0) {
      return { success: 0, failed: 0 };
    }

    Logger.info(LogModule.RAG_EMBED, `重新嵌入 ${events.length} 个事件`);

    // 清空选定范围内现有嵌入标记
    for (const event of events) {
      await db.events.update(event.id, {
        embedding: undefined,
        is_embedded: false,
      });
    }

    // 重新嵌入
    return embedEvents(events, onProgress);
  }

  // ==================== 工具方法 ====================

  /**
   * 计算向量范数平方 (L2 Norm Squared)
   * 注意：为了保持兼容，函数名仍为 computeNorm，但返回的是平方和
   */
  function computeNorm(vec: number[]): number {
    let sum = 0;
    for (let i = 0; i < vec.length; i++) {
      sum += vec[i] * vec[i];
    }
    return sum; // 返回平方和，调用方自行 sqrt 以保持灵活性
  }

  /**
   * 计算余弦相似度
   * 支持传入预计算的范数平方以提升性能
   *
   * @param vecA 向量 A
   * @param vecB 向量 B
   * @param normSqA (可选) 向量 A 的范数平方
   * @param normSqB (可选) 向量 B 的范数平方
   */
  function cosineSimilarity(
    vecA: number[],
    vecB: number[],
    normSqA?: number,
    normSqB?: number
  ): number {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;

    let dot = 0;
    let nA = normSqA ?? 0;
    let nB = normSqB ?? 0;

    const calcA = normSqA === undefined;
    const calcB = normSqB === undefined;

    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
      if (calcA) nA += vecA[i] * vecA[i];
      if (calcB) nB += vecB[i] * vecB[i];
    }

    const denom = Math.sqrt(nA) * Math.sqrt(nB);
    return denom === 0 ? 0 : dot / denom;
  }

  /**
   * 获取嵌入统计信息
   */
  async function getEmbeddingStats(): Promise<{
    total: number;
    embedded: number;
    pending: number;
  }> {
    const chatId = getCurrentChatId();
    if (!chatId) {
      return { total: 0, embedded: 0, pending: 0 };
    }

    const db = tryGetDbForChat(chatId);
    if (!db) {
      return { total: 0, embedded: 0, pending: 0 };
    }

    const events = await db.events.toArray();
    const embedded = events.filter((event) => event.is_embedded).length;

    return {
      total: events.length,
      embedded,
      pending: events.length - embedded,
    };
  }

  return {
    setConfig,
    setConcurrency,
    stop,
    reset,
    embed,
    embedBatch,
    embedUnprocessedEvents,
    embedEvents,
    embedEvent,
    reembedAllEvents,
    computeNorm,
    cosineSimilarity,
    getEmbeddingStats,
  };
}

// 导出单例
export const embeddingService = createEmbeddingService();

