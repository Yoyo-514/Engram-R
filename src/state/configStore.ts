import { create } from 'zustand';

import { DEFAULT_SUMMARIZER_CONFIG } from '@/config/memory/defaults';
import { DEFAULT_PREPROCESS_CONFIG } from '@/config/preprocess/defaults';
import { DEFAULT_EMBEDDING_CONFIG } from '@/config/rag/defaults';
import { createDebouncedPersistence } from '@/core/utils';
import { type EngramSettings, get as getSettings, set as setSettings } from '@/config/settings';
import type { CustomMacro } from '@/types/macro';
import type { EntityExtractConfig, SummarizerConfig } from '@/types/memory';
import type { EmbeddingConfig, RecallConfig, RerankConfig, VectorConfig } from '@/types/rag';
import type { GlobalRegexConfig } from '@/types/regex';
import type { PreprocessConfig } from '@/types/preprocess';

export interface ConfigState {
  vectorConfig: VectorConfig;
  rerankConfig: RerankConfig;
  recallConfig: RecallConfig;
  regexConfig: GlobalRegexConfig;
  entityExtractConfig: EntityExtractConfig;
  embeddingConfig: EmbeddingConfig;
  customMacros: CustomMacro[];
  enableAnimations: boolean;
  summarizerConfig: SummarizerConfig;
  preprocessConfig: PreprocessConfig;
  linkedDeletion: EngramSettings['linkedDeletion'];
  glassSettings: EngramSettings['glassSettings'];
  syncConfig: EngramSettings['syncConfig'];
  hasChanges: boolean;

  updateConfig: <K extends keyof PersistedConfigState>(
    key: K,
    value:
      | PersistedConfigState[K]
      | ((prev: PersistedConfigState[K]) => PersistedConfigState[K])
  ) => void;
  addCustomMacro: () => void;
  updateCustomMacro: (id: string, updates: Partial<CustomMacro>) => void;
  deleteCustomMacro: (id: string) => void;
  toggleCustomMacro: (id: string) => void;
  saveConfig: () => void;
}

type PersistedConfigState = Pick<
  ConfigState,
  | 'vectorConfig'
  | 'rerankConfig'
  | 'recallConfig'
  | 'regexConfig'
  | 'entityExtractConfig'
  | 'embeddingConfig'
  | 'customMacros'
  | 'enableAnimations'
  | 'summarizerConfig'
  | 'preprocessConfig'
  | 'linkedDeletion'
  | 'glassSettings'
  | 'syncConfig'
>;

const savedContext = getSettings('runtimeSettings');
const summary = getSettings('summarizerConfig');
const preprocess = getSettings('preprocessConfig');
const savedLinkedDeletion = getSettings('linkedDeletion');
const savedGlassSettings = getSettings('glassSettings');
const savedSyncConfig = getSettings('syncConfig');

function buildPersistedConfigState(
  state: Partial<PersistedConfigState> | undefined
): PersistedConfigState {
  return {
    vectorConfig: state?.vectorConfig ?? savedContext.vectorConfig,
    rerankConfig: state?.rerankConfig ?? savedContext.rerankConfig,
    recallConfig: state?.recallConfig ?? savedContext.recallConfig,
    regexConfig: state?.regexConfig ?? savedContext.regexConfig,
    entityExtractConfig: state?.entityExtractConfig ?? savedContext.entityExtractConfig,
    embeddingConfig: state?.embeddingConfig ?? DEFAULT_EMBEDDING_CONFIG,
    customMacros: state?.customMacros ?? savedContext.customMacros ?? [],
    enableAnimations: state?.enableAnimations ?? savedContext.enableAnimations ?? true,
    summarizerConfig: state?.summarizerConfig ?? {
      ...DEFAULT_SUMMARIZER_CONFIG,
      ...summary,
    },
    preprocessConfig: state?.preprocessConfig ?? {
      ...DEFAULT_PREPROCESS_CONFIG,
      ...preprocess,
    },
    linkedDeletion: state?.linkedDeletion ?? savedLinkedDeletion,
    glassSettings: state?.glassSettings ?? savedGlassSettings,
    syncConfig: state?.syncConfig ?? savedSyncConfig,
  };
}

