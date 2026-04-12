import { Plus, X } from 'lucide-react';
import type { EventNode } from '@/types/graph';
import { useEffect, useState } from 'react';
import type { FC } from 'react';

type EditableEventKV = Partial<EventNode['structured_kv']>;

export type SummaryReviewEvent = string | SummaryReviewEventObject;

export interface SummaryReviewEventObject {
  summary?: string;
  structured_kv?: EditableEventKV;
  meta?: EditableEventKV;
  significance_score?: number;
}

export interface SummaryReviewPayload {
  events: SummaryReviewEvent[];
}

interface SummaryReviewProps {
  content: string;
  data?: { events?: SummaryReviewEvent[] } | SummaryReviewEvent[];
  onChange: (content: string, data: SummaryReviewPayload) => void;
}

type EditableKVKey = keyof EditableEventKV;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (typeof value === 'string') {
    return value.length > 0 ? [value] : [];
  }

  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

function parseEditableEventKV(value: unknown): EditableEventKV | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const result: EditableEventKV = {};
  const event = readString(value.event);
  const timeAnchor = readString(value.time_anchor);
  const causality = readString(value.causality);
  const location = normalizeStringArray(value.location);
  const role = normalizeStringArray(value.role);
  const logic = normalizeStringArray(value.logic);

  if (event !== undefined) result.event = event;
  if (timeAnchor !== undefined) result.time_anchor = timeAnchor;
  if (causality !== undefined) result.causality = causality;
  if (location !== undefined) result.location = location;
  if (role !== undefined) result.role = role;
  if (logic !== undefined) result.logic = logic;

  return result;
}

function parseSummaryReviewEvent(value: unknown): SummaryReviewEvent | null {
  if (typeof value === 'string') {
    return value;
  }

  if (!isRecord(value)) {
    return null;
  }

  return {
    summary: readString(value.summary),
    structured_kv: parseEditableEventKV(value.structured_kv),
    meta: parseEditableEventKV(value.meta),
    significance_score: readNumber(value.significance_score),
  };
}

