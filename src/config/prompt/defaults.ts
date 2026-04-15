import type { PromptCategory } from '@/types/prompt';

export const PROMPT_CATEGORIES: { value: PromptCategory; label: string; description: string }[] = [
  { value: 'summary', label: '剧情摘要', description: '将对话转为结构化 JSON 事件' },
  { value: 'trim', label: '精简/修剪', description: '合并、压缩旧的事件记录' },
  {
    value: 'preprocess',
    label: '预处理',
    description: '用户输入预处理（Query 增强/剧情编排/描写增强等）',
  },
  {
    value: 'entity_extraction',
    label: '实体提取',
    description: '从事件中提取角色、地点、物品等实体',
  },
];
