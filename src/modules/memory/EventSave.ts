import { Logger } from '@/core/logger';
import { isRecord, isStringArray, parseJson, readNumber, readString } from '@/core/utils';
import { hideMessageRange, refreshEngramCache } from '@/integrations/tavern';
import { useMemoryStore } from '@/state/memoryStore';
import type { EventNode } from '@/types/graph';
import { notificationService } from '@/ui/services/NotificationService';

type EventKvInput = Partial<EventNode['structured_kv']> & {
  characters?: string | string[];
};

type ParsedEventInput = {
  summary?: string;
  significance_score?: number;
  structured_kv?: EventKvInput;
  meta?: EventKvInput;
};

type ParsedEventsPayload = {
  events: ParsedEventInput[];
};

export interface EventSaveOptions {
  range: [number, number];
  isImport?: boolean;
  autoHide?: boolean;
}

function normalizeStringArray(value: unknown): string[] {
  if (typeof value === 'string' && value.length > 0) {
    return [value];
  }

  if (isStringArray(value)) {
    return value.filter((item) => item.length > 0);
  }

  return [];
}

function parseEventKv(value: unknown): EventKvInput | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const result: EventKvInput = {};
  const timeAnchor = readString(value.time_anchor);
  const location = normalizeStringArray(value.location);
  const role = normalizeStringArray(value.role);
  const logic = normalizeStringArray(value.logic);
  const event = readString(value.event);
  const causality = readString(value.causality);
  const characters = value.characters;

  if (timeAnchor !== undefined) result.time_anchor = timeAnchor;
  if (location.length > 0) result.location = location;
  if (role.length > 0) result.role = role;
  if (logic.length > 0) result.logic = logic;
  if (event !== undefined) result.event = event;
  if (causality !== undefined) result.causality = causality;
  if (typeof characters === 'string' || isStringArray(characters)) {
    result.characters = characters;
  }

  return result;
}

function parseEventInput(value: unknown): ParsedEventInput | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    summary: readString(value.summary),
    significance_score: readNumber(value.significance_score),
    structured_kv: parseEventKv(value.structured_kv),
    meta: parseEventKv(value.meta),
  };
}

function extractEvents(value: unknown): ParsedEventInput[] {
  if (!isRecord(value) || !Array.isArray(value.events)) {
    return [];
  }

  return value.events
    .map((item) => parseEventInput(item))
    .filter((item): item is ParsedEventInput => item !== null);
}

function buildBurnedSummary(event: ParsedEventInput): string {
  const kv = event.structured_kv ?? event.meta ?? {};

  const titleSuffixParts: string[] = [];
  if (kv.causality) titleSuffixParts.push(kv.causality);
  if (kv.logic && kv.logic.length > 0) {
    titleSuffixParts.push(kv.logic.join(', '));
  }
  const titleSuffix = titleSuffixParts.length > 0 ? ` (${titleSuffixParts.join(' | ')})` : '';

  const eventTitle = kv.event ?? '';
  const titleLine = eventTitle ? `${eventTitle}${titleSuffix}:\n` : '';

  const metaParts: string[] = [];
  if (kv.time_anchor) metaParts.push(kv.time_anchor);
  if (kv.location && kv.location.length > 0) {
    metaParts.push(kv.location.join(', '));
  }

  const rolesArray = kv.role && kv.role.length > 0 ? kv.role : normalizeStringArray(kv.characters);
  if (rolesArray.length > 0) metaParts.push(rolesArray.join(', '));
  const metaLine = metaParts.length > 0 ? `(${metaParts.join(' | ')}) ` : '';

  const rawSummary = event.summary ?? `[Summary Missing] ${kv.event ?? 'Unknown Event'}`;
  return `${titleLine}${metaLine}${rawSummary}`;
}

/** 接受事件对象或 JSON 文本，找出待保存的事件列表。 */
function readEvents(content: unknown): ParsedEventInput[] {
  const directEvents = extractEvents(content);
  if (directEvents.length > 0) {
    return directEvents;
  }

  if (typeof content !== 'string' || !content) {
    throw new Error('EventSave: missing output content');
  }

  const parsed = parseJson<ParsedEventsPayload>(content);
  if (!parsed) {
    throw new Error('EventSave: failed to parse events JSON');
  }

  const events = extractEvents(parsed);
  if (events.length === 0) {
    throw new Error('EventSave: no events to save');
  }

  return events;
}

/** 把摘要事件落地，并维护总结楼层、缓存与自动隐藏。 */
export async function saveEvents(
  content: unknown,
  options: EventSaveOptions
): Promise<EventNode[]> {
  const eventsToSave = readEvents(content);
  const store = useMemoryStore.getState();
  const db = await store.initChat();

  if (!db) {
    throw new Error('EventSave: no chat context');
  }

  const savedEvents: EventNode[] = [];
  const range = options.range;
  const isImport = options.isImport === true;

  for (const event of eventsToSave) {
    const kv = event.structured_kv ?? event.meta ?? {};
    const rolesArray =
      kv.role && kv.role.length > 0 ? kv.role : normalizeStringArray(kv.characters);

    const saved = await store.saveEvent({
      summary: buildBurnedSummary(event),
      structured_kv: {
        time_anchor: kv.time_anchor ?? '',
        role: rolesArray,
        location: kv.location ?? [],
        event: kv.event ?? '',
        logic: kv.logic ?? [],
        causality: kv.causality ?? '',
      },
      significance_score: event.significance_score ?? 0.5,
      level: 0,
      is_embedded: false,
      is_archived: false,
      source_range: {
        start_index: range[0],
        end_index: range[1],
      },
    });
    savedEvents.push(saved);
  }

  if (range[1] > 0 && !isImport) {
    await store.setLastSummarizedFloor(range[1]);
  }

  await refreshEngramCache();

  if (options.autoHide === true && range[1] > 0 && !isImport) {
    const startIndex = range[0] - 1;
    const endIndex = range[1] - 1;

    Logger.info('EventSave', 'Preparing to auto-hide summarized messages', {
      workflowRange: range,
      hideRange: [startIndex, endIndex],
      savedEventCount: savedEvents.length,
    });

    try {
      await hideMessageRange(startIndex, endIndex);
      Logger.success('EventSave', 'Summarized messages hidden successfully');
    } catch (error) {
      Logger.error('EventSave', 'Auto-hide failed after summary save', error);
      notificationService.warning(
        'Summary saved, but auto-hide failed. Please check the chat state.',
        'Engram'
      );
    }
  }

  Logger.success('EventSave', `Saved ${savedEvents.length} event(s)`);
  notificationService.success(`Saved ${savedEvents.length} event(s)`, 'Engram');

  return savedEvents;
}
