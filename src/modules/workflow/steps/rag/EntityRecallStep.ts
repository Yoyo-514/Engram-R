import { DEFAULT_ENTITY_INJECT_LIMIT } from '@/config/rag/defaults';
import { Logger, LogModule } from '@/core/logger';
import { tryGetDbForChat } from '@/data/db';
import { getCurrentChatId } from '@/integrations/tavern';
import { readKeywordEntityRefs } from '@/modules/rag/retrieval/KeywordEntityRefs';
import type { JobContext } from '@/types/job_context';
import type { RecalledEntity } from '@/types/rag';
import type { IStep } from '@/types/step';

/**
 * 按关键词得分选出本轮注入的实体。
 *
 * 直中与多跳联想的分数由 KeywordRetrieveStep 给出，这里只做排序与截断，
 * 结果同时供实体状态注入、召回日志和界面预览使用。
 */
export class EntityRecallStep implements IStep {
  name = 'EntityRecallStep';

  async execute(context: JobContext): Promise<void> {
    context.data = context.data || {};

    const refs = readKeywordEntityRefs(context.data.keywordEntityIds)
      .toSorted((a, b) => b.score - a.score)
      .slice(0, DEFAULT_ENTITY_INJECT_LIMIT);

    if (refs.length === 0) {
      context.data.recalledEntities = [];
      return;
    }

    const chatId = getCurrentChatId();
    const db = chatId ? tryGetDbForChat(chatId) : null;
    if (!db) {
      context.data.recalledEntities = [];
      return;
    }

    const nodes = await db.entities.bulkGet(refs.map((ref) => ref.id));
    const scoreById = new Map(refs.map((ref) => [ref.id, ref.score]));
    const recalledEntities: RecalledEntity[] = nodes.flatMap((node) =>
      node ? [{ ...node, recallScore: scoreById.get(node.id) ?? 0 }] : []
    );

    context.data.recalledEntities = recalledEntities;

    Logger.debug(LogModule.RAG_RETRIEVE, '实体召回完成', {
      candidates: refs.length,
      injected: recalledEntities.length,
    });
  }
}
