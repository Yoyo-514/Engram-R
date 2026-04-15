/** 预处理配置 */
export interface PreprocessConfig {
  /** 是否启用 */
  enabled: boolean;
  /** 当前使用的提示词模板 ID */
  templateId: string;
  /** 是否自动触发 (每次发送消息) */
  autoTrigger: boolean;
  /** 是否开启预览修订 (V0.8.6+) */
  preview: boolean;
}

/** Agentic RAG 召回条目 */
export interface AgenticRecall {
  /** 事件短 UUID (如 evt_a1b2c3d4) */
  id: string;
  /** LLM 赋予的重要性评分 (0.0 - 1.0) */
  score: number;
  /** 召回理由 */
  reason: string;
}

/** 预处理结果 */
export interface PreprocessResult {
  /** 是否成功 */
  success: boolean;
  /** <output> 标签内容 - 注入到用户消息 */
  output: string | null;
  /** <query> 标签内容 - RAG 检索关键词 (Query 增强模式) */
  query: string | null;
  /** 原始 LLM 输出 (已清理 <think>) */
  rawOutput: string;
  /** 召回的事件 ID (Query 增强模式) */
  recalledIds?: string[];
  /** Agentic RAG: <recall_decision> 解析结果 */
  agenticRecalls?: AgenticRecall[];
  /** 处理耗时 (ms) */
  processingTime: number;
  /** 错误信息 */
  error?: string;
}
