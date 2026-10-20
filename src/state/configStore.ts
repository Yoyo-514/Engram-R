import { create } from 'zustand';

import {
  type EngramSettings,
  get as getSettings,
  getSettings as readSettings,
  set as setSettings,
  saveSettings,
  subscribe,
} from '@/config/settings';
import type { CustomMacro } from '@/types/macro';
import type { EntityExtractConfig, SummarizerConfig, TrimmerConfig } from '@/types/memory';
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
  summarizerConfig: SummarizerConfig;
  trimmerConfig: TrimmerConfig;
  linkedDeletion: EngramSettings['linkedDeletion'];
  syncConfig: EngramSettings['syncConfig'];
  hasChanges: boolean;
  updateConfig: <K extends keyof PersistedConfigState>(
    key: K,
    value: PersistedConfigState[K] | ((prev: PersistedConfigState[K]) => PersistedConfigState[K])
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
  | 'summarizerConfig'
  | 'trimmerConfig'
  | 'linkedDeletion'
  | 'syncConfig'
>;
type RootConfigKey = keyof PersistedConfigState & keyof EngramSettings;

/** UI 只投影宿主配置的引用，不持有另一份可回写的业务快照。 */
function readConfig(): PersistedConfigState {
  const settings = readSettings();
  const runtime = settings.runtimeSettings;
  return {
    vectorConfig: runtime.vectorConfig,
    rerankConfig: runtime.rerankConfig,
    recallConfig: runtime.recallConfig,
    regexConfig: runtime.regexConfig,
    entityExtractConfig: runtime.entityExtractConfig,
    // 宿主绑定时已统一补齐该可选字段。
    embeddingConfig: runtime.embeddingConfig!,
    customMacros: runtime.customMacros,
    summarizerConfig: settings.summarizerConfig,
    trimmerConfig: settings.trimmerConfig,
    linkedDeletion: settings.linkedDeletion,
    syncConfig: settings.syncConfig,
  };
}

export const useConfigStore = create<ConfigState>((set, get) => ({
  ...readConfig(),
  hasChanges: false,
  updateConfig: (key, value) => {
    const current = readConfig()[key];
    const next = typeof value === 'function' ? value(current) : value;
    if (Object.is(current, next)) return;

    const runtime = getSettings('runtimeSettings');
    if (key in runtime) {
      setSettings('runtimeSettings', { ...runtime, [key]: next });
    } else {
      setSettings(key as RootConfigKey, next as EngramSettings[RootConfigKey]);
    }
    set({ hasChanges: true });
  },
  addCustomMacro: () => {
    const now = Date.now();
    const macro: CustomMacro = {
      id: `custom_${now}`,
      name: 'new_macro',
      content: '',
      enabled: true,
      createdAt: now,
    };
    get().updateConfig('customMacros', (macros) => [...macros, macro]);
  },
  updateCustomMacro: (id, updates) => {
    get().updateConfig('customMacros', (macros) =>
      macros.map((macro) => (macro.id === id ? { ...macro, ...updates } : macro))
    );
  },
  deleteCustomMacro: (id) => {
    get().updateConfig('customMacros', (macros) => macros.filter((macro) => macro.id !== id));
  },
  toggleCustomMacro: (id) => {
    get().updateConfig('customMacros', (macros) =>
      macros.map((macro) => (macro.id === id ? { ...macro, enabled: !macro.enabled } : macro))
    );
  },
  saveConfig: () => {
    saveSettings();
    set({ hasChanges: false });
  },
}));

subscribe(() => useConfigStore.setState(readConfig()));
