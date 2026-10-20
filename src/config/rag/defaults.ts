import type { EmbeddingConfig, RecallConfig, RerankConfig, VectorConfig } from '@/types/rag';

export const DEFAULT_VECTOR_CONFIG: VectorConfig = {
  source: 'transformers',
};

export const DEFAULT_RECALL_CONFIG: RecallConfig = {
  enabled: true,
  useEmbedding: true,
  useRerank: false,
  useKeywordRecall: true,
  enableEntityKeyword: true,
  enableEventKeyword: true,
  keywordTopK: {
    events: 50,
    entities: 30,
  },
  embedding: {
    topK: 50,
    minScoreThreshold: 0.35,
  },
};

export const DEFAULT_EMBEDDING_CONFIG: EmbeddingConfig = {
  enabled: false,
  trigger: 'with_trim',
  concurrency: 5,
  keepRecentCount: 3,
};

export const DEFAULT_RERANK_CONFIG: RerankConfig = {
  enabled: false,
  url: '',
  apiKey: '',
  model: '',
  topN: 5,
  hybridAlpha: 0.5,
};

/**
 * 实体注入上限：无论关键词召回多少实体，注入 prompt 的实体状态最多取这个数
 * 防止实体描述（YAML 烧录）过多撑爆 token
 */
export const DEFAULT_ENTITY_INJECT_LIMIT = 10;
