import {
  AlertTriangle,
  ArrowDownToLine,
  Check,
  Layers,
  Minus,
  RefreshCw,
  RotateCcw,
  X,
} from 'lucide-react';
import type { FC } from 'react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { engramEventBus } from '@/core/events';
import type { ReviewAction, ReviewRequest } from '@/core/events/ReviewService';
import type { EntityNode } from '@/types/graph';
import type { AgenticRecall } from '@/types/preprocess';
import { ModernButton as Button } from '@/ui/components/core/Button';

import { EntityReview } from './EntityReview';
import { MessageReview } from './MessageReview';
import { RecallDecisionModal } from './RecallDecisionModal';
import { SummaryReview } from './SummaryReview'; // V1.2
import type { SummaryReviewEvent } from './SummaryReview';

interface ReviewSessionData {
  query?: string;
  agenticRecalls?: AgenticRecall[];
  newEntities?: EntityNode[];
  updatedEntities?: EntityNode[];
  events?: SummaryReviewEvent[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function isAgenticRecall(value: unknown): value is AgenticRecall {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.score === 'number' &&
    typeof value.reason === 'string'
  );
}

function isEntityNode(value: unknown): value is EntityNode {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    Array.isArray(value.aliases) &&
    typeof value.description === 'string' &&
    isRecord(value.profile)
  );
}

function toReviewSessionData(value: unknown): ReviewSessionData | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    query: typeof value.query === 'string' ? value.query : undefined,
    agenticRecalls:
      Array.isArray(value.agenticRecalls) && value.agenticRecalls.every(isAgenticRecall)
        ? value.agenticRecalls
        : undefined,
    newEntities:
      Array.isArray(value.newEntities) && value.newEntities.every(isEntityNode)
        ? value.newEntities
        : undefined,
    updatedEntities:
      Array.isArray(value.updatedEntities) && value.updatedEntities.every(isEntityNode)
        ? value.updatedEntities
        : undefined,
  };
}

// --- Sub-component: ReviewSession ---
// Encapsulates state and logic for a SINGLE review request
interface ReviewSessionProps {
  request: ReviewRequest;
  isActive: boolean;
  onFinish: (requestId: string) => void;
  footerEl: HTMLElement | null; // V1.5: Portal target for footer
}

