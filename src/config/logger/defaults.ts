import type { LoggerConfig } from '@/types/logger';

/**
 * 日志级别枚举
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  SUCCESS = 2,
  WARN = 3,
  ERROR = 4,
}

export const DEFAULT_LOGGER_CONFIG: LoggerConfig = {
  maxEntries: 5000,
  minLevel: LogLevel.DEBUG,
};
