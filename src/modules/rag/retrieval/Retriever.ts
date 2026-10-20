/**
 * Retriever Service
 *
 * 扩展支持向量检索 + Rerank 混合召回
 *
 * 召回模式：
 * - full: Embedding + Rerank
 * - standard: Embedding + Rerank
 * - light: 仅 Embedding
 * - llm_only: LLM 直接召回
 * - keyword_only: 仅关键词扫描
 */

import { DEFAULT_RECALL_CONFIG } from '@/config/rag/defaults';
import { get } from '@/config/settings';
import { Logger, LogModule } from '@/core/logger';
import { getErrorMessage, getErrorStack } from '@/core/utils';
import { tryGetDbForChat } from '@/data/db';
import { getCurrentChatId, getChatHistory, getCurrentMessageCount } from '@/integrations/tavern';
import { createRetrievalWorkflow, runWorkflow } from '@/modules/workflow';
import type { EventNode } from '@/types/graph';
import type { RecalledEntity, RecallCandidate, RecallConfig } from '@/types/rag';

import { recallCache, type RecentRecall } from './RecallCache';

// ==================== 类型定义 ====================

export interface RetrievalResult {
  entries: string[]; // Formatted entries ready for injection
  nodes: EventNode[]; // Raw nodes
  candidates?: RecallCandidate[]; // 曝露带分数的候选列表供前端装配
  recalledEntities?: RecalledEntity[]; // 本轮召回的实体
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
   * @param options 额外配置（skipContext, mode 等）
   */
  async search(
    userInput: string,
    options?: {
      skipContext?: boolean;
      mode?: string;
    }
  ): Promise<RetrievalResult> {
    Logger.debug(LogModule.RAG_INJECT, '>>> Retriever.search 被调用 <<<', {
      input: userInput.substring(0, 20),
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

      // 轨道 B: 意图语义增强 (浅层回溯: 2 条)
      const shallowContext = this.getRecentContext(2);
      if (shallowContext) {
        intentQuery = `${shallowContext}\n\n[Current]\n${userInput}`;
        Logger.debug(LogModule.RAG_INJECT, '已回溯 2 条聊天历史进行意图兜底增强');
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

    // 统一走检索工作流：关键词扫描、向量检索与 Rerank 串联。
    if (recallConfig.enabled || recallConfig.useKeywordRecall) {
      const result = await this.hybridSearch(intentQuery, recallConfig, scanQuery);
      this.recordRecent(chatId, result);
      return result;
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

  /** 记录本轮最终候选，供近期召回宏与界面读取。 */
  private recordRecent(chatId: string | null, result: RetrievalResult): void {
    if (!chatId) return;
    const scores = new Map(
      (result.candidates ?? []).map((c) => [c.id, c.rerankScore ?? c.embeddingScore])
    );
    const items: RecentRecall[] = [
      ...result.nodes.map((node) => ({
        id: node.id,
        label: node.structured_kv?.event || node.summary.slice(0, 20),
        category: 'event' as const,
        score: scores.get(node.id) ?? 0,
      })),
      ...(result.recalledEntities ?? []).map((entity) => ({
        id: entity.id,
        label: entity.name,
        category: 'entity' as const,
        score: entity.recallScore,
      })),
    ];
    recallCache.record(chatId, items);
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
      // oxlint-disable-next-line unicorn/no-array-reverse -- Dexie Collection.reverse()，非数组
      .reverse()
      .limit(limit)
      .toArray();

    // 2. Get latest Level 1 (Macro Context)
    const latestMacro = await db.events
      .filter((node) => node.level === 1)
      // oxlint-disable-next-line unicorn/no-array-reverse -- Dexie Collection.reverse()，非数组
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
}

export const retriever = new Retriever();
