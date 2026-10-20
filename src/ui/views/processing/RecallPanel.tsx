import { Database, History, Loader2, Play, Search, Zap } from 'lucide-react';
import { useState, type FC } from 'react';

import { scanEntities, scanEvents } from '@/modules/memory/EntityScanner';
import { retriever } from '@/modules/rag/retrieval/Retriever';
import { useMemoryStore } from '@/state/memoryStore';
import type { EntityNode, EventNode } from '@/types/graph';
import type { RecallCandidate, RecallConfig, RerankConfig } from '@/types/rag';
import { notificationService } from '@/ui/services/NotificationService';
import { RecallDecisionModal, type RecallPreviewItem } from '@/ui/views/review/RecallDecisionModal';

import { RecallConfigForm } from './components/RecallConfigForm';

interface RecallPanelProps {
  recallConfig: RecallConfig;
  rerankConfig: RerankConfig;
  onRecallConfigChange: (config: RecallConfig) => void;
  onRerankConfigChange: (config: RerankConfig) => void;
}

type PreviewCandidate = RecallCandidate & {
  hybridScore?: number;
};

const getPreviewCandidateScore = (candidate: PreviewCandidate): number => {
  if (typeof candidate.hybridScore === 'number') return candidate.hybridScore;
  if (typeof candidate.rerankScore === 'number') return candidate.rerankScore;
  return candidate.embeddingScore;
};

