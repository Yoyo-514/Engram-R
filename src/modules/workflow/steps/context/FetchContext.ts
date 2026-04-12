import { Logger } from '@/core/logger';
import { getCurrentTavernCharacter } from '@/core/utils';
import {
  getCurrentCharacter,
  getCurrentChat,
  getSTContext,
  MacroService,
} from '@/integrations/tavern';
import { WorldInfoService } from '@/integrations/tavern/worldbook';
import { type JobContext } from '../../core/JobContext';
import { type IStep } from '../../core/Step';
import { SettingsManager } from '@/config/settings';
import { PromptLoader } from '@/integrations/llm';

interface TemplateWithWorldbooks {
  id: string;
  name: string;
  enabled?: boolean;
  category?: unknown;
  extraWorldbooks?: string[];
}

export class FetchContext implements IStep {
  name = 'FetchContext';

  async execute(context: JobContext): Promise<void> {
    Logger.debug('FetchContext', '开始获取上下文数据...');

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

    const range = context.input.range;
    Logger.debug('FetchContext', '开始获取聊天记录', {
      range: range ?? null,
      trigger: context.trigger,
      workflowId: context.id,
      currentStep: context.metadata.currentStep,
    });

    const isImport = Boolean(context.input.isImport);
    let history = '';

    if (isImport) {
      history = context.input.text || context.input.chatHistory || '';
      Logger.debug('FetchContext', '使用外部导入文本作为上下文', { bytes: history.length });
    } else {
      history = MacroService.getChatHistory(range);
    }

    context.input.chatHistory = history || '';

    if (!history && !isImport) {
      Logger.warn('FetchContext', '未获取到任何聊天记录，这可能导致提示词中出现空上下文');
    }

    const scopes = WorldInfoService.getScopes();
    const globalBooks = scopes.global || [];
    const charBooks = scopes.chat || [];
    let extraBooks = (context.input.extraWorldbooks as string[] | undefined) || [];

    try {
      let templateId = context.config.templateId;
      const category = context.config.category;
      const apiSettings = SettingsManager.get('apiSettings') as
        | { promptTemplates?: TemplateWithWorldbooks[] }
        | undefined;
      const userTemplates = apiSettings?.promptTemplates || [];

      if (!templateId && category) {
        const enabledTemplate = userTemplates.find(
          (template) => template.category === category && template.enabled === true
        );
        if (enabledTemplate) {
          templateId = enabledTemplate.id;
        }
      }

      if (templateId) {
        const builtinTemplates = PromptLoader.getAllTemplates() as TemplateWithWorldbooks[];
        const template =
          userTemplates.find((item) => item.id === templateId) ||
          builtinTemplates.find((item) => item.id === templateId);

        if (template?.extraWorldbooks?.length) {
          Logger.debug('FetchContext', `发现模板 [${template.name}] 绑定的额外世界书`, {
            books: template.extraWorldbooks,
          });
          extraBooks = [...extraBooks, ...template.extraWorldbooks];
        }
      }
    } catch (error) {
      Logger.warn('FetchContext', '获取模板绑定世界书失败', error);
    }

    const allBooks = [...new Set([...globalBooks, ...charBooks, ...extraBooks])];
    const worldbooksToScan = allBooks.filter((name) => !name.startsWith('[Engram]'));

    Logger.debug('FetchContext', '世界书扫描列表', {
      global: globalBooks.length,
      char: charBooks.length,
      extra: extraBooks.length,
      totalFilter: worldbooksToScan.length,
      list: worldbooksToScan,
    });

    let scanText = '';
    if (range) {
      const chat = getCurrentChat();
      const messages = chat.slice(Math.max(0, range[0] - 1), range[1]);
      scanText = messages.map((message) => message.mes || '').join('\n');
    } else {
      scanText = context.input.text || history || '';
    }

    const worldInfoContentParts: string[] = [];
    await new Promise((resolve) => setTimeout(resolve, 0));

    for (const book of extraBooks) {
      if (book.startsWith('[Engram]')) {
        continue;
      }

      const content = await WorldInfoService.scanWorldbook(book, scanText, {
        forceInclude: true,
      });
      if (content) {
        worldInfoContentParts.push(content);
      }
    }

    const booksToScanNormally = worldbooksToScan.filter((book) => !extraBooks.includes(book));
    if (booksToScanNormally.length > 0) {
      const results = await Promise.all(
        booksToScanNormally.map((worldbookName) =>
          WorldInfoService.scanWorldbook(worldbookName, scanText)
        )
      );
      worldInfoContentParts.push(...results.filter(Boolean));
    }

    const wiContent = worldInfoContentParts.filter(Boolean).join('\n\n');
    context.input.worldbookContext = wiContent;
    context.input.context = wiContent;

    const summaryContent = MacroService.getSummaries();
    context.input.engramSummaries = summaryContent;

    const entityStatesContent = MacroService.getEntityStates();
    context.input.engramEntityStates = entityStatesContent;

    Logger.debug('FetchContext', '上下文获取完成', {
      historyLen: history.length,
      wiLen: wiContent.length,
      summaryLen: summaryContent.length,
    });
  }
}
