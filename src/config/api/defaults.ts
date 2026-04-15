import { getBuiltInPromptTemplates } from '@/config/prompt/templates';
import type { EngramRuntimeSettings } from '@/types/config';

import { DEFAULT_CUSTOM_MACROS } from '../macro/defaults';
import { DEFAULT_ENTITY_CONFIG } from '../memory/defaults';
import {
  DEFAULT_RECALL_CONFIG,
  DEFAULT_RERANK_CONFIG,
  DEFAULT_VECTOR_CONFIG,
} from '../rag/defaults';
import { DEFAULT_REGEX_CONFIG } from '../regex/defaults';
import { DEFAULT_WORLDBOOK_CONFIG } from '../worldbook/defaults';
import { createDefaultLLMPreset } from './factories';

export function getDefaultRuntimeSettings(): EngramRuntimeSettings {
  return {
    llmPresets: [createDefaultLLMPreset()],
    selectedPresetId: null,
    vectorConfig: { ...DEFAULT_VECTOR_CONFIG },
    rerankConfig: { ...DEFAULT_RERANK_CONFIG },
    promptTemplates: getBuiltInPromptTemplates(),
    worldbookConfig: { ...DEFAULT_WORLDBOOK_CONFIG },
    regexConfig: { ...DEFAULT_REGEX_CONFIG },
    recallConfig: { ...DEFAULT_RECALL_CONFIG },
    entityExtractConfig: { ...DEFAULT_ENTITY_CONFIG },
    customMacros: [...DEFAULT_CUSTOM_MACROS],
    worldbookProfiles: [],
    enableAnimations: true,
  };
}
