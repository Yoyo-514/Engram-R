import { CheckSquare, Database, MessageSquare, Search, Square } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { FC } from 'react';
import { Virtuoso } from 'react-virtuoso';

import { useMemoryStore } from '@/state/memoryStore';
import type { EntityNode, EventNode } from '@/types/graph';
import type { AgenticRecall } from '@/types/preprocess';
import { SimpleModal } from '@/ui/components/feedback/SimpleModal';

type RecalledEntity = EntityNode & {
  recallWeight?: number;
};

type DisplayEvent = AgenticRecall & {
  summary: string;
  typeLabel: string;
};

interface RecallDecisionModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialRecalls: AgenticRecall[];
  recalledEntities?: RecalledEntity[]; // V1.4: 传入被激活的实体
  onConfirm: (newRecalls: AgenticRecall[]) => void;
}

/**
 * RecallDecisionModal - Agentic RAG 召回决策审阅与编辑弹窗
 */
export const RecallDecisionModal: FC<RecallDecisionModalProps> = ({
  isOpen,
  onClose,
  initialRecalls,
  recalledEntities = [],
  onConfirm,
}) => {
  // 状态: 存储组件内编辑的 recalls (基于 initialRecalls 初始化)
  const [editedRecalls, setEditedRecalls] = useState<AgenticRecall[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [allEvents, setAllEvents] = useState<EventNode[]>([]);

  // 在打开时初始化数据
  useEffect(() => {
    if (isOpen) {
      setEditedRecalls([...initialRecalls]);
      setSearchQuery('');
      const store = useMemoryStore.getState();
      void store.getAllEvents().then((events) => {
        // 只显示 level 0 且已归档的事件
        setAllEvents(events.filter((event) => event.level === 0 && event.is_archived));
      });
    }
  }, [isOpen, initialRecalls]);

  // 分类并过滤数据
  const { activeEvents, inactiveEvents } = useMemo(() => {
    const activeIds = new Set(editedRecalls.map((r) => r.id));

    // 已激活事件 (保留 LLM 原始顺序和 score/reason)
    const active: DisplayEvent[] = editedRecalls
      .map((recall) => {
        const event = allEvents.find((item) => item.id === recall.id);
        return {
          ...recall,
          summary: event?.summary || '(事件未找到)',
          typeLabel: event?.structured_kv.event || 'unknown',
        };
      })
      .sort((a, b) => b.score - a.score); // 降序

    // 未激活事件 (支持文本过滤)
    const inactive = allEvents
      .filter((event) => !activeIds.has(event.id))
      .filter((event) => {
        if (!searchQuery) return true;
        const lowerQ = searchQuery.toLowerCase();
        return (
          event.summary.toLowerCase().includes(lowerQ) ||
          event.structured_kv.event.toLowerCase().includes(lowerQ)
        );
      });

    return { activeEvents: active, inactiveEvents: inactive };
  }, [allEvents, editedRecalls, searchQuery]);

  // --- 交互处理 ---

  const handleConfirm = () => {
    // 构建最终的 AgenticRecall 列表并抛出
    onConfirm(editedRecalls);
    onClose();
  };

  /** 切换激活状态/更新分数 */
  const handleToggleInactive = (eventId: string, defaultScore: number = 0.5) => {
    // 如果原本未激活，现在变为激活，给个默认理由
    setEditedRecalls((prev) => [
      ...prev,
      { id: eventId, score: defaultScore, reason: '用户手动追加召回' },
    ]);
  };

  const handleRemoveActive = (eventId: string) => {
    setEditedRecalls((prev) => prev.filter((r) => r.id !== eventId));
  };

  const handleUpdateScore = (eventId: string, newScore: number) => {
    setEditedRecalls((prev) => prev.map((r) => (r.id === eventId ? { ...r, score: newScore } : r)));
  };

  // --- 渲染渲染函数 ---

  const renderFooter = () => (
    <div className="flex w-full items-center justify-between">
      <span className="text-sm text-muted-foreground">
        已选中 <strong className="font-mono text-value">{editedRecalls.length}</strong> 条即将注入
      </span>
      <div className="flex gap-2">
        <button
          className="rounded-md border-border bg-transparent px-4 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted"
          onClick={onClose}
        >
          取消
        </button>
        <button
          className="text-bg-app rounded-md bg-primary px-4 py-1.5 text-sm shadow-[0_4px_12px_rgba(var(--primary-rgb),0.25)] transition-all hover:brightness-110"
          onClick={handleConfirm}
        >
          确认激活
        </button>
      </div>
    </div>
  );

  return (
    <SimpleModal
      isOpen={isOpen}
      onClose={onClose}
      title="Agentic 召回审阅"
      maxWidth="max-w-3xl"
      footer={renderFooter()}
    >
      <div className="engram-animate-fade-up flex h-[70vh] flex-col">
        {/* === 上半部: 已激活列表 === */}
        <div className="bg-card/20 shrink-0 border-b border-border p-4">
          <h4 className="mb-3 flex items-center justify-between text-sm font-medium text-heading">
            <span>已激活 ({activeEvents.length})</span>
          </h4>
          <div className="max-h-[30vh] space-y-3 overflow-y-auto pr-2">
            {activeEvents.map((evt) => (
              <div
                key={evt.id}
                className="hover:bg-muted/20 group flex flex-col gap-1 rounded p-2 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-1 items-start gap-2">
                    <button
                      className="mt-0.5 shrink-0 cursor-pointer text-primary transition-colors hover:text-destructive"
                      onClick={() => handleRemoveActive(evt.id)}
                      title="取消激活"
                    >
                      <CheckSquare size={16} />
                    </button>
                    <p
                      className="text-foreground/90 whitespace-pre-wrap break-words text-sm leading-relaxed"
                      title={evt.summary}
                    >
                      <span className="mr-2 select-none rounded bg-muted px-1 py-0.5 text-[10px] uppercase text-label">
                        {evt.typeLabel}
                      </span>
                      {evt.summary}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <span className="w-10 text-right font-mono text-xs text-muted-foreground">
                      Score:
                    </span>
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.1"
                      className="border-border/50 w-14 border-b border-none bg-transparent p-0 text-right font-mono text-sm text-value transition-colors hover:border-muted-foreground focus:border-primary focus:ring-0"
                      value={evt.score}
                      onChange={(e) => handleUpdateScore(evt.id, parseFloat(e.target.value) || 0)}
                    />
                  </div>
                </div>
                <div className="mt-1 flex items-start gap-1.5 pl-6">
                  <MessageSquare size={12} className="text-muted-foreground/50 mt-[3px] shrink-0" />
                  <p className="break-words text-xs leading-snug text-emphasis opacity-80 transition-opacity group-hover:opacity-100">
                    {evt.reason}
                  </p>
                </div>
              </div>
            ))}
            {activeEvents.length === 0 && (
              <p className="py-2 text-center text-xs italic text-muted-foreground">
                暂无激活的事件
              </p>
            )}
          </div>

          {/* V1.4: 被唤醒的实体展示 (只读) */}
          {recalledEntities.length > 0 && (
            <div className="border-border/40 mt-4 border-t pt-4">
              <h5 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Database size={12} className="text-primary/60" />
                已唤醒实体 ({recalledEntities.length})
              </h5>
              <div className="flex max-h-[15vh] flex-wrap gap-2 overflow-y-auto pr-1">
                {recalledEntities.map((ent) => (
                  <div
                    key={ent.id}
                    className="bg-primary/5 border-primary/20 text-primary/80 hover:bg-primary/10 flex cursor-default items-center gap-1.5 rounded border px-2 py-1 text-[10px] transition-colors"
                    title={ent.description || ent.name}
                  >
                    <span className="bg-primary/40 h-1.5 w-1.5 rounded-full" />
                    <span className="font-medium">{ent.name}</span>
                    {ent.recallWeight && (
                      <span className="font-mono opacity-40">({ent.recallWeight.toFixed(2)})</span>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[10px] italic text-muted-foreground">
                * 实体将根据关键词匹配或关系联想自动注入对话上下文。
              </p>
            </div>
          )}
        </div>

        {/* === 下半部: 未激活列表 (虚拟滚动) */}
        <div className="flex min-h-0 flex-1 flex-col bg-background">
          <div className="bg-background/80 sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-border p-3 backdrop-blur">
            <h4 className="text-sm font-medium text-heading">待选事件 ({inactiveEvents.length})</h4>
            <div className="relative w-64">
              <Search className="absolute left-2 top-1.5 text-muted-foreground" size={14} />
              <input
                type="text"
                placeholder="搜索归档事件 summary..."
                className="border-border/50 placeholder:text-muted-foreground/30 w-full border-b border-none bg-transparent py-1 pl-7 pr-2 text-sm text-foreground transition-colors focus:border-primary focus:ring-0"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 p-2">
            <Virtuoso
              style={{ height: '100%' }}
              data={inactiveEvents}
              itemContent={(_index, evt) => (
                <div className="hover:bg-muted/20 border-border/20 mb-1 flex flex-col gap-1 rounded border-b border-transparent p-2 transition-colors last:border-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-1 items-start gap-2">
                      <button
                        className="text-muted-foreground/50 mt-0.5 shrink-0 cursor-pointer transition-colors hover:text-primary"
                        onClick={() => handleToggleInactive(evt.id, 0.5)}
                        title="添加激活"
                      >
                        <Square size={16} />
                      </button>
                      <p
                        className="text-foreground/90 whitespace-pre-wrap break-words text-sm leading-relaxed"
                        title={evt.summary}
                      >
                        <span className="mr-2 select-none rounded bg-muted px-1 py-0.5 text-[10px] uppercase text-label">
                          {evt.structured_kv.event}
                        </span>
                        {evt.summary}
                      </p>
                    </div>

                    {/* 快捷打分 */}
                    <div className="bg-muted/20 flex shrink-0 items-center gap-1 rounded px-2 py-1">
                      {[
                        { label: '低', val: 0.3 },
                        { label: '中', val: 0.6 },
                        { label: '高', val: 0.9 },
                      ].map((btn) => (
                        <button
                          key={btn.label}
                          onClick={() => handleToggleInactive(evt.id, btn.val)}
                          className="rounded bg-transparent px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        >
                          {btn.label}
                        </button>
                      ))}
                      <span className="mx-1 text-border">|</span>
                      <input
                        type="number"
                        min="0"
                        max="1"
                        step="0.1"
                        placeholder="0.0"
                        className="border-border/50 w-10 border-b border-none bg-transparent p-0 text-right font-mono text-xs text-value transition-colors focus:border-primary focus:ring-0"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const val = parseFloat((e.target as HTMLInputElement).value) || 0.5;
                            handleToggleInactive(evt.id, val);
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
            />
          </div>
        </div>
      </div>
    </SimpleModal>
  );
};
