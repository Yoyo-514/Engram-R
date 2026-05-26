/**
 * HybridScorer - 混合打分算法
 *
 * 用于合并 Embedding 相似度、关键词硬匹配和 Rerank 分数。
 * 保持纯函数实现，调用方负责日志和副作用。
 */

import type { EventNode } from '@/types/graph';

/**
 * 带分数的事件
 */
export interface ScoredEvent {
  /** 事件 ID */
  id: string;
  /** 事件摘要 */
  summary: string;
  /** Embedding 余弦相似度分数 (0-1) */
  embeddingScore?: number;
  /** 关键词硬匹配分数 (0-1) */
  keywordScore?: number;
  /** Rerank 相关性分数 (0-1) */
  rerankScore?: number;
  /** 混合分数 */
  hybridScore?: number;
  /** 原始事件节点 */
  node?: EventNode;
}

export interface RerankScore {
  index: number;
  relevance_score: number;
}

/**
 * 计算混合分数。
 * 基础分取 Embedding 与关键词分的较高值，再累加 Rerank 分。
 */
export function calculateHybridScore(
  embeddingScore: number | null | undefined,
  rerankScore: number | null | undefined,
  keywordScore: number | null | undefined
): number {
  const baseScore = Math.max(embeddingScore ?? 0, keywordScore ?? 0);

  if (baseScore === 0 && rerankScore == null) return 0;
  if (baseScore === 0) return rerankScore ?? 0;
  if (rerankScore == null) return baseScore;

  return baseScore + rerankScore;
}

/**
 * 对候选事件进行混合打分和排序。
 * 不修改入参，返回带 hybridScore 的新数组。
 */
export function scoreAndSort(candidates: ScoredEvent[]): ScoredEvent[] {
  return candidates
    .map((event) => ({
      ...event,
      hybridScore: calculateHybridScore(
        event.embeddingScore,
        event.rerankScore,
        event.keywordScore
      ),
    }))
    .sort((a, b) => (b.hybridScore ?? 0) - (a.hybridScore ?? 0));
}

/**
 * 合并基础召回结果和 Rerank 结果。
 * 不修改传入的 Map 和候选对象，方便测试与复用。
 */
export function mergeResults(
  embeddingResults: Map<string, ScoredEvent>,
  rerankResults: RerankScore[],
  embeddingCandidates: ScoredEvent[]
): ScoredEvent[] {
  const merged = new Map<string, ScoredEvent>();

  for (const [id, event] of embeddingResults) {
    merged.set(id, { ...event });
  }

  for (const rerankItem of rerankResults) {
    const candidate = embeddingCandidates[rerankItem.index];
    if (!candidate || !merged.has(candidate.id)) {
      continue;
    }

    merged.set(candidate.id, {
      ...merged.get(candidate.id)!,
      rerankScore: rerankItem.relevance_score,
    });
  }

  return scoreAndSort([...merged.values()]);
}
