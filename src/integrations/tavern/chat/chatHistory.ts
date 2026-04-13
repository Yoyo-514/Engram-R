import { SettingsManager } from '@/config/settings';
import { Logger } from '@/core/logger';
import type { SummarizerConfig } from '@/modules/memory/types';
import { regexProcessor } from '@/modules/workflow/steps';
import { useMemoryStore } from '@/state/memoryStore';
import { getSTContext, type RawSTChatMessage } from '../core/context';
import { getTavernHelper } from '@/core/utils';

type RegexSource = 'user_input' | 'ai_output';

type ChatHistoryMessage = RawSTChatMessage & {
  content?: string;
  message?: string;
};

function getMessageContent(message: ChatHistoryMessage): string {
  return message.mes || message.content || message.message || '';
}

const PROCESSED_MESSAGE_CACHE_LIMIT = 500;

export class ChatHistoryHelper {
  private static processedMessageCache = new Map<string, string>();
  private static cacheSignature = '';

  private static resetCacheIfNeeded(signature: string): void {
    if (this.cacheSignature === signature) {
      return;
    }

    this.cacheSignature = signature;
    this.processedMessageCache.clear();
  }

  private static getCachedProcessedMessage(cacheKey: string): string | undefined {
    const cached = this.processedMessageCache.get(cacheKey);
    if (cached === undefined) {
      return undefined;
    }

    this.processedMessageCache.delete(cacheKey);
    this.processedMessageCache.set(cacheKey, cached);
    return cached;
  }

  private static setCachedProcessedMessage(cacheKey: string, value: string): void {
    if (this.processedMessageCache.has(cacheKey)) {
      this.processedMessageCache.delete(cacheKey);
    } else if (this.processedMessageCache.size >= PROCESSED_MESSAGE_CACHE_LIMIT) {
      const oldestKey = this.processedMessageCache.keys().next().value;
      if (oldestKey !== undefined) {
        this.processedMessageCache.delete(oldestKey);
      }
    }

    this.processedMessageCache.set(cacheKey, value);
  }

  private static processMessage(
    message: ChatHistoryMessage,
    index: number,
    messageCount: number,
    tavernHelper: ReturnType<typeof getTavernHelper>,
    enableNativeRegex: boolean,
    hasTavernHelper: boolean,
    hasFormatFunc: boolean
  ): string {
    let content = getMessageContent(message);
    const originalContent = content;
    const regexSource: RegexSource = message.is_user ? 'user_input' : 'ai_output';
    const cacheKey = `${regexSource}|${originalContent}`;
    const cachedContent = this.getCachedProcessedMessage(cacheKey);

    if (cachedContent !== undefined) {
      if (index === 0 || index === messageCount - 1) {
        Logger.debug('ChatHistoryHelper', '消息处理详情', {
          index,
          original: originalContent.substring(0, 50),
          source: regexSource,
          cacheHit: true,
          result: cachedContent.substring(0, 50),
        });
      }

      return cachedContent;
    }

    if (index === 0) {
      Logger.debug('ChatHistoryHelper', 'TavernHelper 诊断', {
        hasTavernHelper,
        hasFormatFunc,
        enableNativeRegex,
        availableMethods: tavernHelper ? Object.keys(tavernHelper).slice(0, 10) : [],
      });
    }

    if (enableNativeRegex && hasTavernHelper && hasFormatFunc) {
      try {
        const prev = content;

        if (tavernHelper?.formatAsTavernRegexedString) {
          content = tavernHelper.formatAsTavernRegexedString(content, regexSource, 'prompt');
        }

        if (index === 0) {
          Logger.debug('ChatHistoryHelper', 'TavernHelper 正则结果', {
            didChange: prev !== content,
            prevLength: prev.length,
            afterLength: content.length,
          });
        }

        if (!content && prev) {
          if (index === 0) {
            Logger.debug('ChatHistoryHelper', 'TavernHelper stripped content empty! (Recovered)', {
              prev,
              content,
            });
          }
          content = prev;
        }
      } catch (err) {
        Logger.warn('ChatHistoryHelper', '酒馆原生正则清洗失败', err);
      }
    } else if (index === 0 && !enableNativeRegex) {
      Logger.debug('ChatHistoryHelper', '酒馆原生正则已禁用，跳过清洗');
    } else if (index === 0) {
      Logger.warn('ChatHistoryHelper', 'TavernHelper.formatAsTavernRegexedString 不可用', {
        hasTavernHelper,
        hasFormatFunc,
      });
    }

    const preRegex = content;
    content = regexProcessor.process(content, 'both');

    if (!content && preRegex) {
      Logger.warn('ChatHistoryHelper', 'RegexProcessor 清洗后内容为空!', {
        preRegex,
        content,
      });
    }

    if (index === 0 || index === messageCount - 1) {
      Logger.debug('ChatHistoryHelper', '消息处理详情', {
        index,
        original: originalContent.substring(0, 50),
        source: regexSource,
        step1_tavern: preRegex.substring(0, 50),
        step2_regex: content.substring(0, 50),
        cacheHit: false,
      });
    }

    this.setCachedProcessedMessage(cacheKey, content);
    return content;
  }

