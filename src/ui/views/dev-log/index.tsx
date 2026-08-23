import {
  Terminal,
  Trash2,
  Download,
  Search,
  ChevronDown,
  ArrowDownToLine,
  Zap,
  Target,
  Maximize2,
  Minimize2,
} from 'lucide-react';
/**
 * DevLog - 开发日志视图
 *
 * 应用「无框流体」设计语言：
 * - 减少卡片边框，使用细线分割
 * - 工具栏 sticky 固定
 * - 极简主义布局
 */
import type { FC } from 'react';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Virtuoso } from 'react-virtuoso';

import type { LogLevel } from '@/config/logger/defaults';
import { LogLevelConfig } from '@/config/logger/presentation';
import { Logger, ALL_MODULES } from '@/core/logger';
import type { LogEntry } from '@/types/logger';
import { PageTitle } from '@/ui/components/display/PageTitle';
import { LayoutTabs } from '@/ui/components/layout/LayoutTabs';
import { type Tab } from '@/ui/components/layout/TabPills';

import {
  groupLogsByModule,
  LogEntryItem,
  LogGroupHeader,
  summarizeLogGroup,
  type LogGroupSummary,
} from './LogEntryItem';
import { ModelLog } from './ModelLog';
import { RecallLog } from './RecallLog';

// Tab 类型
type TabType = 'runtime' | 'model' | 'recall';

// Tab 配置
const TABS: Tab[] = [
  { id: 'runtime', label: '运行日志', icon: <Terminal size={14} /> },
  { id: 'model', label: '模型日志', icon: <Zap size={14} /> },
  { id: 'recall', label: '召回日志', icon: <Target size={14} /> },
];

// Tab 信息映射
const TAB_INFO: Record<TabType, { title: string; subtitle: string }> = {
  runtime: { title: '运行日志', subtitle: '查看系统运行时日志' },
  model: { title: '模型日志', subtitle: '查看 LLM 调用记录' },
  recall: { title: '召回日志', subtitle: '查看 RAG 召回记录' },
};

// V0.9.10: 模块列表自动生成（不再硬编码）
const MODULES = ['ALL', ...ALL_MODULES];

// 日志订阅批量合并间隔：高频日志下把多次 setState 合并为一次
const LOG_BATCH_INTERVAL_MS = 100;

// 虚拟化列表行类型：分组头或单条日志
// 重构说明：V0.9.12 的分组展示保留，但改为 flatten 行 + Virtuoso 虚拟化渲染
// 5000 条日志只渲染可视区域，避免全量 DOM 导致卡顿
type LogRow =
  | { kind: 'header'; summary: LogGroupSummary }
  | { kind: 'entry'; entry: LogEntry; indent: boolean };

interface DevLogProps {
  initialTab?: TabType;
}