const ReviewSession: FC<ReviewSessionProps> = ({ request, isActive, onFinish, footerEl }) => {
  // Independent state for this session
  const [content, setContent] = useState(request.content);
  const [data, setData] = useState<ReviewSessionData | undefined>(() =>
    toReviewSessionData(request.data)
  );
  const [query, setQuery] = useState<string | undefined>(
    () => toReviewSessionData(request.data)?.query
  );

  // Phase 2 Fix: 监听 request 的变化以同步状态（防御闭包读取到早期缓存）
  useEffect(() => {
    const nextData = toReviewSessionData(request.data);
    setContent(request.content);
    setData(nextData);
    setQuery(nextData?.query);
  }, [request.content, request.data]);

  // Reject Feedback State
  const [feedback, setFeedback] = useState('');
  const [showFeedbackInput, setShowFeedbackInput] = useState(false);
  const [isRecallModalOpen, setIsRecallModalOpen] = useState(false);

  const handleAction = (action: ReviewAction) => {
    if (action === 'reject' && !showFeedbackInput) {
      setShowFeedbackInput(true);
      return;
    }

    const resultData = query !== undefined ? { ...data, query } : data;
    request.onResult({
      action,
      content,
      data: resultData,
      feedback: action === 'reject' ? feedback : undefined,
    });

    // Notify parent to remove this session
    onFinish(request.id);
  };

  // Keep mounted but hidden if not active to preserve state
  const displayStyle = isActive ? { display: 'flex' } : { display: 'none' };

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col" style={displayStyle}>
      {/* Header (Session Info) - Optional, can be merged into Tab bar or kept here */}
      {request.description && (
        <div className="bg-muted/20 flex items-center justify-between border-b border-border px-5 py-2 text-xs text-muted-foreground">
          <span>{request.description}</span>
          <span className="rounded border border-border bg-background px-1 uppercase">
            {request.type}
          </span>
        </div>
      )}

      {/* Content Area */}
      <div className="bg-background/50 custom-scrollbar min-h-0 flex-1 overflow-y-auto p-5">
        {showFeedbackInput ? (
          <div className="animate-in fade-in slide-in-from-bottom-2 flex h-full flex-col gap-4">
            <div className="bg-destructive/10 border-destructive/20 flex items-center gap-3 rounded-md border p-4">
              <AlertTriangle className="shrink-0 text-destructive" />
              <div>
                <h4 className="font-medium text-destructive">准备打回重写</h4>
                <p className="text-destructive/80 text-xs">
                  请输入修改意见，AI 将根据您的反馈重新生成。
                </p>
              </div>
            </div>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              className="min-h-[150px] w-full flex-1 resize-none rounded-md border border-border bg-muted p-4 focus:ring-2 focus:ring-destructive"
              placeholder="例如：请不要引入新人物..."
              autoFocus
            />
          </div>
        ) : request.type === 'entity' ? (
          <EntityReview
            data={{
              newEntities: data?.newEntities ?? [],
              updatedEntities: data?.updatedEntities ?? [],
            }}
            onChange={(newData) => setData(newData)}
          />
        ) : request.type === 'summary' ? (
          <SummaryReview
            content={content}
            data={data}
            onChange={(newContent, newData) => {
              setContent(newContent);
              setData(newData);
            }}
          />
        ) : (
          <MessageReview
            content={content}
            onChange={(newContent) => setContent(newContent)}
            query={query}
            onQueryChange={query !== undefined ? setQuery : undefined}
            agenticRecalls={data?.agenticRecalls}
            onAgenticRecallsChange={(newRecalls) =>
              setData((prev) => ({ ...prev, agenticRecalls: newRecalls }))
            }
            onOpenRecallModal={() => setIsRecallModalOpen(true)}
          />
        )}
      </div>

      {/* Footer / Action Bar (Portaled to Window Level) */}
      {footerEl &&
        isActive &&
        createPortal(
          <div className="flex h-full w-full flex-col-reverse items-center justify-between gap-4 px-4 py-4 sm:flex-row sm:gap-0 sm:px-5">
            <div className="flex w-full gap-2 sm:w-auto">
              {showFeedbackInput ? (
                <Button
                  label="返回"
                  onClick={() => setShowFeedbackInput(false)}
                  className="w-full sm:w-auto"
                />
              ) : (
                request.actions?.includes('fill') && (
                  <Button
                    label="填充"
                    icon={ArrowDownToLine}
                    onClick={() => handleAction('fill')}
                    className="w-full text-muted-foreground hover:text-foreground sm:w-auto"
                  />
                )
              )}
            </div>
            <div className="flex w-full gap-3 sm:w-auto">
              {showFeedbackInput ? (
                <Button
                  label="提交打回"
                  icon={RotateCcw}
                  onClick={() => handleAction('reject')}
                  disabled={!feedback.trim()}
                  className="hover:bg-destructive/90 w-full bg-destructive text-destructive-foreground sm:w-auto"
                />
              ) : (
                <>
                  {request.actions?.includes('reject') && (
                    <Button
                      label="打回"
                      icon={RotateCcw}
                      onClick={() => handleAction('reject')}
                      className="hover:bg-destructive/10 border-destructive/30 flex-1 text-destructive sm:flex-none"
                    />
                  )}
                  {request.actions?.includes('reroll') && (
                    <Button
                      label="重抽"
                      icon={RefreshCw}
                      onClick={() => handleAction('reroll')}
                      className="flex-1 sm:flex-none"
                    />
                  )}
                  {request.actions?.includes('confirm') && (
                    <Button
                      label="确认"
                      icon={Check}
                      primary
                      onClick={() => handleAction('confirm')}
                      className="min-w-[100px] flex-1 sm:flex-none"
                    />
                  )}
                </>
              )}
            </div>
          </div>,
          footerEl
        )}

      {/* Agentic RAG 决策编辑弹窗 (V1.4) */}
      {data?.agenticRecalls && (
        <RecallDecisionModal
          isOpen={isRecallModalOpen}
          onClose={() => setIsRecallModalOpen(false)}
          initialRecalls={data.agenticRecalls}
          onConfirm={(newRecalls) => {
            setData((prev) => ({ ...prev, agenticRecalls: newRecalls }));
            setIsRecallModalOpen(false);
          }}
        />
      )}
    </div>
  );
};

