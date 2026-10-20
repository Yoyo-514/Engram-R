import { engramEventBus } from './event-bus';

export type ReviewAction = 'confirm' | 'reject' | 'reroll' | 'cancel';

export interface ReviewResult {
  action: ReviewAction;
  content: string;
  feedback?: string;
  data?: unknown;
}

export interface ReviewRequest {
  id: string; // Unique ID for multi-tab support
  title: string;
  description: string;
  content: string; // fallback text
  type?: 'text' | 'json' | 'entity' | 'summary';
  data?: unknown; // Structured data for specialized views
  actions?: ReviewAction[];
  onResult: (result: ReviewResult) => void;
}

/**
 * ReviewService - 负责处理内容审查请求
 *
 * 解耦 UI (Modal) 和 业务逻辑 (Summarizer)
 */
class ReviewService {
  /**
   * 请求用户审查内容
   * @returns Promise
   */
  public async requestReview(
    title: string,
    description: string,
    content: string,
    actions: ReviewAction[] = ['confirm'],
    type: 'text' | 'json' | 'entity' | 'summary' = 'text',
    data?: unknown
  ): Promise<ReviewResult> {
    return new Promise((resolve) => {
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      const request: ReviewRequest = {
        id,
        title,
        description,
        content,
        actions,
        type,
        data,
        onResult: (result) => resolve(result),
      };
      engramEventBus.emit({ type: 'REVIEW_REQUESTED', payload: request });
    });
  }
}

export const reviewService = new ReviewService();
