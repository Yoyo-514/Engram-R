import { get } from '@/config/settings';
import { Logger, LogModule } from '@/core/logger';
import { regexProcessor } from '@/core/regex';
import { parseJson } from '@/core/utils/JsonParser';
import { refreshCache } from '@/integrations/tavern';
import { stopGeneration } from '@/integrations/tavern/generation';
import { requestCompletion, type CompletionSignal } from '@/modules/llm/Completion';
import { buildPrompt, type PromptInput } from '@/modules/llm/PromptBuilder';
import { embeddingService } from '@/modules/rag';
import { useMemoryStore } from '@/state/memoryStore';
import type { EventNode } from '@/types/graph';
import { notificationService } from '@/ui/services/NotificationService';

const TRIM_TEMPLATE_ID = 'builtin_trim';

export interface TrimExecutionOptions {
  manual: boolean;
  keepRecentCount?: number;
  signal?: CompletionSignal;
}

export interface TrimResult {
  /** 精简后的事件 */
  newEvent: EventNode;
  /** 被删除的事件数量 */
  deletedCount: number;
  /** 原始事件 ID 列表 */
  sourceEventIds: string[];
}

interface ParsedTrimEvent {
  summary?: string;
  meta?: {
    time_anchor?: string;
    location?: string | string[];
  };
}

function isTruthyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function mergeArrays(arrays: string[][]): string[] {
  const set = new Set<string>();
  for (const arr of arrays) {
    for (const item of arr) {
      set.add(item);
    }
  }
  return Array.from(set);
}

function formatEvents(events: EventNode[]): string {
  return events
    .map((e) => {
      const kv = e.structured_kv;
      const locStr = Array.isArray(kv.location) ? kv.location.join(', ') : kv.location;
      return `${e.summary}
Role: [${kv.role.join(', ')}]
Loc: [${locStr}]
Event: ${kv.event}
Logic: [${kv.logic.join(', ')}]
Causality: ${kv.causality}
Significance: ${e.significance_score}`;
    })
    .join('\n\n---\n\n');
}

/** 把多条旧事件合并为一条压缩事件，并归档原始事件。 */
export async function trimEvents(options: TrimExecutionOptions): Promise<TrimResult | null> {
  await stopGeneration(options.signal);

  const store = useMemoryStore.getState();
  const eventsToMerge = await store.getEventsToMerge(options.keepRecentCount ?? 3);

  if (eventsToMerge.length < 2) {
    if (options.manual) {
      throw new Error('待合并的事件不足 (需要至少 2 条)');
    }
    Logger.debug(LogModule.MEMORY_TRIM, '事件不足，无需精简');
    return null;
  }

  const formatted = formatEvents(eventsToMerge);
  const input: PromptInput = { targetSummaries: formatted, text: formatted };
  const prompt = await buildPrompt(input, { templateId: TRIM_TEMPLATE_ID, category: 'trim' });

  const response = await requestCompletion(prompt, {
    logType: 'trim',
    jobId: `trim_${Date.now()}`,
    signal: options.signal,
  });
  const cleaned = regexProcessor.process(response.content, 'output');

  const parsed = parseJson<{ events?: ParsedTrimEvent[] }>(cleaned);
  if (!parsed) {
    throw new Error('ParseJson: JSON 解析失败');
  }

  const parsedEvents = parsed.events ?? [];
  if (parsedEvents.length === 0) {
    throw new Error('ApplyTrim: 无有效的精简结果');
  }

  const firstParsed = parsedEvents[0];

  const newEvent = await store.saveEvent({
    summary: parsedEvents.map((event) => event.summary || '').join('\n\n'),
    structured_kv: {
      time_anchor: firstParsed.meta?.time_anchor || '',
      role: mergeArrays(eventsToMerge.map((e) => e.structured_kv.role)),
      location: Array.isArray(firstParsed.meta?.location)
        ? firstParsed.meta.location
        : [firstParsed.meta?.location].filter(isTruthyString),
      event: '精简合并',
      logic: mergeArrays(eventsToMerge.map((e) => e.structured_kv.logic)),
      causality: 'Chain',
    },
    significance_score: Math.max(...eventsToMerge.map((e) => e.significance_score)),
    level: 1,
    is_embedded: false,
    is_archived: false,
    // 抢占子节点中最老的时间点再提前 1ms，保证合并事件排在它们之前
    timestamp: Math.min(...eventsToMerge.map((e) => e.timestamp)) - 1,
    source_range: {
      start_index: Math.min(...eventsToMerge.map((e) => e.source_range?.start_index ?? 0)),
      end_index: Math.max(...eventsToMerge.map((e) => e.source_range?.end_index ?? 0)),
    },
  });

  const sourceEventIds = eventsToMerge.map((e) => e.id);
  const settings = get('runtimeSettings');
  const embeddingConfig = settings?.embeddingConfig;

  if (embeddingConfig?.enabled && embeddingConfig.trigger === 'with_trim') {
    Logger.info(LogModule.MEMORY_TRIM, '触发联动嵌入', { count: eventsToMerge.length });
    try {
      const vectorConfig = settings?.vectorConfig;
      if (vectorConfig) {
        embeddingService.setConfig(vectorConfig);
      }

      await embeddingService.embedEvents(eventsToMerge);
      await store.markEventsAsEmbedded(sourceEventIds);
    } catch (embedError) {
      Logger.error(LogModule.MEMORY_TRIM, '联动嵌入失败', { error: embedError });
      notificationService.warning('联动嵌入失败，但精简已完成', 'Engram');
    }
  }

  await store.archiveEvents(sourceEventIds);
  await refreshCache();

  Logger.success(LogModule.MEMORY_TRIM, '精简完成', {
    merged: eventsToMerge.length,
    newEventId: newEvent.id,
  });

  return { newEvent, deletedCount: 0, sourceEventIds };
}
