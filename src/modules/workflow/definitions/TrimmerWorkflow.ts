import { type WorkflowDefinition } from '../core/WorkflowEngine';
import {
  ApplyTrim,
  BuildPrompt,
  CleanRegex,
  FetchEventsToTrim,
  FormatTrimInput,
  LlmRequest,
  ParseJson,
  StopGeneration,
} from '../steps';

export const createTrimmerWorkflow = (): WorkflowDefinition => ({
  name: 'TrimmerWorkflow',
  steps: [
    new StopGeneration(),
    new FetchEventsToTrim(),
    new FormatTrimInput(),
    new BuildPrompt({ category: 'trim' }),
    new LlmRequest(),
    new CleanRegex('output'),
    new ParseJson(),
    new ApplyTrim(),
  ],
});
