import { isPromptCategory, readString } from '@/core/utils';
import { buildPrompt } from '@/modules/llm/PromptBuilder';
import type { JobContext } from '@/types/job_context';
import type { PromptCategory } from '@/types/prompt';
import type { IStep } from '@/types/step';

interface BuildPromptConfig {
  templateId?: string;
  category?: PromptCategory;
  vars?: Record<string, string>;
}

/** 工作流适配层；新代码直接调用 buildPrompt。 */
export class BuildPrompt implements IStep {
  name = 'BuildPrompt';

  constructor(private config: BuildPromptConfig) {}

  async execute(context: JobContext): Promise<void> {
    const input = context.input as Record<string, unknown>;
    const templateId = readString(context.config.templateId) ?? this.config.templateId;
    const category = isPromptCategory(context.config.category)
      ? context.config.category
      : this.config.category;

    context.prompt = await buildPrompt(
      {
        text: readString(input.text),
        chatHistory: readString(input.chatHistory),
        previousOutput: readString(input.previousOutput),
        feedback: readString(input.feedback),
        charName: readString(input.charName),
        userName: readString(input.userName),
        charPersona: readString(input.charPersona),
        userPersona: readString(input.userPersona),
        context: readString(input.context),
        worldbookContext: readString(input.worldbookContext),
        engramSummaries: readString(input.engramSummaries),
        engramEntityStates: readString(input.engramEntityStates),
        targetSummaries: readString(input.targetSummaries),
      },
      { templateId, category, vars: this.config.vars }
    );
  }
}
