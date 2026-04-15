import type { GlobalRegexConfig, RegexRule, RegexScope } from '@/types/regex';

export const DEFAULT_REGEX_CONFIG: GlobalRegexConfig = {
  enableNativeRegex: true,
  enableEngramRegex: true,
};

/** 作用域选项 (常量) */
export const REGEX_SCOPE_OPTIONS: { value: RegexScope; label: string; description: string }[] = [
  { value: 'input', label: '输入', description: '清洗发给 LLM 的聊天内容' },
  { value: 'output', label: '输出', description: '清洗 LLM 返回的内容（预览/写入前）' },
  { value: 'both', label: '两者', description: '输入和输出都应用' },
];

/** 默认正则规则 */
export const DEFAULT_REGEX_RULES: RegexRule[] = [
  {
    id: 'remove-think',
    name: '移除思维链',
    pattern: '<(think|thinking)(?:\\s+[^>]*)?>[\\s\\S]*?<\\/(think|thinking)\\s*>',
    replacement: '',
    enabled: true,
    flags: 'gi',
    scope: 'both',
    description: '移除 LLM 输出中的 <think>...</think> 或 <thinking>...</thinking> 思考过程',
  },
  {
    id: 'remove-headless-think',
    name: '移除无头思维链',
    pattern: '[\\s\\S]*?<\\/(think|thinking)\\s*>',
    replacement: '',
    enabled: true,
    flags: 'gi',
    scope: 'both',
    description: '移除无开头标签的思维链，如直接以 </think> 或 </thinking> 结尾的内容',
  },
  {
    id: 'remove-disclaimer',
    name: '移除解析声明 (Disclaimer)',
    pattern: '<disclaimer(?:\\s+[^>]*)?>[\\s\\S]*?<\\/disclaimer\\s*>',
    replacement: '',
    enabled: true,
    flags: 'gi',
    scope: 'both',
    description: '移除 LLM 输出中可能出现的 <disclaimer> 免责声明，主要用于反截断和内容清洗',
  },
  {
    id: 'remove-update-variable',
    name: '移除 UpdateVariable',
    pattern: '<UpdateVariable(?:\\s+[^>]*)?>[\\s\\S]*?<\\/UpdateVariable\\s*>',
    replacement: '',
    enabled: true,
    flags: 'gi',
    scope: 'both',
    description: '移除 MVU 更新变量标签，避免污染提示词',
  },
  {
    id: 'remove-status-placeholder',
    name: '移除 StatusPlaceHolder',
    pattern: '<StatusPlaceHolderImpl(?:\\s+[^>]*)?\\s*\\/>',
    replacement: '',
    enabled: true,
    flags: 'gi',
    scope: 'both',
    description: '移除变量脚本在消息末尾添加的占位符标签',
  },
];
