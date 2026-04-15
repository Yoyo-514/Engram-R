import type {
  BrainRecallConfig,
  EmbeddingConfig,
  RecallConfig,
  RerankConfig,
  VectorConfig,
} from '@/types/rag';

export const DEFAULT_VECTOR_CONFIG: VectorConfig = {
  source: 'transformers',
};

export const DEFAULT_BRAIN_RECALL_CONFIG: BrainRecallConfig = {
  enabled: false,
  workingLimit: 10,
  shortTermLimit: 35,
  reinforceFactor: 0.2,
  decayRate: 0.08,
  evictionThreshold: 0.25,
  contextSwitchThreshold: 0.4,
  gateThreshold: 0.6,
  maxDamping: 0.1,
  sigmoidTemperature: 0.15,
  boredomThreshold: 5,
  boredomPenalty: 0.1,
  mmrThreshold: 0.85,
  newcomerBoost: 0.2,
};

export const DEFAULT_RECALL_CONFIG: RecallConfig = {
  enabled: true,
  useEmbedding: true,
  useRerank: false,
  usePreprocessing: false,
  useAgenticRAG: false,
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
  brainRecall: DEFAULT_BRAIN_RECALL_CONFIG,
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
