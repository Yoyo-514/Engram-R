import type { ScopeState } from '@/types/graph';
import type { EntityExtractConfig, SummarizerConfig, TrimmerConfig } from '@/types/memory';

/**
 * EntityType - 实体类型枚举
 */
export enum EntityType {
  Character = 'char', // 角色/人物
  Location = 'loc', // 地点
  Item = 'item', // 物品
  Concept = 'concept', // 概念/组织/势力
  Unknown = 'unknown', // 未知类型
}

export const DEFAULT_SUMMARIZER_CONFIG: SummarizerConfig = {
  enabled: true,
  triggerMode: 'auto',
  floorInterval: 25, // V0.9.5: 20-30 层一次
  previewEnabled: true,
  promptTemplateId: null,
  llmPresetId: null,
  bufferSize: 10, // V0.9.5: 缓存 10 层
  autoHide: false,
};

export const DEFAULT_TRIMMER_CONFIG: TrimmerConfig = {
  enabled: false,
  trigger: 'token',
  tokenLimit: 4096,
  countLimit: 5,
  keepRecentCount: 3,
  preserveOriginal: false,
  previewEnabled: true,
};

export const DEFAULT_ENTITY_CONFIG: EntityExtractConfig = {
  enabled: false,
  trigger: 'floor',
  floorInterval: 15,
  keepRecentCount: 5,
  autoArchive: true,
  archiveLimit: 50,
};

/**
 * 默认 ScopeState
 */
export const DEFAULT_SCOPE_STATE: ScopeState = {
  chatId: '',
  last_summarized_floor: 0,
  token_usage_accumulated: 0,
  last_compressed_at: 0,
  active_summary_order: 9000,
  last_extracted_floor: 0,
  lastModified: 0,
};
