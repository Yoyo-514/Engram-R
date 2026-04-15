import type { ContextSettings, SamplingParameters } from '@/types/llm';

export const DEFAULT_SAMPLING_PARAMETERS: SamplingParameters = {
  temperature: 1.0,
  topP: 0.98,
  maxTokens: 60000,
  frequencyPenalty: 0,
  presencePenalty: 0,
  maxContext: 150000,
};

export const DEFAULT_CONTEXT_SETTINGS: ContextSettings = {
  maxChatHistory: 10,
};
