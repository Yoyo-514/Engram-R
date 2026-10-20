export type PromptCategory =
  | 'summary' // 剧情摘要（统一为 JSON 输出）
  | 'trim' // 精简/修剪
  | 'entity_extraction'; // 实体提取

export interface PromptTemplate {
  /** 唯一标识 */
  id: string;
  /** 模板名称 */
  name: string;
  /** 模板分类 */
  category: PromptCategory;
  /** 是否启用（每个分类可以有多个模板，但只有一个启用的会被使用） */
  enabled: boolean;
  /** 是否为内置模板（内置模板不可删除） */
  isBuiltIn: boolean;
  /** 绑定的 LLM 预设 ID，null 表示使用默认预设 */
  boundPresetId: string | null;
  /** 直接绑定的额外世界书列表（导出时会被排除） */
  extraWorldbooks?: string[];
  /** 系统提示词 */
  systemPrompt: string;
  /** 用户提示词模板，支持变量 {{chatHistory}}, {{context}} 等 */
  userPromptTemplate: string;
  /** 注入模式: 'replace'=覆盖用户输入, 'append'=追加到用户输入之后, 'prepend'=添加到用户输入之前 */
  injectionMode?: 'replace' | 'append' | 'prepend';
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
}
