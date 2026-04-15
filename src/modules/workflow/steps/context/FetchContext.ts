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
import type { PreparedSummaryContext } from '@/modules/memory/SummaryPreparationCache';
import type { JobContext } from '@/types/job_context';
import type { IStep } from '@/types/step';
import type { WorldbookConfig } from '@/types/worldbook';

const RECENT_WORLDBOOK_MESSAGE_LIMIT = 4;

interface TemplateWithWorldbooks {
  id: string;
  name: string;
  enabled?: boolean;
  category?: unknown;
  extraWorldbooks?: string[];
}

function getRecentWorldbookMessages(
  context: JobContext,
  history: string,
  isImport: boolean
): string[] | undefined {
  if (isImport) {
    return history ? [history] : undefined;
  }

  const range = context.input.range as [number, number] | undefined;
  const currentChat = getSTContext()?.chat || [];

  if (range) {
    const sliceStart = Math.max(0, range[1] - RECENT_WORLDBOOK_MESSAGE_LIMIT);
    return currentChat
      .slice(sliceStart, range[1])
      .map((message) => message.mes || '')
      .filter((message): message is string => typeof message === 'string' && message.length > 0)
      .reverse();
  }

  return currentChat
    .slice(-RECENT_WORLDBOOK_MESSAGE_LIMIT)
    .map((message) => message.mes || '')
    .filter((message): message is string => typeof message === 'string' && message.length > 0)
    .reverse();
}

export class FetchContext implements IStep {
  name = 'FetchContext';

  async execute(context: JobContext): Promise<void> {
    Logger.debug('FetchContext', 'Starting context fetch');

    const char = getCurrentCharacter();
    const stContext = getSTContext();
    const currentCharacter = getCurrentTavernCharacter(stContext);
    if (char) {
      context.input.charName = char.name;
      context.input.charPersona = currentCharacter?.description || '';
    }

    if (stContext) {
      context.input.userName = stContext.name1 || 'User';
      context.input.userPersona = stContext.powerUserSettings?.persona_description || '';
    }

    const range = context.input.range as [number, number] | undefined;
    const preparedSummaryContext = context.input.preparedSummaryContext as
      | PreparedSummaryContext
      | undefined;

    Logger.debug('FetchContext', 'Loading chat history', {
      range: range ?? null,
      trigger: context.trigger,
      workflowId: context.id,
      currentStep: context.metadata.currentStep,
    });

    const isImport = Boolean(context.input.isImport);
    let history = '';

    if (isImport) {
      history = context.input.text || context.input.chatHistory || '';
      Logger.debug('FetchContext', 'Using imported text as context', { bytes: history.length });
    } else if (
      preparedSummaryContext &&
      range &&
      preparedSummaryContext.range[0] === range[0] &&
      preparedSummaryContext.range[1] === range[1]
    ) {
      if (preparedSummaryContext.isComplete) {
        history = preparedSummaryContext.chatHistory || '';
        Logger.debug('FetchContext', 'Using prepared summary chat history', {
          range,
          bytes: history.length,
          preparedAt: preparedSummaryContext.createdAt,
        });
      } else {
        const missingStart = preparedSummaryContext.preparedThroughFloor + 1;
        const preparedHistory = preparedSummaryContext.chatHistory || '';
        const missingHistory =
          missingStart <= range[1] ? getChatHistory([missingStart, range[1]]) : '';

        history =
          preparedHistory && missingHistory
            ? `${preparedHistory}\n\n${missingHistory}`
            : preparedHistory || missingHistory;

        Logger.debug('FetchContext', 'Using partial prepared summary chat history', {
          range,
          bytes: history.length,
          preparedAt: preparedSummaryContext.createdAt,
          preparedThroughFloor: preparedSummaryContext.preparedThroughFloor,
          missingRange: missingStart <= range[1] ? [missingStart, range[1]] : null,
        });
      }
    } else {
      history = getChatHistory(range);
    }

    context.input.chatHistory = history || '';

    if (!history && !isImport) {
      Logger.warn('FetchContext', 'No chat history was resolved for current workflow');
    }

    let resolvedExtraWorldbooks = (context.input.extraWorldbooks as string[] | undefined) || [];

    try {
      let templateId = context.config.templateId as string | undefined;
      const category = context.config.category;
      const runtimeSettings = get('runtimeSettings') as
        | { promptTemplates?: TemplateWithWorldbooks[] }
        | undefined;
      const userTemplates = runtimeSettings?.promptTemplates || [];

      if (!templateId && category) {
        const enabledTemplate = userTemplates.find(
          (template) => template.category === category && template.enabled === true
        );
        if (enabledTemplate) {
          templateId = enabledTemplate.id;
        }
      }

      if (templateId) {
        const builtinTemplates = getAllTemplates() as TemplateWithWorldbooks[];
        const template =
          userTemplates.find((item) => item.id === templateId) ||
          builtinTemplates.find((item) => item.id === templateId);

        if (template?.extraWorldbooks?.length) {
          Logger.debug('FetchContext', `Template [${template.name}] has extra worldbooks`, {
            books: template.extraWorldbooks,
          });
          resolvedExtraWorldbooks = [...resolvedExtraWorldbooks, ...template.extraWorldbooks];
        }
      }
    } catch (error) {
      Logger.warn('FetchContext', 'Failed to resolve template-bound worldbooks', error);
    }

    resolvedExtraWorldbooks = [
      ...new Set(
        resolvedExtraWorldbooks.filter((name): name is string => typeof name === 'string')
      ),
    ];

    const wbConfig: WorldbookConfig | undefined = get('runtimeSettings')?.worldbookConfig;

    let wiContent = '';

    if (wbConfig?.enabled === false) {
      Logger.debug('FetchContext', 'Worldbook feature disabled, skipping world info');
    } else {
      const worldbookMessages = getRecentWorldbookMessages(context, history, isImport);
      const useContextualWorldInfo =
        isImport || Boolean(range) || resolvedExtraWorldbooks.length > 0;

      wiContent = useContextualWorldInfo
        ? await getContextualWorldInfo(worldbookMessages || [], {
            floorRange: range,
            extraWorldbooks: resolvedExtraWorldbooks,
          })
        : await getLiveActivatedWorldInfo();
    }

    context.input.worldbookContext = wiContent;
    context.input.context = context.input.charPersona || '';

    const summaryContent = getSummaries();
    context.input.engramSummaries = summaryContent;

    const entityStatesContent = getEntityStates();
    context.input.engramEntityStates = entityStatesContent;

    Logger.debug('FetchContext', 'Context fetch complete', {
      historyLen: history.length,
      wiLen: wiContent.length,
      summaryLen: summaryContent.length,
    });
  }
}
