import { Logger, LogModule } from '@/core/logger';

import { sleep } from './common';
import { getErrorMessage } from './error';

export interface RetryPolicy {
  /** 总尝试次数，1 表示不重试 */
  maxAttempts: number;
  /** 初始延迟 (ms) */
  delayMs: number;
  /** 省略时使用固定延迟 */
  backoff?: 'linear' | 'exponential';
  /** 判定某个错误是否值得重试，省略时全部重试 */
  retryIf?: (error: unknown) => boolean;
}

/** 按策略执行可重试操作，重试耗尽后抛出最后一次错误。 */
export async function withRetry<T>(
  run: () => Promise<T>,
  policy: RetryPolicy,
  label: string
): Promise<T> {
  let delay = policy.delayMs;

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      const shouldRetry = policy.retryIf ? policy.retryIf(error) : true;
      if (!shouldRetry || attempt >= policy.maxAttempts) {
        throw error;
      }

      Logger.warn(LogModule.RAG_RETRIEVE, `重试 ${label} (${attempt}/${policy.maxAttempts})`, {
        error: getErrorMessage(error),
        delay,
      });
      await sleep(delay);
      if (policy.backoff === 'exponential') {
        delay *= 2;
      }
    }
  }
}
