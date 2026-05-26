import { Logger } from '@/core/logger';
import { getSTContext } from '@/integrations/tavern';

const MODULE = 'Worldbook';

async function getTokenCountAsync(text: string): Promise<number> {
  try {
    const context = getSTContext();
    if (context?.getTokenCountAsync) {
      return await context.getTokenCountAsync(text);
    }

    return Math.ceil(text.length / 4);
  } catch {
    Logger.warn(MODULE, '无法使用酒馆 Token 计数，回退到字符估算');
    return Math.ceil(text.length / 4);
  }
}

/**
 * 统计单段文本 token 数
 */
export async function countTokens(text: string): Promise<number> {
  return getTokenCountAsync(text);
}

/**
 * 检查是否可用原生 token 计数接口
 */
export async function isNativeTokenCountAvailable(): Promise<boolean> {
  try {
    const context = getSTContext();
    return typeof context?.getTokenCountAsync === 'function';
  } catch {
    return false;
  }
}