// --- Main Container ---
export const ReviewContainer: FC = () => {
  const [requests, setRequests] = useState<ReviewRequest[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [footerEl, setFooterEl] = useState<HTMLElement | null>(null); // State to hold ref to footer slot

  useEffect(() => {
    const subscription = engramEventBus.on<ReviewRequest>('REVIEW_REQUESTED', (req) => {
      // Ensure ID exists (fallback for old callers though we updated Bridge)
      if (!req.id) req.id = Date.now().toString();

      setRequests((prev) => {
        const exists = prev.find((r) => r.id === req.id);
        if (exists) return prev;
        return [...prev, req];
      });

      // If it's the first one, activate it
      setActiveId((current) => current || req.id);
      setIsMinimized(false);
    });
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleSessionFinish = (finishedId: string) => {
    setRequests((prev) => {
      const next = prev.filter((r) => r.id !== finishedId);
      // If we removed the active one, switch to another if available
      if (activeId === finishedId) {
        const nextActive = next.length > 0 ? next[0].id : null;
        setActiveId(nextActive);
      }
      return next;
    });
  };

  const handleRestore = () => setIsMinimized(false);

  // Render Logic
  if (requests.length === 0) return null;

  // Minimized Badge
  if (isMinimized) {
    return createPortal(
      <div className="engram-app-root" style={{ display: 'contents' }}>
        <div className="animate-in zoom-in slide-in-from-bottom-4 pointer-events-auto fixed bottom-4 right-4 z-[9999]">
          <button
            onClick={handleRestore}
            className="border-primary-foreground/20 flex items-center gap-2 rounded-full border-2 bg-primary px-4 py-3 font-medium text-primary-foreground shadow-lg transition-transform hover:scale-105"
          >
            <Layers size={18} className="animate-pulse" />
            <span>待处理 ({requests.length})</span>
          </button>
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className="engram-app-root" style={{ display: 'contents' }}>
      <div
        className="pointer-events-auto fixed inset-0 z-[11000] flex items-center justify-center p-4 sm:p-4"
        style={{ height: '100dvh', width: '100vw' }} // Explicitly force full viewport info
      >
        <div className="bg-background/80 animate-in fade-in absolute inset-0 backdrop-blur-sm duration-200" />

        <div className="animate-in zoom-in-95 relative flex h-[90dvh] min-h-0 w-full max-w-4xl flex-col rounded-lg border border-t-4 border-border border-t-primary bg-popover shadow-2xl sm:h-auto sm:max-h-[90vh] sm:min-h-[500px]">
          {/* Top Bar: Tabs & Window Controls */}
          <div className="bg-muted/40 flex items-center justify-between border-b border-border px-2 pt-2">
            {/* Tabs Scroll Area */}
            <div className="no-scrollbar flex flex-1 items-center gap-1 overflow-x-auto pr-4">
              {requests.map((req) => {
                const isActive = req.id === activeId;
                return (
                  <button
                    key={req.id}
                    onClick={() => setActiveId(req.id)}
                    className={`mb-[-1px] flex items-center gap-2 rounded-t-md border-x border-t px-4 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? 'z-10 border-border border-b-transparent bg-popover text-foreground'
                        : 'bg-muted/50 hover:bg-muted/80 border-transparent text-muted-foreground hover:text-foreground'
                    } `}
                  >
                    <span className="max-w-[120px] truncate">{req.title}</span>
                  </button>
                );
              })}
            </div>

            {/* Window Controls */}
            <div className="mb-1 flex items-center gap-1 px-2">
              <button
                onClick={() => setIsMinimized(true)}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                title="最小化"
              >
                <Minus size={16} />
              </button>
              <button
                onClick={() => {
                  if (activeId) {
                    // Cancel active request
                    const req = requests.find((r) => r.id === activeId);
                    if (req) {
                      req.onResult({ action: 'cancel', content: '', data: req.data });
                      handleSessionFinish(activeId);
                    }
                  }
                }}
                className="hover:bg-destructive/10 rounded-md p-1.5 text-muted-foreground transition-colors hover:text-destructive"
                title="关闭/取消当前"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Sessions Area */}
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            {requests.map((req) => (
              <ReviewSession
                key={req.id}
                request={req}
                isActive={req.id === activeId}
                onFinish={handleSessionFinish}
                footerEl={footerEl}
              />
            ))}
            {/* Empty State (Shouldn't happen if logic is correct) */}
            {requests.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
                <Check size={48} className="mb-2 opacity-20" />
                <p>所有任务已完成</p>
              </div>
            )}
          </div>

          {/* Footer Slot (Window Level) */}
          <div
            ref={setFooterEl}
            className="bg-muted/30 min-h-[60px] flex-none border-t border-border"
          >
            {/* Portaled Content will appear here */}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
