import { type WorkflowDefinition } from '../core/WorkflowEngine';
import {
  BuildPrompt,
  CleanRegex,
  FetchContext,
  LlmRequest,
  SaveEvent,
  StopGeneration,
  UserReview,
} from '../steps';

export const createSummaryWorkflow = (): WorkflowDefinition => ({
  name: 'SummaryWorkflow',
  steps: [
    new FetchContext(),
    new BuildPrompt({ category: 'summary' }),
    new StopGeneration('manual_only'),
    new LlmRequest(),
    new CleanRegex('output'),
    new UserReview({
      title: '剧情摘要修订',
      type: 'summary',
    }),
    new SaveEvent(),
  ],
});
