import { BrainCircuit, Database, History, Loader2, Play, Search, Zap } from 'lucide-react';
import { useState, type FC } from 'react';

import { scanEntities, scanEvents } from '@/modules/memory/EntityScanner';
import { preprocessor } from '@/modules/preprocess';
import { retriever } from '@/modules/rag/retrieval/Retriever';
import { useMemoryStore } from '@/state/memoryStore';
import type { EntityNode, EventNode } from '@/types/graph';
import type { AgenticRecall } from '@/types/preprocess';
import type { RecallCandidate, RecallConfig, RerankConfig } from '@/types/rag';
import { notificationService } from '@/ui/services/NotificationService';
import { RecallDecisionModal } from '@/ui/views/review/RecallDecisionModal';

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
  const [currentRecalls, setCurrentRecalls] = useState<AgenticRecall[]>([]);
  const [currentEntities, setCurrentEntities] = useState<EntityNode[]>([]); // V1.4: 被激活实体状态

  // Scan Dry Run 专属状态
  const [scanQuery, setScanQuery] = useState('');
  const [matchedEntities, setMatchedEntities] = useState<EntityNode[]>([]);
  const [matchedEvents, setMatchedEvents] = useState<EventNode[]>([]);

  const isAgenticMode = recallConfig.useAgenticRAG;

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
   * - Agentic 模式：先跑预处理，展示模型给出的召回决策
   * - 普通模式：执行一次真实检索，但跳过聊天上下文增强，便于观察当前配置效果
   */
  const handlePreviewTest = async () => {
    if (!testQuery.trim() || isTesting) return;

    // 仅关键词召回不消耗远端模型资源，可跳过确认
    const isZeroCost =
      recallConfig.useKeywordRecall &&
      !recallConfig.useEmbedding &&
      !recallConfig.useAgenticRAG &&
      !recallConfig.usePreprocess;

    if (!isZeroCost) {
      const userAgreed = window.confirm(
        '召回预览将马上调用远端模型（大语言模型或 Embedding/Rerank 模型）来生成结果，这会产生 Token 消耗，请确认是否继续？'
      );
      if (!userAgreed) return;
    }

    setIsTesting(true);
    try {
      if (isAgenticMode) {
        // Agentic 模式：由大模型预先生成 JSON
        const result = await preprocessor.process(testQuery);
        if (!result.success) {
          notificationService.error(result.error || 'Agentic 预处理失败', 'Agentic RAG');
          return;
        }
        const recalls = result.agenticRecalls ?? [];
        if (recalls.length === 0) {
          notificationService.warning('预处理完成但未产生召回决策', 'Agentic RAG');
          return;
        }
        setCurrentRecalls(recalls);
        setCurrentEntities([]); // Agentic 预处理当前只返回事件决策，不直接提供实体结果
        setIsModalOpen(true);
      } else {
        // 普通（向量/混合）模式：执行一次真实检索，但跳过上下文增强
        const searchResult = await retriever.search(testQuery, undefined, { skipContext: true });
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
        const pseudoRecalls: AgenticRecall[] = candidates.map((candidate) => {
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
              className="bg-secondary/20 border-border/40 focus:border-primary/50 min-h-[80px] resize-y whitespace-pre-wrap break-words rounded-md border p-3 text-sm transition-colors focus:outline-none"
            />

            {/* 扫描匹配结果直接在这里渲染，不使用弹窗 */}
            {(matchedEntities.length > 0 || matchedEvents.length > 0) && (
              <div className="bg-muted/20 border-border/20 flex flex-col gap-2 rounded border p-2">
                {matchedEntities.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    <div className="mb-1 flex w-full items-center gap-1 text-[10px] text-muted-foreground">
                      <Database size={10} /> 命中的实体:
                    </div>
                    {matchedEntities.map((ent) => (
                      <span
                        key={ent.id}
                        className="bg-primary/10 border-primary/20 rounded border px-1.5 py-0.5 text-[10px] font-medium text-primary"
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
                        className="text-foreground/70 bg-secondary/30 border-primary/40 line-clamp-2 whitespace-normal break-words rounded border-l-2 p-1.5 text-[10px]"
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
          {isAgenticMode ? (
            <>
              <BrainCircuit size={16} className="text-primary" />
              Agentic RAG Test
            </>
          ) : (
            <>
              <Search size={16} className="text-primary" />
              Vector/Hybrid Retrieval Test
            </>
          )}
          <span className="bg-primary/10 ml-1 rounded px-1.5 py-0.5 text-[10px] font-normal italic text-primary">
            注意: 产生 Token 消耗
          </span>
        </h3>

        <div className="flex gap-2">
          <textarea
            value={testQuery}
            onChange={(e) => setTestQuery(e.target.value)}
            placeholder={
              isAgenticMode
                ? '模拟用户输入触发 Agentic 预处理...'
                : '模拟 User Input 触发向量召回预览...'
            }
            className="bg-secondary/30 border-border/50 focus:border-primary/50 min-h-[80px] flex-1 resize-y whitespace-pre-wrap break-words rounded-md border p-3 text-sm transition-colors focus:outline-none"
          />
          <div className="flex flex-col gap-2">
            <button
              onClick={handlePreviewTest}
              disabled={!testQuery.trim() || isTesting}
              className={`flex min-w-[100px] flex-1 flex-col items-center justify-center gap-1 rounded-md px-4 py-3 text-sm font-medium transition-all ${
                !testQuery.trim() || isTesting
                  ? 'cursor-not-allowed bg-muted text-muted-foreground'
                  : 'hover:bg-primary/90 bg-primary text-primary-foreground shadow-sm'
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
            {isAgenticMode && currentRecalls.length > 0 && (
              <button
                onClick={() => setIsModalOpen(true)}
                disabled={isTesting}
                className={`hover:bg-muted/50 flex items-center justify-center gap-1 rounded-md border border-border bg-transparent py-2 text-[10px] font-medium text-muted-foreground transition-all`}
              >
                <BrainCircuit size={14} />
                <span>审阅结果</span>
              </button>
            )}
          </div>
        </div>
        <p className="mt-2 pl-1 text-xs text-muted-foreground">
          * 将执行一次真实的召回流程并弹窗确认，用于校验 Rerank 与 Agentic 评估效果。
          {isAgenticMode && (
            <>
              <br />
              <span className="text-amber-500/80">* 注: Agentic 模式由专门提示词控制。</span>
            </>
          )}
        </p>
      </div>

      {/* 统一 RAG 回顾弹窗 */}
      <RecallDecisionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        initialRecalls={currentRecalls}
        recalledEntities={currentEntities}
        onConfirm={async (newRecalls) => {
          setCurrentRecalls(newRecalls);
          try {
            setIsTesting(true);
            // 确认后，通过提供明确的 ID 数组强制触发最终的内容装配与记录，绕过额外的无谓检索
            const searchResult = await retriever.agenticSearch(newRecalls, {
              mode: isAgenticMode ? 'agentic' : 'hybrid',
              isManualTest: true, // 显式标记为手动测试，跳过日志和 Brain 状态变更
            });
            notificationService.success(
              `预览确认完成! 强一致性注入 ${searchResult.nodes?.length ?? 0} 条事件，请查看日志`,
              'RAG'
            );
          } catch {
            notificationService.error('确认后重新执行内容装配失败', 'RAG');
          } finally {
            setIsTesting(false);
          }
        }}
      />
    </div>
  );
};
