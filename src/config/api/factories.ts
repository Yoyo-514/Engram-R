import type { ContextSettings, LLMPreset, SamplingParameters } from '@/types/llm';

import { DEFAULT_CONTEXT_SETTINGS, DEFAULT_SAMPLING_PARAMETERS } from '../llm/defaults';

export function createDefaultLLMPreset(name: string = '默认预设'): LLMPreset {
  const now = Date.now();
  const parameters: SamplingParameters = { ...DEFAULT_SAMPLING_PARAMETERS };
  const context: ContextSettings = { ...DEFAULT_CONTEXT_SETTINGS };

  return {
    id: `preset_${now}`,
    name,
    source: 'tavern',
    parameters,
    context,
    isDefault: true,
    createdAt: now,
    updatedAt: now,
  };
}
