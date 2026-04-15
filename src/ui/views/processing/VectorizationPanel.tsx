import { AlertCircle, CheckCircle2, Loader2, Play, RefreshCw, Square } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { FC } from 'react';

import { embeddingService } from '@/modules/rag';
/**
 * VectorizationPanel - 向量化面板组件
 *
 * 应用「无框流体」设计语言
 * 功能：
 * - 显示嵌入统计
 * - 批量嵌入控制
 * - 进度显示
 */
import type { EmbeddingConfig, VectorConfig } from '@/types/rag';
import {
  NumberField,
  SelectField,
  SwitchField,
  TextField,
} from '@/ui/components/form/FormComponents';
import { Divider } from '@/ui/components/layout/Divider';

// ==================== 类型 ====================

interface EmbeddingStats {
  total: number;
  embedded: number;
  pending: number;
}

interface EmbeddingProgress {
  current: number;
  total: number;
  errors: number;
}

// ==================== 组件 ====================

// ==================== 组件 ====================

interface VectorizationPanelProps {
  config: EmbeddingConfig;
  vectorConfig: VectorConfig;
  onConfigChange: (updates: Partial<EmbeddingConfig>) => void;
}

export const VectorizationPanel: FC<VectorizationPanelProps> = ({
  config,
  vectorConfig,
  onConfigChange,
}) => {
  // 状态
  const [stats, setStats] = useState<EmbeddingStats>({ total: 0, embedded: 0, pending: 0 });
  const [progress, setProgress] = useState<EmbeddingProgress | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ success: number; failed: number } | null>(null);
  const [rangeStart, setRangeStart] = useState<string>('');
  const [rangeEnd, setRangeEnd] = useState<string>('');

  // 加载初始数据
  useEffect(() => {
    void loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      // 获取统计
      const newStats = await embeddingService.getEmbeddingStats();
      setStats(newStats);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  // 刷新统计
  const refreshStats = useCallback(async () => {
    const newStats = await embeddingService.getEmbeddingStats();
    setStats(newStats);
  }, []);

  // 开始嵌入
  const handleStartEmbedding = async () => {
    if (!vectorConfig) {
      setError('请先配置向量化服务');
      return;
    }

    setIsProcessing(true);
    setProgress({ current: 0, total: stats.pending, errors: 0 });
    setError(null);
    setLastResult(null);

    try {
      embeddingService.setConfig(vectorConfig);
      embeddingService.setConcurrency(config.concurrency);

      const range = {
        start: rangeStart ? parseInt(rangeStart, 10) : undefined,
        end: rangeEnd ? parseInt(rangeEnd, 10) : undefined,
      };

      const result = await embeddingService.embedUnprocessedEvents((current, total, errors) => {
        setProgress({ current, total, errors });
      }, range);

      setLastResult(result);
      await refreshStats();
    } catch (e) {
      setError(e instanceof Error ? e.message : '嵌入失败');
    } finally {
      setIsProcessing(false);
      setProgress(null);
    }
  };

  // 停止嵌入
  const handleStopEmbedding = () => {
    embeddingService.stop();
  };

  // 重新嵌入所有
  const handleReembedAll = async () => {
    if (!vectorConfig) {
      setError('请先配置向量化服务');
      return;
    }

    if (!confirm('确定要重新嵌入所有事件吗？这将清除现有嵌入并重新生成。')) {
      return;
    }

    setIsProcessing(true);
    setProgress({ current: 0, total: stats.total, errors: 0 });
    setError(null);
    setLastResult(null);

    try {
      embeddingService.setConfig(vectorConfig);
      embeddingService.setConcurrency(config.concurrency);

      const range = {
        start: rangeStart ? parseInt(rangeStart, 10) : undefined,
        end: rangeEnd ? parseInt(rangeEnd, 10) : undefined,
      };

      const result = await embeddingService.reembedAllEvents((current, total, errors) => {
        setProgress({ current, total, errors });
      }, range);

      setLastResult(result);
      await refreshStats();
    } catch (e) {
      setError(e instanceof Error ? e.message : '重新嵌入失败');
    } finally {
      setIsProcessing(false);
      setProgress(null);
    }
  };

  // 计算进度百分比
  const progressPercent = progress
    ? progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : 0
    : 0;

  // 检查向量配置是否有效
  const isVectorConfigValid =
    vectorConfig && (vectorConfig.source === 'transformers' || vectorConfig.model);

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center gap-2 text-muted-foreground">
        <Loader2 size={20} className="animate-spin" />
        <span className="text-sm font-light">加载中...</span>
      </div>
    );
  }

  return (
    <div className="py-4">
      {/* 统计信息 */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">总事件</span>
          <span className="text-2xl font-light">{stats.total}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">已嵌入</span>
          <span className="text-2xl font-light text-primary">{stats.embedded}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">待处理</span>
          <span className="text-2xl font-light text-warning">{stats.pending}</span>
        </div>
      </div>

      {/* 进度条 */}
      {progress && (
        <div className="bg-muted/30 mb-6 rounded-lg p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              嵌入进度 {progress.current}/{progress.total}
            </span>
            <span className="text-sm font-medium">{progressPercent}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          {progress.errors > 0 && (
            <p className="mt-2 text-xs text-destructive">{progress.errors} 个错误</p>
          )}
        </div>
      )}

      {/* 结果提示 */}
      {lastResult && (
        <div
          className={`mb-6 flex items-center gap-2 rounded-lg p-3 ${
            lastResult.failed > 0 ? 'bg-warning/10 text-warning' : 'bg-primary/10 text-primary'
          }`}
        >
          {lastResult.failed > 0 ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
          <span className="text-sm">
            完成：{lastResult.success} 成功
            {lastResult.failed > 0 && `，${lastResult.failed} 失败`}
          </span>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="bg-destructive/10 mb-6 flex items-center gap-2 rounded-lg p-3 text-destructive">
          <AlertCircle size={16} />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* 向量配置状态 */}
      {!isVectorConfigValid && (
        <div className="bg-muted/50 mb-6 rounded-lg p-3">
          <p className="text-sm text-muted-foreground">
            请在
            <span className="mx-1 text-primary">API 配置 → 模型配置 → 向量化</span>
            中设置向量化服务
          </p>
        </div>
      )}

      {/* 范围选择 */}
      <div className="mb-6 grid grid-cols-2 gap-4">
        <TextField
          label="起始消息序号"
          value={rangeStart}
          onChange={setRangeStart}
          placeholder="可选..."
          type="number"
          description="仅供单独/重新嵌入时过滤范围使用，留空表示不限制"
        />
        <TextField
          label="结束消息序号"
          value={rangeEnd}
          onChange={setRangeEnd}
          placeholder="可选..."
          type="number"
          description="仅供单独/重新嵌入时过滤范围使用，留空表示不限制"
        />
      </div>

      {/* 操作按钮 */}
      <div className="mb-6 flex flex-wrap gap-3">
        {isProcessing ? (
          <button
            onClick={handleStopEmbedding}
            className="hover:bg-destructive/90 inline-flex items-center gap-2 rounded-md bg-destructive px-4 py-2 text-destructive-foreground transition-colors"
          >
            <Square size={16} />
            停止
          </button>
        ) : (
          <>
            <button
              onClick={handleStartEmbedding}
              disabled={stats.pending === 0 || !isVectorConfigValid}
              className="hover:bg-primary/90 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-primary-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Play size={16} />
              嵌入未处理 ({stats.pending})
            </button>
            <button
              onClick={handleReembedAll}
              disabled={stats.total === 0 || !isVectorConfigValid}
              className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw size={16} />
              重新嵌入所有
            </button>
            <button
              onClick={() => {
                void refreshStats();
              }}
              className="inline-flex items-center gap-2 px-3 py-2 text-muted-foreground transition-colors hover:text-foreground"
            >
              <RefreshCw size={16} />
            </button>
          </>
        )}
      </div>

      <Divider className="my-6" />

      {/* 配置区域 */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          嵌入设置
        </h3>

        <SwitchField
          label="启用自动嵌入"
          checked={config.enabled}
          onChange={(checked) => onConfigChange({ enabled: checked })}
          description="触发条件满足时自动嵌入"
        />

        <SelectField
          label="触发模式"
          value={config.trigger}
          onChange={(value) => onConfigChange({ trigger: value as EmbeddingConfig['trigger'] })}
          options={[
            { value: 'with_trim', label: '与 Trim 联动' },
            { value: 'standalone', label: '独立触发' },
            { value: 'manual', label: '仅手动' },
          ]}
          description="with_trim: Trim 时自动嵌入 | standalone: 使用相同阈值独立触发"
        />

        <NumberField
          label="并发数"
          value={config.concurrency}
          onChange={(value) => onConfigChange({ concurrency: Math.max(1, Math.min(20, value)) })}
          min={1}
          max={20}
          description="同时处理的嵌入请求数 (1-20)"
        />

        {vectorConfig && (
          <div className="bg-muted/30 rounded-lg p-3">
            <p className="mb-1 text-xs text-muted-foreground">当前向量配置</p>
            <p className="text-sm">
              <span className="text-primary">{vectorConfig.source}</span>
              {vectorConfig.model && (
                <span className="ml-2 text-muted-foreground">/ {vectorConfig.model}</span>
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
