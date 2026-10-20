import type { EntityNode } from './graph';

export interface VectorConfig {
  /** 向量源 */
  source: VectorSource;
  /** API 端点（部分源需要） */
  apiUrl?: string;
  /** API Key（部分源需要） */
  apiKey?: string;
  /** 模型名称 */
  model?: string;
  /** 向量维度 */
  dimensions?: number;
  /** 自动添加 URL 后缀 (默认 true) */
  autoSuffix?: boolean;
  /** API 调用重试配置 */
  retryConfig?: {
    maxAttempts: number;
    retryDelay: number;
  };
}

export type VectorSource =
  | 'transformers' // 本地 transformers
  | 'openai' // OpenAI Embeddings API
  | 'ollama' // Ollama
  | 'vllm' // vLLM
  | 'cohere' // Cohere
  | 'jina' // Jina AI
  | 'voyage' // Voyage AI
  | 'custom'; // 自定义 (OpenAI 兼容)

export interface RerankConfig {
  /** 是否启用 */
  enabled: boolean;
  /** API 端点 */
  url: string;
  /** API Key */
  apiKey: string;
  /** 模型名称 */
  model: string;
  /** 返回的结果数量 */
  topN: number;
  /** 混合评分权重 (0-1, 0=纯向量, 1=纯Rerank) */
  hybridAlpha: number;
  /** 自动添加 URL 后缀 (默认 true) */
  autoSuffix?: boolean;
  /** API 调用重试配置 */
  retryConfig?: {
    maxAttempts: number;
    retryDelay: number;
  };
}

export interface RecallConfig {
  /** 是否启用 RAG 召回系统 (总开关) */
  enabled: boolean;

  /** 策略 1: 是否使用 Embedding 语义检索 */
  useEmbedding: boolean;

  /** 策略 2: 是否使用 Rerank 重排序 */
  useRerank: boolean;

  /** 策略 3: 是否使用关键词召回 (0 消耗模式) */
  useKeywordRecall?: boolean;

  /** 关键词召回细分：是否检索实体 (默认 true) */
  enableEntityKeyword?: boolean;

  /** 关键词召回细分：是否检索事件 (默认 true) */
  enableEventKeyword?: boolean;

  /**
   * 关键词召回硬上限 (Hard TopK)
   * - 防止关键词召回候选爆炸
   */
  keywordTopK?: {
    /** 关键词命中的事件上限 */
    events: number;
    /** 关键词命中的实体上限 */
    entities: number;
  };

  /** Embedding 详细配置 */
  embedding?: {
    topK: number;
    minScoreThreshold: number;
  };
}

export interface RecallCandidate {
  id: string;
  label?: string; // 可读名称
  category?: 'event' | 'entity'; // 类型区分，默认 event
  embeddingScore: number;
  rerankScore?: number;
  embeddingVector?: number[];
}

/** 本轮召回的实体，recallScore 为关键词直中或多跳衰减后的得分。 */
export type RecalledEntity = EntityNode & { recallScore: number };

export type EmbeddingTriggerType = 'with_trim' | 'standalone' | 'manual';

export interface EmbeddingConfig {
  /** 是否启用嵌入 */
  enabled: boolean;
  /** 触发器类型 */
  trigger: EmbeddingTriggerType;
  /** 并发数 (1-20) */
  concurrency: number;
  /** 保留最近 N 条不嵌入 (与 Trim.keepRecentCount 共享) */
  keepRecentCount?: number;
}
