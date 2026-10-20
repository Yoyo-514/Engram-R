/**
 * 单条召回结果
 */
export interface RecallResultItem {
  eventId: string;
  summary: string;
  category: string;
  embeddingScore: number; // 向量相似度 [0-1]
  keywordScore?: number; // 关键词匹配分数 [0.8 / 0.9]
  rerankScore?: number; // Rerank 分数 [0-1]
  hybridScore?: number; // 混合分数
  isTopK: boolean; // 是否进入 TopK
  isReranked: boolean; // 是否通过 Rerank
  sourceFloor?: number; // 来源楼层
}

/**
 * 召回统计
 */
export interface RecallStats {
  totalCandidates: number; // 候选总数
  topKCount: number; // TopK 数量
  rerankCount: number; // Rerank 后数量
  latencyMs: number; // 耗时 (ms)
}

export interface RecalledEntityLogItem {
  id: string;
  name: string;
  type?: string;
  description?: string;
  score: number;
}

/**
 * 召回日志条目
 */
export interface RecallLogEntry {
  id: string;
  timestamp: number;
  query: string; // 检索查询
  mode: 'embedding' | 'hybrid';
  results: RecallResultItem[]; // 召回结果
  recalledEntities?: RecalledEntityLogItem[]; // 本轮注入的实体列表
  stats: RecallStats; // 统计信息
}
