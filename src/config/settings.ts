import type { JsonObject } from 'type-fest';

import { getDefaultRuntimeSettings } from '@/config/api/defaults';
import { DEFAULT_SUMMARIZER_CONFIG, DEFAULT_TRIMMER_CONFIG } from '@/config/memory/defaults';
import { DEFAULT_PREPROCESS_CONFIG } from '@/config/preprocess/defaults';
import { getBuiltInTemplateById } from '@/config/prompt/templates';
import { Logger } from '@/core/logger';
import { deepClone } from '@/core/utils';
import type { TavernContext } from '@/core/utils';
import { getRawSTContext } from '@/integrations/tavern/core';
import type { EngramRuntimeSettings } from '@/types/config';
import type { SummarizerConfig, TrimmerConfig } from '@/types/memory';
import type { PreprocessConfig } from '@/types/preprocess';
import type { PromptTemplate } from '@/types/prompt';
import type { RegexRule } from '@/types/regex';

type EngramContextSettings = Record<string, EngramSettings | undefined>;

type SettingsCapableContext = Omit<TavernContext, 'extensionSettings'> & {
  extensionSettings?: EngramContextSettings;
};

type EngramExtensionContext = {
  extensionSettings: EngramContextSettings;
  settings: EngramSettings;
};

export interface EngramSettings {
  theme: string;
  presets: JsonObject; // 待扩展的预设类型，暂时使用 Record
  templates: JsonObject; // 待扩展的模板类型，暂时使用 Record
  promptTemplates: PromptTemplate[]; // 提示词模板列表
  lastOpenedTab: string; // 上次打开的主界面页面
  summarizerConfig: SummarizerConfig; // 总结器运行配置（持久化层）
  trimmerConfig: TrimmerConfig; // 事件精简配置
  regexRules: RegexRule[]; // 正则清洗规则列表
  runtimeSettings: EngramRuntimeSettings; // 运行时业务配置（模型、提示词、世界书、召回等）
  preprocessConfig: PreprocessConfig; // 输入预处理配置
  linkedDeletion: {
    enabled: boolean; // 是否启用联动删除
    deleteIndexedDB: boolean; // 是否删除关联聊天数据库与同步残留
    showConfirmation: boolean; // 是否在删除前弹出确认
  };
  glassSettings: {
    enabled: boolean; // 是否启用
    opacity: number; // 0-1
    blur: number; // px
  };
  syncConfig: {
    enabled: boolean; // 总开关：是否启用同步功能
    autoSync: boolean; // 是否在数据变动时自动上传
  };
}

/** 默认设置 */
const defaultSettings: EngramSettings = Object.freeze({
  theme: 'odysseia',
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
  glassSettings: {
    enabled: true,
    opacity: 0.3,
    blur: 10,
  },
  syncConfig: {
    enabled: false, // 默认关闭（Beta功能）
    autoSync: true, // 启用后默认开启自动同步
  },
});

/**
 * SettingsManager - Engram 设置管理器
 *
 * 使用 SillyTavern.getContext().extensionSettings API 进行持久化
 * 这是 ST 官方推荐的扩展设置存储方式
 */
const EXTENSION_NAME = 'engram';
const listeners: Set<() => void> = new Set();
const CONTEXT_READY_RETRY_INTERVAL_MS = 200;
const CONTEXT_READY_TIMEOUT_MS = 5000;

/**
 * 订阅设置变更事件
 * @param listener 回调函数
 * @returns 取消订阅的函数
 */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyListeners(): void {
  listeners.forEach((l) => {
    try {
      l();
    } catch (e) {
      Logger.warn('SettingsManager', 'Listener Execution Error', e);
    }
  });
}

function cloneDefaultSettings(): EngramSettings {
  return deepClone(defaultSettings);
}

function getOrCreateContextSettings(
  context: SettingsCapableContext | null
): EngramExtensionContext | null {
  if (!context?.extensionSettings) {
    return null;
  }

  const extensionSettings = context.extensionSettings;
  let settings = extensionSettings[EXTENSION_NAME];

  if (!settings) {
    settings = cloneDefaultSettings();
    extensionSettings[EXTENSION_NAME] = settings;
    Logger.debug('SettingsManager', 'Initialized engram settings with defaults');
    saveContext(context);
  }

  return {
    extensionSettings,
    settings,
  };
}

