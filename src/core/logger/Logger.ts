/**
 * Logger - 日志核心服务
 *
 * 提供统一的日志记录、持久化存储和 EventBus 集成。
 * 替代 console.log，确保调试信息可追踪、可导出。
 */

import { DEFAULT_LOGGER_CONFIG, LogLevel } from '@/config/logger/defaults';
import { generateShortUUID } from '@/core/utils';
import type { LogEntry, LoggerConfig } from '@/types/logger';

import manifest from '../../../manifest.json';
// 深度导入 event-bus 而非 events 桶文件：
// events/index 会反向引入 EventWatcher → tavern 集成链 → PromptLoader，
// 而 PromptLoader 在模块顶层调用 Logger.info，形成致命循环依赖
// （生产环境靠加载顺序侥幸避过，单测/不同入口下会直接崩）
import { engramEventBus } from '../events/event-bus';
import type { EngramEvent } from '../events/event-bus';
import type { LogModule } from './LogModule';

// 日志流监听器
const logListeners = new Set<(entry: LogEntry) => void>();

// 内存中的日志缓存（用于快速访问和 UI 展示）
// 注意：模块级变量在 HMR 时可能被保留，但完整页面刷新会重置
let logCache: LogEntry[] = [];

// 全局配置实例
let config: LoggerConfig = { ...DEFAULT_LOGGER_CONFIG };

// 初始化标记（防止重复订阅 EventBus）
let isInitialized = false;

// 单条日志 data 序列化后的最大保留字符数
// 防止超大 payload（如召回结果、聊天上下文）长期驻留内存并拖慢 UI 序列化
const MAX_LOG_DATA_CHARS = 4096;

/**
 * 格式化时间戳为 HH:MM:SS
 */
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toTimeString().slice(0, 8);
}

/**
 * 限制日志 data 大小（写入侧截断）
 *
 * 设计取舍：
 * - 超大 payload 在写入时截断一次并缓存序列化结果，
 *   避免 UI 展开时反复 JSON.stringify 大对象，也避免内存膨胀
 * - 小数据直接原样返回，序列化开销可忽略
 */
function limitLogData(data: unknown): unknown {
  if (data === undefined || data === null) {
    return data;
  }

  if (typeof data === 'string') {
    if (data.length <= MAX_LOG_DATA_CHARS) {
      return data;
    }
    return `${data.slice(0, MAX_LOG_DATA_CHARS)}...[已截断，原 ${data.length} 字符]`;
  }

  if (typeof data !== 'object') {
    return data;
  }

  try {
    const json = JSON.stringify(data);
    if (json.length <= MAX_LOG_DATA_CHARS) {
      return data;
    }
    return {
      truncated: true,
      originalLength: json.length,
      preview: json.slice(0, MAX_LOG_DATA_CHARS),
    };
  } catch {
    // 循环引用或不可序列化对象
    return '[Data serialization failed]';
  }
}

/**
 * 写入日志条目（内部方法）
 * 执行过滤、缓存和广播
 */
function writeLog(level: LogLevel, module: string, message: string, data?: unknown): void {
  if (level < config.minLevel) return;

  const entry: LogEntry = {
    id: generateShortUUID('log_'),
    timestamp: Date.now(),
    level,
    module,
    message,
    data: limitLogData(data),
  };

  // 添加到内存缓存
  logCache.push(entry);

  // 惰性裁剪：超过上限的 125% 才一次性裁剪 (FIFO)
  // 避免每次写入都做 O(n) 数组拷贝
  if (logCache.length > config.maxEntries * 1.25) {
    logCache = logCache.slice(-config.maxEntries);
  }

  // 广播给订阅者 (如: DevTools UI)
  for (const listener of logListeners) {
    listener(entry);
  }
}

/**
 * 设置 EventBus 监听
 * 将系统核心事件自动转换为日志
 */
