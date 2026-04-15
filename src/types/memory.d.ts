/** 触发模式 */
export type SummarizerTriggerType = 'auto' | 'manual';

export type TrimTriggerType = 'token' | 'count';

export type EntityTriggerType = 'floor' | 'manual';

/** Summarizer 配置 */
export interface SummarizerConfig {
  /** 是否启用自动总结 */
  enabled: boolean;
  /** 触发模式：自动/手动 */
  triggerMode: TriggerMode;
  /** 楼层间隔：每 N 楼触发一次 */
  floorInterval: number;
  /** 是否启用预览 */
  previewEnabled: boolean;
  /** 使用的提示词模板 ID */
  promptTemplateId: string | null;
  /** 使用的 LLM 预设 ID（null 表示使用默认） */
  llmPresetId: string | null;
  /** 保留末尾不处理的楼层数（缓冲） */
  bufferSize: number;
  /** 是否自动隐藏已总结的楼层 */
  autoHide: boolean;
}

/** 总结结果 */
export interface SummaryResult {
  /** 唯一标识 (V4 新增) */
  id?: string;

  /** 总结内容 */
  content: string;
  /** Token 数量 */
  tokenCount: number;
  /** 来源楼层范围 [起始, 结束] */
  sourceFloors: [number, number];
  /** 生成时间戳 */
  timestamp: number;
}

/** Summarizer 状态 */
export interface SummarizerStatus {
  /** 是否正在运行 */
  running: boolean;
  /** 当前楼层计数 */
  currentFloor: number;
  /** 上次总结时的楼层 */
  lastSummarizedFloor: number;
  /** 待处理楼层数 */
  pendingFloors: number;
  /**
   * 触发模式
   * auto: 自动触发 (基于楼层或 V2 Pipeline)
   * manual: 仅手动
   */
  mode?: SummarizerTriggerType;

  /** 总结历史记录数 */
  historyCount: number;
  /** 是否正在执行总结 */
  isSummarizing: boolean;
}

export interface TrimmerConfig {
  /** 是否启用精简 */
  enabled: boolean;
  /** 触发器类型 */
  trigger: TrimTriggerType;
  /** Token 上限（trigger='token' 时使用） */
  tokenLimit: number;
  /** 总结次数上限（trigger='count' 时使用） */
  countLimit: number;
  /** 保留最近 N 条不合并 */
  keepRecentCount?: number;
  /** 是否保留原始条目（禁用而非删除） */
  preserveOriginal?: boolean;
  /** 是否启用预览确认 */
  previewEnabled?: boolean;
}

export interface EntityExtractConfig {
  /** 是否启用自动提取 */
  enabled: boolean;
  /** 触发器类型 */
  trigger: EntityTriggerType;
  /** 楼层间隔 (每 N 楼触发一次，默认 50) */
  floorInterval: number;
  /** 保留最近 N 条对话不处理 */
  /** 保留最近 N 条对话不处理 */
  keepRecentCount: number;
  /** 使用的提示词模板 ID */
  promptTemplateId?: string;
  /** 是否启用自动归档 (当总数超过上限时) */
  autoArchive?: boolean;
  /** 实体数量上限 (默认 50) */
  archiveLimit?: number;
}

/**
 * 记忆槽位
 */
export interface MemorySlot {
  id: string;
  label: string; // 可读名称 (Event Type 或 Entity Name)
  category: 'event' | 'entity'; // 区分实体和事件

  // 双轨强度
  embeddingStrength: number;
  rerankStrength: number;

  // 最终计算分 (基础分，不含临时加成)
  finalScore: number;

  // 时间与计数
  firstRound: number;
  lastRound: number;
  recallCount: number;

  // 连胜计数
  consecutiveWorkingCount: number;

  // 层级
  tier: 'working' | 'shortTerm';

  // 向量缓存
  embeddingVector?: number[];
}
