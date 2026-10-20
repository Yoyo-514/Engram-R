import { getBuiltInTemplateByCategory } from '@/config/prompt/templates';
import { get } from '@/config/settings';
import { Logger } from '@/core/logger';
import { getTavernContext, yieldToMainThread } from '@/core/utils';
import { getAllTemplates, initPromptLoader } from '@/integrations/llm/PromptLoader';
import type { PromptCategory, PromptTemplate } from '@/types/prompt';

export interface PromptInput {
  text?: string;
  chatHistory?: string;
  previousOutput?: string;
  feedback?: string;
  charName?: string;
  userName?: string;
  charPersona?: string;
  userPersona?: string;
  context?: string;
  worldbookContext?: string;
  engramSummaries?: string;
  engramEntityStates?: string;
  targetSummaries?: string;
}

export interface PromptOptions {
  templateId?: string;
  category?: PromptCategory;
  vars?: Record<string, string>;
}

export interface BuiltPrompt {
  system: string;
  user: string;
  templateId: string;
  presetId: string | null;
}

const FEEDBACK_TEMPLATE = `
---
【用户反馈 - 请依据此修正上一次的生成。上一次的生成内容:
{{previousOutput}}

用户的修改意见:
{{feedback}}
`;

function applyMacroReplacements(
  prompt: string,
  variables: Record<string, string | undefined>
): string {
  let result = prompt;

  for (const [key, value] of Object.entries(variables)) {
    if (value === undefined || value === null) {
      continue;
    }

    result = result.split(key).join(value);
  }

  return result;
}

function resolveTemplate(options: PromptOptions): PromptTemplate {
  const allTemplates = get('runtimeSettings')?.promptTemplates ?? [];

  initPromptLoader();
  const templateMap = new Map<string, PromptTemplate>();
  getAllTemplates().forEach((template) => templateMap.set(template.id, template));
  allTemplates.forEach((template) => templateMap.set(template.id, template));
  const mergedTemplates = Array.from(templateMap.values());

  let template: PromptTemplate | null = null;
  if (options.templateId) {
    template = mergedTemplates.find((candidate) => candidate.id === options.templateId) ?? null;
  } else if (options.category) {
    const templates = mergedTemplates.filter(
      (candidate) => candidate.category === options.category && candidate.enabled
    );
    template = templates.find((candidate) => !candidate.isBuiltIn) ?? templates[0] ?? null;

    if (template) {
      Logger.debug('PromptBuilder', `Using auto-detected enabled template: ${template.name}`);
    }
  }

  if (!template && options.category) {
    template = getBuiltInTemplateByCategory(options.category);
    Logger.debug('PromptBuilder', `Fallback to builtin template: ${template?.name ?? 'unknown'}`);
  }

  if (!template) {
    throw new Error(
      `PromptBuilder: 未找到可用模板 (ID: ${options.templateId}, Category: ${options.category ?? 'none'})`
    );
  }

  return template;
}

/** 读取模板并按输入变量组装 system / user 提示词。 */
export async function buildPrompt(
  input: PromptInput,
  options: PromptOptions
): Promise<BuiltPrompt> {
  const template = resolveTemplate(options);

  const variables: Record<string, string> = {
    ...options.vars,
    '{{userInput}}': input.text ?? '',
    '{{chatHistory}}': input.chatHistory ?? '',
    '{{previousOutput}}': input.previousOutput ?? '',
    '{{feedback}}': input.feedback ?? '',
  };

  let systemPrompt = template.systemPrompt;
  let userPrompt = template.userPromptTemplate;

  if (variables['{{feedback}}']) {
    userPrompt += FEEDBACK_TEMPLATE;
    Logger.debug('PromptBuilder', '检测到反馈，已自动附加反馈模板');
  }

  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    systemPrompt = systemPrompt.replace(regex, value);
    userPrompt = userPrompt.replace(regex, value);

    if (systemPrompt.length + userPrompt.length > 100_000) {
      await yieldToMainThread();
    }
  }

  const macros: Record<string, string | undefined> = {
    '{{chatHistory}}': input.chatHistory,
    '{{engramSummaries}}': input.engramSummaries,
    '{{engramEntityStates}}': input.engramEntityStates,
    '{{targetSummaries}}': input.targetSummaries,
    '{{worldbookContext}}': input.worldbookContext,
    '{{context}}': input.context ?? input.charPersona,
    '{{userPersona}}': input.userPersona,
    '{{char}}': input.charName,
    '{{user}}': input.userName,
  };

  await yieldToMainThread();

  systemPrompt = applyMacroReplacements(systemPrompt, macros);
  userPrompt = applyMacroReplacements(userPrompt, macros);

  try {
    const stContext = getTavernContext();
    const substituteParams = stContext?.substituteParams as
      | ((content: string) => string)
      | undefined;
    if (typeof substituteParams === 'function') {
      systemPrompt = substituteParams(systemPrompt);
      userPrompt = substituteParams(userPrompt);
    }
  } catch (error) {
    Logger.warn('PromptBuilder', '酒馆原生宏替换失败', error);
  }

  Logger.debug('PromptBuilder', `Prompt 构建完成 (Template: ${template.name})`, {
    systemLen: systemPrompt.length,
    userLen: userPrompt.length,
  });

  return {
    system: systemPrompt,
    user: userPrompt,
    templateId: template.id,
    presetId: template.boundPresetId,
  };
}
