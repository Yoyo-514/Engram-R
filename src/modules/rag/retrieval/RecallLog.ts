import { Logger, LogModule } from '@/core/logger';
import { RecallLogService } from '@/core/logger/RecallLogger';
import { getLiveActivatedWorldInfo } from '@/integrations/tavern';
import type { ScoredEvent } from '@/modules/rag/retrieval/HybridScorer';
import type { RecallConfig, RecalledEntity } from '@/types/rag';

export interface RecallLogInput {
  query: string;
  candidates: ScoredEvent[];
  recalledEntities: RecalledEntity[];
  config: RecallConfig;
  totalCandidates: number;
  keywordElapsedMs: number;
  vectorElapsedMs: number;
  rerankMs: number;
}

/** 记录本轮召回结果，并输出汇总日志。 */
export async function recordRecallLog(input: RecallLogInput): Promise<void> {
  const { candidates, recalledEntities } = input;

  // 并行激活的世界书条目仅用于日志展示，注入由宿主处理
  let worldbookEntriesCount = 0;
  try {
    const worldInfoText = await getLiveActivatedWorldInfo();
    worldbookEntriesCount = worldInfoText ? worldInfoText.split('\n\n').length : 0;
  } catch {
    Logger.debug(LogModule.RAG_INJECT, '获取世界书条目统计失败');
  }

  const latencyMs = input.vectorElapsedMs + input.keywordElapsedMs + input.rerankMs;

  RecallLogService.log({
    query: input.query,
    mode: 'hybrid',
    results: candidates.map((candidate) => ({
      eventId: candidate.id,
      summary: candidate.summary,
      category: candidate.node?.structured_kv?.event || 'unknown',
      embeddingScore: candidate.embeddingScore || 0,
      keywordScore: candidate.keywordScore,
      rerankScore: candidate.rerankScore,
      hybridScore: candidate.hybridScore,
      isTopK: true,
      isReranked: candidate.rerankScore != null,
      sourceFloor: candidate.node?.source_range?.start_index,
    })),
    recalledEntities: recalledEntities.map((entity) => ({
      id: entity.id,
      name: entity.name,
      type: entity.type,
      description: entity.description,
      score: entity.recallScore,
    })),
    stats: {
      totalCandidates: input.totalCandidates,
      topKCount: candidates.length,
      rerankCount: candidates.length,
      latencyMs,
    },
  });

  Logger.info(LogModule.RAG_INJECT, '召回汇总报告', {
    entities: recalledEntities.length,
    events: candidates.filter((candidate) => candidate.node).length,
    worldbook: worldbookEntriesCount,
    totalTime: `${latencyMs}ms`,
    isEmbedding: !!input.config.useEmbedding,
    isRerank: !!input.config.useRerank,
  });
}