function setupEventBusListener(): void {
  engramEventBus.subscribe((event: EngramEvent) => {
    const levelMap: Record<string, LogLevel> = {
      INGESTION_START: LogLevel.INFO,
      INGESTION_COMPLETE: LogLevel.SUCCESS,
      ENTITY_CREATED: LogLevel.INFO,
      MEMORY_STORED: LogLevel.SUCCESS,
      RETRIEVAL_START: LogLevel.DEBUG,
      RETRIEVAL_COMPLETE: LogLevel.SUCCESS,
      CHAT_CHANGED: LogLevel.INFO,
      MESSAGE_RECEIVED: LogLevel.DEBUG,
    };

    const level = levelMap[event.type] ?? LogLevel.DEBUG;
    writeLog(level, 'EngramEventBus', `${event.type}`, event.payload);
  });
}

/**
 * Logger 公共 API
 *
 * 支持 LogModule 枚举和普通字符串作为模块名
 */
export const Logger = {
  /**
   * 初始化 Logger
   * 重置缓存并建立 EventBus 连接
   */
  init(userConfig?: Partial<LoggerConfig>): void {
    logCache = []; // 清空之前的日志

    if (userConfig) {
      config = { ...config, ...userConfig };
    }

    if (!isInitialized) {
      setupEventBusListener();
      isInitialized = true;
    }

    Logger.info('System', 'Logger 初始化完成');
  },

  /**
   * DEBUG 级别日志 (调试信息)
   */
  debug(module: LogModule | string, message: string, data?: unknown): void {
    writeLog(LogLevel.DEBUG, module, message, data);
  },

  /**
   * INFO 级别日志 (常规信息)
   */
  info(module: LogModule | string, message: string, data?: unknown): void {
    writeLog(LogLevel.INFO, module, message, data);
  },

  /**
   * SUCCESS 级别日志 (操作成功)
   */
  success(module: LogModule | string, message: string, data?: unknown): void {
    writeLog(LogLevel.SUCCESS, module, message, data);
  },

  /**
   * WARN 级别日志 (警告信息)
   */
  warn(module: LogModule | string, message: string, data?: unknown): void {
    writeLog(LogLevel.WARN, module, message, data);
  },

  /**
   * ERROR 级别日志 (错误信息)
   */
  error(module: LogModule | string, message: string, data?: unknown): void {
    writeLog(LogLevel.ERROR, module, message, data);
  },

  /**
   * 获取所有缓存日志
   */
  getLogs(): LogEntry[] {
    return [...logCache];
  },

  /**
   * 订阅新日志流
   * @returns 取消订阅函数
   */
  subscribe(callback: (entry: LogEntry) => void): () => void {
    logListeners.add(callback);
    return () => {
      logListeners.delete(callback);
    };
  },

  /**
   * 清空所有日志
   */
  clear(): void {
    logCache = [];
    Logger.info('Logger', '日志已清空');
  },

  /**
   * 导出日志为 Markdown 格式
   * 用于错误报告
   */
  exportToMarkdown(): string {
    const now = new Date();

    const levelLabels: Record<LogLevel, string> = {
      [LogLevel.DEBUG]: 'DEBUG',
      [LogLevel.INFO]: 'INFO',
      [LogLevel.SUCCESS]: 'SUCCESS',
      [LogLevel.WARN]: 'WARN',
      [LogLevel.ERROR]: 'ERROR',
    };

    let md = `# Engram Debug Log\n\n`;
    md += `- **导出时间**: ${now.toLocaleString('zh-CN')}\n`;
    md += `- **版本**: ${manifest.version}\n`;
    md += `- **日志条数**: ${logCache.length}\n\n`;
    md += `---\n\n`;
    md += `## 日志记录\n\n`;
    md += '```m\n';

    for (const entry of logCache) {
      const time = formatTime(entry.timestamp);
      const level = levelLabels[entry.level].padEnd(7);
      const module = entry.module.padEnd(16);
      md += `[${time}] [${module}] ${level} ${entry.message}\n`;

      if (entry.data !== undefined) {
        try {
          const dataStr = JSON.stringify(entry.data, null, 2)
            .split('\n')
            .map((line) => `    ${line}`)
            .join('\n');
          md += `${dataStr}\n`;
        } catch {
          md += `    [Data serialization failed]\n`;
        }
      }
    }

    md += '```\n';
    return md;
  },

  /**
   * 生成导出文件名
   * 格式: engram_log_YYYY-MM-DD_HHMMSS.md
   */
  getExportFilename(): string {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
    return `engram_log_${dateStr}_${timeStr}.md`;
  },
};
