/** 生成前召回注入：为用户消息装配 Engram 上下文。 */
import { DEFAULT_RECALL_CONFIG } from '@/config/rag/defaults';
import { get } from '@/config/settings';
import { Logger, LogModule } from '@/core/logger';
import { getErrorMessage, getErrorStack } from '@/core/utils/error';
import {
  eventBus,
  events,
  getCurrentChatId,
  getSTContext,
  refreshCache,
  refreshCacheWithNodes,
  setUserInput,
} from '@/integrations/tavern';
import { retriever } from '@/modules/rag/retrieval/Retriever';

interface GenerationAfterCommandsParams {
  automatic_trigger?: boolean;
  force_name2?: boolean;
  quiet_prompt?: string;
  quietToLoud?: boolean;
  skipWIAN?: boolean;
  force_chid?: number;
  signal?: AbortSignal;
  quietImage?: string;
  _engram_processed?: boolean;
  _engram_internal?: boolean;
  prompt?: string;
}

type EngramChatMessage = SillyTavern.ChatMessage & { _engram_processed?: boolean };

class Injector {
  private isInitialized = false;
  private processingChats = new Set<string>();
  /** 用户编辑消息后需重新召回。 */
  private cacheInvalid = false;

  public init(): void {
    if (this.isInitialized) return;

    eventBus.on(events.GENERATION_AFTER_COMMANDS, async (...args: unknown[]) => {
      const type = typeof args[0] === 'string' ? args[0] : '';
      const params = (args[1] || {}) as GenerationAfterCommandsParams;
      const dryRun = Boolean(args[2]);
      await this.handleGenerationAfterCommands(type, params, dryRun);
    });

    eventBus.on(events.CHAT_CHANGED, () => {
      this.processingChats.clear();
      this.cacheInvalid = false;
      refreshCache().catch((e) => {
        Logger.warn(LogModule.RAG_INJECT, '聊天切换时刷新缓存失败', e);
      });
    });

    eventBus.on(events.MESSAGE_EDITED, (...args: unknown[]) => {
      const msgIndex = args[0] as number;
      const msg = getSTContext()?.chat?.[msgIndex];
      if (msg?.is_user) {
        this.cacheInvalid = true;
        Logger.info(LogModule.RAG_INJECT, '用户消息被编辑，下次生成重新召回', { msgIndex });
      }
    });

    this.isInitialized = true;
    Logger.success(LogModule.RAG_INJECT, '召回注入器初始化完成');
  }

  /** 必须 await，才能阻塞酒馆生成直到召回完成。 */
  private async handleGenerationAfterCommands(
    type: string,
    params: GenerationAfterCommandsParams,
    dryRun: boolean
  ): Promise<void> {
    let activeChatId: string | null = null;

    try {
      if (dryRun) return;
      if (type === 'quiet' || type === 'impersonate') return;
      if (type === 'regenerate' || type === 'swipe') {
        if (!this.cacheInvalid) return;
      }
      if (params._engram_processed || params._engram_internal) return;
      if (type === 'normal' && Object.keys(params).length === 0) return;

      const chatId = getCurrentChatId();
      if (!chatId) {
        Logger.warn(LogModule.RAG_INJECT, '无有效聊天 ID');
        return;
      }
      activeChatId = chatId;

      if (this.processingChats.has(chatId)) {
        Logger.debug(LogModule.RAG_INJECT, '当前聊天正在处理中，跳过重复调用', { chatId, type });
        return;
      }
      this.processingChats.add(chatId);

      const context = getSTContext();
      if (!context?.chat?.length) {
        Logger.warn(LogModule.RAG_INJECT, '无法获取聊天上下文');
        return;
      }

      const lastMessageIndex = context.chat.length - 1;
      const lastMessage = context.chat[lastMessageIndex] as EngramChatMessage | undefined;
      let userInput = '';

      if (lastMessage?.is_user) {
        if (lastMessage._engram_processed) return;
        userInput = lastMessage.mes;
      } else {
        const textarea = document.getElementById('send_textarea') as HTMLTextAreaElement;
        if (!textarea?.value.trim()) return;
        userInput = textarea.value;
      }

      if (!userInput.trim()) return;

      const recallConfig = get('runtimeSettings')?.recallConfig || DEFAULT_RECALL_CONFIG;
      const isKeywordOnly = recallConfig.useKeywordRecall && !recallConfig.enabled;
      if (!recallConfig.enabled && !isKeywordOnly) {
        Logger.debug(LogModule.RAG_INJECT, '召回未开启，跳过');
        return;
      }

      this.cacheInvalid = false;
      params._engram_processed = true;
      setUserInput(userInput);

      try {
        const recallResult = await retriever.search(userInput);
        const nodes = recallResult.nodes;
        const entities = recallResult.recalledEntities ?? [];
        if (nodes.length > 0 || entities.length > 0) {
          Logger.success(LogModule.RAG_INJECT, '召回完成', {
            nodeCount: nodes.length,
            entityCount: entities.length,
          });
          await refreshCacheWithNodes(nodes);
        } else {
          Logger.debug(LogModule.RAG_INJECT, '召回无结果');
        }
      } catch (e) {
        Logger.error(LogModule.RAG_INJECT, '召回失败', e);
      }
    } catch (e: unknown) {
      Logger.error(LogModule.RAG_INJECT, '召回注入失败', {
        message: getErrorMessage(e),
        stack: getErrorStack(e),
      });
    } finally {
      if (activeChatId) this.processingChats.delete(activeChatId);
    }
  }
}

export const injector = new Injector();
