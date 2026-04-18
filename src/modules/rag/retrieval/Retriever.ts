/**
 * Retriever Service
 *
 * V0.8.5: 扩展支持向量检索 + Rerank 混合召回
 *
 * 召回模式：
 * - full: 预处理 + Embedding + Rerank
 * - standard: Embedding + Rerank
 * - light: 仅 Embedding
 * - llm_only: LLM 直接召回
 * - keyword_only: 仅关键词扫描
 */

import { DEFAULT_BRAIN_RECALL_CONFIG, DEFAULT_RECALL_CONFIG } from '@/config/rag/defaults';
import { get } from '@/config/settings';
import { Logger, LogModule } from '@/core/logger';
import { RecallLogService } from '@/core/logger/RecallLogger';
import { getErrorMessage, getErrorStack } from '@/core/utils';
import { tryGetDbForChat } from '@/data/db';
import { getCurrentChatId, getChatHistory, getCurrentMessageCount } from '@/integrations/tavern';
import { createRetrievalWorkflow, runWorkflow } from '@/modules/workflow';
import type { EntityNode, EventNode } from '@/types/graph';
import type { AgenticRecall } from '@/types/preprocess';
import type { BrainRecallConfig, RecallCandidate, RecallConfig } from '@/types/rag';

import { brainRecallCache } from './BrainRecallCache';

// ==================== 类型定义 ====================

export interface RetrievalResult {
  entries: string[]; // Formatted entries ready for injection
  nodes: EventNode[]; // Raw nodes
  candidates?: RecallCandidate[]; // 曝露带分数的候选列表供前端装配
  recalledEntities?: EntityNode[]; // 曝露通过类脑被召回的实体
  skippedReason?: string; // 召回短路原因（如无可召回对象）
}

function createEmptyResult(skippedReason?: string): RetrievalResult {
  return skippedReason ? { entries: [], nodes: [], skippedReason } : { entries: [], nodes: [] };
}

// ==================== Retriever ====================

class Retriever {
  /**
   * 获取召回配置
   */
  private getRecallConfig(): RecallConfig {
    const runtimeSettings = get('runtimeSettings');
    return runtimeSettings?.recallConfig || DEFAULT_RECALL_CONFIG;
  }

  // 缓存向量化状态，避免重复扫描事件表
  private _hasVectorizedNodesCache: boolean | null = null;

  /**
   * 检查是否存在已向量化的节点
   * 用于决定是否需要执行向量检索
   */
  async hasVectorizedNodes(): Promise<boolean> {
    const chatId = getCurrentChatId();
    if (!chatId) return false;

    const db = tryGetDbForChat(chatId);
    if (!db) return false;

    // 检查是否存在任何带有 embeddings 的事件
    const count = await db.events
      .filter((e) => !!e.is_embedded)
      .limit(1)
      .count();

    this._hasVectorizedNodesCache = count > 0;
    return this._hasVectorizedNodesCache;
  }

  /**
   * 清理矢量化节点缓存（暴露给外部在触发 embedding 构建后调用）
   */
  invalidateVectorCache(): void {
    this._hasVectorizedNodesCache = null;
  }

  /**
   * 获取指定深度的最近聊天上下文
   * @param count 消息条数
   */
  private getRecentContext(count: number): string | null {
    try {
      const currentCount = getCurrentMessageCount();
      if (currentCount <= 0) return null;

      return getChatHistory([Math.max(1, currentCount - count), currentCount]);
    } catch {
      return null;
    }
  }