  static getChatHistory(floorRange?: [number, number]): string {
    try {
      const context = getSTContext();
      const tavernHelper = getTavernHelper();
      const regexConfig = SettingsManager.get('apiSettings')?.regexConfig;
      const enableNativeRegex = regexConfig?.enableNativeRegex ?? true;
      const hasTavernHelper = !!tavernHelper;
      const hasFormatFunc = typeof tavernHelper.formatAsTavernRegexedString === 'function';
      const cacheSignature = `${regexProcessor.getRevision()}|${enableNativeRegex ? 1 : 0}|${hasFormatFunc ? 1 : 0}`;

      this.resetCacheIfNeeded(cacheSignature);

      if (context?.chat && Array.isArray(context.chat)) {
        let messages: ChatHistoryMessage[] = [];

        if (floorRange) {
          const [start, end] = floorRange;
          const effectiveStart = Math.max(1, start);
          const sliceStart = effectiveStart - 1;
          const sliceEnd = end;
          messages = context.chat.slice(sliceStart, sliceEnd);
          Logger.info('ChatHistoryHelper', 'getChatHistory 调试信息', {
            inputRange: floorRange,
            calcSlice: [sliceStart, sliceEnd],
            chatLen: context.chat.length,
            firstMsgSummary: messages[0]?.mes?.substring(0, 20) || 'undefined',
            firstMsgIndex: messages[0] ? context.chat.indexOf(messages[0]) : -1,
          });
        } else {
          const store = useMemoryStore.getState();
          const lastFloor = store.lastSummarizedFloor;

          if (lastFloor > 0) {
            messages = context.chat.slice(lastFloor);
            Logger.debug('ChatHistoryHelper', 'getChatHistory (Smart Incremental)', {
              lastSummarizedFloor: lastFloor,
              count: messages.length,
            });
          } else {
            const limit = this.getDynamicChatHistoryLimit();
            messages = context.chat.slice(-limit);
            Logger.debug('ChatHistoryHelper', 'getChatHistory (Recent Fallback)', {
              limit,
              count: messages.length,
            });
          }
        }

        if (messages.length === 0) return '';

        return messages
          .map((message, index: number) =>
            this.processMessage(
              message,
              index,
              messages.length,
              tavernHelper,
              enableNativeRegex,
              hasTavernHelper,
              hasFormatFunc
            )
          )
          .join('\n\n');
      }

      Logger.warn('ChatHistoryHelper', 'Context chat is empty or invalid');
      return '';
    } catch (e) {
      Logger.debug('ChatHistoryHelper', '获取对话历史失败', e);
      return '';
    }
  }

  static getCurrentMessageCount(): number {
    try {
      const context = getSTContext();
      if (context?.chat && Array.isArray(context.chat)) {
        return context.chat.length;
      }
      return 0;
    } catch (_e: unknown) {
      return 0;
    }
  }

  static getDynamicChatHistoryLimit(): number {
    try {
      const summarizerConfig: Partial<SummarizerConfig> = SettingsManager.get('summarizerConfig');
      const floorInterval = summarizerConfig?.floorInterval ?? 20;
      const bufferSize = summarizerConfig?.bufferSize ?? 10;
      const limit = Math.max(1, floorInterval);
      Logger.debug('ChatHistoryHelper', '动态计算 chatHistory limit (FloorInterval)', {
        floorInterval,
        bufferSize,
        limit,
      });
      return limit;
    } catch (e) {
      Logger.warn('ChatHistoryHelper', '动态计算 limit 失败，使用默认值 20', e);
      return 20;
    }
  }
}
