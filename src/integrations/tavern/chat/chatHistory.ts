import { get } from '@/config/settings';
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

const tavernHelper = getTavernHelper()

function convertBuiltinChatMessage(message: ChatMessage): ChatHistoryMessage {
  return {
    mes: message.message,
    message: message.message,
    name: message.name,
    is_user: message.role === 'user',
    is_system: message.is_hidden || message.role === 'system',
    extra: message.extra,
  } as ChatHistoryMessage;
}

function getRangeMessagesFromTavernHelperApi(
  floorRange: [number, number]
): ChatHistoryMessage[] | null {
  if (typeof tavernHelper?.getChatMessages !== 'function') {
    return null;
  }

  const [start, end] = floorRange;
  const effectiveStart = Math.max(1, start);
  const effectiveEnd = Math.max(effectiveStart, end);
  const range = `${effectiveStart - 1}-${effectiveEnd - 1}`;

  try {
    const builtinMessages = tavernHelper.getChatMessages(range, {
      hide_state: 'all',
      include_swipes: false,
    });

    if (!Array.isArray(builtinMessages)) {
      return null;
    }

    return builtinMessages.map(convertBuiltinChatMessage);
  } catch (error) {
    Logger.warn('ChatHistoryHelper', 'getChatMessages 范围读取失败，回退到 context.chat', {
      floorRange,
      range,
      error,
    });
    return null;
  }
}

function getMessageContent(message: ChatHistoryMessage): string {
  return message.mes || message.content || message.message || '';
}

const PROCESSED_MESSAGE_CACHE_LIMIT = 500;
const processedMessageCache = new Map<string, string>();
let cacheSignature = '';

function resetCacheIfNeeded(signature: string): void {
  if (cacheSignature === signature) {
    return;
  }

  cacheSignature = signature;
  processedMessageCache.clear();
}

function getCachedProcessedMessage(cacheKey: string): string | undefined {
  const cached = processedMessageCache.get(cacheKey);
  if (cached === undefined) {
    return undefined;
  }

  processedMessageCache.delete(cacheKey);
  processedMessageCache.set(cacheKey, cached);
  return cached;
}

function setCachedProcessedMessage(cacheKey: string, value: string): void {
  if (processedMessageCache.has(cacheKey)) {
    processedMessageCache.delete(cacheKey);
  } else if (processedMessageCache.size >= PROCESSED_MESSAGE_CACHE_LIMIT) {
    const oldestKey = processedMessageCache.keys().next().value;
    if (oldestKey !== undefined) {
      processedMessageCache.delete(oldestKey);
    }
  }

  processedMessageCache.set(cacheKey, value);
}

function processMessage(
    message: ChatHistoryMessage,
    index: number,
    messageCount: number,
    enableNativeRegex: boolean,
    hasTavernHelper: boolean,
    hasFormatFunc: boolean
  ): string {
    let content = getMessageContent(message);
    const originalContent = content;
    const regexSource: RegexSource = message.is_user ? 'user_input' : 'ai_output';
    const cacheKey = `${regexSource}|${originalContent}`;
    const cachedContent = getCachedProcessedMessage(cacheKey);

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
    content = regexProcessor.process(content, 'input');

    if (!content && preRegex) {
      Logger.warn('ChatHistoryHelper', 'RegexProcessor 输入清洗后内容为空!', {
        preRegex,
        content,
        source: regexSource,
      });
    }

    if (index === 0 || index === messageCount - 1) {
      Logger.debug('ChatHistoryHelper', '消息处理详情', {
        index,
        original: originalContent.substring(0, 50),
        source: regexSource,
        step1_tavern: preRegex.substring(0, 50),
        step2_regex_input: content.substring(0, 50),
        cacheHit: false,
      });
    }

    setCachedProcessedMessage(cacheKey, content);
    return content;
}

export function getChatHistory(floorRange?: [number, number]): string {
    return getChatHistorySegments(floorRange).join('\n\n');
}

export function getCurrentMessageCount(): number {
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

export function getDynamicChatHistoryLimit(): number {
    try {
      const summarizerConfig: Partial<SummarizerConfig> = get('summarizerConfig');
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

export function getChatHistorySegments(floorRange?: [number, number]): string[] {
    try {
      const context = getSTContext();
      const regexConfig = get('apiSettings')?.regexConfig;
      const enableNativeRegex = regexConfig?.enableNativeRegex ?? true;
      const hasTavernHelper = !!tavernHelper;
      const hasFormatFunc = typeof tavernHelper?.formatAsTavernRegexedString === 'function';
      const cacheSign = `${regexProcessor.getRevision()}|${enableNativeRegex ? 1 : 0}|${hasFormatFunc ? 1 : 0}`;

      resetCacheIfNeeded(cacheSign);

      if (!(context?.chat && Array.isArray(context.chat))) {
        Logger.warn('ChatHistoryHelper', 'Context chat is empty or invalid');
        return [];
      }

      let messages: ChatHistoryMessage[] = [];

      if (floorRange) {
        const builtinMessages = getRangeMessagesFromTavernHelperApi(floorRange);

        if (builtinMessages && builtinMessages.length > 0) {
          messages = builtinMessages;
        } else {
          const [start, end] = floorRange;
          const effectiveStart = Math.max(1, start);
          const sliceStart = effectiveStart - 1;
          const sliceEnd = end;
          messages = context.chat.slice(sliceStart, sliceEnd);
        }
        Logger.debug('ChatHistoryHelper', 'getChatHistory 调试信息', {
          inputRange: floorRange,
          chatLen: context.chat.length,
          source: builtinMessages && builtinMessages.length > 0 ? 'getChatMessages' : 'context.chat',
          count: messages.length,
          firstMsgSummary: getMessageContent(messages[0]).substring(0, 20) || 'undefined',
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
          const limit = getDynamicChatHistoryLimit();
          messages = context.chat.slice(-limit);
          Logger.debug('ChatHistoryHelper', 'getChatHistory (Recent Fallback)', {
            limit,
            count: messages.length,
          });
        }
      }

      if (messages.length === 0) {
        return [];
      }

      return messages.map((message, index: number) =>
        processMessage(
          message,
          index,
          messages.length,
          enableNativeRegex,
          hasTavernHelper,
          hasFormatFunc
        )
      );
    } catch (e) {
      Logger.debug('ChatHistoryHelper', '获取对话历史失败', e);
      return [];
    }
}
