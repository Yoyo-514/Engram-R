import { reviewService, type ReviewRequest } from '@/core/events/ReviewService';
import { Logger } from '@/core/logger';
import { isRecord, parseJson } from '@/core/utils';
import { countWorldbookTokens } from '@/integrations/tavern';
import type { JobContext } from '@/types/job_context';
import type { IStep, StepResult } from '@/types/step';
import { notificationService } from '@/ui/services/NotificationService';

interface UserReviewConfig {
  title: string;
  description?: string;
  type?: ReviewRequest['type'];
}

interface ReviewPayload {
  newEntities?: unknown[];
  updatedEntities?: unknown[];
}

function isReviewPayload(value: unknown): value is ReviewPayload {
  if (!isRecord(value)) {
    return false;
  }

  return (
    (value.newEntities === undefined || Array.isArray(value.newEntities)) &&
    (value.updatedEntities === undefined || Array.isArray(value.updatedEntities))
  );
}

export class UserReview implements IStep {
  name = 'UserReview';

  constructor(private config: UserReviewConfig) {}

  async execute(context: JobContext): Promise<StepResult> {
    Logger.debug('UserReview', 'previewEnabled check', {
      previewEnabled: context.config.previewEnabled,
      configKeys: Object.keys(context.config),
    });

    if (!context.config.previewEnabled) {
      // 实体流程已完成预演，保留结构化结果供落库；文本流程沿用清洗后的正文。
      if (this.config.type !== 'entity') {
        context.output = context.cleanedContent || context.llmResponse?.content;
      }
      Logger.info('UserReview', 'Preview disabled, skipping review');
      return;
    }

    const contentToReview = context.cleanedContent || context.llmResponse?.content || '';
    if (!contentToReview.trim()) {
      Logger.warn('UserReview', 'Content is empty, skipping review');
      throw new Error('生成的摘要内容为空，请检查模型输出或 Token 限制。');
    }

    const tokenCount = await countWorldbookTokens(contentToReview);
    const range = context.input.range
      ? `${context.input.range[0]} - ${context.input.range[1]} 楼`
      : '未知范围';
    const reviewType = this.config.type ?? 'text';
    let reviewData: unknown;

    if (reviewType === 'entity') {
      reviewData = context.output ?? context.parsedData;
    } else if (reviewType === 'json') {
      reviewData = context.parsedData;
    }

    Logger.info('UserReview', '等待用户修订...');
    const result = await reviewService.requestReview(
      this.config.title,
      this.config.description || `范围: ${range} | Token: ${tokenCount}`,
      contentToReview,
      ['confirm', 'fill', 'reject', 'reroll', 'cancel'],
      reviewType,
      reviewData
    );

    if (result.action === 'fill') {
      // 填充正文后结束流程，跳过后续专用处理。
      Logger.info('UserReview', 'User chose to Fill/Skip');
      context.output = result.content;
      context.metadata.skipToInjection = true;
      return { action: 'finish' };
    }

    if (result.action === 'reroll') {
      Logger.info('UserReview', '用户选择重抽 (无反馈)');
      context.input.feedback = '';
      this.clearContextOutput(context);
      return { action: 'jump', targetStep: 'BuildPrompt', reason: 'User reroll' };
    }

    if (result.action === 'reject') {
      Logger.info('UserReview', '用户选择打回重生成');
      context.input.feedback = result.feedback;
      context.input.previousOutput = contentToReview;
      this.clearContextOutput(context);
      return { action: 'jump', targetStep: 'BuildPrompt', reason: 'User rejected' };
    }

    if (result.action === 'cancel') {
      Logger.info('UserReview', 'User explicitly cancelled via Review UI');
      notificationService.info('已取消操作', '操作取消');
      throw new Error('UserCancelled');
    }

    context.cleanedContent = result.content;
    if (isReviewPayload(result.data)) {
      const data = result.data;
      if (data.newEntities || data.updatedEntities) {
        context.parsedData = data;
        context.output = data;
      } else {
        context.output = result.content;
      }
    } else {
      context.output = result.content;
    }

    Logger.info('UserReview', '用户确认修订');
    return { action: 'next' };
  }

  private clearContextOutput(context: JobContext) {
    context.output = undefined;
    context.parsedData = undefined;
    if (context.llmResponse) {
      context.llmResponse.content = '';
    }
    context.extractedTags = undefined;
  }
}
