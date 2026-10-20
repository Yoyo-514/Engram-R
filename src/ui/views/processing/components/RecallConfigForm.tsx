import { AlertTriangle, Database, Layers, Network, Search, Sparkles, Zap } from 'lucide-react';
import type { FC } from 'react';

import type { RecallConfig, RerankConfig } from '@/types/rag';
import { Switch } from '@/ui/components/core/Switch';
import { NumberField } from '@/ui/components/form/FormComponents';

interface RecallConfigFormProps {
  config: RecallConfig;
  onChange: (config: RecallConfig) => void;
  /** Rerank 配置（用于业务参数） */
  rerankConfig?: RerankConfig;
  onRerankChange?: (config: RerankConfig) => void;
}

export const RecallConfigForm: FC<RecallConfigFormProps> = ({ config, onChange }) => {
  const updateConfig = (updates: Partial<RecallConfig>) => {
    onChange({ ...config, ...updates });
  };

  const keywordMode = config.useKeywordRecall && !config.useEmbedding;

  return (
    <div className="animate-in fade-in slide-in-from-right-4 space-y-6 duration-500">
      <div className="rounded-lg border border-border/50 bg-secondary/20 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`rounded-md p-2 ${config.enabled ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}
            >
              <Network size={20} />
            </div>
            <div>
              <div className="font-medium">启用 RAG 召回系统</div>
              <div className="text-xs text-muted-foreground">即使未启用，配置也会被保存</div>
            </div>
          </div>
          <Switch checked={config.enabled} onChange={(val) => updateConfig({ enabled: val })} />
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="px-1 text-sm font-medium uppercase tracking-wider text-muted-foreground">
          召回策略配置
        </h3>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div
            className={`rounded-lg border p-4 transition-all ${config.useKeywordRecall ? 'border-primary/30 bg-primary/5' : 'border-border/50 bg-card hover:border-border'}`}
          >
            <div className="mb-2 flex items-start justify-between">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Search
                  size={16}
                  className={config.useKeywordRecall ? 'text-primary' : 'text-muted-foreground'}
                />
                关键词召回 (Keyword)
              </div>
              <Switch
                checked={config.useKeywordRecall ?? true}
                onChange={(val) => updateConfig({ useKeywordRecall: val })}
              />
            </div>
            <p className="text-xs italic leading-relaxed text-muted-foreground">
              基于 Trigger Keywords 和元数据进行正则扫描，
              <span className="font-medium text-amber-500/80">零 Token 消耗</span>。
            </p>
            {config.useKeywordRecall && (
              <div className="mt-3 grid grid-cols-2 gap-4 border-t border-primary/10 pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium uppercase tracking-tight text-muted-foreground">
                    检索实体
                  </span>
                  <Switch
                    checked={config.enableEntityKeyword ?? true}
                    onChange={(val) => updateConfig({ enableEntityKeyword: val })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium uppercase tracking-tight text-muted-foreground">
                    检索事件
                  </span>
                  <Switch
                    checked={config.enableEventKeyword ?? true}
                    onChange={(val) => updateConfig({ enableEventKeyword: val })}
                  />
                </div>
              </div>
            )}
            {config.useKeywordRecall &&
              !config.enableEntityKeyword &&
              !config.enableEventKeyword && (
                <p className="mt-2 flex items-center gap-1 text-[10px] text-yellow-500">
                  <AlertTriangle size={10} /> 关键词已开启但无生效项目
                </p>
              )}
            {keywordMode && (config.enableEntityKeyword || config.enableEventKeyword) && (
              <p className="mt-2 flex items-center gap-1 text-[10px] text-primary">
                <Zap size={10} /> 当前处于纯 0 消耗模式
              </p>
            )}
          </div>

          <div
            className={`rounded-lg border p-4 transition-all ${config.useEmbedding ? 'border-primary/30 bg-primary/5' : 'border-border/50 bg-card hover:border-border'}`}
          >
            <div className="mb-2 flex items-start justify-between">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Database
                  size={16}
                  className={config.useEmbedding ? 'text-primary' : 'text-muted-foreground'}
                />
                向量检索 (Embedding)
              </div>
              <Switch
                checked={config.useEmbedding}
                onChange={(val) => updateConfig({ useEmbedding: val })}
              />
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              使用语义向量匹配历史事件，RAG 的核心能力。产生 Token 消耗。
            </p>
          </div>

          <div
            className={`rounded-lg border p-4 transition-all ${config.useRerank ? 'border-primary/30 bg-primary/5' : 'border-border/50 bg-card hover:border-border'}`}
          >
            <div className="mb-2 flex items-start justify-between">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Layers
                  size={16}
                  className={config.useRerank ? 'text-primary' : 'text-muted-foreground'}
                />
                Rerank 重排序
              </div>
              <Switch
                checked={config.useRerank}
                disabled={!config.useEmbedding}
                onChange={(val) => updateConfig({ useRerank: val })}
              />
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              对初筛结果进行二次精排。产生 Token 消耗。
              {!config.useEmbedding && (
                <span className="mt-1 flex items-center gap-1 text-[10px] text-yellow-500">
                  <AlertTriangle size={10} /> 需要先启用向量检索
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3">
        <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-amber-500/90">
          <Sparkles size={12} className="mt-0.5 shrink-0" />
          <span>
            💡 <strong>提示：</strong>实体（NPC/地点）召回基于触发词 (Trigger Keywords)
            的关键词扫描和关系链关联，在极低消耗下保持一致性。
          </span>
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 border-t border-border/30 pt-4 md:grid-cols-2">
        <NumberField
          label="初筛数量 (Top-K)"
          description="从向量数据库中检索的候选数量"
          min={1}
          max={100}
          value={config.embedding?.topK ?? 20}
          onChange={(val) =>
            updateConfig({
              embedding: {
                topK: val,
                minScoreThreshold: config.embedding?.minScoreThreshold ?? 0.3,
              },
            })
          }
        />

        <NumberField
          label="相似度阈值"
          description="过滤相关性过低的结果 (0.0 - 1.0)"
          min={0}
          max={1}
          step={0.05}
          value={config.embedding?.minScoreThreshold ?? 0.3}
          onChange={(val) =>
            updateConfig({
              embedding: {
                topK: config.embedding?.topK ?? 20,
                minScoreThreshold: val,
              },
            })
          }
        />
      </div>
    </div>
  );
};
