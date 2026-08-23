/**
 * LogEntryItem - 单条日志渲染组件
 *
 * V0.9.12: 支持分组模式（Docker 风格）
 * - 连续相同模块的日志合并显示
 * - 支持默认展开/折叠
 */

import {
  ChevronRight,
  ChevronDown,
  Layers,
  Terminal,
  Link,
  Brain,
  Search,
  Settings,
  Palette,
  FileCode,
  Database,
  Server,
  Cpu,
  Zap,
  CloudCog,
  type LucideIcon,
} from 'lucide-react';
import type { FC } from 'react';
import { memo, useState, useMemo, createElement } from 'react';

import { LogLevel } from '@/config/logger/defaults';
import { LogLevelConfig } from '@/config/logger/presentation';
import type { LogEntry } from '@/types/logger';

interface LogEntryItemProps {
  entry: LogEntry;
  /** 外部控制是否展开数据详情 */
  defaultExpanded?: boolean;
}

/**
 * 格式化时间为 HH:MM:SS
 */
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toTimeString().slice(0, 8);
}

// 级别样式映射 - 简洁配色（加深 DEBUG 颜色）
const LEVEL_STYLES: Record<LogLevel, { text: string; bg: string }> = {
  [LogLevel.DEBUG]: { text: 'text-zinc-400', bg: 'bg-zinc-500/15' },
  [LogLevel.INFO]: { text: 'text-blue-400', bg: 'bg-blue-500/10' },
  [LogLevel.SUCCESS]: { text: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  [LogLevel.WARN]: { text: 'text-amber-400', bg: 'bg-amber-500/10' },
  [LogLevel.ERROR]: { text: 'text-red-400', bg: 'bg-red-500/10' },
};

/**
 * 模块图标映射
 * 根据模块名前缀匹配对应的图标
 */
const MODULE_ICONS: Record<string, LucideIcon> = {
  // 系统核心
  System: Terminal,
  // 集成层
  STBridge: Link,
  TavernAPI: Server,
  Tavern: Server,
  // 记忆管理
  Summarizer: Brain,
  Memory: Brain,
  // RAG 系统
  RAG: Search,
  // 设置与配置
  SettingsManager: Settings,
  ThemeManager: Palette,
  // 宏处理
  MacroService: FileCode,
  // 数据层
  Data: Database,
  // 预处理
  Preprocess: Cpu,
  // 批处理
  Batch: Zap,
  // LLM
  LLM: CloudCog,
};

/**
 * 根据模块名获取对应图标
 */
function getModuleIcon(module: string): LucideIcon {
  // 精确匹配
  if (MODULE_ICONS[module]) {
    return MODULE_ICONS[module];
  }
  // 前缀匹配（例如 RAG/Inject -> RAG）
  const prefix = module.split('/')[0];
  if (MODULE_ICONS[prefix]) {
    return MODULE_ICONS[prefix];
  }
  // 默认图标
  return Layers;
}

// 单条日志 data 预览的最大展示字符数（写入侧已截断到 4096，这里再收紧展示）
const MAX_PREVIEW_CHARS = 2000;

/**
 * 单条日志项
 *
 * 性能说明：
 * - React.memo 包裹，批量更新时旧条目引用不变，跳过重渲染
 * - data 预览序列化结果 useMemo 缓存，避免每次渲染 JSON.stringify
 */
export const LogEntryItem: FC<LogEntryItemProps> = memo(function LogEntryItem({
  entry,
  defaultExpanded = false,
}) {
  // 自动展开错误和警告
  const autoExpand = entry.level === LogLevel.WARN || entry.level === LogLevel.ERROR;
  const [expanded, setExpanded] = useState(defaultExpanded || autoExpand);
  const hasData = entry.data !== undefined;
  const levelConfig = LogLevelConfig[entry.level];
  const levelStyle = LEVEL_STYLES[entry.level];

  // 缓存 data 预览文本，限制展示长度
  // 大 payload 已在写入侧截断，这里再限制一次展示尺寸
  const dataPreview = useMemo(() => {
    if (!hasData) return null;
    try {
      const str = typeof entry.data === 'string' ? entry.data : JSON.stringify(entry.data, null, 2);
      if (str.length <= MAX_PREVIEW_CHARS) return str;
      return `${str.slice(0, MAX_PREVIEW_CHARS)}\n...[预览已截断]`;
    } catch {
      return '[Data serialization failed]';
    }
  }, [entry.data, hasData]);

  // 响应外部默认展开状态变化（渲染期间调整 state，替代 effect 同步）
  const [prevDefaultExpanded, setPrevDefaultExpanded] = useState(defaultExpanded);
  if (prevDefaultExpanded !== defaultExpanded) {
    setPrevDefaultExpanded(defaultExpanded);
    if (hasData) {
      setExpanded(defaultExpanded || autoExpand);
    }
  }

  return (
    <div className="group">
      <div
        className={`flex items-start gap-3 rounded-sm px-2 py-1 transition-colors hover:bg-white/[0.02] ${hasData ? 'cursor-pointer' : ''} `}
        onClick={() => hasData && setExpanded(!expanded)}
      >
        {/* 展开箭头 */}
        <span className="mt-0.5 flex w-3 shrink-0 items-center text-zinc-600">
          {hasData ? expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} /> : null}
        </span>

        {/* 时间戳 - 加深颜色 */}
        <span className="shrink-0 text-[11px] tabular-nums text-zinc-500">
          {formatTime(entry.timestamp)}
        </span>

        {/* 级别标签 - 紧凑样式 */}
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${levelStyle.text} ${levelStyle.bg} `}
        >
          {levelConfig.label}
        </span>

        {/* 模块标签 - 加深颜色，长模块名截断避免挤压消息 */}
        <span
          className="max-w-[120px] shrink-0 truncate text-[11px] text-zinc-400"
          title={entry.module}
        >
          {entry.module}
        </span>

        {/* 消息内容 */}
        <span className="min-w-0 flex-1 break-words text-[11px] leading-relaxed text-zinc-300">
          {entry.message}
        </span>
      </div>

      {/* 展开的数据详情 */}
      {expanded && hasData && (
        <div className="mb-1 ml-10 mr-2 rounded-r border-l-2 border-zinc-700 bg-zinc-900/50 px-3 py-2 text-[10px]">
          <pre className="m-0 whitespace-pre-wrap break-words font-mono text-zinc-400">
            {dataPreview}
          </pre>
        </div>
      )}
    </div>
  );
});

/**
 * 日志分组摘要（由条目列表预计算，供分组头渲染）
 */
export interface LogGroupSummary {
  module: string;
  count: number;
  first: LogEntry;
  last: LogEntry;
  highestLevel: LogLevel;
}

/**
 * 从一组日志条目计算分组摘要
 */
export function summarizeLogGroup(entries: LogEntry[]): LogGroupSummary {
  const highestLevel = entries.reduce(
    (max, e) => Math.max(max, e.level),
    LogLevel.DEBUG
  ) as LogLevel;

  return {
    module: entries[0]?.module ?? 'Unknown',
    count: entries.length,
    first: entries[0],
    last: entries[entries.length - 1],
    highestLevel,
  };
}

interface LogGroupHeaderProps {
  summary: LogGroupSummary;
  /** 分组是否展开（受控） */
  expanded: boolean;
  onToggle: () => void;
}

/**
 * 日志分组头（Docker 风格，受控组件）
 * 分组内容由上层虚拟化列表渲染，此处只负责头部展示
 */
export const LogGroupHeader: FC<LogGroupHeaderProps> = ({ summary, expanded, onToggle }) => {
  const levelStyle = LEVEL_STYLES[summary.highestLevel];
  const timeRange = `${formatTime(summary.first.timestamp)} - ${formatTime(summary.last.timestamp)}`;

  return (
    <div
      className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-[11px] transition-colors hover:bg-white/[0.02]"
      onClick={onToggle}
    >
      {/* 展开箭头 */}
      <span className="shrink-0 text-zinc-500">
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </span>

      {/* 分组图标 - 根据模块显示对应图标 */}
      {createElement(getModuleIcon(summary.module), {
        size: 13,
        className: `shrink-0 ${levelStyle.text}`,
      })}

      {/* 模块名 */}
      <span className={`min-w-0 truncate font-medium ${levelStyle.text}`} title={summary.module}>
        {summary.module}
      </span>

      {/* 计数标签 */}
      <span
        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${levelStyle.bg} ${levelStyle.text}`}
      >
        {summary.count} 条
      </span>

      {/* 时间范围 - 加深颜色 */}
      <span className="ml-auto shrink-0 tabular-nums text-zinc-500">{timeRange}</span>
    </div>
  );
};

/**
 * 将日志列表按模块分组
 * 连续相同模块的日志会被合并到一个组里
 */
export function groupLogsByModule(logs: LogEntry[]): LogEntry[][] {
  if (logs.length === 0) return [];

  const groups: LogEntry[][] = [];
  let currentGroup: LogEntry[] = [];
  let currentModule: string | null = null;

  for (const log of logs) {
    if (log.module === currentModule) {
      // 同一模块，加入当前组
      currentGroup.push(log);
    } else {
      // 不同模块，保存当前组并开始新组
      if (currentGroup.length > 0) {
        groups.push(currentGroup);
      }
      currentGroup = [log];
      currentModule = log.module;
    }
  }

  // 保存最后一组
  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  return groups;
}