const configPersistence = createDebouncedPersistence<PersistedConfigState>({
  initialValue: buildPersistedConfigState(savedContext),
  persist: (nextValue) => {
    const {
      summarizerConfig,
      preprocessConfig,
      linkedDeletion,
      glassSettings,
      syncConfig,
      ...runtimeSettings
    } = nextValue;

    const currentSettings = getSettings('runtimeSettings') || {};
    setSettings('runtimeSettings', {
      ...currentSettings,
      ...runtimeSettings,
    });

    setSettings('summarizerConfig', summarizerConfig);
    setSettings('preprocessConfig', preprocessConfig);
    setSettings('linkedDeletion', linkedDeletion);
    setSettings('glassSettings', glassSettings);
    setSettings('syncConfig', syncConfig);
  },
});

export const useConfigStore = create<ConfigState>((set, get) => {
  const applyConfigUpdate = (updates: Partial<PersistedConfigState>) => {
    set((state) => {
      const nextState = buildPersistedConfigState({
        vectorConfig: state.vectorConfig,
        rerankConfig: state.rerankConfig,
        recallConfig: state.recallConfig,
        regexConfig: state.regexConfig,
        entityExtractConfig: state.entityExtractConfig,
        embeddingConfig: state.embeddingConfig,
        customMacros: state.customMacros,
        enableAnimations: state.enableAnimations,
        summarizerConfig: state.summarizerConfig,
        preprocessConfig: state.preprocessConfig,
        linkedDeletion: state.linkedDeletion,
        glassSettings: state.glassSettings,
        syncConfig: state.syncConfig,
        ...updates,
      });

      const hasChanges = configPersistence.hasChanges(nextState);
      if (hasChanges) {
        configPersistence.schedule(nextState);
      }

      return {
        ...nextState,
        hasChanges,
      };
    });
  };

  return {
    ...buildPersistedConfigState(savedContext),
    hasChanges: false,

    updateConfig: (key, value) => {
      const currentValue = get()[key];
      const nextValue = typeof value === 'function' ? value(currentValue) : value;
      applyConfigUpdate({ [key]: nextValue } as Partial<PersistedConfigState>);
    },

    addCustomMacro: () => {
      const newMacro: CustomMacro = {
        id: `custom_${Date.now()}`,
        name: 'new_macro',
        content: '',
        enabled: true,
        createdAt: Date.now(),
      };

      applyConfigUpdate({
        customMacros: [...get().customMacros, newMacro],
      });
    },

    updateCustomMacro: (id, updates) => {
      applyConfigUpdate({
        customMacros: get().customMacros.map((macro) =>
          macro.id === id ? { ...macro, ...updates } : macro
        ),
      });
    },

    deleteCustomMacro: (id) => {
      applyConfigUpdate({
        customMacros: get().customMacros.filter((macro) => macro.id !== id),
      });
    },

    toggleCustomMacro: (id) => {
      applyConfigUpdate({
        customMacros: get().customMacros.map((macro) =>
          macro.id === id ? { ...macro, enabled: !macro.enabled } : macro
        ),
      });
    },

    saveConfig: () => {
      const state = get();
      const persistedState = buildPersistedConfigState({
        vectorConfig: state.vectorConfig,
        rerankConfig: state.rerankConfig,
        recallConfig: state.recallConfig,
        regexConfig: state.regexConfig,
        entityExtractConfig: state.entityExtractConfig,
        embeddingConfig: state.embeddingConfig,
        customMacros: state.customMacros,
        enableAnimations: state.enableAnimations,
        summarizerConfig: state.summarizerConfig,
        preprocessConfig: state.preprocessConfig,
        linkedDeletion: state.linkedDeletion,
        glassSettings: state.glassSettings,
        syncConfig: state.syncConfig,
      });

      configPersistence.cancel();
      configPersistence.syncSnapshot(persistedState);

      const {
        summarizerConfig,
        preprocessConfig,
        linkedDeletion,
        glassSettings,
        syncConfig,
        ...runtimeSettings
      } = persistedState;

      const currentSettings = getSettings('runtimeSettings') || {};
      setSettings('runtimeSettings', {
        ...currentSettings,
        ...runtimeSettings,
      });

      setSettings('summarizerConfig', summarizerConfig);
      setSettings('preprocessConfig', preprocessConfig);
      setSettings('linkedDeletion', linkedDeletion);
      setSettings('glassSettings', glassSettings);
      setSettings('syncConfig', syncConfig);

      set({
        hasChanges: false,
      });
    },
  };
});
