import { DEFAULT_RECALL_CONFIG } from '@/config/rag/defaults';
import { get } from '@/config/settings';
import { Logger, LogModule } from '@/core/logger';
import { getErrorMessage } from '@/core/utils/error';
import { withRetry, type RetryPolicy } from '@/core/utils/retry';
import { tryGetDbForChat } from '@/data/db';
import { getCurrentChatId } from '@/integrations/tavern';
import { embeddingService } from '@/modules/rag/embedding/EmbeddingService';
import type { ScoredEvent } from '@/modules/rag/retrieval/HybridScorer';

export interface VectorRecallResult {
  candidates: ScoredEvent[];
  elapsedMs: number;
}

function vectorRetryPolicy(): RetryPolicy {
  const custom = get('runtimeSettings')?.vectorConfig?.retryConfig;

  return {
    maxAttempts: custom?.maxAttempts ?? 3,
    delayMs: custom?.retryDelay ?? 2000,
    backoff: 'exponential',
    retryIf: (error: unknown) => {
      const message =
        error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
      return (
        message.includes('429') ||
        message.includes('rate limit') ||
        message.includes('timeout') ||
        message.includes('network error') ||
        message.includes('failed to fetch')
      );
    },
  };
}

function truncateQuery(rawQuery: string, maxLength: number): string {
  if (Array.from(rawQuery).length <= maxLength) {
    return rawQuery;
  }

  Logger.debug(LogModule.RAG_RETRIEVE, `查询过长，已裁剪至 ${maxLength} 字符`, {
    originalLength: rawQuery.length,
  });
  return Array.from(rawQuery).slice(0, maxLength).join('') + '...';
}

async function scanEmbeddedEvents(query: string): Promise<ScoredEvent[]> {
  const config = get('runtimeSettings')?.recallConfig || DEFAULT_RECALL_CONFIG;
  const chatId = getCurrentChatId();
  const db = chatId ? tryGetDbForChat(chatId) : null;
  if (!db) {
    return [];
  }

  const vectorConfig = get('runtimeSettings')?.vectorConfig;
  if (!vectorConfig) {
    Logger.warn(LogModule.RAG_RETRIEVE, '向量配置缺失，跳过向量检索');
    return [];
  }

  embeddingService.setConfig(vectorConfig);

  const threshold = config.embedding?.minScoreThreshold ?? 0.3;
  const topK = config.embedding?.topK || 20;
  const queryVector = await embeddingService.embed(truncateQuery(query, 300));

  const candidates: ScoredEvent[] = [];
  const scanned = { total: 0, embedded: 0, matched: 0 };

  await db.events.toCollection().each((event) => {
    scanned.total += 1;
    if (!event.embedding || event.embedding.length === 0) {
      return;
    }

    scanned.embedded += 1;
    const similarity = embeddingService.cosineSimilarity(queryVector, event.embedding);
    if (similarity < threshold) {
      return;
    }

    scanned.matched += 1;
    const candidate: ScoredEvent = {
      id: event.id,
      summary: event.summary,
      embeddingScore: similarity,
      node: event,
    };

    // 流式维护 TopK，避免全量事件入内存
    if (candidates.length < topK) {
      candidates.push(candidate);
      candidates.sort((a, b) => (b.embeddingScore || 0) - (a.embeddingScore || 0));
      return;
    }

    const tailScore = candidates[candidates.length - 1]?.embeddingScore || 0;
    if (similarity <= tailScore) {
      return;
    }

    candidates[candidates.length - 1] = candidate;
    candidates.sort((a, b) => (b.embeddingScore || 0) - (a.embeddingScore || 0));
  });

  Logger.debug(LogModule.RAG_INJECT, '向量检索完成', {
    candidateCount: candidates.length,
    scannedEvents: scanned.total,
    embeddedEvents: scanned.embedded,
    matchedEvents: scanned.matched,
    topK,
    threshold,
  });

  return candidates;
}

/** 向量召回；嵌入失败会按配置重试，重试耗尽后抛出。 */
export async function collectVectorCandidates(query: string): Promise<VectorRecallResult> {
  const config = get('runtimeSettings')?.recallConfig || DEFAULT_RECALL_CONFIG;

  if (!config.useEmbedding || !config.enabled) {
    Logger.debug(LogModule.RAG_INJECT, '向量检索未开启，跳过');
    return { candidates: [], elapsedMs: 0 };
  }

  const startTime = Date.now();

  try {
    const candidates = await withRetry(
      () => scanEmbeddedEvents(query),
      vectorRetryPolicy(),
      '向量检索'
    );
    return { candidates, elapsedMs: Date.now() - startTime };
  } catch (error) {
    Logger.warn(LogModule.RAG_RETRIEVE, '生成查询向量失败', { error: getErrorMessage(error) });
    throw error;
  }
}
