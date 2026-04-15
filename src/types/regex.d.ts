/** 正则规则作用域 */
export type RegexScope = 'input' | 'output' | 'both';

export interface GlobalRegexConfig {
  /** 是否启用酒馆原生 Regex (SillyTavern) */
  enableNativeRegex: boolean;
  /** 是否启用 Engram 内部 Regex */
  enableEngramRegex: boolean;
}

/** 正则规则定义 */
export interface RegexRule {
  /** 唯一 ID */
  id: string;
  /** 规则名称 */
  name: string;
  /** 正则表达式 */
  pattern: string;
  /** 替换文本 */
  replacement: string;
  /** 是否启用 */
  enabled: boolean;
  /** 正则标志 (g, i, m, s) */
  flags: string;
  /** 作用域：input=清洗发给LLM的内容，output=清洗LLM返回的内容，both=两者都应用 */
  scope: RegexScope;
  /** 描述 */
  description?: string;
}
