/**
 * RecallLog - 召回日志可视化组件
 *
 * 采用 Master-Detail 布局（参考 MemoryStream）：
 * - 左侧：召回日志列表
 * - 右侧：详情面板（召回结果、分数、过滤）
 * - 移动端：全屏详情
 */

import { motion } from 'framer-motion';
import {
  ArrowLeft,
  ChevronRight,
  Clock,
  Database,
  Filter,
  Search,
  Target,
  Trash2,
  Zap,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { FC } from 'react';

import { RecallLogService } from '@/core/logger/RecallLogger';
import type { RecallLogEntry, RecallResultItem } from '@/types/recall_log';

// 响应式断点
const DESKTOP_BREAKPOINT = 768;

/** 格式化时间 */
const formatTime = (timestamp: number): string => {
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

/** 格式化耗时 */
const formatDuration = (ms?: number): string => {
  if (ms === undefined) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};

// ==================== 列表项组件 ====================

interface LogListItemProps {
  entry: RecallLogEntry;
  isSelected: boolean;
  onSelect: () => void;
}

const LogListItem: FC<LogListItemProps> = ({ entry, isSelected, onSelect }) => {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
      transition={{ duration: 0.3 }}
      className={`border-border/30 cursor-pointer border-b px-3 py-2 transition-colors ${isSelected ? 'bg-primary/10 border-l-2 border-l-primary' : 'hover:bg-muted/30'} `}
      onClick={onSelect}
    >
      {/* 头部：标签 + 时间 */}
      <div className="mb-1 flex items-center gap-2">
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
            entry.mode === 'agentic'
              ? 'bg-amber-500/20 text-amber-400'
              : entry.mode === 'hybrid'
                ? 'bg-purple-500/20 text-purple-400'
                : 'bg-blue-500/20 text-blue-400'
          }`}
        >
          {entry.mode === 'agentic' ? 'Agentic' : entry.mode === 'hybrid' ? '混合' : '向量'}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {entry.stats.rerankCount}/{entry.stats.topKCount} 条
        </span>
        <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
          <Clock size={10} />
          {formatTime(entry.timestamp)}
        </span>
      </div>

      {/* 查询预览 */}
      <div className="group/query relative">
        <p
          className={`text-foreground/90 whitespace-pre-wrap break-words text-sm transition-all duration-300 ${isSelected ? '' : 'line-clamp-3'}`}
        >
          {entry.query}
        </p>
        {!isSelected && entry.query.length > 100 && (
          <div className="bg-background/80 absolute bottom-0 right-0 px-1 text-[10px] text-primary opacity-0 transition-opacity group-hover/query:opacity-100">
            点击查看全部...
          </div>
        )}
      </div>

      {/* 耗时 */}
      <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
        <Zap size={10} />
        {formatDuration(entry.stats.latencyMs)}
      </div>
    </motion.div>
  );
};

// ==================== 详情面板组件 ====================

// 视图模式
type ViewMode = 'all' | 'topK' | 'reranked';

// 排序模式
type SortMode = 'embedding' | 'keyword' | 'rerank' | 'hybrid';

/** 分数条组件 */
const ScoreBar: FC<{
  label: string;
  score: number;
  color: string;
}> = ({ label, score, color }) => {
  const percentage = Math.min(100, score * 100);
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-16 shrink-0 text-muted-foreground">{label}</span>
      <div className="bg-muted/30 h-1.5 flex-1 overflow-hidden rounded-full">
        <div
          className={`h-full ${color} rounded-full transition-all duration-300`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="w-14 shrink-0 text-right font-mono text-muted-foreground">
        {score.toFixed(3)}
      </span>
    </div>
  );
};

/** 单条结果项 */
const ResultItem: FC<{ item: RecallResultItem }> = ({ item }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`border-border/30 hover:bg-muted/10 cursor-pointer border-b px-4 py-3 transition-colors ${item.isReranked ? 'bg-purple-500/5' : item.isTopK ? 'bg-blue-500/5' : ''} `}
      onClick={() => setExpanded(!expanded)}
    >
      {/* 徽章 */}
      <div className="mb-1.5 flex items-center gap-2">
        {item.isReranked && (
          <span className="rounded bg-purple-500/20 px-1.5 py-0.5 text-[10px] text-purple-400">
            Rerank
          </span>
        )}
        {item.isTopK && !item.isReranked && (
          <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] text-blue-400">
            TopK
          </span>
        )}
        {item.keywordScore != null && (
          <span className="rounded bg-green-500/20 px-1.5 py-0.5 text-[10px] text-green-400">
            Keyword
          </span>
        )}
        <span className="max-w-[150px] truncate text-[10px] text-muted-foreground">
          {item.category}
        </span>
        {item.sourceFloor && (
          <span className="text-[10px] text-muted-foreground">楼层 #{item.sourceFloor}</span>
        )}
        <ChevronRight
          size={12}
          className={`ml-auto text-muted-foreground transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
      </div>

      {/* 摘要 */}
      <p
        className={`text-foreground/90 whitespace-pre-wrap break-words text-sm ${expanded ? '' : 'line-clamp-2'}`}
      >
        {item.summary}
      </p>

      {/* 分数（展开时显示） */}
      {expanded && (
        <div className="border-border/20 mt-3 space-y-1.5 border-t pt-2">
          <ScoreBar label="Embedding" score={item.embeddingScore} color="bg-blue-500" />
          {item.keywordScore != null && (
            <ScoreBar label="Keyword" score={item.keywordScore} color="bg-green-500" />
          )}
          {item.rerankScore != null && (
            <ScoreBar label="Rerank" score={item.rerankScore} color="bg-orange-500" />
          )}
          {item.hybridScore != null && (
            <ScoreBar label="Hybrid" score={item.hybridScore} color="bg-purple-500" />
          )}
          {item.reason && (
            <div className="mt-2 text-xs italic text-muted-foreground">💬 {item.reason}</div>
          )}
        </div>
      )}
    </div>
  );
};

