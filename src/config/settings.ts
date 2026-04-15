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
import type { PromptCategory, PromptTemplate } from '@/types/prompt';
import type { RegexRule } from '@/types/regex';

type EngramContextSettings = Record<string, EngramSettings | undefined>;

type SettingsCapableContext = Omit<TavernContext, 'extensionSettings'> & {
  extensionSettings?: EngramContextSettings;
};

type StatisticsState = EngramSettings['statistics'];
type IncrementableStatisticKey = Exclude<keyof StatisticsState, 'firstUseAt' | 'activeDays'>;

type EngramExtensionContext = {
  extensionSettings: EngramContextSettings;
  settings: EngramSettings;
};

export interface EngramSettings {
  theme: string;
  presets: JsonObject; // 待扩展的预设类型，暂时使用 Record
  templates: JsonObject; // 待扩展的模板类型，暂时使用 Record
  promptTemplates: PromptTemplate[]; // 提示词模板列表
  lastReadVersion: string; // 最后已读的版本号
  lastOpenedTab: string; // 上次打开的主界面页面
  summarizerConfig: SummarizerConfig; // 总结器运行配置（持久化层）
  trimmerConfig: TrimmerConfig; // 事件精简配置
  regexRules: RegexRule[]; // 正则清洗规则列表
  runtimeSettings: EngramRuntimeSettings; // 运行时业务配置（模型、提示词、世界书、召回等）
  preprocessConfig: PreprocessConfig; // 输入预处理配置
  linkedDeletion: {
    enabled: boolean; // 是否启用联动删除
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
  statistics: {
    firstUseAt: number | null; // 首次使用时间戳
    activeDays: string[]; // 活跃日期集合 (如 ['2026-03-05', ...])
    totalTokens: number; // 总 Token 消耗
    totalLlmCalls: number; // 总 LLM 调用次数
    totalEvents: number; // 累计生成的节点数
    totalEntities: number; // 累计提取的实体数
    totalRagInjections: number; // 总召回注入次数
  };
}

/** 默认设置 */
const defaultSettings: EngramSettings = Object.freeze({
  theme: 'odysseia',
  presets: {},
  templates: {},
  promptTemplates: [],
  lastReadVersion: '0.0.0',
  lastOpenedTab: 'dashboard',
  summarizerConfig: DEFAULT_SUMMARIZER_CONFIG,
  trimmerConfig: DEFAULT_TRIMMER_CONFIG,
  regexRules: [],
  runtimeSettings: getDefaultRuntimeSettings(),
  preprocessConfig: DEFAULT_PREPROCESS_CONFIG,
  linkedDeletion: {
    enabled: true,
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
  statistics: {
    firstUseAt: null,
    activeDays: [],
    totalTokens: 0,
    totalLlmCalls: 0,
    totalEvents: 0,
    totalEntities: 0,
    totalRagInjections: 0,
  },
});

/**
 * SettingsManager - Engram 设置管理器
 *
 * 使用 SillyTavern.getContext().extensionSettings API 进行持久化
 * 这是 ST 官方推荐的扩展设置存储方式
 */
const EXTENSION_NAME = 'engram';
const SENSITIVE_LOG_KEYS = new Set([
  'apiKey',
  'apikey',
  'key',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'auth',
  'secret',
  'password',
]);
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

/**
 * 脱敏日志数据，避免 API Key / Token 等敏感字段进入日志缓存
 */
function sanitizeLogValue(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return '[Circular]';
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeLogValue(item, seen));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [entryKey, entryValue] of Object.entries(value)) {
    if (SENSITIVE_LOG_KEYS.has(entryKey)) {
      sanitized[entryKey] = '[REDACTED]';
    } else {
      sanitized[entryKey] = sanitizeLogValue(entryValue, seen);
    }
  }
  return sanitized;
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
  Logger.debug('SettingsManager', `Set ${String(key)}`, sanitizeLogValue(value));

  // 触发变更通知
  notifyListeners();

  // 保存到服务器
  saveContext(context);
}

/**
 * 保存设置到服务器
 */
export function save(): void {
  saveContext(getContext());
}

/**
 * 获取指定分类下已启用的提示词模板
 * @param category 模板分类
 * @returns 启用的模板，如果没有则返回 null
 */
export function getEnabledPromptTemplate(category: PromptCategory): PromptTemplate | null {
  // 优先从 runtimeSettings.promptTemplates 读取
  const runtimeSettings = get('runtimeSettings');
  const templates = runtimeSettings?.promptTemplates || [];
  return templates.find((t: PromptTemplate) => t.category === category && t.enabled) || null;
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

// ==================== 统计与遥测 (Telemetry) ====================

/**
 * 累加全局统计数据
 * @param key 要累加的统计字段名
 * @param value 累加值 (默认为 1)
 */
export function incrementStatistic(key: IncrementableStatisticKey, value: number = 1): void {
  const stats = { ...get('statistics') };

  // 初始化首次使用时间
  if (!stats.firstUseAt) {
    stats.firstUseAt = Date.now();
  }

  // 记录活跃天数 (基于本地时区的 YYYY-MM-DD)
  const today = new Date().toLocaleDateString('en-CA'); // 'YYYY-MM-DD'
  if (!stats.activeDays) stats.activeDays = [];
  if (!stats.activeDays.includes(today)) {
    stats.activeDays.push(today);
    // 保持数组不过大，比如保留最近一年 365 天
    if (stats.activeDays.length > 365) {
      stats.activeDays.shift();
    }
  }

  // 累加数值 (不处理数组或非数值类型)
  const currentValue = stats[key];
  if (typeof currentValue === 'number') {
    stats[key] += value;
  }

  set('statistics', stats);
}
