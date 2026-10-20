import type { ModelLogType } from '@/core/logger/ModelLogger';
import { requestCompletion } from '@/modules/llm/Completion';
import type { JobContext } from '@/types/job_context';
import type { IStep } from '@/types/step';

/** 工作流适配层；新代码直接调用 requestCompletion。 */
export class LlmRequest implements IStep {
  name = 'LlmRequest';

  async execute(context: JobContext): Promise<void> {
    if (!context.prompt) {
      throw new Error('LlmRequest: Prompt 未准备好 (previous step missing?)');
    }

    const prompt = context.prompt;
    const result = await requestCompletion(
      {
        system: prompt.system,
        user: prompt.user,
        templateId: prompt.templateId ?? '',
        presetId: prompt.presetId ?? null,
      },
      {
        logType: (context.config.logType as ModelLogType | undefined) ?? 'other',
        jobId: context.id,
        signal: context.signal,
        range: context.input.range,
        presetId: (context.config.presetId as string | null | undefined) ?? undefined,
      }
    );

    context.llmResponse = {
      content: result.content,
      success: true,
      tokenUsage: result.tokenUsage,
    };
  }
}
