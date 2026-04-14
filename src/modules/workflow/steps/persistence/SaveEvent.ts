import { Logger } from '@/core/logger';
import { parseJson } from '@/core/utils';
import { hideMessageRange, refreshEngramCache } from '@/integrations/tavern';
import { useMemoryStore } from '@/state/memoryStore';
import { type EventNode } from '@/types/graph';
import { notificationService } from '@/ui/services/NotificationService';
import { type JobContext } from '../../core/JobContext';
import { type IStep } from '../../core/Step';

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
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

  const rolesArray =
    kv.role && kv.role.length > 0 ? kv.role : normalizeStringArray(kv.characters);
  if (rolesArray.length > 0) metaParts.push(rolesArray.join(', '));
  const metaLine = metaParts.length > 0 ? `(${metaParts.join(' | ')}) ` : '';

  const rawSummary = event.summary ?? `[Summary Missing] ${kv.event ?? 'Unknown Event'}`;
  return `${titleLine}${metaLine}${rawSummary}`;
}

async function parseEventsToSave(context: JobContext): Promise<ParsedEventInput[]> {
  let eventsToSave = extractEvents(context.parsedData);

  if (eventsToSave.length > 0) {
    return eventsToSave;
  }

  const content = typeof context.output === 'string' ? context.output : context.cleanedContent;
  if (!content) {
    throw new Error('SaveEvent: missing output content');
  }

  try {
    const parsed = parseJson<ParsedEventsPayload>(content);
    eventsToSave = extractEvents(parsed);
  } catch {
    throw new Error('SaveEvent: failed to parse events JSON');
  }

  if (eventsToSave.length === 0) {
    throw new Error('SaveEvent: no events to save');
  }

  return eventsToSave;
}

export class SaveEvent implements IStep {
  name = 'SaveEvent';

  async execute(context: JobContext): Promise<void> {
    const eventsToSave = await parseEventsToSave(context);
    const store = useMemoryStore.getState();
    const db = await store.initChat();

    if (!db) {
      throw new Error('SaveEvent: no chat context');
    }

    const savedEvents: EventNode[] = [];
    const range = context.input.range || [0, 0];
    const isImport = context.input?.isImport === true;
    const autoHide = context.config.autoHide === true;

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

    context.output = savedEvents;

    if (range[1] > 0 && !isImport) {
      await store.setLastSummarizedFloor(range[1]);
    }

    await refreshEngramCache();

    if (autoHide && range[1] > 0 && !isImport) {
      const startIndex = range[0] - 1;
      const endIndex = range[1] - 1;

      Logger.info('SaveEvent', 'Preparing to auto-hide summarized messages', {
        workflowRange: range,
        hideRange: [startIndex, endIndex],
        savedEventCount: savedEvents.length,
      });

      try {
        await hideMessageRange(startIndex, endIndex);
        Logger.success('SaveEvent', 'Summarized messages hidden successfully');
      } catch (error) {
        Logger.error('SaveEvent', 'Auto-hide failed after summary save', error);
        notificationService.warning('Summary saved, but auto-hide failed. Please check the chat state.', 'Engram');
      }
    }

    Logger.success('SaveEvent', `Saved ${savedEvents.length} event(s)`);
    notificationService.success(`Saved ${savedEvents.length} event(s)`, 'Engram');
  }
}
