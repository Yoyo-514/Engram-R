import { LogLevel } from './defaults';

/**
 * 日志级别显示配置
 */
export const LogLevelConfig: Record<LogLevel, { label: string; icon: string; color: string }> = {
  [LogLevel.DEBUG]: { label: 'DEBUG', icon: '●', color: '#6c757d' },
  [LogLevel.INFO]: { label: 'INFO', icon: '●', color: '#17a2b8' },
  [LogLevel.SUCCESS]: { label: 'OK', icon: '●', color: '#28a745' },
  [LogLevel.WARN]: { label: 'WARN', icon: '▲', color: '#ffc107' },
  [LogLevel.ERROR]: { label: 'ERROR', icon: '✕', color: '#dc3545' },
};
