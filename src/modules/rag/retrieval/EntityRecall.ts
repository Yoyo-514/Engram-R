import { DEFAULT_ENTITY_INJECT_LIMIT } from '@/config/rag/defaults';
import { Logger, LogModule } from '@/core/logger';
import { tryGetDbForChat } from '@/data/db';
import { getCurrentChatId } from '@/integrations/tavern';
import type { KeywordEntityRef } from '@/modules/rag/retrieval/KeywordEntityRefs';
import type { RecalledEntity } from '@/types/rag';

/**
 * 按关键词得分选出本轮注入的实体。
 *
 * 直中与多跳联想的分数由 collectKeywordCandidates 给出，这里只做排序与截断，
 * 结果同时供实体状态注入、召回日志和界面预览使用。
 */
export async function recallEntities(refs: KeywordEntityRef[]): Promise<RecalledEntity[]> {
  const topRefs = refs.toSorted((a, b) => b.score - a.score).slice(0, DEFAULT_ENTITY_INJECT_LIMIT);

  if (topRefs.length === 0) {
    return [];
  }

  const chatId = getCurrentChatId();
  const db = chatId ? tryGetDbForChat(chatId) : null;
  if (!db) {
    return [];
  }

  const nodes = await db.entities.bulkGet(topRefs.map((ref) => ref.id));
  const scoreById = new Map(topRefs.map((ref) => [ref.id, ref.score]));
  const recalled = nodes.flatMap((node) =>
    node ? [{ ...node, recallScore: scoreById.get(node.id) ?? 0 }] : []
  );

  Logger.debug(LogModule.RAG_RETRIEVE, '实体召回完成', {
    candidates: topRefs.length,
    injected: recalled.length,
  });

  return recalled;
}
