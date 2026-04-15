import type { LLMPreset } from './llm';
import type { CustomMacro } from './macro';
import type { EntityExtractConfig } from './memory';
import type { PromptTemplate } from './prompt';
import type { EmbeddingConfig, RecallConfig, RerankConfig, VectorConfig } from './rag';
import { GlobalRegexConfig } from './regex';
import { WorldbookConfig, WorldbookProfile } from './worldbook';

export interface EngramRuntimeSettings {
  /** LLM 预设列表 */
  llmPresets: LLMPreset[];
  /** 当前选中的 LLM 预设 ID（作为默认预设） */
  selectedPresetId: string | null;
  /** 向量化配置 */
  vectorConfig: VectorConfig;
  /** Rerank 配置 */
  rerankConfig: RerankConfig;
  /** 提示词模板列表 */
  promptTemplates: PromptTemplate[];
  /** 世界书配置 */
  worldbookConfig: WorldbookConfig;
  /** 正则配置 (V0.8) */
  regexConfig: GlobalRegexConfig;
  /** 嵌入配置 */
  embeddingConfig?: EmbeddingConfig;
  /** 召回配置 */
  recallConfig: RecallConfig;
  /** 实体提取配置 */
  entityExtractConfig: EntityExtractConfig;
  /** 自定义宏 */
  customMacros: CustomMacro[];
  /** 世界书配置方案 */
  worldbookProfiles: WorldbookProfile[];
  /** 是否启用 UI 动画 (全局开关) */
  enableAnimations: boolean;
}
