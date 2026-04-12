import type { PreprocessingConfig, RegexRule } from '@/types/data_processing';
import type { EngramAPISettings } from '@/types/config';
import { getBuiltInTemplateById } from '@/types/config';
import type { PromptCategory, PromptTemplate } from '@/types/prompt';
import { deepClone } from '@/core/utils';
import { Logger } from '@/core/logger';
import { getRawSTContext } from '@/integrations/tavern/core';
import type { TavernContext } from '@/core/utils'
import type { SummarizerConfig } from '@/modules/memory/types';
import type { JsonObject } from 'type-fest';

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
  summarizerConfig: Partial<SummarizerConfig> & { trimConfig?: unknown }; // 总结器配置 (Legacy)
  trimmerConfig: JsonObject; // 精简器配置
  regexRules: RegexRule[]; // 正则清洗规则列表
  apiSettings: EngramAPISettings | null; // API 配置（LLM 预设、向量化、重排序等）
  preprocessingConfig: PreprocessingConfig | null; // 输入预处理配置
  linkedDeletion: {
    enabled: boolean; // 是否启用联动删除
    deleteWorldbook: boolean; // 删除角色时同步删除 Engram 世界书
    deleteChatWorldbook: boolean; // 删除聊天时同步删除 Engram 世界书
    deleteIndexedDB: boolean; // 删除角色时同步删除本地 IndexedDB 数据
    showConfirmation: boolean; // 删除前显示确认对话框
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
  summarizerConfig: {},
  trimmerConfig: {},
  regexRules: [],
  apiSettings: null,
  preprocessingConfig: null, // V0.8: 默认关闭预处理
  linkedDeletion: {
    enabled: true,
    deleteWorldbook: true,
    deleteChatWorldbook: false, // 默认关闭，防止误删
    deleteIndexedDB: false,
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
export class SettingsManager {
  private static readonly EXTENSION_NAME = 'engram';
  private static readonly SENSITIVE_LOG_KEYS = new Set([
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
  private static listeners: Set<() => void> = new Set();
  private static readonly CONTEXT_READY_RETRY_INTERVAL_MS = 200;
  private static readonly CONTEXT_READY_TIMEOUT_MS = 5000;

  /**
   * 订阅设置变更事件
   * @param listener 回调函数
   * @returns 取消订阅的函数
   */
  public static subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private static notifyListeners(): void {
    this.listeners.forEach((l) => {
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
  private static sanitizeLogValue(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
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
      return value.map((item) => this.sanitizeLogValue(item, seen));
    }

    const sanitized: Record<string, unknown> = {};
    for (const [entryKey, entryValue] of Object.entries(value)) {
      if (this.SENSITIVE_LOG_KEYS.has(entryKey)) {
        sanitized[entryKey] = '[REDACTED]';
      } else {
        sanitized[entryKey] = this.sanitizeLogValue(entryValue, seen);
      }
    }
    return sanitized;
  }

  private static cloneDefaultSettings(): EngramSettings {
    return deepClone(defaultSettings);
  }

  private static getOrCreateContextSettings(
    context: SettingsCapableContext | null
  ): EngramExtensionContext | null {
    if (!context?.extensionSettings) {
      return null;
    }

    const extensionSettings = context.extensionSettings;
    let settings = extensionSettings[this.EXTENSION_NAME];

    if (!settings) {
      settings = this.cloneDefaultSettings();
      extensionSettings[this.EXTENSION_NAME] = settings;
      Logger.debug('SettingsManager', 'Initialized engram settings with defaults');
      this.saveContext(context);
    }

    return {
      extensionSettings,
      settings,
    };
  }

  private static applyMissingDefaults(settings: EngramSettings): boolean {
    let shouldSave = false;

    for (const key of Object.keys(defaultSettings) as (keyof EngramSettings)[]) {
      if (settings[key] === undefined) {
        this.assignDefaultValue(settings, key);
        shouldSave = true;
        Logger.debug('SettingsManager', `Added missing field: ${key}`);
      }
    }

    return shouldSave;
  }

  private static assignDefaultValue<K extends keyof EngramSettings>(
    settings: EngramSettings,
    key: K
  ): void {
    settings[key] = deepClone(defaultSettings[key]);
  }

  private static saveContext(context: SettingsCapableContext | null): void {
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
  private static getContext(): SettingsCapableContext | null {
    return getRawSTContext() as SettingsCapableContext | null;
  }

  private static hasContextSettings(context: SettingsCapableContext | null): boolean {
    return !!context?.extensionSettings;
  }

  private static wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  public static async waitUntilReady(
    timeoutMs: number = this.CONTEXT_READY_TIMEOUT_MS,
    retryIntervalMs: number = this.CONTEXT_READY_RETRY_INTERVAL_MS
  ): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      if (this.hasContextSettings(this.getContext())) {
        return true;
      }
      await this.wait(retryIntervalMs);
    }

    return this.hasContextSettings(this.getContext());
  }

  /**
   * 获取扩展设置对象
   * 如果不存在则创建
   */
  public static getSettings(): EngramSettings {
    const context = this.getContext();
    const resolved = this.getOrCreateContextSettings(context);
    if (!resolved) {
      Logger.warn('SettingsManager', 'SillyTavern context.extensionSettings not available');
      return this.cloneDefaultSettings();
    }

    if (this.applyMissingDefaults(resolved.settings)) {
      this.saveContext(context);
    }

    return resolved.settings;
  }

  private static getExtensionSettings(): EngramSettings {
    return this.getSettings();
  }

  /**
   * 初始化设置（在扩展加载时调用）
   * 确保所有必需的字段都存在
   */
  public static async initSettings(): Promise<boolean> {
    const isReady = await this.waitUntilReady();
    if (!isReady) {
      Logger.warn('SettingsManager', 'Cannot init settings: context.extensionSettings not ready');
      return false;
    }

    const context = this.getContext();
    const resolved = this.getOrCreateContextSettings(context);
    if (!resolved) {
      Logger.warn('SettingsManager', 'Cannot init settings: context not available');
      return false;
    }

    if (this.applyMissingDefaults(resolved.settings)) {
      Logger.info('SettingsManager', 'Created or repaired engram settings');
      this.saveContext(context);
    }

    return true;
  }

  /**
   * Get a specific setting value
   */
  public static get<K extends keyof EngramSettings>(key: K): EngramSettings[K] {
    const settings = this.getExtensionSettings();
    const value = settings[key];
    // 如果值不存在，返回默认值
    return value !== undefined ? value : defaultSettings[key];
  }

  /**
   * Save a specific setting value
   * 直接更新 context.extensionSettings 中的字段
   */
  public static set<K extends keyof EngramSettings>(key: K, value: EngramSettings[K]): void {
    const context = this.getContext();
    const resolved = this.getOrCreateContextSettings(context);
    if (!resolved) {
      Logger.warn('SettingsManager', 'Cannot set: context.extensionSettings not available');
      return;
    }

    // 更新单个字段
    resolved.settings[key] = value;
    Logger.debug('SettingsManager', `Set ${String(key)}`, this.sanitizeLogValue(value));

    // 触发变更通知
    this.notifyListeners();

    // 保存到服务器
    this.saveContext(context);
  }

  /**
   * 保存设置到服务器
   */
  private static save(): void {
    this.saveContext(this.getContext());
  }

  /**
   * Load settings from SillyTavern global state
   * 兼容旧代码的接口
   */
  public static loadSettings(): EngramSettings {
    return this.getExtensionSettings();
  }

  /**
   * 获取指定分类下已启用的提示词模板
   * @param category 模板分类
   * @returns 启用的模板，如果没有则返回 null
   */
  public static getEnabledPromptTemplate(category: PromptCategory): PromptTemplate | null {
    // 优先从 apiSettings.promptTemplates 读取（这是 useAPIPresets 保存的位置）
    const apiSettings = this.get('apiSettings');
    const templates = apiSettings?.promptTemplates || [];
    return templates.find((t: PromptTemplate) => t.category === category && t.enabled) || null;
  }

  /**
   * 根据 ID 获取提示词模板
   * @param id 模板 ID
   * @returns 模板对象，如果未找到则返回 null
   */
  public static getPromptTemplateById(id: string): PromptTemplate | null {
    const apiSettings = this.get('apiSettings');
    const templates = apiSettings?.promptTemplates || [];
    // 尝试精确匹配 ID
    const byId = templates.find((t: PromptTemplate) => t.id === id);
    if (byId) return byId;

    // Fallback: 尝试查找内置模板
    const builtIn = getBuiltInTemplateById(id);
    if (builtIn) {
      // 注意：这里返回的内置模板可能没有用户覆盖的配置（如 enabled），
      // 但如果它被 QuickPanel 选中为当前模板，说明用户意图是使用它。
      // 它的 enabled 状态可能在 Settings 里没保存，但在运行时 context 下它是有效的。
      return builtIn;
    }

    // 向下兼容：如果 ID 实际上是 category (旧版配置可能会这样)，尝试按分类查找启用的模板
    // 这种情况主要发生在旧配置未完全迁移时
    return templates.find((t: PromptTemplate) => t.category === id && t.enabled) || null;
  }

  /**
   * 获取总结器设置
   * @returns summarizerConfig 对象
   */
  public static getSummarizerSettings(): EngramSettings['summarizerConfig'] {
    return this.get('summarizerConfig') || {};
  }

  /**
   * 设置总结器设置（合并更新）
   * @param config 要合并的配置对象
   */
  public static setSummarizerSettings(config: Partial<EngramSettings['summarizerConfig']>): void {
    const current = this.getSummarizerSettings();
    this.set('summarizerConfig', { ...current, ...config });
  }

  /**
   * 获取正则规则列表
   * @returns RegexRule[] 正则规则数组
   */
  public static getRegexRules(): RegexRule[] {
    return this.get('regexRules') || [];
  }

  /**
   * 设置正则规则列表
   * @param rules 规则数组
   */
  public static setRegexRules(rules: RegexRule[]): void {
    this.set('regexRules', rules);
  }

  // ==================== 统计与遥测 (Telemetry) ====================

  /**
   * 累加全局统计数据
   * @param key 要累加的统计字段名
   * @param value 累加值 (默认为 1)
   */
  public static incrementStatistic(key: IncrementableStatisticKey, value: number = 1): void {
    const stats = { ...this.get('statistics') };

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

    this.set('statistics', stats);
  }
}
