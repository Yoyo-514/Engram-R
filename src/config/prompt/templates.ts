import { getBuiltInTemplates, initPromptLoader } from '@/integrations/llm/PromptLoader';
import type { PromptCategory, PromptTemplate } from '@/types/prompt';

/**
 * 内置提示词模板
 */
export function getBuiltInPromptTemplates(): PromptTemplate[] {
  initPromptLoader();
  return getBuiltInTemplates();
}

/**
 * 通过 ID 获取内置模板
 */
export function getBuiltInTemplateById(id: string): PromptTemplate | undefined {
  return getBuiltInPromptTemplates().find((template) => template.id === id);
}

/**
 * 通过分类获取内置模板的默认值
 */
export function getBuiltInTemplateByCategory(category: PromptCategory): PromptTemplate | null {
  return getBuiltInPromptTemplates().find((template) => template.category === category) || null;
}
