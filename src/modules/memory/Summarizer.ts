/**
 * SummarizerService - 剧情总结核心服务
 */

import { DEFAULT_SUMMARIZER_CONFIG } from '@/config/memory/defaults';
import { get, incrementStatistic, set } from '@/config/settings';
import { eventWatcher } from '@/core/events/EventWatcher';
import { Logger } from '@/core/logger';
import { getTavernContext } from '@/core/utils';
import { chatManager } from '@/data/ChatManager';
import { getSTContext, initWorldBookSlot } from '@/integrations/tavern';
import { createSummaryWorkflow, runWorkflow, StopGeneration } from '@/modules/workflow';
import { useMemoryStore } from '@/state/memoryStore'; // Used for setLastSummarizedFloor
import type { JobContext } from '@/types/job_context';
import type { SummarizerConfig, SummarizerStatus, SummaryResult } from '@/types/memory';
import { notificationService } from '@/ui/services/NotificationService';

import { eventTrimmer } from './EventTrimmer';
import {
  getCurrentSummaryPreparationChatId,
  summaryPreparationCache,
} from './SummaryPreparationCache';

/** 元数据 key */
const METADATA_KEY = 'engram';

/**
 * 获取 chat_metadata
 */
function getChatMetadata(): Record<string, unknown> | null {
  try {
    // 优先从 context 获取
    const context = getSTContext();
    if (context?.chatMetadata) {
      return context.chatMetadata;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * SummarizerService 类
 * 核心总结服务
 */
class SummarizerService {
  private config: SummarizerConfig;

  private currentChatId: string | null = null;
  private isRunning = false;
  private isSummarizing = false;
  private cancelRequested = false; // 用户请求取消总结
  private unsubscribeMessage: (() => void) | null = null;
  private unsubscribeChat: (() => void) | null = null;
  private summaryHistory: SummaryResult[] = [];

  // 缓存最后总结的楼层，用于同步读取
  private _lastSummarizedFloor: number = 0;

  constructor(config?: Partial<SummarizerConfig>) {
    // 优先使用传入配置，其次加载持久化配置，最后使用默认配置
    const savedConfig = get('summarizerConfig') as Partial<SummarizerConfig>;
    this.config = { ...DEFAULT_SUMMARIZER_CONFIG, ...savedConfig, ...config };
  }

  // ==================== 元数据操作 ====================
  // 注：getInfoFromChatMetadata 和 saveToChatMetadata 原方法保留作为兼容或临时使用，
  // 但主要逻辑已迁移至 WorldBookStateService。

  /**
   * 从当前聊天元数据获取值
   */
  private getFromChatMetadata(key: string): unknown {
    const metadata = getChatMetadata();
    if (!metadata) {
      return undefined;
    }
    if (!metadata.extensions) metadata.extensions = {};
    // @ts-expect-error - 动态访问
    if (!metadata.extensions[METADATA_KEY]) metadata.extensions[METADATA_KEY] = {};
    // @ts-expect-error - 动态访问
    return metadata.extensions[METADATA_KEY][key];
  }

  /**
   * 获取上次总结的楼层
   * V0.5: 优先从 memoryStore 读取
   * V0.8: 修复时序问题，直接从 chatManager.getState() 读取确保获取最新值
   */
  private async getLastSummarizedFloor(): Promise<number> {
    // 如果缓存有值且不是刚被清零，直接返回
    if (this._lastSummarizedFloor > 0) return this._lastSummarizedFloor;

    // 直接从 IndexedDB 读取，避免 memoryStore 缓存未初始化的问题
    try {
      const state = await chatManager.getState();
      this._lastSummarizedFloor = state.last_summarized_floor;
      await this.log('debug', '从 DB 读取 lastSummarizedFloor', {
        value: this._lastSummarizedFloor,
      });
      return this._lastSummarizedFloor;
    } catch (e) {
      await this.log('warn', '读取 lastSummarizedFloor 失败，使用默认值 0', e);
      return 0;
    }
  }

  /**
   * 设置上次总结的楼层
   * V0.5: 保存到 memoryStore (IndexedDB)
   */
  public async setLastSummarizedFloor(floor: number): Promise<void> {
    this._lastSummarizedFloor = floor;

    // 保存到 memoryStore
    const store = useMemoryStore.getState();
    await store.setLastSummarizedFloor(floor);
    summaryPreparationCache.reset(getCurrentSummaryPreparationChatId(), floor);
  }

  // ==================== 楼层计算 ====================

  /**
   * 获取当前真实楼层数
   */
  private getCurrentFloor(): number {
    const context = getTavernContext();
    if (!context?.chat) {
      return 0;
    }
    // 楼层从0开始计数，所以 length - 1 是最后一楼的索引
    return context.chat.length;
  }

  /**
   * 获取当前聊天 ID
   */
  private getCurrentChatId(): string | null {
    const context = getTavernContext();
    return context?.chatId || null;
  }

  private async requestStopGeneration(signal?: JobContext['signal']): Promise<void> {
    await StopGeneration.abort(signal);
  }

  // ==================== 生命周期 ====================

  /**
   * 启动服务，开始监听事件
   * V0.5: 使用 EventWatcher 统一监听
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      await this.log('warn', '服务已在运行');
      return;
    }

    // 初始化当前聊天状态
    await this.initializeForCurrentChat();

    // 启动 EventWatcher (如果尚未启动)
    eventWatcher.start();

    // 注册回调
    // V0.9.11: Always subscribe to messages to support Entity Extraction even if Summary is Manual
    this.unsubscribeMessage = eventWatcher.on(
      'onMessageReceived',
      this.handleMessageReceived.bind(this)
    );
    await this.log('debug', '已通过 EventWatcher 订阅消息事件');

    this.unsubscribeChat = eventWatcher.on('onChatChanged', this.handleChatChanged.bind(this));
    await this.log('debug', '已通过 EventWatcher 订阅聊天切换事件');

    this.isRunning = true;

    const status = this.getStatus();
    await this.log('info', '服务已启动', status);
  }

  /**
   * 重置进度 (设置为 0)
   */
  public async resetProgress(): Promise<void> {
    await this.setLastSummarizedFloor(0);
    await this.log('info', '进度已重置');
  }

  /**
   * 停止服务
   */
  async stop() {
    if (this.unsubscribeMessage) {
      this.unsubscribeMessage();
      this.unsubscribeMessage = null;
    }
    if (this.unsubscribeChat) {
      this.unsubscribeChat();
      this.unsubscribeChat = null;
    }
    this.isRunning = false;
    await this.log('info', '服务已停止');
  }

  /**
   * 为当前聊天初始化状态
   */
  public async initializeForCurrentChat(): Promise<void> {
    const chatId = this.getCurrentChatId();
    const currentFloor = this.getCurrentFloor();

    // 重置/加载缓存
    this.currentChatId = chatId;
    this.summaryHistory = [];
    this._lastSummarizedFloor = 0; // 先清空，迫使 reload

    const lastSummarized = await this.getLastSummarizedFloor(); // 这会更新 _lastSummarizedFloor

    await this.log('info', '初始化当前聊天状态', {
      chatId,
      currentFloor,
      lastSummarizedFloor: lastSummarized,
      pendingFloors: currentFloor - lastSummarized,
    });

    // 如果从未总结过（lastSummarized=0），不要自动跳过，保持为 0，等待用户触发
    // if (lastSummarized === 0 && currentFloor > 0) {
    //     this.log('info', '首次初始化，设置基准为当前楼层', { currentFloor });
    //     await this.setLastSummarizedFloor(currentFloor);
    // }    }
  }

  // ==================== 事件处理 ====================

  /**
   * 处理消息接收事件
   * V0.9.1: 同时检查实体提取和 Summary 的触发条件
   */
  private async handleMessageReceived(): Promise<void> {
    const currentFloor = this.getCurrentFloor();
    const lastSummarized = await this.getLastSummarizedFloor();
    const pendingFloors = currentFloor - lastSummarized;

    await this.log('debug', '收到新消息', {
      currentFloor,
      lastSummarized,
      pendingFloors,
      triggerAt: this.config.floorInterval,
    });

    // V0.9.1: 检查实体提取触发
    // V0.9.14: EntityExtraction now has its own listener in EntityExtractor.ts. Removing coupled call.
    // await this.checkEntityExtraction(currentFloor);

    // 检查是否达到 Summary 触发条件
    if (this.config.enabled && !this.isSummarizing && pendingFloors > 0) {
      summaryPreparationCache.scheduleWarm({
        chatId: this.currentChatId,
        baseFloor: lastSummarized,
        targetFloor: currentFloor,
      });
    }

    if (pendingFloors >= this.config.floorInterval) {
      await this.log('info', '达到触发条件，准备总结', {
        pendingFloors,
        interval: this.config.floorInterval,
      });
      await this.triggerSummary();
    }
  }

  /**
   * 处理聊天切换事件
   */
  private async handleChatChanged() {
    const newChatId = this.getCurrentChatId();

    await this.log('info', '聊天已切换', {
      from: this.currentChatId,
      to: newChatId,
    });

    // 重新初始化
    await this.initializeForCurrentChat();
  }

  // ==================== 总结逻辑 ====================

  /**
   * 手动/自动触发总结
   */
  async triggerSummary(
    manual = false,
    rangeOverride?: [number, number]
  ): Promise<SummaryResult | null> {
    if (this.isSummarizing) {
      await this.log('warn', '正在执行总结，跳过本次触发');
      return null;
    }

    if (!this.config.enabled && !manual) {
      await this.log('debug', '自动总结已禁用');
      return null;
    }

    const currentFloor = this.getCurrentFloor();

    this.isSummarizing = true;
    this.cancelRequested = false; // 重置取消标志

    // 创建取消信号（引用对象，传递给 WorkflowEngine）
    const cancelSignal: NonNullable<JobContext['signal']> = { cancelled: false };

    // 显示运行中通知
    const runningToast = notificationService.running('总结运行中...', 'Engram', () => {
      cancelSignal.cancelled = true;
      cancelSignal.reason = 'summary_cancelled';
      this.cancelRequested = true;
      void this.log('info', '用户请求取消总结');
      void this.requestStopGeneration(cancelSignal);
      notificationService.warning('正在取消总结...', 'Engram');
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    try {
      // 1. Calculate Range
      let startFloor: number;
      let endFloor: number;

      if (rangeOverride) {
        [startFloor, endFloor] = rangeOverride;
      } else {
        startFloor = this._lastSummarizedFloor + 1;
        const buffer = Math.max(0, this.config.bufferSize || 0);
        const interval = Math.max(1, this.config.floorInterval || 10);
        const pendingFloors = Math.max(0, currentFloor - this._lastSummarizedFloor);
        const maxProcessableFloor = currentFloor - buffer;

        if (startFloor > maxProcessableFloor) {
          if (manual) {
            notificationService.info('暂无足够的新内容需要总结 (缓冲期内)', 'Engram');
          }
          return null;
        }

        // 稳定策略：无论自动还是手动触发，只要没有显式传入 rangeOverride，
        // 默认都按「楼层间隔 - 缓冲层」处理一个固定窗口，避免手动触发时把所有未处理楼层一次性吞掉。
        const targetProcessCount = Math.max(1, interval - buffer);
        const availableProcessCount = Math.max(0, maxProcessableFloor - startFloor + 1);
        const processCount = Math.min(targetProcessCount, availableProcessCount, pendingFloors);

        if (processCount <= 0) {
          if (manual) {
            notificationService.info('暂无足够的新内容需要总结 (缓冲期内)', 'Engram');
          }
          return null;
        }

        endFloor = startFloor + processCount - 1;
      }

      if (startFloor > endFloor) return null;

      const range: [number, number] = [startFloor, endFloor];
      await this.log('info', '准备总结', {
        range,
        currentFloor,
        lastSummarizedFloor: this._lastSummarizedFloor,
        floorInterval: this.config.floorInterval,
        bufferSize: this.config.bufferSize,
        maxProcessableFloor: rangeOverride
          ? endFloor
          : currentFloor - (this.config.bufferSize || 0),
        autoHide: this.config.autoHide,
        manual,
        rangeOverride: rangeOverride ?? null,
      });

      const preparedSummaryContext = await summaryPreparationCache.getPreparedRange({
        chatId: this.currentChatId,
        baseFloor: this._lastSummarizedFloor,
        range,
      });

      // 2. Run Workflow
      await initWorldBookSlot();

      const context = await runWorkflow(createSummaryWorkflow(), {
        trigger: manual ? 'manual' : 'auto',
        signal: cancelSignal,
        config: {
          previewEnabled: this.config.previewEnabled,
          autoHide: this.config.autoHide,
          templateId: this.config.promptTemplateId,
          logType: 'summarize',
        },
        input: {
          range: range,
          preparedSummaryContext,
        },
      });

      // 3. Construct Result (Backward Compatibility)
      const savedEvents = context.output; // From SaveEvent (Array of EventNodes)

      // If SaveEvent returns array of events, we construct a SummaryResult-like object
      // or just return the list. Original method returned SummaryResult (single object).
      // But now we have multiple events potentially.
      // Let's verify `SummaryResult` type in `types.d.ts` or similar.
      // It seems SummaryResult expects `content` string.

      // If we have parsed multiple events, the "content" might            // The raw text
      const result: SummaryResult = {
        id: Date.now().toString(),
        content: context.cleanedContent || '', // The raw text
        sourceFloors: range,
        timestamp: Date.now(),
        tokenCount: 0, // TODO: Get from context or re-measure
      };

      if (Array.isArray(savedEvents) && savedEvents.length > 0) {
        incrementStatistic('totalEvents', savedEvents.length);
      }

      // Update local state (redundant if SaveEvent updated store, but safe)
      await this.setLastSummarizedFloor(endFloor);
      this.summaryHistory.push(result);

      // V1.0.5: 联动触发精简 - 总结完成后检查是否需要精简
      try {
        const trimStatus = await eventTrimmer.getStatus();
        const trimConfig = eventTrimmer.getConfig();
        const trimAvailability = await eventTrimmer.canTrim();

        await this.log('debug', '自动精简触发检查', {
          enabled: trimConfig.enabled,
          triggerType: trimStatus.triggerType,
          currentValue: trimStatus.currentValue,
          threshold: trimStatus.threshold,
          pendingEntryCount: trimStatus.pendingEntryCount,
          canTrim: trimAvailability.canTrim,
        });

        // 只有在精简已启用、达到阈值且存在足够待合并事件时才自动执行
        if (trimConfig.enabled && trimStatus.triggered && trimAvailability.canTrim) {
          await this.log('info', '联动触发精简', {
            triggerType: trimStatus.triggerType,
            currentValue: trimStatus.currentValue,
            threshold: trimStatus.threshold,
            pendingEntryCount: trimStatus.pendingEntryCount,
          });
          // 使用 manual=false 表示自动触发
          await eventTrimmer.trim(false);
        } else {
          await this.log('debug', '跳过自动精简', {
            enabled: trimConfig.enabled,
            triggered: trimStatus.triggered,
            canTrim: trimAvailability.canTrim,
            pendingEntryCount: trimStatus.pendingEntryCount,
          });
        }
      } catch (trimError) {
        // 精简失败不应影响总结结果
        await this.log('warn', '联动精简失败', { error: trimError });
      }

      return result;
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);

      if (errorMsg === 'UserCancelled') {
        await this.log('info', '总结已被用户取消');
        return null;
      }

      await this.log('error', '总结执行异常', { error: errorMsg });
      notificationService.error(`总结异常: ${errorMsg}`, 'Engram 错误');
      return null;
    } finally {
      notificationService.remove(runningToast);
      this.isSummarizing = false;
    }
  }

  // ==================== 状态查询 ====================

  /**
   * 获取当前状态
   */
  getStatus(): SummarizerStatus {
    const currentFloor = this.getCurrentFloor();
    // 使用同步缓存值
    const lastSummarized = this._lastSummarizedFloor;

    return {
      running: this.isRunning,
      currentFloor,
      lastSummarizedFloor: lastSummarized,
      pendingFloors: Math.max(0, currentFloor - lastSummarized),
      historyCount: this.summaryHistory.length,
      isSummarizing: this.isSummarizing,
    };
  }

  /**
   * 刷新状态（强制重新读取）
   */
  refreshStatus(): SummarizerStatus {
    // 触发异步刷新，但返回当前缓存
    void this.initializeForCurrentChat();
    return this.getStatus();
  }

  /**
   * 获取配置
   */
  getConfig(): SummarizerConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<SummarizerConfig>) {
    this.config = { ...this.config, ...config };
    // 持久化保存
    set('summarizerConfig', this.config);
    void this.log('debug', '配置已更新并保存', this.config);
  }

  /**
   * 获取总结历史
   */
  getHistory(): SummaryResult[] {
    return [...this.summaryHistory];
  }

  /**
   * 重置基准楼层为当前楼层
   */
  async resetBaseFloor(): Promise<void> {
    const currentFloor = this.getCurrentFloor();
    await this.setLastSummarizedFloor(currentFloor);
    void this.log('info', '已重置基准楼层', { currentFloor });
  }

  // ==================== 工具方法 ====================

  /**
   * 记录日志
   */
  private async log(
    level: 'debug' | 'info' | 'success' | 'warn' | 'error',
    message: string,
    data?: unknown
  ): Promise<void> {
    try {
      Logger[level]('Summarizer', message, data);
    } catch {
      console.info(`[Summarizer] ${level}: ${message}`, data);
    }
  }
}

/** 默认实例 */
export const summarizerService = new SummarizerService();