function applyMissingDefaults(settings: EngramSettings): boolean {
  let shouldSave = false;

  for (const key of Object.keys(defaultSettings) as (keyof EngramSettings)[]) {
    if (settings[key] === undefined) {
      assignDefaultValue(settings, key);
      shouldSave = true;
      Logger.debug('SettingsManager', `Added missing field: ${key}`);
    }
  }

  return shouldSave;
}

function assignDefaultValue<K extends keyof EngramSettings>(
  settings: EngramSettings,
  key: K
): void {
  settings[key] = deepClone(defaultSettings[key]);
}

function saveContext(context: SettingsCapableContext | null): void {
  if (context?.saveSettingsDebounced) {
    void context.saveSettingsDebounced();
    Logger.debug('SettingsManager', 'Saved via context.saveSettingsDebounced');
  } else {
    Logger.warn('SettingsManager', 'saveSettingsDebounced not available');
  }
}

/**
 * 获取 SillyTavern context
 */
function getContext(): SettingsCapableContext | null {
  return getRawSTContext() as SettingsCapableContext | null;
}

function hasContextSettings(context: SettingsCapableContext | null): boolean {
  return !!context?.extensionSettings;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export async function waitUntilReady(
  timeoutMs: number = CONTEXT_READY_TIMEOUT_MS,
  retryIntervalMs: number = CONTEXT_READY_RETRY_INTERVAL_MS
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    if (hasContextSettings(getContext())) {
      return true;
    }
    await wait(retryIntervalMs);
  }

  return hasContextSettings(getContext());
}

/**
 * 获取扩展设置对象
 * 如果不存在则创建
 */
export function getSettings(): EngramSettings {
  const context = getContext();
  const resolved = getOrCreateContextSettings(context);
  if (!resolved) {
    Logger.warn('SettingsManager', 'SillyTavern context.extensionSettings not available');
    return cloneDefaultSettings();
  }

  if (applyMissingDefaults(resolved.settings)) {
    saveContext(context);
  }

  return resolved.settings;
}

/**
 * 初始化设置（在扩展加载时调用）
 * 确保所有必需的字段都存在
 */
export async function initSettings(): Promise<boolean> {
  const isReady = await waitUntilReady();
  if (!isReady) {
    Logger.warn('SettingsManager', 'Cannot init settings: context.extensionSettings not ready');
    return false;
  }

  const context = getContext();
  const resolved = getOrCreateContextSettings(context);
  if (!resolved) {
    Logger.warn('SettingsManager', 'Cannot init settings: context not available');
    return false;
  }

  if (applyMissingDefaults(resolved.settings)) {
    Logger.info('SettingsManager', 'Created or repaired engram settings');
    saveContext(context);
  }

  return true;
}

/**
 * Get a specific setting value
 */
export function get<K extends keyof EngramSettings>(key: K): EngramSettings[K] {
  const settings = getSettings();
  const value = settings[key];
  // 如果值不存在，返回默认值
  return value !== undefined ? value : defaultSettings[key];
}

/**
 * Save a specific setting value
 * 直接更新 context.extensionSettings 中的字段
 */
export function set<K extends keyof EngramSettings>(key: K, value: EngramSettings[K]): void {
  const context = getContext();
  const resolved = getOrCreateContextSettings(context);
  if (!resolved) {
    Logger.warn('SettingsManager', 'Cannot set: context.extensionSettings not available');
    return;
  }

  // 更新单个字段
  resolved.settings[key] = value;
  // 配置可能包含密钥，日志只记录发生变更的字段名。
  Logger.debug('SettingsManager', `Set ${String(key)}`);

  // 触发变更通知
  notifyListeners();

  // 保存到服务器
  saveContext(context);
}

/**
 * 根据 ID 获取提示词模板
 * @param id 模板 ID
 * @returns 模板对象，如果未找到则返回 null
 */
export function getPromptTemplateById(id: string): PromptTemplate | null {
  const runtimeSettings = get('runtimeSettings');
  const templates = runtimeSettings?.promptTemplates || [];
  // 尝试精确匹配 ID
  const byId = templates.find((t: PromptTemplate) => t.id === id);
  if (byId) return byId;

  return getBuiltInTemplateById(id) ?? null;
}

/**
 * 获取正则规则列表
 * @returns RegexRule[] 正则规则数组
 */
export function getRegexRules(): RegexRule[] {
  return get('regexRules') || [];
}

/**
 * 设置正则规则列表
 * @param rules 规则数组
 */
export function setRegexRules(rules: RegexRule[]): void {
  set('regexRules', rules);
}
