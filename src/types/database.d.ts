/**
 * 数据库与 ST 聊天的关联状态
 * - active: 聊天存在于 ST 聊天列表（含历史聊天）
 * - orphaned: 确认孤立（聊天已删除/导出后未清理）
 * - unknown: 无法枚举 ST 聊天列表（旧版酒馆或 API 不可用），不误判
 */
export type DatabaseBindStatus = 'active' | 'orphaned' | 'unknown';

export interface DatabaseSummary {
  name: string;
  chatId: string;
  characterName: string | null;
  isCurrent: boolean;
  lastModified: number | null;
  /** 与 ST 聊天的绑定状态 */
  status: DatabaseBindStatus;
  /** 事件与实体计数，用于卡片上的数据量/空数据指示 */
  eventCount: number;
  entityCount: number;
}

export interface DatabaseStats {
  name: string;
  chatId: string;
  eventCount: number;
  entityCount: number;
  archivedEventCount: number;
  archivedEntityCount: number;
  embeddedEventCount: number;
  embeddedEntityCount: number;
  lastModified: number | null;
}
