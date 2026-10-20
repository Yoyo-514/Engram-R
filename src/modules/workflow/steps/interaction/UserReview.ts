import { requestOutputReview } from '@/core/events/OutputReview';
import { type ReviewRequest } from '@/core/events/ReviewService';
import { Logger } from '@/core/logger';
import { isRecord } from '@/core/utils';
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

/** 工作流适配层；实体链已改用 requestOutputReview 的显式循环。 */
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
    const reviewType = this.config.type ?? 'text';
    const reviewData =
      reviewType === 'entity'
        ? (context.output ?? context.parsedData)
        : reviewType === 'json'
          ? context.parsedData
          : undefined;

    Logger.info('UserReview', '等待用户修订...');
    const result = await requestOutputReview(contentToReview, {
      title: this.config.title,
      description: this.config.description,
      type: reviewType,
      range: context.input.range,
      data: reviewData,
    });

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
      clearContextOutput(context);
      return { action: 'jump', targetStep: 'BuildPrompt', reason: 'User reroll' };
    }

    if (result.action === 'reject') {
      Logger.info('UserReview', '用户选择打回重生成');
      context.input.feedback = result.feedback;
      context.input.previousOutput = contentToReview;
      clearContextOutput(context);
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
}

function clearContextOutput(context: JobContext): void {
  context.output = undefined;
  context.parsedData = undefined;
  if (context.llmResponse) {
    context.llmResponse.content = '';
  }
  context.extractedTags = undefined;
}