export const DevLog: FC<DevLogProps> = ({ initialTab }) => {
  const [activeTab, setActiveTab] = useState<TabType>(initialTab || 'runtime');
  const currentInfo = TAB_INFO[activeTab];
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState<LogLevel | -1>(-1);
  const [moduleFilter, setModuleFilter] = useState('ALL');
  const [autoScroll, setAutoScroll] = useState(true);
  const [showLevelDropdown, setShowLevelDropdown] = useState(false);
  const [showModuleDropdown, setShowModuleDropdown] = useState(false);
  // V0.9.12: 分组展开控制
  const [defaultGroupExpanded, setDefaultGroupExpanded] = useState(true);
  const [defaultDataExpanded] = useState(false);

  // 初始化和订阅日志
  // 性能说明：回调只入缓冲区，每 100ms 批量 flush 一次 setState
  // 高频日志（批量处理、RAG 注入等场景）下渲染频率从每条一次降到每秒最多 10 次
  useEffect(() => {
    setLogs(Logger.getLogs());
    let timer: ReturnType<typeof setTimeout> | null = null;
    const pending: LogEntry[] = [];

    const flush = () => {
      timer = null;
      if (pending.length > 0) {
        setLogs((prev) => [...prev, ...pending.splice(0)]);
      }
    };

    const unsubscribe = Logger.subscribe((entry) => {
      pending.push(entry);
      if (timer === null) {
        timer = setTimeout(flush, LOG_BATCH_INTERVAL_MS);
      }
    });

    return () => {
      if (timer !== null) {
        clearTimeout(timer);
      }
      unsubscribe();
    };
  }, []);

  // 过滤日志：改为 useMemo 派生，替代原先的 useEffect + 中间 state（消除双重渲染）
  const filteredLogs = useMemo(() => {
    let result = logs;
    if (levelFilter !== -1) {
      result = result.filter((log) => log.level >= levelFilter);
    }
    if (moduleFilter !== 'ALL') {
      result = result.filter((log) => log.module.startsWith(moduleFilter));
    }
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (log) =>
          log.message.toLowerCase().includes(query) || log.module.toLowerCase().includes(query)
      );
    }
    return result;
  }, [logs, levelFilter, moduleFilter, searchQuery]);

  // V0.9.12: 将日志按模块分组
  const logGroups = useMemo(() => {
    return groupLogsByModule(filteredLogs);
  }, [filteredLogs]);

  // 分组 + 折叠状态 → 虚拟化列表行
  const rows = useMemo(() => {
    const out: LogRow[] = [];
    for (const group of logGroups) {
      const isSingle = group.length === 1;
      const isExpanded = isSingle || defaultGroupExpanded;

      // 单条日志沿用原行为：直接显示条目，不渲染分组头
      if (!isSingle) {
        out.push({ kind: 'header', summary: summarizeLogGroup(group) });
      }
      if (isExpanded) {
        for (const entry of group) {
          out.push({ kind: 'entry', entry, indent: !isSingle });
        }
      }
    }
    return out;
  }, [logGroups, defaultGroupExpanded]);

  const handleClear = useCallback(() => {
    Logger.clear();
    setLogs([]);
  }, []);

  const handleExport = useCallback(() => {
    const markdown = Logger.exportToMarkdown();
    const filename = Logger.getExportFilename();
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    Logger.success('DevLog', `日志已导出: ${filename}`);
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* 页面标题 - 统一样式 */}
      {/* 页面标题 - 统一样式 */}
      <PageTitle
        breadcrumbs={['开发日志']}
        title={currentInfo.title}
        subtitle={currentInfo.subtitle}
        className="mb-2"
      />

      {/* Tab 切换 - 使用 LayoutTabs */}
      <LayoutTabs
        tabs={TABS}
        activeTab={activeTab}
        onChange={(id: string) => setActiveTab(id as TabType)}
      />

      {/* ========== 运行日志 Tab ========== */}
      {activeTab === 'runtime' && (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* 工具栏 - sticky (Level 2, now top-0 because tabs are in header) */}
          <div className="bg-background/95 sticky top-0 z-10 -mx-4 border-b border-border px-4 py-3 backdrop-blur-sm md:-mx-8 md:px-8 lg:-mx-12 lg:px-12">
            <div className="flex flex-wrap items-center gap-2">
              {/* 级别过滤 */}
              <div className="relative">
                <button
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => setShowLevelDropdown(!showLevelDropdown)}
                >
                  {levelFilter === -1 ? '全部级别' : LogLevelConfig[levelFilter].label}
                  <ChevronDown size={12} />
                </button>
                {showLevelDropdown && (
                  <div className="absolute left-0 top-full z-20 mt-1 flex min-w-[100px] flex-col rounded-md border border-border bg-popover py-1 shadow-lg">
                    <button
                      className="block w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent"
                      onClick={() => {
                        setLevelFilter(-1);
                        setShowLevelDropdown(false);
                      }}
                    >
                      全部级别
                    </button>
                    {Object.entries(LogLevelConfig).map(([level, config]) => (
                      <button
                        key={level}
                        className="block w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent"
                        onClick={() => {
                          setLevelFilter(Number(level) as LogLevel);
                          setShowLevelDropdown(false);
                        }}
                      >
                        {config.icon} {config.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 分隔线 */}
              <div className="h-4 w-px bg-border" />

              {/* 模块过滤 */}
              <div className="relative">
                <button
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => setShowModuleDropdown(!showModuleDropdown)}
                >
                  {moduleFilter}
                  <ChevronDown size={12} />
                </button>
                {showModuleDropdown && (
                  <div className="absolute left-0 top-full z-20 mt-1 flex max-h-48 min-w-[120px] flex-col overflow-y-auto rounded-md border border-border bg-popover py-1 shadow-lg">
                    {MODULES.map((mod) => (
                      <button
                        key={mod}
                        className="block w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent"
                        onClick={() => {
                          setModuleFilter(mod);
                          setShowModuleDropdown(false);
                        }}
                      >
                        {mod}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 分隔线 */}
              <div className="h-4 w-px bg-border" />

              {/* 搜索框 */}
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Search size={12} />
                <input
                  type="text"
                  placeholder="搜索日志..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-24 border-none bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground md:w-40"
                />
              </div>

              {/* 右侧操作 */}
              <div className="ml-auto flex items-center gap-1">
                {/* V0.9.12: 分组展开控制 */}
                <button
                  className={`rounded p-1.5 transition-colors ${defaultGroupExpanded ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                  onClick={() => setDefaultGroupExpanded(!defaultGroupExpanded)}
                  title={defaultGroupExpanded ? '折叠所有分组' : '展开所有分组'}
                >
                  {defaultGroupExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                </button>
                <button
                  className={`rounded p-1.5 transition-colors ${autoScroll ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                  onClick={() => setAutoScroll(!autoScroll)}
                  title="自动滚动"
                >
                  <ArrowDownToLine size={14} />
                </button>
                <button
                  className="rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                  onClick={handleClear}
                  title="清空"
                >
                  <Trash2 size={14} />
                </button>
                <button
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  onClick={handleExport}
                >
                  <Download size={12} />
                  导出
                </button>
              </div>
            </div>
          </div>

          {/* 日志内容区 - 无边框 */}
          {/* 性能说明：Virtuoso 虚拟化渲染，只挂载可视区域内的行 */}
          <div className="min-h-0 flex-1 py-2 font-mono text-xs leading-relaxed">
            {filteredLogs.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
                <Terminal size={32} strokeWidth={1} className="opacity-30" />
                <p className="text-sm font-light">暂无日志记录</p>
              </div>
            ) : (
              <Virtuoso
                className="min-h-0 flex-1"
                style={{ height: '100%' }}
                data={rows}
                computeItemKey={(index, row) =>
                  row.kind === 'header' ? `header-${row.summary.first.id}` : row.entry.id
                }
                followOutput={autoScroll ? (isAtBottom) => (isAtBottom ? 'smooth' : false) : false}
                itemContent={(index, row) => {
                  if (row.kind === 'header') {
                    return (
                      <LogGroupHeader
                        summary={row.summary}
                        expanded={defaultGroupExpanded}
                        onToggle={() => setDefaultGroupExpanded(!defaultGroupExpanded)}
                      />
                    );
                  }

                  const item = (
                    <LogEntryItem entry={row.entry} defaultExpanded={defaultDataExpanded} />
                  );
                  // 分组内条目带缩进边线，保持 Docker 风格视觉
                  return row.indent ? (
                    <div className="ml-4 border-l border-zinc-800 pl-2">{item}</div>
                  ) : (
                    item
                  );
                }}
              />
            )}
          </div>

          {/* 状态栏 - 简化 */}
          <div className="border-t border-border py-2 text-[10px] text-muted-foreground">
            {logs.length} 条日志
            {filteredLogs.length !== logs.length && ` · ${filteredLogs.length} 条匹配`}
          </div>
        </div>
      )}

      {/* ========== 模型日志 Tab ========== */}
      {activeTab === 'model' && (
        <div className="flex-1 overflow-hidden">
          <ModelLog />
        </div>
      )}

      {/* ========== 召回日志 Tab ========== */}
      {activeTab === 'recall' && (
        <div className="flex-1 overflow-hidden">
          <RecallLog />
        </div>
      )}
    </div>
  );
};
