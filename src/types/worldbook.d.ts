export interface WorldbookConfig {
  /** 是否启用世界书 */
  enabled: boolean;
  /** 是否包含全局世界书（相当于全选/全不选） */
  includeGlobal: boolean;
  /** 全局世界书黑名单（被禁用的世界书名称列表） */
  disabledWorldbooks: string[];
  /** 全局条目黑名单 (V1.3 替代弃用的 state.ts) */
  disabledEntries?: Record<string, number[]>;
  /** 是否启用 EJS 模板 (ST-Prompt-Template 兼容) */
  enableEJS?: boolean;
}

export interface WorldbookProfile {
  id: string;
  name: string;
  description?: string; // For future LLM routing
  mode: 'inherit_global' | 'custom';
  selectedWorldbooks: string[]; // Whitelist of worldbook names
  createdAt: number;
  updatedAt: number;
}
