import type { JsonObject } from 'type-fest';

import { getDefaultRuntimeSettings } from '@/config/api/defaults';
import { DEFAULT_SUMMARIZER_CONFIG, DEFAULT_TRIMMER_CONFIG } from '@/config/memory/defaults';
import { DEFAULT_PREPROCESS_CONFIG } from '@/config/preprocess/defaults';
import { getBuiltInTemplateById } from '@/config/prompt/templates';
import { Logger } from '@/core/logger';
import type { TavernContext } from '@/core/utils';
import { deepClone } from '@/core/utils/clone';
import { getRawSTContext } from '@/integrations/tavern/core/context';
import type { EngramRuntimeSettings } from '@/types/config';
import type { SummarizerConfig, TrimmerConfig } from '@/types/memory';
import type { PreprocessConfig } from '@/types/preprocess';
import type { PromptTemplate } from '@/types/prompt';
import type { RegexRule } from '@/types/regex';

type SettingsCapableContext = Omit<TavernContext, 'extensionSettings'> & {
  extensionSettings?: Record<string, EngramSettings | undefined>;
};

export interface EngramSettings {
  presets: JsonObject;
  templates: JsonObject;
  promptTemplates: PromptTemplate[];
  lastOpenedTab: string;
  summarizerConfig: SummarizerConfig;
  trimmerConfig: TrimmerConfig;
  regexRules: RegexRule[];
  runtimeSettings: EngramRuntimeSettings;
  preprocessConfig: PreprocessConfig;
  linkedDeletion: {
    enabled: boolean;
    deleteIndexedDB: boolean;
    showConfirmation: boolean;
  };
  syncConfig: {
    enabled: boolean;
    autoSync: boolean;
  };
}

const defaultSettings: EngramSettings = {
  presets: {},
  templates: {},
  promptTemplates: [],
  lastOpenedTab: 'memory',
  summarizerConfig: DEFAULT_SUMMARIZER_CONFIG,
  trimmerConfig: DEFAULT_TRIMMER_CONFIG,
  regexRules: [],
  runtimeSettings: getDefaultRuntimeSettings(),
  preprocessConfig: DEFAULT_PREPROCESS_CONFIG,
  linkedDeletion: {
    enabled: true,
    deleteIndexedDB: true,
    showConfirmation: true,
  },
  syncConfig: {
    enabled: false,
    autoSync: true,
  },
};

const EXTENSION_NAME = 'engram';
const CONTEXT_READY_RETRY_INTERVAL_MS = 200;
const CONTEXT_READY_TIMEOUT_MS = 5000;
const listeners = new Set<() => void>();
// 宿主就绪前提供稳定的初始视图；业务写入始终落在酒馆设置中。
const initialSettings = deepClone(defaultSettings);
let boundSettings: EngramSettings | undefined;

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyListeners(): void {
  for (const listener of listeners) listener();
}

function getContext(): SettingsCapableContext | null {
  return getRawSTContext() as SettingsCapableContext | null;
}

function saveContext(context: SettingsCapableContext | null): void {
  if (context?.saveSettingsDebounced) {
    void context.saveSettingsDebounced();
  } else {
    Logger.warn('SettingsManager', 'saveSettingsDebounced not available');
  }
}

/** 仅在绑定宿主设置时补齐字段，数组与用户选择按原值保留。 */
export function getSettings(): EngramSettings {
  const context = getContext();
  if (!context?.extensionSettings) return initialSettings;

  const saved = context.extensionSettings[EXTENSION_NAME];
  if (saved && saved === boundSettings) return saved;

  const defaults = deepClone(defaultSettings);
  boundSettings = {
    ...defaults,
    ...saved,
    runtimeSettings: { ...defaults.runtimeSettings, ...saved?.runtimeSettings },
    summarizerConfig: { ...defaults.summarizerConfig, ...saved?.summarizerConfig },
    trimmerConfig: { ...defaults.trimmerConfig, ...saved?.trimmerConfig },
    preprocessConfig: { ...defaults.preprocessConfig, ...saved?.preprocessConfig },
    linkedDeletion: { ...defaults.linkedDeletion, ...saved?.linkedDeletion },
    syncConfig: { ...defaults.syncConfig, ...saved?.syncConfig },
  };
  context.extensionSettings[EXTENSION_NAME] = boundSettings;
  saveContext(context);
  return boundSettings;
}

export async function waitUntilReady(
  timeoutMs: number = CONTEXT_READY_TIMEOUT_MS,
  retryIntervalMs: number = CONTEXT_READY_RETRY_INTERVAL_MS
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (getContext()?.extensionSettings) return true;
    await new Promise<void>((resolve) => setTimeout(resolve, retryIntervalMs));
  }
  return !!getContext()?.extensionSettings;
}

export async function initSettings(): Promise<boolean> {
  if (!(await waitUntilReady())) {
    Logger.warn('SettingsManager', 'Cannot init settings: context.extensionSettings not ready');
    return false;
  }
  getSettings();
  // UI 模块可能先于宿主就绪，绑定后统一刷新响应式视图。
  notifyListeners();
  return true;
}

export function get<K extends keyof EngramSettings>(key: K): EngramSettings[K] {
  return getSettings()[key];
}

export function set<K extends keyof EngramSettings>(key: K, value: EngramSettings[K]): void {
  const context = getContext();
  if (!context?.extensionSettings) {
    Logger.warn('SettingsManager', 'Cannot set: context.extensionSettings not available');
    return;
  }
  const settings = getSettings();
  settings[key] = value;
  // 完整替换运行配置时，调用方可省略嵌入配置；在写入边界统一补齐。
  if (key === 'runtimeSettings' && settings.runtimeSettings.embeddingConfig === undefined) {
    settings.runtimeSettings.embeddingConfig = deepClone(
      defaultSettings.runtimeSettings.embeddingConfig!
    );
  }
  // 配置可能包含密钥，日志只记录发生变更的字段名。
  Logger.debug('SettingsManager', `Set ${String(key)}`);
  notifyListeners();
  saveContext(context);
}

/** 立即请求宿主保存，防抖与实际落盘由酒馆负责。 */
export function saveSettings(): void {
  saveContext(getContext());
}

export function getPromptTemplateById(id: string): PromptTemplate | null {
  return (
    get('runtimeSettings').promptTemplates.find((template) => template.id === id) ??
    getBuiltInTemplateById(id) ??
    null
  );
}

export function getRegexRules(): RegexRule[] {
  return get('regexRules');
}

export function setRegexRules(rules: RegexRule[]): void {
  set('regexRules', rules);
}
