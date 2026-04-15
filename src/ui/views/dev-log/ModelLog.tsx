import {
  AlertCircle,
  Bot,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  Loader2,
  Send,
  Trash2,
  XCircle,
  Zap,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FC } from 'react';

/**
 * ModelLog - 模型日志可视化组件
 *
 * 伪聊天式布局展示 LLM 调用记录
 */
import { type ModelLogEntry, ModelLogger } from '@/core/logger/ModelLogger';
import { countWorldbookTokens } from '@/integrations/tavern';

/** 类型标签配置 */
const TYPE_LABELS: Record<ModelLogEntry['type'], { label: string; color: string }> = {
  summarize: { label: '总结', color: 'bg-blue-500/20 text-blue-400' },
  trim: { label: '修剪', color: 'bg-yellow-500/20 text-yellow-500' },
  vectorize: { label: '向量化', color: 'bg-purple-500/20 text-purple-400' },
  query: { label: '查询', color: 'bg-green-500/20 text-green-400' },
  entity_extraction: { label: '实体提取', color: 'bg-cyan-500/20 text-cyan-400' },
  other: { label: '其他', color: 'bg-gray-500/20 text-gray-400' },
};

/** 状态图标 */
const StatusIcon: FC<{ status: ModelLogEntry['status'] }> = ({ status }) => {
  switch (status) {
    case 'pending':
      return <Loader2 size={14} className="animate-spin text-yellow-400" />;
    case 'success':
      return <CheckCircle size={14} className="text-green-400" />;
    case 'error':
      return <AlertCircle size={14} className="text-red-400" />;
    case 'cancelled':
      return <XCircle size={14} className="text-orange-400" />;
  }
};

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

/** 单条日志卡片 */
const LogCard: FC<{
  sent: ModelLogEntry;
  received?: ModelLogEntry;
}> = ({ sent, received }) => {
  const [expanded, setExpanded] = useState(false);
  const [calcSentTokens, setCalcSentTokens] = useState<number | null>(null);
  const [calcRecvTokens, setCalcRecvTokens] = useState<number | null>(null);

  // 动态计算 Token
  useEffect(() => {
    if (!expanded) return;

    const countTokens = async () => {
      try {
        if (!sent.tokensSent && (sent.systemPrompt || sent.userPrompt)) {
          const t1 = sent.systemPrompt ? await countWorldbookTokens(sent.systemPrompt) : 0;
          const t2 = sent.userPrompt ? await countWorldbookTokens(sent.userPrompt) : 0;
          setCalcSentTokens(t1 + t2);
        }
        if (received?.response && !received.tokensReceived) {
          const t = await countWorldbookTokens(received.response);
          setCalcRecvTokens(t);
        }
      } catch (e) {
        console.warn('Failed to count tokens', e);
      }
    };
    void countTokens();
  }, [sent, received, expanded]);

  const typeConfig = TYPE_LABELS[sent.type];

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      {/* 头部 */}
      <div
        className="flex cursor-pointer items-center gap-2 bg-muted-20 px-3 py-2 hover:bg-muted-30"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${typeConfig.color}`}>
          {typeConfig.label}
        </span>

        {/* Model Badge */}
        {sent.model && (
          <span
            className="max-w-[150px] truncate rounded border border-indigo-500/20 bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-medium text-indigo-400"
            title={`模型: ${sent.model}`}
          >
            {sent.model}
          </span>
        )}

        {/* Character Badge */}
        {sent.character && (
          <span
            className="max-w-[120px] truncate rounded border border-orange-500/20 bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-medium text-orange-400"
            title={`角色: ${sent.character}`}
          >
            {sent.character.length > 8 ? sent.character.slice(0, 8) + '...' : sent.character}
          </span>
        )}
        <span className="text-xs text-muted-foreground">{formatTime(sent.timestamp)}</span>
        <StatusIcon status={received?.status || sent.status} />
        {sent.floorRange && (
          <span className="text-xs text-muted-foreground">
            楼层 #{sent.floorRange[0]}-{sent.floorRange[1]}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          <Clock size={12} />
          {formatDuration(received?.duration || sent.duration)}
        </span>
      </div>

      {/* 展开内容 */}
      {expanded && (
        <div className="flex flex-col md:flex-row">
          {/* 左侧：发送 */}
          <div className="min-w-0 flex-1 border-r border-border p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-blue-400">
              <Send size={14} />
              发送
              {(sent.tokensSent || calcSentTokens !== null) && (
                <span className="ml-auto text-xs text-muted-foreground">
                  ~{sent.tokensSent || calcSentTokens} tokens
                </span>
              )}
            </div>

            {sent.systemPrompt && (
              <div className="mb-3">
                <div className="mb-1 text-xs text-muted-foreground">System</div>
                <div className="max-h-[500px] overflow-y-auto whitespace-pre-wrap break-words rounded bg-muted-20 p-2 text-sm">
                  {sent.systemPrompt}
                </div>
              </div>
            )}

            {sent.userPrompt && (
              <div>
                <div className="mb-1 text-xs text-muted-foreground">User</div>
                <div className="max-h-[500px] overflow-y-auto whitespace-pre-wrap rounded bg-muted-20 p-2 text-sm">
                  {sent.userPrompt}
                </div>
              </div>
            )}
          </div>

          {/* 右侧：接收 */}
          <div className="min-w-0 flex-1 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-green-400">
              <Bot size={14} />
              接收
              {(received?.tokensReceived || calcRecvTokens !== null) && (
                <span className="ml-auto text-xs text-muted-foreground">
                  ~{received?.tokensReceived || calcRecvTokens} tokens
                </span>
              )}
            </div>

            {received?.status === 'error' && received.error && (
              <div className="rounded border border-red-500/30 bg-red-500/10 p-2 text-sm text-red-400">
                {received.error}
              </div>
            )}

            {received?.response && (
              <div className="max-h-[500px] overflow-y-auto whitespace-pre-wrap break-words rounded bg-muted-20 p-2 text-sm">
                {received.response}
              </div>
            )}

            {!received && sent.status === 'pending' && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 size={14} className="animate-spin" />
                等待响应...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/** ModelLog 主组件 */
export const ModelLog: FC = () => {
  const [logs, setLogs] = useState(ModelLogger.getPaired());

  useEffect(() => {
    const unsubscribe = ModelLogger.subscribe(() => {
      setLogs(ModelLogger.getPaired());
    });
    return unsubscribe;
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* 头部 */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Zap size={16} className="text-primary" />
          <span className="font-medium text-foreground">模型调用日志</span>
          <span className="text-xs text-muted-foreground">({logs.length})</span>
        </div>
        <button
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:text-destructive"
          onClick={() => ModelLogger.clear()}
          title="清除日志"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* 日志列表 */}
      <div className="flex-1 overflow-y-auto p-4">
        {logs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <Bot size={48} className="opacity-30" />
            <p className="text-sm">暂无模型调用记录</p>
            <p className="text-xs">触发总结或向量化后，调用记录将显示在这里</p>
          </div>
        ) : (
          <div className="flex h-full flex-col gap-3">
            {logs.map((log, index) => (
              <LogCard key={index} sent={log.sent} received={log.received} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