export const RecallPanel: FC<RecallPanelProps> = ({
  recallConfig,
  rerankConfig,
  onRecallConfigChange,
  onRerankConfigChange,
}) => {
  // --- 状态管理 ---
  const [testQuery, setTestQuery] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentRecalls, setCurrentRecalls] = useState<RecallPreviewItem[]>([]);
  const [currentEntities, setCurrentEntities] = useState<EntityNode[]>([]); // V1.4: 被激活实体状态

  // Scan Dry Run 专属状态
  const [scanQuery, setScanQuery] = useState('');
  const [matchedEntities, setMatchedEntities] = useState<EntityNode[]>([]);
  const [matchedEvents, setMatchedEvents] = useState<EventNode[]>([]);

  // --- 逻辑处理 ---

  /** 静态扫描 Dry Run：零消耗测试关键词/正则匹配 */
  const handleScanDryRun = async () => {
    if (!scanQuery.trim()) {
      setMatchedEntities([]);
      setMatchedEvents([]);
      return;
    }

    const store = useMemoryStore.getState();
    const entities = await store.getAllEntities();
    const events = await store.getAllEvents();

    // 执行扫描 (Level 0 事件才参与)
    const hitEntities = scanEntities(scanQuery, entities);
    const hitEvents = scanEvents(
      scanQuery,
      events.filter((e) => e.level === 0)
    );

    setMatchedEntities(hitEntities);
    setMatchedEvents(hitEvents);

    if (hitEntities.length === 0 && hitEvents.length === 0) {
      notificationService.warning('关键词扫描未命中任何实体或事件', 'Scan Dry Run');
    } else {
      notificationService.success(
        `扫描命中: ${hitEntities.length} 个实体, ${hitEvents.length} 条事件`,
        'Scan Dry Run'
      );
    }
  };

  /**
   * 统一处理预览测试：
   * 执行一次真实检索，但跳过聊天上下文增强，便于观察当前配置效果
   */
  const handlePreviewTest = async () => {
    if (!testQuery.trim() || isTesting) return;

    // 仅关键词召回不消耗远端模型资源，可跳过确认
    const isZeroCost = recallConfig.useKeywordRecall && !recallConfig.useEmbedding;

    if (!isZeroCost) {
      const userAgreed = window.confirm(
        '召回预览将马上调用远端模型（大语言模型或 Embedding/Rerank 模型）来生成结果，这会产生 Token 消耗，请确认是否继续？'
      );
      if (!userAgreed) return;
    }

    setIsTesting(true);
    try {
      {
        // 普通（向量/混合）模式：执行一次真实检索，但跳过上下文增强
        const searchResult = await retriever.search(testQuery, { skipContext: true });
        const candidates = (searchResult.candidates ?? []) as PreviewCandidate[];
        const recalledEntities = searchResult.recalledEntities ?? [];

        if (searchResult.skippedReason) {
          notificationService.info(searchResult.skippedReason, 'RAG 冷启动保护');
          return;
        }

        if (candidates.length === 0 && recalledEntities.length === 0) {
          notificationService.warning('检索未命中任何事件或实体', 'RAG');
          return;
        }
        // 将检索候选转换为统一的预览结构，复用同一个确认弹窗
        const pseudoRecalls: RecallPreviewItem[] = candidates.map((candidate) => {
          const score = getPreviewCandidateScore(candidate);

          return {
            id: candidate.id,
            score,
            reason:
              typeof candidate.rerankScore === 'number'
                ? 'Rerank 优化命中'
                : '向量检索 (TopK) 命中',
          };
        });

        setCurrentRecalls(pseudoRecalls);
        setCurrentEntities(recalledEntities);
        setIsModalOpen(true);
      }
    } catch {
      notificationService.error('召回预览执行失败，请查阅控制台报错', 'RAG');
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-4 p-1">
      <RecallConfigForm
        config={recallConfig}
        onChange={onRecallConfigChange}
        rerankConfig={rerankConfig}
        onRerankChange={onRerankConfigChange}
      />

      {/* 静态扫描快速测试（零消耗） */}
      <div className="mt-6 border-t border-border pt-6">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Zap size={16} className="text-amber-500" />
          Keyword Scan Dry Run
          <span className="ml-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-normal text-amber-500/80">
            零消耗・正则测试
          </span>
        </h3>

        <div className="flex gap-2">
          <div className="flex flex-1 flex-col gap-2">
            <textarea
              value={scanQuery}
              onChange={(e) => setScanQuery(e.target.value)}
              placeholder="输入文本测试匹配 (实际检索会自动回溯最近 5 条消息)..."
              className="min-h-[80px] resize-y whitespace-pre-wrap break-words rounded-md border border-border/40 bg-secondary/20 p-3 text-sm transition-colors focus:border-primary/50 focus:outline-none"
            />

            {/* 扫描匹配结果直接在这里渲染，不使用弹窗 */}
            {(matchedEntities.length > 0 || matchedEvents.length > 0) && (
              <div className="flex flex-col gap-2 rounded border border-border/20 bg-muted/20 p-2">
                {matchedEntities.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    <div className="mb-1 flex w-full items-center gap-1 text-[10px] text-muted-foreground">
                      <Database size={10} /> 命中的实体:
                    </div>
                    {matchedEntities.map((ent) => (
                      <span
                        key={ent.id}
                        className="rounded border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                      >
                        {ent.name}
                      </span>
                    ))}
                  </div>
                )}
                {matchedEvents.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <div className="mb-1 flex w-full items-center gap-1 text-[10px] text-muted-foreground">
                      <History size={10} /> 命中的事件摘要:
                    </div>
                    {matchedEvents.map((evt) => (
                      <div
                        key={evt.id}
                        className="line-clamp-2 whitespace-normal break-words rounded border-l-2 border-primary/40 bg-secondary/30 p-1.5 text-[10px] text-foreground/70"
                      >
                        {evt.summary}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <button
            onClick={handleScanDryRun}
            disabled={!scanQuery.trim()}
            className={`flex min-w-[80px] flex-col items-center justify-center gap-1 rounded-md px-4 text-sm font-medium transition-all ${
              !scanQuery.trim()
                ? 'cursor-not-allowed bg-muted text-muted-foreground'
                : 'bg-primary/80 text-primary-foreground shadow-sm hover:bg-primary'
            } `}
          >
            <Search size={18} />
            <span className="text-xs">扫描测试</span>
          </button>
        </div>
        <p className="mt-2 pl-1 text-[10px] italic text-muted-foreground">
          * 基于实体别名(Trigger Keywords)与事件元数据(Role/Loc)的正则匹配，完全本地执行。
        </p>
      </div>

      {/* 模型召回测试（有消耗） */}
      <div className="mt-8 border-t border-border pt-6">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Search size={16} className="text-primary" />
          召回预览
          <span className="ml-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-normal italic text-primary">
            注意: 产生 Token 消耗
          </span>
        </h3>

        <div className="flex gap-2">
          <textarea
            value={testQuery}
            onChange={(e) => setTestQuery(e.target.value)}
            placeholder="模拟 User Input 触发召回预览..."
            className="min-h-[80px] flex-1 resize-y whitespace-pre-wrap break-words rounded-md border border-border/50 bg-secondary/30 p-3 text-sm transition-colors focus:border-primary/50 focus:outline-none"
          />
          <div className="flex flex-col gap-2">
            <button
              onClick={handlePreviewTest}
              disabled={!testQuery.trim() || isTesting}
              className={`flex min-w-[100px] flex-1 flex-col items-center justify-center gap-1 rounded-md px-4 py-3 text-sm font-medium transition-all ${
                !testQuery.trim() || isTesting
                  ? 'cursor-not-allowed bg-muted text-muted-foreground'
                  : 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90'
              } `}
            >
              {isTesting ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span className="text-center text-xs">
                    检索并
                    <br />
                    推理中
                  </span>
                </>
              ) : (
                <>
                  <Play size={18} fill="currentColor" />
                  <span className="text-xs">执行召回预览</span>
                </>
              )}
            </button>
          </div>
        </div>
        <p className="mt-2 pl-1 text-xs text-muted-foreground">
          * 将执行一次真实的召回流程并弹窗确认，用于校验重排效果。
        </p>
      </div>

      {/* 统一 RAG 回顾弹窗 */}
      <RecallDecisionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        initialRecalls={currentRecalls}
        recalledEntities={currentEntities}
        onConfirm={(newRecalls) => {
          setCurrentRecalls(newRecalls);
          setIsModalOpen(false);
          notificationService.success(`已确认 ${newRecalls.length} 条召回结果`, 'RAG');
        }}
      />
    </div>
  );
};
