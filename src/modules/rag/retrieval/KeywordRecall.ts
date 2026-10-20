import { get } from '@/config/settings';
import { Logger, LogModule } from '@/core/logger';
import { tryGetDbForChat } from '@/data/db';
import { getCurrentChatId } from '@/integrations/tavern';
import { matchEvent, scanEntities } from '@/modules/memory/EntityScanner';
import type { ScoredEvent } from '@/modules/rag/retrieval/HybridScorer';
import type { EntityNode, EventNode } from '@/types/graph';

const MODULE = 'KeywordRecall';

type ArchivedEventQuery = {
  limit: (count: number) => {
    count: () => Promise<number>;
  };
};

export interface KeywordRecallInput {
  /** 意图轨文本，参与扫描 */
  query?: string;
  /** 文本轨输入，优先级高于 query */
  scanQuery?: string;
  text?: string;
  /** 原始聊天记录，取其末尾片段参与扫描 */
  chatHistory?: string;
}

export interface KeywordRecallResult {
  candidates: ScoredEvent[];
  /** 直中与多跳联想后的实体得分，供实体召回使用 */
  entityRefs: Array<{ id: string; score: number }>;
  elapsedMs: number;
}

function emptyResult(): KeywordRecallResult {
  return { candidates: [], entityRefs: [], elapsedMs: 0 };
}

function buildScanText(input: KeywordRecallInput): string {
  const scanParts: string[] = [];

  if (input.scanQuery) {
    scanParts.push(input.scanQuery);
  } else if (input.chatHistory) {
    const recentSegments = input.chatHistory.split('\n\n').slice(-5).join('\n\n');
    if (recentSegments) {
      scanParts.push(recentSegments);
    }
  }

  if (input.query) {
    scanParts.push(input.query);
  }

  if (input.text && input.text !== input.query) {
    scanParts.push(input.text);
  }

  return Array.from(new Set(scanParts.filter(Boolean))).join('\n\n');
}

async function hasArchivedEvents(db: ReturnType<typeof tryGetDbForChat>): Promise<boolean> {
  if (!db) return false;

  try {
    const filtered = (
      db.events as typeof db.events & {
        where?: (index: 'is_archived') => { equals: (value: 1) => ArchivedEventQuery };
      }
    )
      .where?.('is_archived')
      ?.equals(1);

    if (filtered) {
      return (await filtered.limit(1).count()) > 0;
    }

    return (
      (await db.events
        .toCollection()
        .filter((event) => !!event.is_archived)
        .limit(1)
        .count()) > 0
    );
  } catch (error) {
    Logger.warn(MODULE, '无法检查归档事件状态，默认尝试扫描', error);
    return true;
  }
}

function buildEntityIndex(allEntities: EntityNode[]): {
  index: Array<Pick<EntityNode, 'id' | 'name' | 'aliases'>>;
  byName: Map<string, EntityNode>;
} {
  const index = allEntities.map((entity) => ({
    id: entity.id,
    name: entity.name,
    aliases: entity.aliases,
  }));

  const byName = new Map<string, EntityNode>();
  for (const entity of allEntities) {
    byName.set(entity.name.toLowerCase(), entity);
    for (const alias of entity.aliases ?? []) {
      byName.set(alias.toLowerCase(), entity);
    }
  }

  return { index, byName };
}

function scanArchivedEvents(
  db: ReturnType<typeof tryGetDbForChat>,
  textToScan: string,
  eventTopK: number
): Promise<EventNode[]> {
  if (!db) return Promise.resolve([]);

  return (async () => {
    const hitEvents: EventNode[] = [];
    const scannedCount = { total: 0, archived: 0, matched: 0 };

    await db.events.toCollection().each((event) => {
      scannedCount.total += 1;
      if (!event.is_archived) return;

      scannedCount.archived += 1;
      if (!matchEvent(textToScan, event)) return;

      scannedCount.matched += 1;
      if (hitEvents.length < eventTopK) {
        hitEvents.push(event);
      }
    });

    Logger.debug(LogModule.RAG_INJECT, '事件关键词扫描完成', {
      eventTopK,
      scannedTotal: scannedCount.total,
      scannedArchived: scannedCount.archived,
      matched: scannedCount.matched,
      kept: hitEvents.length,
    });

    return hitEvents;
  })();
}

