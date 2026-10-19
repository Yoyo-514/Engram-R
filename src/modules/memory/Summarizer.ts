/**
 * SummarizerService - 剧情总结核心服务
 */

import { DEFAULT_SUMMARIZER_CONFIG } from '@/config/memory/defaults';
import { get, incrementStatistic } from '@/config/settings';
import { eventWatcher } from '@/core/events/EventWatcher';
import { Logger } from '@/core/logger';
import { getTavernContext } from '@/core/utils';
import { chatManager } from '@/data/ChatManager';
import { initWorldBookSlot } from '@/integrations/tavern';
import { createSummaryWorkflow, runWorkflow, StopGeneration } from '@/modules/workflow';
import { useMemoryStore } from '@/state/memoryStore';
import type { JobContext } from '@/types/job_context';
import type { SummarizerConfig, SummarizerStatus, SummaryResult } from '@/types/memory';
import { notificationService } from '@/ui/services/NotificationService';

import { eventTrimmer } from './EventTrimmer';

/**
 * SummarizerService 类
 * 核心总结服务
 */
class SummarizerService {
  private config: SummarizerConfig;

  private currentChatId: string | null = null;
  private isRunning = false;
  private isSummarizing = false;
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

  /** 获取上次总结的楼层，内存进度为空时从聊天数据库加载。 */
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

  /** 更新内存进度，并通过 memoryStore 持久化。 */
  public async setLastSummarizedFloor(floor: number): Promise<void> {
    this._lastSummarizedFloor = floor;

    // 保存到 memoryStore
    const store = useMemoryStore.getState();
    await store.setLastSummarizedFloor(floor);
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
    // 楼层范围从 1 开始计数，消息总数即当前末楼层。
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

  /** 启动服务，通过 EventWatcher 监听消息和聊天切换。 */
  async start(): Promise<void> {
    if (this.isRunning) {
      await this.log('warn', '服务已在运行');
      return;
    }

    // 初始化当前聊天状态
    await this.initializeForCurrentChat();

    // 启动 EventWatcher (如果尚未启动)
    eventWatcher.start();

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

    // 切换聊天后清空内存进度，再从当前聊天数据库加载。
    this.currentChatId = chatId;
    this.summaryHistory = [];
    this._lastSummarizedFloor = 0;

    const lastSummarized = await this.getLastSummarizedFloor();

    await this.log('info', '初始化当前聊天状态', {
      chatId,
      currentFloor,
      lastSummarizedFloor: lastSummarized,
      pendingFloors: currentFloor - lastSummarized,
    });
  }

  // ==================== 事件处理 ====================

  /** 收到消息后检查自动摘要的楼层间隔。 */
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

    // 检查是否达到 Summary 触发条件
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

    // 创建取消信号（引用对象，传递给 WorkflowEngine）
    const cancelSignal: NonNullable<JobContext['signal']> = { cancelled: false };

    // 显示运行中通知
    const runningToast = notificationService.running('总结运行中...', 'Engram', () => {
      cancelSignal.cancelled = true;
      cancelSignal.reason = 'summary_cancelled';
      void this.log('info', '用户请求取消总结');
      void this.requestStopGeneration(cancelSignal);
      notificationService.warning('正在取消总结...', 'Engram');
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    try {
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

        // 使用默认范围时，手动和自动摘要均处理一个固定窗口，并保留缓冲楼层。
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

      await initWorldBookSlot();

      const context = await runWorkflow(createSummaryWorkflow(), {
        trigger: manual ? 'manual' : 'auto',
        signal: cancelSignal,
        config: {
          previewEnabled: this.config.previewEnabled,
          autoHide: this.config.autoHide,
          templateId: this.config.promptTemplateId ?? undefined,
          logType: 'summarize',
        },
        input: {
          range,
        },
      });

      const savedEvents = context.output;
      const result: SummaryResult = {
        id: Date.now().toString(),
        content: context.cleanedContent || '',
        sourceFloors: range,
        timestamp: Date.now(),
        tokenCount: 0,
      };

      if (Array.isArray(savedEvents) && savedEvents.length > 0) {
        incrementStatistic('totalEvents', savedEvents.length);
      }

      await this.setLastSummarizedFloor(endFloor);
      this.summaryHistory.push(result);

      // 摘要保存后检查自动精简条件。
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

  /** 启动异步状态刷新，并立即返回当前内存状态。 */
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
   * 更新运行态配置
   */
  updateConfig(config: Partial<SummarizerConfig>) {
    this.config = { ...this.config, ...config };
    void this.log('debug', '配置已更新', this.config);
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
