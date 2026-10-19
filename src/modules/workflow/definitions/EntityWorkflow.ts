import type { WorkflowDefinition } from '../core/WorkflowEngine';
import {
  BuildPrompt,
  CleanRegex,
  FetchContext,
  FetchExistingEntities,
  LlmRequest,
  ParseJson,
  SaveEntity,
  UserReview,
} from '../steps';

export const createEntityWorkflow = (): WorkflowDefinition => ({
  name: 'EntityWorkflow',
  steps: [
    new FetchContext(),
    new FetchExistingEntities(),
    new BuildPrompt({ category: 'entity_extraction' }),
    new LlmRequest(),
    new CleanRegex('output'),
    new ParseJson(),
    // 先预演 Patch，审阅后直接保存确认的实体结果。
    new SaveEntity({ dryRun: true }),
    new UserReview({
      title: '实体提取确认',
      type: 'entity',
      description: '请确认提取的实体列表 (JSON/YAML)。您可以直接编辑以修正错误。',
    }),
    new SaveEntity({ dryRun: false }),
  ],
});