interface DetailPanelProps {
  entry: RecallLogEntry | null;
  isFullScreen?: boolean;
  onClose?: () => void;
}

const DetailPanel: FC<DetailPanelProps> = ({ entry, isFullScreen, onClose }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [sortMode, setSortMode] = useState<SortMode>('hybrid');
  const [searchQuery, setSearchQuery] = useState('');

  // 过滤和排序结果
  const displayedResults = useMemo(() => {
    if (!entry) return [];

    let results = [...entry.results];

    // 搜索过滤
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      results = results.filter((r) => r.summary.toLowerCase().includes(q));
    }

    // 按视图模式过滤
    if (viewMode === 'topK') {
      // Show items that are marked as TopK (whether reranked or not)
      results = results.filter((r) => r.isTopK === true);
    } else if (viewMode === 'reranked') {
      // Show items that successfully passed reranking
      results = results.filter((r) => r.isReranked === true);
    }

    // 按分数排序
    results.sort((a, b) => {
      const getScore = (item: RecallResultItem) => {
        switch (sortMode) {
          case 'embedding':
            return item.embeddingScore;
          case 'keyword':
            return item.keywordScore ?? 0;
          case 'rerank':
            return item.rerankScore ?? 0;
          case 'hybrid':
            return item.hybridScore ?? Math.max(item.embeddingScore, item.keywordScore ?? 0);
        }
      };
      return getScore(b) - getScore(a);
    });

    return results;
  }, [entry, viewMode, sortMode, searchQuery]);

  if (!entry) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <Target size={32} className="opacity-30" />
        <p className="text-sm font-light">选择一条召回日志查看详情</p>
      </div>
    );
  }

  return (
    <div className={`flex h-full flex-col ${isFullScreen ? 'p-4' : ''}`}>
      {/* 移动端返回按钮 */}
      {isFullScreen && onClose && (
        <button
          onClick={onClose}
          className="mb-4 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={16} />
          返回列表
        </button>
      )}

      {/* 头部信息 */}
      <div className="mb-4 shrink-0 border-b border-border pb-4">
        <div className="mb-2 flex items-center gap-2">
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${
              entry.mode === 'agentic'
                ? 'bg-amber-500/20 text-amber-400'
                : entry.mode === 'hybrid'
                  ? 'bg-purple-500/20 text-purple-400'
                  : 'bg-blue-500/20 text-blue-400'
            }`}
          >
            {entry.mode === 'agentic'
              ? 'Agentic 召回'
              : entry.mode === 'hybrid'
                ? '混合召回'
                : '向量召回'}
          </span>
          <span className="text-xs text-muted-foreground">{formatTime(entry.timestamp)}</span>
        </div>

        <p className="text-foreground/90 mb-2 whitespace-pre-wrap break-words text-sm">
          {entry.query}
        </p>

        {entry.preprocessedQuery && entry.preprocessedQuery !== entry.query && (
          <p className="text-xs text-muted-foreground">→ 预处理: {entry.preprocessedQuery}</p>
        )}

        {/* 统计 */}
        <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
          <span>候选: {entry.stats.totalCandidates}</span>
          <span>TopK: {entry.stats.topKCount}</span>
          <span>Rerank: {entry.stats.rerankCount}</span>
          <span className="flex items-center gap-1">
            <Zap size={10} />
            {formatDuration(entry.stats.latencyMs)}
          </span>
        </div>

        {/* V1.3.1: 类脑召回详情 */}
        {entry.brainStats && (
          <div className="border-border/30 mt-4 border-t pt-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs font-medium text-foreground">类脑状态</span>
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                第 {entry.brainStats.round} 轮
              </span>
            </div>

            <div className="bg-muted/20 border-border/30 overflow-hidden rounded border">
              <table className="w-full text-left text-[10px]">
                <thead className="bg-muted/30 text-muted-foreground">
                  <tr>
                    <th className="p-1.5 font-medium">Event</th>
                    <th className="p-1.5 font-medium">Tier</th>
                    <th className="p-1.5 text-right font-medium">Score</th>
                    <th className="p-1.5 text-right font-medium">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {entry.brainStats.snapshot.map((slot) => (
                    <tr
                      key={slot.id}
                      className="border-border/10 hover:bg-muted/20 border-t transition-colors"
                    >
                      <td className="max-w-[80px] truncate p-1.5" title={slot.id}>
                        {slot.label || slot.id.slice(0, 8)}
                      </td>
                      <td className="p-1.5">
                        <span
                          className={`rounded px-1 ${slot.tier === 'working' ? 'bg-green-500/10 text-green-500' : 'text-muted-foreground'}`}
                        >
                          {slot.tier === 'working' ? 'WM' : 'STM'}
                        </span>
                      </td>
                      <td className="p-1.5 text-right font-mono">{slot.finalScore.toFixed(3)}</td>
                      <td className="p-1.5 text-right font-mono">{slot.recallCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {entry.brainStats.snapshot.length === 0 && (
                <div className="p-2 text-center text-[10px] italic text-muted-foreground">
                  短期记忆为空
                </div>
              )}
            </div>
          </div>
        )}

        {/* V1.4: 被激活的实体 */}
        {entry.recalledEntities && entry.recalledEntities.length > 0 && (
          <div className="border-border/30 mt-4 border-t pt-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs font-medium text-foreground">已唤醒实体</span>
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {entry.recalledEntities.length}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {entry.recalledEntities.map((ent: any) => (
                <div key={ent.id} className="group relative">
                  <div className="bg-primary/10 border-primary/20 hover:bg-primary/20 flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] text-primary transition-colors">
                    <Database size={10} />
                    {ent.name}
                    {ent._recallWeight && (
                      <span className="font-mono opacity-60">({ent._recallWeight.toFixed(2)})</span>
                    )}
                  </div>
                  <div className="text-foreground/80 pointer-events-none absolute bottom-full left-0 z-50 mb-2 hidden w-48 rounded-lg border border-border bg-popover p-2 text-[10px] leading-relaxed shadow-xl group-hover:block">
                    <div className="mb-1 font-bold">
                      {ent.name} ({ent.type || '未知'})
                    </div>
                    <div className="line-clamp-4">{ent.description || '无描述'}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 过滤和排序工具栏 */}
      <div className="mb-3 flex shrink-0 flex-wrap items-center gap-3">
        {/* 视图模式 */}
        <div className="flex items-center gap-1 text-xs">
          <Filter size={12} className="text-muted-foreground" />
          {(['all', 'topK', 'reranked'] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              className={`rounded px-2 py-1 transition-colors ${
                viewMode === mode
                  ? 'bg-primary/20 text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setViewMode(mode)}
            >
              {mode === 'all' ? '全部' : mode === 'topK' ? 'TopK' : 'Reranked'}
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-border" />

        {/* 排序模式 */}
        <div className="flex items-center gap-1 text-xs">
          {(['hybrid', 'keyword', 'embedding', 'rerank'] as SortMode[]).map((mode) => (
            <button
              key={mode}
              className={`rounded px-2 py-1 transition-colors ${
                sortMode === mode
                  ? 'bg-primary/20 text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setSortMode(mode)}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-border" />

        {/* 搜索 */}
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Search size={12} />
          <input
            type="text"
            placeholder="搜索结果..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-24 border-none bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {/* 结果列表 */}
      <div className="-mx-4 flex-1 overflow-y-auto md:mx-0">
        {displayedResults.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">无匹配结果</div>
        ) : (
          <div className="flex flex-col">
            {displayedResults.map((item, index) => (
              <ResultItem key={index} item={item} />
            ))}
          </div>
        )}
      </div>

      {/* 状态栏 */}
      <div className="mt-2 shrink-0 border-t border-border py-2 text-[10px] text-muted-foreground">
        显示 {displayedResults.length} / {entry.results.length} 条结果
      </div>
    </div>
  );
};

// ==================== RecallLog 主组件 ====================
export const RecallLog: FC = () => {
  const [logs, setLogs] = useState<RecallLogEntry[]>(RecallLogService.getLogs());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < DESKTOP_BREAKPOINT);
  const [showDetail, setShowDetail] = useState(false);

  // 响应式检测
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < DESKTOP_BREAKPOINT);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 订阅日志更新
  useEffect(() => {
    const unsubscribe = RecallLogService.subscribe((newLogs) => {
      setLogs(newLogs);
    });
    return unsubscribe;
  }, []);

  // 选中的日志
  const selectedEntry = useMemo(() => {
    return logs.find((l) => l.id === selectedId) || null;
  }, [logs, selectedId]);

  // 选择日志
  const handleSelect = (id: string) => {
    setSelectedId(id);
    if (isMobile) {
      setShowDetail(true);
    }
  };

  // 关闭详情
  const handleCloseDetail = () => {
    setShowDetail(false);
    if (isMobile) {
      setSelectedId(null);
    }
  };

  // 移动端全屏详情
  if (isMobile && showDetail && selectedEntry) {
    return <DetailPanel entry={selectedEntry} isFullScreen={true} onClose={handleCloseDetail} />;
  }

  return (
    <div className="flex h-full flex-col">
      {/* 头部 */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Target size={16} className="text-primary" />
          <span className="font-medium text-foreground">召回日志</span>
          <span className="text-xs text-muted-foreground">({logs.length})</span>
        </div>
        <button
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:text-destructive"
          onClick={() => RecallLogService.clear()}
          title="清除日志"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* 主内容区 - Master-Detail 布局 */}
      <div className="flex min-h-0 flex-1">
        {/* 左侧：日志列表 */}
        <div
          className={` ${isMobile ? 'w-full' : 'w-[30%] min-w-[240px]'} overflow-y-auto ${!isMobile ? 'border-border/50 border-r' : ''} `}
        >
          {logs.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-muted-foreground">
              <Database size={32} className="opacity-30" />
              <p className="text-sm font-light">暂无召回记录</p>
              <p className="text-xs opacity-70">触发 RAG 召回后显示</p>
            </div>
          ) : (
            <div className="flex flex-col pb-4">
              {logs.map((entry) => (
                <LogListItem
                  key={entry.id}
                  entry={entry}
                  isSelected={entry.id === selectedId}
                  onSelect={() => handleSelect(entry.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* 右侧：详情面板 */}
        {!isMobile && (
          <div className="flex-1 overflow-y-auto p-4">
            <DetailPanel entry={selectedEntry} />
          </div>
        )}
      </div>
    </div>
  );
};