function parseEventsFromUnknown(
  data: SummaryReviewProps['data'],
  content: string
): SummaryReviewEvent[] {
  const fromData = Array.isArray(data)
    ? data
    : Array.isArray(data?.events)
      ? data.events
      : undefined;
  if (fromData) {
    return fromData;
  }

  if (content) {
    try {
      const cleanContent = content.replace(/```(json)?/g, '').trim();
      const parsed: unknown = JSON.parse(cleanContent);

      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => parseSummaryReviewEvent(item))
          .filter((item): item is SummaryReviewEvent => item !== null);
      }

      if (isRecord(parsed) && Array.isArray(parsed.events)) {
        return parsed.events
          .map((item) => parseSummaryReviewEvent(item))
          .filter((item): item is SummaryReviewEvent => item !== null);
      }
    } catch {
      // Ignore parse errors and fall back to plain text splitting.
    }

    return content
      .split('\n')
      .map((line) => line.trim())
      .filter(
        (line) =>
          line.length > 0 &&
          !line.startsWith('{') &&
          !line.startsWith('}') &&
          !line.startsWith('[') &&
          !line.startsWith(']')
      );
  }

  return [];
}

function serializeEvents(events: SummaryReviewEvent[]): string {
  return JSON.stringify({ events }, null, 2);
}

function isEventObject(event: SummaryReviewEvent): event is SummaryReviewEventObject {
  return typeof event === 'object' && event !== null;
}

function getEventKV(event: SummaryReviewEventObject): EditableEventKV {
  return event.structured_kv ?? event.meta ?? {};
}

function withUpdatedKV(
  event: SummaryReviewEventObject,
  updatedKV: EditableEventKV
): SummaryReviewEventObject {
  if (event.structured_kv) {
    return { ...event, structured_kv: updatedKV };
  }

  if (event.meta) {
    return { ...event, meta: updatedKV };
  }

  return { ...event, structured_kv: updatedKV };
}

export const SummaryReview: FC<SummaryReviewProps> = ({ content, data, onChange }) => {
  const [events, setEvents] = useState<SummaryReviewEvent[]>([]);

  const notifyChange = (newEvents: SummaryReviewEvent[]) => {
    const newContent = serializeEvents(newEvents);
    onChange(newContent, { events: newEvents });
  };

  useEffect(() => {
    const parsed = parseEventsFromUnknown(data, content);
    setEvents(parsed);

    const parentHasEvents = Array.isArray(data) || Array.isArray(data?.events);
    if (!parentHasEvents && parsed.length > 0) {
      onChange(serializeEvents(parsed), { events: parsed });
    }
  }, [content, data, onChange]);

  const handleUpdateKV = (index: number, key: EditableKVKey, value: string) => {
    const next = [...events];
    const current = next[index];
    const event = isEventObject(current)
      ? current
      : ({ summary: current, structured_kv: {} } satisfies SummaryReviewEventObject);

    const currentKV = getEventKV(event);
    const nextValue =
      key === 'location' || key === 'role' || key === 'logic'
        ? value
            .split(/[,，]/)
            .map((item) => item.trim())
            .filter(Boolean)
        : value;

    next[index] = withUpdatedKV(event, {
      ...currentKV,
      [key]: nextValue,
    });

    setEvents(next);
    notifyChange(next);
  };

  const handleChangeEvent = (index: number, value: string) => {
    const next = [...events];
    const current = next[index];
    next[index] = isEventObject(current) ? { ...current, summary: value } : value;
    setEvents(next);
    notifyChange(next);
  };

  const handleRemoveEvent = (index: number) => {
    const next = events.filter((_, eventIndex) => eventIndex !== index);
    setEvents(next);
    notifyChange(next);
  };

  const handleAddEvent = () => {
    const isObjectFormat = events.length > 0 && isEventObject(events[0]);
    const newItem: SummaryReviewEvent = isObjectFormat
      ? { summary: '', meta: {}, significance_score: 0.5 }
      : '';
    const next = [...events, newItem];
    setEvents(next);
    notifyChange(next);
  };

  const renderKV = (event: SummaryReviewEvent, index: number) => {
    if (!isEventObject(event)) {
      return null;
    }

    const kv = getEventKV(event);
    const fields: Array<{ key: EditableKVKey; label: string; color: string }> = [
      { key: 'time_anchor', label: '时间', color: 'text-value border-value/20 bg-value/5' },
      { key: 'location', label: '地点', color: 'text-value border-value/20 bg-value/5' },
      { key: 'role', label: '人物', color: 'text-emphasis border-emphasis/20 bg-emphasis/5' },
      { key: 'logic', label: '逻辑', color: 'text-primary border-primary/20 bg-primary/5' },
      {
        key: 'causality',
        label: '因果',
        color: 'text-orange-400 border-orange-400/20 bg-orange-400/5',
      },
    ];

    return (
      <div className="flex flex-wrap items-center gap-2 mb-3 px-1">
        {fields.map((field) => {
          const rawValue = kv[field.key];
          const value = Array.isArray(rawValue) ? rawValue.join(', ') : (rawValue ?? '');

          return (
            <div
              key={field.key}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded border ${field.color} transition-all focus-within:ring-1 focus-within:ring-offset-0 focus-within:ring-current`}
            >
              <span className="text-[9px] font-bold uppercase opacity-60 pointer-events-none select-none">
                {field.label}:
              </span>
              <input
                value={value}
                onChange={(inputEvent) => handleUpdateKV(index, field.key, inputEvent.target.value)}
                className="bg-transparent border-none outline-none text-[10px] w-[60px] focus:w-[120px] transition-all placeholder:italic placeholder:opacity-30"
                placeholder="..."
                spellCheck={false}
              />
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="text-sm text-muted-foreground bg-muted/20 p-3 rounded-md border border-border/50">
        请确认生成的摘要事件列表。您可以直接在标签内修改结构化数据，或在下方修改描述。
      </div>

      <div className="space-y-4 pr-2 pb-4">
        {events.map((event, index) => {
          const displayTitle = isEventObject(event)
            ? (getEventKV(event).event ?? `Event ${index + 1}`)
            : `Event ${index + 1}`;
          const summaryText = isEventObject(event) ? (event.summary ?? '') : event;
          const rowCount = Math.max(2, Math.ceil(summaryText.length / 40));

          return (
            <div
              key={index}
              className="relative group bg-card border border-border/50 rounded-lg p-3 shadow-sm hover:border-primary/40 transition-colors"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0" />
                  <input
                    value={displayTitle}
                    onChange={(inputEvent) =>
                      handleUpdateKV(index, 'event', inputEvent.target.value)
                    }
                    className="text-xs font-medium text-heading truncate uppercase tracking-wider bg-transparent border-none outline-none focus:text-primary max-w-[200px]"
                    placeholder="事件名称"
                  />
                </div>
                <button
                  onClick={() => handleRemoveEvent(index)}
                  className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity bg-background/50 rounded"
                  title="移除该事件"
                >
                  <X size={14} />
                </button>
              </div>

              {renderKV(event, index)}

              <textarea
                value={summaryText}
                onChange={(inputEvent) => handleChangeEvent(index, inputEvent.target.value)}
                className="w-full min-h-[60px] p-2 bg-muted/20 border border-transparent hover:border-border focus:border-primary focus:bg-background rounded-md text-sm resize-none focus:outline-none transition-colors"
                rows={rowCount}
                placeholder="摘要详情..."
              />
            </div>
          );
        })}

        {events.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm italic">暂无事件记录</div>
        )}

        <button
          onClick={handleAddEvent}
          className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-primary hover:bg-muted/50 rounded-md transition-colors w-full justify-center border border-dashed border-border hover:border-primary/30"
        >
          <Plus size={14} />
          添加事件
        </button>
      </div>
    </div>
  );
};
