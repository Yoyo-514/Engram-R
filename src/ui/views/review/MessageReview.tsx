import { BrainCircuit, FileText, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FC, ChangeEvent } from 'react';

import type { AgenticRecall } from '@/types/preprocess';

interface MessageReviewProps {
  content: string;
  onChange: (newContent: string) => void;
  /** Query 内容 (可选) */
  query?: string;
  /** Query 变更回调 (可选) */
  onQueryChange?: (newQuery: string) => void;
  /** Agentic RAG 召回决策 (可选) */
  agenticRecalls?: AgenticRecall[];
  /** 召回决策变更回调 (可选) */
  onAgenticRecallsChange?: (newRecalls: AgenticRecall[]) => void;
  /** 组件内点击编辑时，触发召回 Modal 打开 */
  onOpenRecallModal?: () => void;
}

export const MessageReview: FC<MessageReviewProps> = ({
  content,
  onChange,
  query,
  onQueryChange,
  agenticRecalls,
  onAgenticRecallsChange,
  onOpenRecallModal,
}) => {
  const [text, setText] = useState(content);
  const [queryText, setQueryText] = useState(query || '');

  useEffect(() => {
    setText(content);
  }, [content]);

  useEffect(() => {
    setQueryText(query || '');
  }, [query]);

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);
    onChange(val);
  };

  const handleQueryChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setQueryText(val);
    onQueryChange?.(val);
  };

  const showQuery = query !== undefined && onQueryChange !== undefined;
  const showAgentic = agenticRecalls !== undefined && onAgenticRecallsChange !== undefined;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="bg-muted/20 border-border/50 shrink-0 rounded-md border p-3 text-sm text-muted-foreground">
        请检查生成的内容。您可以直接编辑文本，或者使用下方按钮进行重生成。
      </div>

      {/* Output 区域 */}
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <FileText size={16} className="text-primary" />
          <span>输出内容 (Output)</span>
        </div>
        <div className="relative flex-1">
          <textarea
            value={text}
            onChange={handleChange}
            className="bg-muted/50 custom-scrollbar h-full min-h-[100px] w-full resize-none rounded-md border border-border p-4 font-mono text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            spellCheck={false}
            placeholder="在此编辑输出内容..."
          />
          <div className="bg-background/80 pointer-events-none absolute bottom-2 right-2 rounded px-2 py-1 text-xs text-muted-foreground">
            {text.length} 字符
          </div>
        </div>
      </div>

      {/* Query 区域 - 仅在有 query 时显示 */}
      {showQuery && (
        <div className="flex shrink-0 flex-col gap-2">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Search size={16} className="text-accent-foreground" />
            <span>检索关键词 (Query)</span>
            <span className="text-xs font-normal text-muted-foreground">用于 RAG 召回</span>
          </div>
          <div className="relative">
            <textarea
              value={queryText}
              onChange={handleQueryChange}
              className="bg-accent/10 border-accent/30 custom-scrollbar min-h-[80px] w-full resize-none rounded-md border p-4 font-mono text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              spellCheck={false}
              placeholder="RAG 检索关键词..."
            />
            <div className="bg-background/80 pointer-events-none absolute bottom-2 right-2 rounded px-2 py-1 text-xs text-muted-foreground">
              {queryText.length} 字符
            </div>
          </div>
        </div>
      )}

      {/* Agentic RAG 召回决策区域 */}
      {showAgentic && (
        <div className="flex shrink-0 flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <BrainCircuit size={16} className="text-primary" />
              <span>Agentic 召回决策</span>
              <span className="text-xs font-normal text-muted-foreground">
                基于用户意图的智能检索
              </span>
            </div>
            {onOpenRecallModal && (
              <button
                onClick={onOpenRecallModal}
                className="bg-card/50 rounded border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                查看 / 编辑
              </button>
            )}
          </div>
          {agenticRecalls && agenticRecalls.length > 0 ? (
            <div className="bg-accent/10 border-accent/20 custom-scrollbar flex max-h-[150px] flex-col gap-1 overflow-y-auto rounded-md border p-2">
              {agenticRecalls.map((r, i) => (
                <div key={i} className="hover:bg-muted/30 flex flex-col gap-0.5 rounded p-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-mono text-xs text-muted-foreground">{r.id}</span>
                    <span className="font-mono text-xs text-value">Score: {r.score}</span>
                  </div>
                  <p className="line-clamp-1 text-xs text-emphasis" title={r.reason}>
                    {r.reason}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-muted/20 border-border/50 rounded-md border p-3 text-center text-xs text-muted-foreground">
              本次无召回决策
            </div>
          )}
        </div>
      )}
    </div>
  );
};
