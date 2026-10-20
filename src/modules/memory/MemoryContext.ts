import { get } from '@/config/settings';
import { Logger } from '@/core/logger';
import { getCurrentTavernCharacter } from '@/core/utils';
import { getAllTemplates } from '@/integrations/llm';
import {
  getChatHistory,
  getContextualWorldInfo,
  getCurrentCharacter,
  getEntityStates,
  getLiveActivatedWorldInfo,
  getSTContext,
  getSummaries,
} from '@/integrations/tavern';
import { regexProcessor } from '@/modules/workflow/steps/text/RegexProcessor';
import type { PromptCategory } from '@/types/prompt';
import type { WorldbookConfig } from '@/types/worldbook';

const RECENT_WORLDBOOK_MESSAGE_LIMIT = 4;

interface TemplateWithWorldbooks {
  id: string;
  name: string;
  enabled?: boolean;
  category?: unknown;
  extraWorldbooks?: string[];
}

export interface MemoryContextInput {
  range?: [number, number];
  isImport?: boolean;
  text?: string;
  chatHistory?: string;
  extraWorldbooks?: string[];
}

export interface MemoryContextOptions {
  trigger: 'auto' | 'manual' | 'batch';
  workflowId?: string;
  templateId?: string;
  category?: PromptCategory;
  skipInputRegexForHistory?: boolean;
}

export interface MemoryContext {
  charName?: string;
  charPersona: string;
  userName?: string;
  userPersona: string;
  chatHistory: string;
  worldbookContext: string;
  context: string;
  engramSummaries: string;
  engramEntityStates: string;
  extraWorldbooks: string[];
}

function getRecentWorldbookMessages(
  range: [number, number] | undefined,
  history: string,
  isImport: boolean
): string[] | undefined {
  if (isImport) {
    return history ? [history] : undefined;
  }

  const currentChat = getSTContext()?.chat || [];

  if (range) {
    const sliceStart = Math.max(0, range[1] - RECENT_WORLDBOOK_MESSAGE_LIMIT);
    return currentChat
      .slice(sliceStart, range[1])
      .map((message) => message.mes || '')
      .filter((message): message is string => typeof message === 'string' && message.length > 0)
      .toReversed();
  }

  return currentChat
    .slice(-RECENT_WORLDBOOK_MESSAGE_LIMIT)
    .map((message) => message.mes || '')
    .filter((message): message is string => typeof message === 'string' && message.length > 0)
    .toReversed();
}

function resolveTemplateWorldbooks(
  templateId: string | undefined,
  category: PromptCategory | undefined,
  initial: string[]
): string[] {
  let resolved = [...initial];

  try {
    let activeTemplateId = templateId;
    const runtimeSettings = get('runtimeSettings') as
      | { promptTemplates?: TemplateWithWorldbooks[] }
      | undefined;
    const userTemplates = runtimeSettings?.promptTemplates || [];

    if (!activeTemplateId && category) {
      const enabledTemplate = userTemplates.find(
        (template) => template.category === category && template.enabled === true
      );
      if (enabledTemplate) {
        activeTemplateId = enabledTemplate.id;
      }
    }

    if (activeTemplateId) {
      const builtinTemplates = getAllTemplates() as TemplateWithWorldbooks[];
      const template =
        userTemplates.find((item) => item.id === activeTemplateId) ||
        builtinTemplates.find((item) => item.id === activeTemplateId);

      if (template?.extraWorldbooks?.length) {
        Logger.debug('MemoryContext', `Template [${template.name}] has extra worldbooks`, {
          books: template.extraWorldbooks,
        });
        resolved = [...resolved, ...template.extraWorldbooks];
      }
    }
  } catch (error) {
    Logger.warn('MemoryContext', 'Failed to resolve template-bound worldbooks', error);
  }

  return [...new Set(resolved.filter((name): name is string => typeof name === 'string'))];
}

async function resolveWorldbookContent(
  input: MemoryContextInput,
  chatHistory: string
): Promise<string> {
  const worldbookConfig: WorldbookConfig | undefined = get('runtimeSettings')?.worldbookConfig;

  if (worldbookConfig?.enabled === false) {
    Logger.debug('MemoryContext', 'Worldbook feature disabled, skipping world info');
    return '';
  }

  const isImport = Boolean(input.isImport);
  const extraWorldbooks = input.extraWorldbooks ?? [];
  const messages = getRecentWorldbookMessages(input.range, chatHistory, isImport);
  const useContextual = isImport || Boolean(input.range) || extraWorldbooks.length > 0;

  return useContextual
    ? getContextualWorldInfo(messages || [], {
        floorRange: input.range,
        extraWorldbooks,
      })
    : getLiveActivatedWorldInfo();
}

/** 读取角色、聊天历史、世界书与记忆状态，组装一次生成所需的上下文。 */
export async function fetchMemoryContext(
  input: MemoryContextInput,
  options: MemoryContextOptions
): Promise<MemoryContext> {
  const char = getCurrentCharacter();
  const stContext = getSTContext();
  const currentCharacter = getCurrentTavernCharacter(stContext);

  const range = input.range;
  const isImport = Boolean(input.isImport);

  Logger.debug('MemoryContext', 'Loading chat history', {
    range: range ?? null,
    trigger: options.trigger,
    workflowId: options.workflowId,
  });

  // 每次读取当前聊天记录，避免重 roll 或删除消息后复用旧内容
  const history = isImport ? input.text || input.chatHistory || '' : getChatHistory(range);

  const cleanedHistory =
    isImport && !options.skipInputRegexForHistory
      ? await regexProcessor.processAsync(history || '', 'input')
      : history || '';

  if (!history && !isImport) {
    Logger.warn('MemoryContext', 'No chat history was resolved for current workflow');
  }

  const extraWorldbooks = resolveTemplateWorldbooks(
    options.templateId,
    options.category,
    input.extraWorldbooks ?? []
  );

  const worldbookContext = await resolveWorldbookContent(
    { ...input, extraWorldbooks },
    cleanedHistory
  );

  const charPersona = currentCharacter?.description || '';
  const engramSummaries = getSummaries();
  const engramEntityStates = getEntityStates();

  Logger.debug('MemoryContext', 'Context fetch complete', {
    historyLen: cleanedHistory.length,
    wiLen: worldbookContext.length,
    summaryLen: engramSummaries.length,
  });

  return {
    charName: char?.name,
    charPersona,
    userName: stContext?.name1 || 'User',
    userPersona: stContext?.powerUserSettings?.persona_description || '',
    chatHistory: cleanedHistory,
    worldbookContext,
    context: charPersona,
    engramSummaries,
    engramEntityStates,
    extraWorldbooks,
  };
}