  /**
   * 执行检索流程
   * @param userInput 用户原始输入
   * @param unifiedQueries 预处理生成的查询词（可选）
   * @param options 额外配置（skipContext, mode 等）
   */
  async search(
    userInput: string,
    unifiedQueries?: string[],
    options?: {
      skipContext?: boolean;
      mode?: string;
    }
  ): Promise<RetrievalResult> {
    Logger.debug(LogModule.RAG_INJECT, '>>> Retriever.search 被调用 <<<', {
      input: userInput.substring(0, 20),
      unifiedCount: unifiedQueries?.length || 0,
      skipContext: options?.skipContext,
    });

    const recallConfig = this.getRecallConfig();

    // --- 逻辑分发 ---
    let intentQuery = userInput; // 意图轨道 (Embedding/Rerank)
    let scanQuery = userInput; // 扫描轨道 (Keyword)

    // 只有在非跳过模式下才进行上下文增强
    if (!options?.skipContext) {
      // 轨道 A: 关键词扫描增强 (深层回溯: 5 条)
      if (recallConfig.useKeywordRecall) {
        const deepContext = this.getRecentContext(5);
        if (deepContext) {
          scanQuery = `${deepContext}\n\n[Current]\n${userInput}`;
          Logger.debug(LogModule.RAG_INJECT, '已回溯 5 条聊天历史增强关键词扫描深度');
        }
      }

      // 轨道 B: 意图语义增强 (浅层回溯: 2 条) - 仅限正式聊天且无预处理结果时
      const noUnifiedQueries = !unifiedQueries || unifiedQueries.length === 0;
      if (noUnifiedQueries) {
        const shallowContext = this.getRecentContext(2);
        if (shallowContext) {
          intentQuery = `${shallowContext}\n\n[Current]\n${userInput}`;
          Logger.debug(LogModule.RAG_INJECT, '已回溯 2 条聊天历史进行意图兜底增强');
        }
      }
    } else {
      Logger.debug(LogModule.RAG_INJECT, '手动测试模式：跳过上下文增强');
    }

    // 未启用召回，使用滚动窗口策略
    if (!recallConfig.enabled && !recallConfig.useKeywordRecall) {
      Logger.debug(LogModule.RAG_INJECT, '召回与关键词模式均未启用，使用滚动窗口策略');
      const limit = recallConfig.embedding?.topK || 20;
      return this.rollingSearch(limit);
    }

    // 冷启动保护：没有任何可召回对象时，直接短路返回
    // 可召回对象定义：存在已向量化事件，或存在已归档条目（事件/实体）
    const chatId = getCurrentChatId();
    const db = chatId ? tryGetDbForChat(chatId) : null;
    if (db) {
      try {
        const [embeddedEventCount, archivedEventCount, archivedEntityCount] = await Promise.all([
          db.events
            .filter((e) => !!e.is_embedded)
            .limit(1)
            .count(),
          db.events
            .filter((e) => !!e.is_archived)
            .limit(1)
            .count(),
          db.entities
            .filter((e) => !!e.is_archived)
            .limit(1)
            .count(),
        ]);

        const canRecall =
          embeddedEventCount > 0 || archivedEventCount > 0 || archivedEntityCount > 0;
        if (!canRecall) {
          Logger.info(LogModule.RAG_INJECT, '冷启动保护：无可召回对象，返回空召回结果');
          return createEmptyResult('当前没有向量化或归档条目，已跳过召回流程');
        }
      } catch (error) {
        Logger.warn(LogModule.RAG_INJECT, '冷启动检查失败，跳过保护逻辑', {
          error: getErrorMessage(error),
        });
      }
    }

    // 统一走检索工作流：关键词扫描、向量检索、Rerank 与类脑处理都在其中串联
    if (recallConfig.enabled || recallConfig.useKeywordRecall) {
      return this.hybridSearch(intentQuery, unifiedQueries, recallConfig, scanQuery);
    }

    // 默认回退
    return this.rollingSearch(recallConfig.embedding?.topK || 20);
  }

  /**
   * 执行统一检索工作流
   * - intentQuery：用于语义检索 / Rerank 的意图轨输入
   * - scanQuery：用于关键词扫描的文本轨输入
   */
  private async hybridSearch(
    intentQuery: string,
    unifiedQueries: string[] | undefined,
    config: RecallConfig,
    scanQuery?: string
  ): Promise<RetrievalResult> {
    const startTime = Date.now();
    Logger.debug(LogModule.RAG_INJECT, '--- 进入 Hybrid Search 工作流 ---', {
      scanQueryLen: scanQuery?.length,
    });

    try {
      const context = await runWorkflow(createRetrievalWorkflow(), {
        input: {
          query: intentQuery,
          scanQuery: scanQuery || intentQuery,
          unifiedQueries,
          mode: 'hybrid',
        },
        data: {
          recallConfig: config,
          vectorRetrieveStartTime: startTime,
        },
      });

      Logger.info(LogModule.RAG_INJECT, 'Hybrid Search 工作流执行完毕', {
        steps: context.metadata.stepsExecuted,
        entityCount: context.data?.recalledEntities?.length || 0,
        candidateCount: context.data?.candidates?.length || 0,
      });

      return (context.output as RetrievalResult | undefined) || createEmptyResult();
    } catch (error) {
      Logger.error(LogModule.RAG_INJECT, 'Hybrid Search 工作流遭遇毁灭性失败', {
        error: getErrorMessage(error),
        stack: getErrorStack(error),
      });
      return createEmptyResult();
    }
  }

