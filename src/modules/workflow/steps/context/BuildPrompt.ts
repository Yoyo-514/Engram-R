import { getBuiltInTemplateByCategory } from '@/config/prompt/templates';
import { get } from '@/config/settings';
import { Logger } from '@/core/logger';
import { getTavernContext } from '@/core/utils';
import { tryGetDbForChat } from '@/data/db';
import { getAllTemplates, initPromptLoader } from '@/integrations/llm/PromptLoader';
import { getCurrentChatId } from '@/integrations/tavern';
import type { JobContext } from '@/types/job_context';
import type { PromptCategory, PromptTemplate } from '@/types/prompt';
import type { IStep } from '@/types/step';

interface BuildPromptConfig {
  templateId?: string;
  category?: PromptCategory;
  vars?: Record<string, string>;
}

type KeywordEntityRef = {
  id: string;
  score?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isPromptCategory(value: unknown): value is PromptCategory {
  return (
    value === 'summary' ||
    value === 'trim' ||
    value === 'preprocessing' ||
    value === 'entity_extraction'
  );
}

function readKeywordEntityRefs(value: unknown): KeywordEntityRef[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    const id = readString(item.id);
    if (!id) {
      return [];
    }

    const score =
      typeof item.score === 'number' && Number.isFinite(item.score) ? item.score : undefined;
    return [{ id, score }];
  });
}

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

export class BuildPrompt implements IStep {
  name = 'BuildPrompt';

  constructor(private config: BuildPromptConfig) {}

  async execute(context: JobContext): Promise<void> {
    const contextConfig = context.config as Record<string, unknown>;
    const contextInput = context.input as Record<string, unknown>;
    const sharedData = (context.data ?? {}) as Record<string, unknown>;

    const templateId = readString(contextConfig.templateId) ?? this.config.templateId;
    const category = isPromptCategory(contextConfig.category)
      ? contextConfig.category
      : this.config.category;

    const allTemplates = get('runtimeSettings')?.promptTemplates ?? [];

    initPromptLoader();
    const builtInTemplates = getAllTemplates();

    const templateMap = new Map<string, PromptTemplate>();
    builtInTemplates.forEach((template) => templateMap.set(template.id, template));
    allTemplates.forEach((template) => templateMap.set(template.id, template));

    const mergedTemplates = Array.from(templateMap.values());

    let template: PromptTemplate | null = null;
    if (templateId) {
      template = mergedTemplates.find((candidate) => candidate.id === templateId) ?? null;
    } else if (category) {
      const templates = mergedTemplates.filter(
        (candidate) => candidate.category === category && candidate.enabled
      );
      template = templates.find((candidate) => !candidate.isBuiltIn) ?? templates[0] ?? null;

      if (template) {
        Logger.debug('BuildPrompt', `Using auto-detected enabled template: ${template.name}`);
      }
    }

    if (!template && category) {
      template = getBuiltInTemplateByCategory(category);
      Logger.debug('BuildPrompt', `Fallback to builtin template: ${template?.name ?? 'unknown'}`);
    }

    if (!template) {
      throw new Error(
        `BuildPrompt: 未找到可用模板 (ID: ${templateId}, Category: ${category ?? 'none'})`
      );
    }

    const variables: Record<string, string> = {
      ...this.config.vars,
      '{{userInput}}': readString(contextInput.text) ?? '',
      '{{chatHistory}}': readString(contextInput.chatHistory) ?? '',
      '{{previousOutput}}': readString(contextInput.previousOutput) ?? '',
      '{{feedback}}': readString(contextInput.feedback) ?? '',
    };

    let systemPrompt = template.systemPrompt;
    let userPrompt = template.userPromptTemplate;

    if (variables['{{feedback}}']) {
      const feedbackTemplate = `
---
【用户反馈 - 请依据此修正上一次的生成。上一次的生成内容:
{{previousOutput}}

用户的修改意见:
{{feedback}}
`;
      userPrompt += feedbackTemplate;
      Logger.debug('BuildPrompt', '检测到反馈，已自动附加反馈模板');
    }

    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      systemPrompt = systemPrompt.replace(regex, value);
      userPrompt = userPrompt.replace(regex, value);
    }

    let hitEntitiesSummary = '无';
    const keywordEntityIds = readKeywordEntityRefs(sharedData.keywordEntityIds);
    if (keywordEntityIds.length > 0) {
      const chatId = getCurrentChatId();
      const db = chatId ? tryGetDbForChat(chatId) : null;
      if (db) {
        const names: string[] = [];
        for (const keywordEntity of keywordEntityIds) {
          const entity = await db.entities.get(keywordEntity.id);
          if (entity) {
            names.push(entity.name);
          }
        }

        if (names.length > 0) {
          hitEntitiesSummary = names.join(', ');
        }
      }
    }

    const potentialMacros: Record<string, string | undefined> = {
      '{{chatHistory}}': readString(contextInput.chatHistory),
      '{{engramSummaries}}': readString(contextInput.engramSummaries),
      '{{engramEntityStates}}': readString(contextInput.engramEntityStates),
      '{{targetSummaries}}': readString(contextInput.targetSummaries),
      '{{worldbookContext}}': readString(contextInput.worldbookContext),
      '{{context}}': readString(contextInput.context) ?? readString(contextInput.charPersona),
      '{{userPersona}}': readString(contextInput.userPersona),
      '{{hitEntities}}': hitEntitiesSummary,
      '{{char}}': readString(contextInput.charName),
      '{{user}}': readString(contextInput.userName),
    };

    systemPrompt = applyMacroReplacements(systemPrompt, potentialMacros);
    userPrompt = applyMacroReplacements(userPrompt, potentialMacros);

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
      Logger.warn('BuildPrompt', '酒馆原生宏替换失败', error);
    }

    context.prompt = {
      system: systemPrompt,
      user: userPrompt,
      templateId: template.id,
    };

    Logger.debug('BuildPrompt', `Prompt 构建完成 (Template: ${template.name})`, {
      systemLen: systemPrompt.length,
      userLen: userPrompt.length,
    });
  }
}
