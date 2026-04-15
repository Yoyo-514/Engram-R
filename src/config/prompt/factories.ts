import type { PromptCategory, PromptTemplate } from '@/types/prompt';

/**
 * 创建提示词模板
 */
export function createPromptTemplate(
  name: string,
  category: PromptCategory,
  options: Partial<Omit<PromptTemplate, 'name' | 'category' | 'createdAt' | 'updatedAt'>> & {
    id?: string;
  } = {}
): PromptTemplate {
  const now = Date.now();

  return {
    id: options.id || `template_${now}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    category,
    enabled: options.enabled ?? false,
    isBuiltIn: options.isBuiltIn ?? false,
    boundPresetId: options.boundPresetId ?? null,
    systemPrompt: options.systemPrompt ?? '',
    userPromptTemplate: options.userPromptTemplate ?? '',
    injectionMode: options.injectionMode,
    createdAt: now,
    updatedAt: now,
  };
}