/** 扫描归档事件与实体，返回高分事件候选和实体引用。 */
export async function collectKeywordCandidates(
  input: KeywordRecallInput
): Promise<KeywordRecallResult> {
  const textToScan = buildScanText(input);

  if (!textToScan) {
    Logger.debug(LogModule.RAG_INJECT, '没有提供扫描上下文，跳过关键词检索');
    return emptyResult();
  }

  const chatId = getCurrentChatId();
  const db = chatId ? tryGetDbForChat(chatId) : null;
  if (!db) {
    return emptyResult();
  }

  const startTime = Date.now();
  const recallConfig = get('runtimeSettings')?.recallConfig;

  const allEntities = await db.entities.toArray();
  const { index: entityIndex, byName: entryMap } = buildEntityIndex(allEntities);

  Logger.debug(LogModule.RAG_INJECT, `准备扫描。实体索引总量: ${entityIndex.length}`);

  // 事件与实体分别限流：优先 keywordTopK，其次回退 embedding.topK / 默认值
  const eventTopK = recallConfig?.keywordTopK?.events ?? recallConfig?.embedding?.topK ?? 50;
  const entityTopK = recallConfig?.keywordTopK?.entities ?? 30;

  let hitEntities: EntityNode[] = [];
  if (recallConfig?.enableEntityKeyword !== false) {
    const matchedIndex = scanEntities(textToScan, entityIndex as EntityNode[]).slice(0, entityTopK);

    if (matchedIndex.length > 0) {
      const matchedIds = new Set(matchedIndex.map((entity) => entity.id));
      hitEntities = allEntities.filter((entity) => matchedIds.has(entity.id));

      Logger.debug(
        LogModule.RAG_INJECT,
        `命中了 ${hitEntities.length} 个实体(TopK=${entityTopK}): ${hitEntities.map((entity) => entity.name).join(', ')}`
      );
    }
  } else {
    Logger.debug(LogModule.RAG_INJECT, '实体关键词扫描已禁用');
  }

  let hitEvents: EventNode[] = [];
  if (recallConfig?.useKeywordRecall !== false && recallConfig?.enableEventKeyword !== false) {
    // 归档事件检查只限制事件扫描，不影响实体扫描
    if (await hasArchivedEvents(db)) {
      hitEvents = await scanArchivedEvents(db, textToScan, eventTopK);
    } else {
      Logger.info(LogModule.RAG_INJECT, '事件关键词扫描跳过：当前无归档事件');
    }
  } else {
    Logger.debug(LogModule.RAG_INJECT, '事件关键词扫描已禁用或主开关关闭');
  }

  // 关键词命中的基础分较高，确保在后续合并或截断时能占优
  const candidates: ScoredEvent[] = hitEvents.map((event) => ({
    id: event.id,
    summary: event.summary,
    keywordScore: 0.8,
    node: event,
  }));

  const entityScores = new Map<string, number>();

  // 第一跳：直接命中
  for (const entity of hitEntities) {
    entityScores.set(entity.id, 0.9);
  }

  // 第二跳：按 relations 扩展一跳关联实体，得分衰减
  const hopAttenuation = 0.8;
  for (const seedEntity of hitEntities) {
    const relations = seedEntity.profile?.relations as Record<string, unknown> | undefined;
    if (!relations) continue;

    const hopScore = (entityScores.get(seedEntity.id) ?? 0) * hopAttenuation;

    for (const targetName of Object.keys(relations)) {
      const targetEntity = entryMap.get(targetName.toLowerCase());
      if (!targetEntity) continue;

      const currentScore = entityScores.get(targetEntity.id) ?? 0;
      if (hopScore > currentScore) {
        entityScores.set(targetEntity.id, hopScore);
        Logger.debug(
          LogModule.RAG_INJECT,
          `[多跳联想] 由 ${seedEntity.name} 联想到了 ${targetEntity.name} (${hopScore.toFixed(2)})`
        );
      }
    }
  }

  const elapsedMs = Date.now() - startTime;
  const entityRefs = Array.from(entityScores, ([id, score]) => ({ id, score }));

  Logger.debug(
    LogModule.RAG_INJECT,
    `关键词扫描完成，耗时 ${elapsedMs}ms。命中实体: ${hitEntities.length} 个，命中事件: ${hitEvents.length} 个`
  );

  return { candidates, entityRefs, elapsedMs };
}
