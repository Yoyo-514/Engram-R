import { fetchMemoryContext } from '@/modules/memory/MemoryContext';
import type { JobContext } from '@/types/job_context';
import type { PromptCategory } from '@/types/prompt';
import type { IStep } from '@/types/step';

/** 工作流适配层；新代码直接调用 fetchMemoryContext。 */
export class FetchContext implements IStep {
  name = 'FetchContext';

  async execute(context: JobContext): Promise<void> {
    const memory = await fetchMemoryContext(
      {
        range: context.input.range,
        isImport: Boolean(context.input.isImport),
        text: context.input.text,
        chatHistory: context.input.chatHistory,
        extraWorldbooks: context.input.extraWorldbooks,
      },
      {
        trigger: context.trigger,
        workflowId: context.id,
        templateId: context.config.templateId,
        category: context.config.category as PromptCategory | undefined,
        skipInputRegexForHistory: Boolean(context.config.skipInputRegexForHistory),
      }
    );

    context.input.charName = memory.charName;
    context.input.charPersona = memory.charPersona;
    context.input.userName = memory.userName;
    context.input.userPersona = memory.userPersona;
    context.input.chatHistory = memory.chatHistory;
    context.input.worldbookContext = memory.worldbookContext;
    context.input.context = memory.context;
    context.input.engramSummaries = memory.engramSummaries;
    context.input.engramEntityStates = memory.engramEntityStates;
    context.input.extraWorldbooks = memory.extraWorldbooks;
  }
}
