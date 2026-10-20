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
import { isRecord } from '@/core/utils';
import type { EntityNode } from '@/types/graph';
import { ModernButton as Button } from '@/ui/components/core/Button';

import { EntityReview } from './EntityReview';
import { MessageReview } from './MessageReview';
import { SummaryReview } from './SummaryReview';
import type { SummaryReviewEvent } from './SummaryReview';

interface ReviewSessionData {
  newEntities?: EntityNode[];
  updatedEntities?: EntityNode[];
  events?: SummaryReviewEvent[];
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
  footerEl: HTMLElement | null; // Portal target for footer
}

const ReviewSession: FC<ReviewSessionProps> = ({ request, isActive, onFinish, footerEl }) => {
  // Independent state for this session
  const [content, setContent] = useState(request.content);
  const [data, setData] = useState<ReviewSessionData | undefined>(() =>
    toReviewSessionData(request.data)
  );

  // 监听 request 的变化以同步状态（渲染期间调整 state，替代 effect 同步）
  // 防御闭包读取到早期缓存
  const [prevContent, setPrevContent] = useState(request.content);
  const [prevData, setPrevData] = useState(request.data);
  if (prevContent !== request.content || prevData !== request.data) {
    setPrevContent(request.content);
    setPrevData(request.data);
    const nextData = toReviewSessionData(request.data);
    setContent(request.content);
    setData(nextData);
  }

  // 打回反馈状态
  const [feedback, setFeedback] = useState('');
  const [showFeedbackInput, setShowFeedbackInput] = useState(false);

  const handleAction = (action: ReviewAction) => {
    if (action === 'reject' && !showFeedbackInput) {
      setShowFeedbackInput(true);
      return;
    }

    request.onResult({
      action,
      content,
      data,
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
        <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/20 px-5 py-2 text-xs text-muted-foreground">
          <span className="min-w-0 flex-1 break-words">{request.description}</span>
          <span className="shrink-0 rounded border border-border bg-background px-1 uppercase">
            {request.type}
          </span>
        </div>
      )}

      {/* Content Area */}
      <div className="custom-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-background/40 p-4 sm:p-5">
        {showFeedbackInput ? (
          <div className="animate-in fade-in slide-in-from-bottom-2 flex h-full flex-col gap-4">
            <div className="flex items-center gap-3 rounded-md border border-destructive/20 bg-destructive/10 p-4">
              <AlertTriangle className="shrink-0 text-destructive" />
              <div>
                <h4 className="font-medium text-destructive">准备打回重写</h4>
                <p className="text-xs text-destructive/80">
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
          <MessageReview content={content} onChange={(newContent) => setContent(newContent)} />
        )}
      </div>

      {/* Footer / Action Bar (Portaled to Window Level) */}
      {footerEl &&
        isActive &&
        createPortal(
          <div className="flex h-full w-full flex-col-reverse items-center justify-between gap-4 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:gap-0 sm:px-5 sm:py-4">
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
                  className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90 sm:w-auto"
                />
              ) : (
                <>
                  {request.actions?.includes('reject') && (
                    <Button
                      label="打回"
                      icon={RotateCcw}
                      onClick={() => handleAction('reject')}
                      className="flex-1 border-destructive/30 text-destructive hover:bg-destructive/10 sm:flex-none"
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
            className="flex items-center gap-2 rounded-full border-2 border-primary-foreground/20 bg-primary px-4 py-3 font-medium text-primary-foreground shadow-lg transition-transform hover:scale-105"
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
        className="pointer-events-auto fixed inset-0 z-[11000] flex items-stretch justify-center p-0 sm:items-center sm:p-4"
        style={{ height: '100dvh', width: '100vw' }} // Explicitly force full viewport info
      >
        <div className="animate-in fade-in absolute inset-0 bg-background/80 backdrop-blur-sm duration-200" />

        <div className="engram-acrylic cq animate-in zoom-in-95 relative flex h-[100dvh] min-h-0 w-full flex-col overflow-hidden shadow-[var(--shadow-3)] sm:h-auto sm:max-h-[90vh] sm:max-w-4xl sm:rounded-xl sm:border sm:border-t-4 sm:border-border sm:border-t-primary">
          {/* Top Bar: Tabs & Window Controls */}
          <div className="flex items-center justify-between border-b border-border/60 bg-muted/30 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:pt-2">
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
                        : 'border-transparent bg-muted/50 text-muted-foreground hover:bg-muted/80 hover:text-foreground'
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
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
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
            className="flex-none border-t border-border/60 bg-muted/20"
          >
            {/* Portaled Content will appear here */}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