  /**
   * Agentic RAG 直通检索
   * 跳过 Embedding/Rerank，直接按 LLM 给出的事件 ID 取回结果
   * - 正常模式：参与类脑流程，并记录召回日志
   * - 手动测试模式：仅做结果装配，不污染类脑状态和日志
   *
   * @param recalls LLM 输出的召回决策列表
   * @param options 额外配置 (mode, isManualTest 等)
   * @returns 检索结果
   */
  async agenticSearch(
    recalls: AgenticRecall[],
    options?: { mode?: string; isManualTest?: boolean }
  ): Promise<RetrievalResult> {
    const startTime = Date.now();
    const chatId = getCurrentChatId();
    if (!chatId) {
      Logger.warn(LogModule.RAG_RETRIEVE, 'Agentic Search: 无当前聊天');
      return createEmptyResult();
    }

    const db = tryGetDbForChat(chatId);
    if (!db) {
      Logger.warn(LogModule.RAG_RETRIEVE, 'Agentic Search: 数据库不可用');
      return createEmptyResult();
    }

    // 1. 按 ID 直接从数据库捣取事件
    const ids = recalls.map((r) => r.id);
    const events = await db.events.bulkGet(ids);
    const validEvents = events.filter((e): e is EventNode => e != null);

    if (validEvents.length === 0) {
      Logger.warn(LogModule.RAG_RETRIEVE, 'Agentic Search: 无有效事件', {
        requestedIds: ids,
      });
      return createEmptyResult();
    }

    Logger.info(LogModule.RAG_RETRIEVE, 'Agentic Search: 数据库查询完成', {
      requested: ids.length,
      found: validEvents.length,
    });

    // 2. 构建 RecallCandidate（用 LLM 给的 score 填充双轨）
    const validEventMap = new Map(validEvents.map((event) => [event.id, event]));
    const validRecallEntries = recalls.flatMap((recall) => {
      const event = validEventMap.get(recall.id);
      return event ? [{ recall, event }] : [];
    });

    const candidates: RecallCandidate[] = validRecallEntries.map(({ recall, event }) => ({
      id: recall.id,
      label: event.structured_kv?.event || recall.id,
      embeddingScore: recall.score,
      rerankScore: recall.score, // 双轨同分，让 BrainRecallCache 的门控逻辑正常工作
    }));

    // 3. 送入 BrainRecallCache（自动触发 Decay Bomb）
    const recallConfig = this.getRecallConfig();
    const brainConfig: BrainRecallConfig = recallConfig.brainRecall || DEFAULT_BRAIN_RECALL_CONFIG;
    let finalNodes = validEvents;

    if (brainConfig.enabled && !options?.isManualTest) {
      brainRecallCache.setConfig(brainConfig);
      brainRecallCache.nextRound();

      const brainResults = brainRecallCache.process(candidates);

      // 根据 BrainRecallCache 输出重新排序
      const brainIdSet = new Set(brainResults.map((s) => s.id));
      finalNodes = validEvents.filter((e) => brainIdSet.has(e.id));

      Logger.info(LogModule.RAG_RETRIEVE, 'Agentic Search: 类脑召回已应用', {
        inputCount: candidates.length,
        outputCount: brainResults.length,
        round: brainRecallCache.getCurrentRound(),
      });
    } else if (options?.isManualTest) {
      Logger.debug(LogModule.RAG_RETRIEVE, 'Agentic Search: 手动测试模式跳过类脑处理逻辑');
    }

    const totalTime = Date.now() - startTime;

    // 4. 记录召回日志 (如果是手动测试确认，则跳过日志记录)
    if (!options?.isManualTest) {
      const brainStats = brainConfig.enabled
        ? {
            round: brainRecallCache.getCurrentRound(),
            snapshot: brainRecallCache.getShortTermSnapshot(),
          }
        : undefined;

      RecallLogService.log({
        query: options?.mode === 'hybrid' ? '[Hybrid Preview Mode]' : '[Agentic RAG]',
        mode: options?.mode === 'hybrid' ? 'hybrid' : 'agentic',
        results: validRecallEntries.map(({ recall, event }) => ({
          eventId: recall.id,
          summary: event.summary,
          category: event.structured_kv?.event || 'unknown',
          embeddingScore: recall.score, // 模型给出的分通常作为主分
          rerankScore: recall.score, // 对于 Agentic，Rerank 分数默认等同于评估分
          hybridScore: recall.score,
          isTopK: true,
          isReranked: true, // Agentic 模式下默认视为已重排 (LLM 钦定)
          reason: recall.reason,
        })),
        stats: {
          totalCandidates: recalls.length,
          topKCount: validRecallEntries.length,
          rerankCount: 0,
          latencyMs: totalTime,
        },
        brainStats,
      });
    }

    // 5. 返回结果
    const entries = finalNodes.map((n) => n.summary);

    Logger.info(LogModule.RAG_RETRIEVE, 'Agentic Search 完成', {
      totalTime,
      resultCount: finalNodes.length,
    });

    return { entries, nodes: finalNodes, candidates };
  }

  /**
   * 滚动窗口策略 (基础模式)
   * 返回最近的事件，不使用向量检索
   */
  private async rollingSearch(limit: number): Promise<RetrievalResult> {
    const chatId = getCurrentChatId();
    if (!chatId) {
      return createEmptyResult();
    }

    const db = tryGetDbForChat(chatId);
    if (!db) {
      return createEmptyResult();
    }

    // 1. Get recent Level 0 (Details)
    const recentEvents = await db.events
      .filter((node) => node.level === 0)
      .reverse()
      .limit(limit)
      .toArray();

    // 2. Get latest Level 1 (Macro Context)
    const latestMacro = await db.events
      .filter((node) => node.level === 1)
      .reverse()
      .first();

    const nodes: EventNode[] = [...recentEvents];
    if (latestMacro) {
      nodes.unshift(latestMacro);
    }

    // 3. Format entries
    const entries = nodes.map((node) => node.summary);

    return { entries, nodes };
  }

  /**
   * @deprecated 使用 search() 替代
   */
  async vectorSearch(query: string): Promise<RetrievalResult> {
    return this.search(query);
  }
}

export const retriever = new Retriever();
