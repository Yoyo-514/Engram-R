import type { LogLevel } from '@/config/logger/defaults';

// Logger 类型定义

/**
 * 日志条目接口
 */
export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  module: string; // 如 'CORE/Pipeline', 'UI/GraphView'
  message: string;
  data?: unknown; // 可选的附加数据（展开查看）
}

/**
 * 日志配置接口
 */
export interface LoggerConfig {
  maxEntries: number; // 最大存储条数
  minLevel: LogLevel; // 最低显示级别
}
