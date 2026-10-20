import { reviewService, type ReviewResult, type ReviewRequest } from '@/core/events/ReviewService';
import { countWorldbookTokens } from '@/integrations/tavern';

export interface OutputReviewOptions {
  title: string;
  type?: ReviewRequest['type'];
  description?: string;
  range?: [number, number];
  data?: unknown;
}

/** 把生成结果交给审阅界面，返回用户动作与（可能被编辑的）正文。 */
export async function requestOutputReview(
  content: string,
  options: OutputReviewOptions
): Promise<ReviewResult> {
  if (!content.trim()) {
    throw new Error('生成的摘要内容为空，请检查模型输出或 Token 限制。');
  }

  const tokenCount = await countWorldbookTokens(content);
  const range = options.range ? `${options.range[0]} - ${options.range[1]} 楼` : '未知范围';

  return reviewService.requestReview(
    options.title,
    options.description || `范围: ${range} | Token: ${tokenCount}`,
    content,
    ['confirm', 'reject', 'reroll', 'cancel'],
    options.type ?? 'text',
    options.data
  );
}
