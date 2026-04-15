import { create } from 'zustand';

import { DEFAULT_EMBEDDING_CONFIG } from '@/config/rag/defaults';
import { get as getExtSettings, set as setExtSerrings } from '@/config/settings';
import type { CustomMacro } from '@/types/macro';
import type { EntityExtractConfig } from '@/types/memory';
import type { EmbeddingConfig, RecallConfig, RerankConfig, VectorConfig } from '@/types/rag';
import type { GlobalRegexConfig } from '@/types/regex';

export interface ConfigState {
  vectorConfig: VectorConfig;
  rerankConfig: RerankConfig;
  recallConfig: RecallConfig;
  regexConfig: GlobalRegexConfig;
  entityExtractConfig: EntityExtractConfig;
  embeddingConfig: EmbeddingConfig;
  customMacros: CustomMacro[];
  enableAnimations: boolean;
  hasChanges: boolean;

  updateVectorConfig: (config: VectorConfig) => void;
  updateRerankConfig: (config: RerankConfig) => void;
  updateRecallConfig: (config: RecallConfig) => void;
  updateRegexConfig: (config: GlobalRegexConfig) => void;
  updateEntityExtractConfig: (config: EntityExtractConfig) => void;
  updateEmbeddingConfig: (config: EmbeddingConfig) => void;
  updateEnableAnimations: (enabled: boolean) => void;

  // Batch update to reduce re-renders
  updateMultipleConfigs: (
    updates: Partial<
      Omit<
        ConfigState,
        | 'hasChanges'
        | 'initFromSettings'
        | 'saveConfig'
        | 'updateMultipleConfigs'
        | 'addCustomMacro'
        | 'updateCustomMacro'
        | 'deleteCustomMacro'
        | 'toggleCustomMacro'
      >
    >
  ) => void;

  addCustomMacro: () => void;
  updateCustomMacro: (id: string, updates: Partial<CustomMacro>) => void;
  deleteCustomMacro: (id: string) => void;
  toggleCustomMacro: (id: string) => void;

  saveConfig: () => void;
}

const savedContext = getExtSettings('runtimeSettings');

export const useConfigStore = create<ConfigState>((set, get) => ({
  vectorConfig: savedContext.vectorConfig,
  rerankConfig: savedContext.rerankConfig,
  recallConfig: savedContext.recallConfig,
  regexConfig: savedContext.regexConfig,
  entityExtractConfig: savedContext.entityExtractConfig,
  embeddingConfig: savedContext.embeddingConfig || DEFAULT_EMBEDDING_CONFIG,
  customMacros: savedContext.customMacros || [],
  enableAnimations: savedContext.enableAnimations ?? true,
  hasChanges: false,

  updateVectorConfig: (config) => set({ vectorConfig: config, hasChanges: true }),
  updateRerankConfig: (config) => set({ rerankConfig: config, hasChanges: true }),
  updateRecallConfig: (config) => set({ recallConfig: config, hasChanges: true }),
  updateRegexConfig: (config) => set({ regexConfig: config, hasChanges: true }),
  updateEntityExtractConfig: (config) => set({ entityExtractConfig: config, hasChanges: true }),
  updateEmbeddingConfig: (config) => set({ embeddingConfig: config, hasChanges: true }),
  updateEnableAnimations: (enabled) => set({ enableAnimations: enabled, hasChanges: true }),

  updateMultipleConfigs: (updates) => set({ ...updates, hasChanges: true }),

  addCustomMacro: () =>
    set((state) => {
      const newMacro: CustomMacro = {
        id: `custom_${Date.now()}`,
        name: '新宏',
        content: '',
        enabled: true,
        createdAt: Date.now(),
      };
      return { customMacros: [...state.customMacros, newMacro], hasChanges: true };
    }),

  updateCustomMacro: (id, updates) =>
    set((state) => ({
      customMacros: state.customMacros.map((m) => (m.id === id ? { ...m, ...updates } : m)),
      hasChanges: true,
    })),

  deleteCustomMacro: (id) =>
    set((state) => ({
      customMacros: state.customMacros.filter((m) => m.id !== id),
      hasChanges: true,
    })),

  toggleCustomMacro: (id) =>
    set((state) => ({
      customMacros: state.customMacros.map((m) =>
        m.id === id ? { ...m, enabled: !m.enabled } : m
      ),
      hasChanges: true,
    })),

  saveConfig: () => {
    const state = get();
    // Option to add Schema Check here before saving
    const currentSettings = getExtSettings('runtimeSettings') || {};
    setExtSerrings('runtimeSettings', {
      ...currentSettings,
      vectorConfig: state.vectorConfig,
      rerankConfig: state.rerankConfig,
      recallConfig: state.recallConfig,
      regexConfig: state.regexConfig,
      entityExtractConfig: state.entityExtractConfig,
      embeddingConfig: state.embeddingConfig,
      customMacros: state.customMacros,
      enableAnimations: state.enableAnimations,
    });
    set({ hasChanges: false });
  },
}));
