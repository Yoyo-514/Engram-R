import { get } from '@/config/settings';
import { Logger, LogModule } from '@/core/logger';
import { getErrorMessage } from '@/core/utils/error';
import { withRetry, type RetryPolicy } from '@/core/utils/retry';
import { mergeResults, scoreAndSort, type ScoredEvent } from '@/modules/rag/retrieval/HybridScorer';
import { rerankService } from '@/modules/rag/retrieval/Reranker';
import type { RecallConfig } from '@/types/rag';

export interface MergeAndRerankInput {
  vectorCandidates: ScoredEvent[];
  keywordCandidates: ScoredEvent[];
  query: string;
  config: RecallConfig;
}

export interface MergeAndRerankResult {
  candidates: ScoredEvent[];
  originalCount: number;
  hardLimit: number;
  rerankMs: number;
}

function rerankRetryPolicy(): RetryPolicy {
  const custom = get('runtimeSettings')?.rerankConfig?.retryConfig;

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
        message.includes('network') ||
        message.includes('failed to fetch')
      );
    },
  };
}

/** 合并关键词与向量候选，按配置重排；重排失败时回退到合并结果。 */
export async function mergeAndRerank(input: MergeAndRerankInput): Promise<MergeAndRerankResult> {
  const candidateMap = new Map<string, ScoredEvent>();

  // 先放关键词候选；复制对象，避免污染上游候选缓存
  for (const candidate of input.keywordCandidates) {
    candidateMap.set(candidate.id, { ...candidate });
  }

  for (const candidate of input.vectorCandidates) {
    const existing = candidateMap.get(candidate.id);
    candidateMap.set(
      candidate.id,
      existing ? { ...existing, embeddingScore: candidate.embeddingScore } : { ...candidate }
    );
  }

  const merged = Array.from(candidateMap.values());
  if (merged.length === 0) {
    Logger.info(LogModule.RAG_INJECT, '没有合并候选，跳过合并');
    return { candidates: [], originalCount: 0, hardLimit: 0, rerankMs: 0 };
  }

  // 避免关键词候选爆炸穿透到后续
  const hardLimit = input.config.keywordTopK?.events ?? input.config.embedding?.topK ?? 50;
  const limited = scoreAndSort(merged).slice(0, Math.max(1, hardLimit));
  const originalCount = merged.length;

  if (!input.config.useRerank || !rerankService.isEnabled()) {
    Logger.debug(LogModule.RAG_INJECT, `合并完成，最终事件候选: ${limited.length} 个`, {
      vector: input.vectorCandidates.length,
      keyword: input.keywordCandidates.length,
    });
    return { candidates: limited, originalCount, hardLimit, rerankMs: 0 };
  }

  const startTime = Date.now();

  try {
    const rerankResults = await withRetry(
      () =>
        rerankService.rerank(
          input.query,
          limited.map((candidate) => candidate.summary)
        ),
      rerankRetryPolicy(),
      'Rerank'
    );

    const embeddingMap = new Map(limited.map((candidate) => [candidate.id, candidate]));
    const candidates = mergeResults(embeddingMap, rerankResults, limited);

    Logger.debug(LogModule.RAG_INJECT, `Rerank 完成，最终事件候选: ${candidates.length} 个`, {
      vector: input.vectorCandidates.length,
      keyword: input.keywordCandidates.length,
    });

    return { candidates, originalCount, hardLimit, rerankMs: Date.now() - startTime };
  } catch (error) {
    Logger.warn(LogModule.RAG_RETRIEVE, 'Rerank 重试耗尽，回退到未重排候选', {
      error: getErrorMessage(error),
    });
    return { candidates: limited, originalCount, hardLimit, rerankMs: Date.now() - startTime };
  }
}
