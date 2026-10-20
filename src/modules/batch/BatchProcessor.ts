/**
 * BatchProcessor - 批处理调度与入口
 *
 * 管理任务队列、并发锁、起停与进度广播；
 * 具体的导入解析与历史补全逻辑下发到 tasks/ 实现。
 */

import { Logger, LogModule } from '@/core/logger';
import { getErrorMessage } from '@/core/utils/error';
import type {
  BatchProgressCallback,
  BatchQueue,
  BatchTaskType,
  HistoryAnalysis,
  IBatchTaskHandler,
} from '@/types/batch';
import { notificationService } from '@/ui/services/NotificationService';

import { HistoryTask } from './tasks/HistoryTask';
import { type ImportConfig, ImportTextTask } from './tasks/ImportTextTask';

const THROTTLE_MS = 100;
// 让 UI 有时间展示 stop 状态后再清理队列
const STOP_CLEAR_DELAY_MS = 500;

class BatchProcessor {
  private queueState: BatchQueue = {
    tasks: [],
    isRunning: false,
    isPaused: false,
    currentTaskIndex: 0,
    overallProgress: { current: 0, total: 0 },
  };

  private listeners = new Set<BatchProgressCallback>();
  private stopSignal = false;
  private lastNotifyTime = 0;

  // 软暂停：用 Promise 挂起执行循环
  private pausePromise: Promise<void> | null = null;
  private pauseResolve: (() => void) | null = null;

  // 执行周期 ID，防止 stop() 的延迟清理误杀新任务
  private executionId = 0;

  /** 订阅队列状态变化，挂载时立即收到一次快照 */
  subscribe(callback: BatchProgressCallback): () => void {
    this.listeners.add(callback);
    this.notifyProgress(true);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notifyProgress(force = false): void {
    const now = Date.now();
    if (!force && now - this.lastNotifyTime < THROTTLE_MS) {
      return;
    }

    this.lastNotifyTime = now;
    for (const listener of this.listeners) {
      listener(this.getQueueState());
    }
  }

  private updateTaskProgress(taskIndex: number, currentProgress: number): void {
    if (taskIndex < 0 || taskIndex >= this.queueState.tasks.length) return;

    this.queueState.currentTaskIndex = taskIndex;
    this.queueState.tasks[taskIndex] = {
      ...this.queueState.tasks[taskIndex],
      status: 'running',
      progress: {
        ...this.queueState.tasks[taskIndex].progress,
        current: currentProgress,
      },
    };
    this.queueState.tasks = [...this.queueState.tasks];
    this.queueState.overallProgress = {
      ...this.queueState.overallProgress,
      current: this.queueState.tasks.reduce((sum, task) => sum + task.progress.current, 0),
    };
    this.notifyProgress();
  }

  private getQueueState(): BatchQueue {
    return {
      ...this.queueState,
      tasks: [...this.queueState.tasks],
      overallProgress: { ...this.queueState.overallProgress },
    };
  }

  private clearQueue(): void {
    this.queueState = {
      tasks: [],
      isRunning: false,
      isPaused: false,
      currentTaskIndex: 0,
      overallProgress: { current: 0, total: 0 },
    };
    this.stopSignal = false;
    this.notifyProgress(true);
  }

  private checkStopSignal = (): boolean => this.stopSignal;

  /** 把任务投入执行队列，isRunning 只在 finally 释放 */
  private async execute(handler: IBatchTaskHandler): Promise<void> {
    if (this.queueState.isRunning) {
      Logger.warn(LogModule.BATCH, '任务仍在运行中，忽略本次调度');
      return;
    }

    this.queueState.isRunning = true;
    this.stopSignal = false;
    this.queueState.isPaused = false;
    this.pausePromise = null;
    this.pauseResolve = null;

    const currentExecutionId = ++this.executionId;

    try {
      const tasks = await handler.estimate();

      if (this.stopSignal) {
        Logger.info(LogModule.BATCH, '收到中止信号，放弃本次任务');
        return;
      }

      if (tasks.length === 0) {
        return;
      }

      this.queueState.tasks = tasks;
      this.queueState.currentTaskIndex = 0;
      this.queueState.overallProgress = {
        current: 0,
        total: tasks.reduce((sum, task) => sum + task.progress.total, 0),
      };
      this.notifyProgress(true);

      const generator = handler.execute(
        this.queueState.tasks,
        this.checkStopSignal,
        (index, current) => this.updateTaskProgress(index, current)
      );

      for await (const _ of generator) {
        const pendingPause = this.pausePromise;
        if (this.queueState.isPaused && !this.stopSignal && pendingPause) {
          await pendingPause;
        }

        if (this.stopSignal) {
          Logger.info(LogModule.BATCH, '收到中止信号，结束迭代');
          break;
        }
      }

      if (!this.stopSignal) {
        this.queueState.tasks.forEach((task) => {
          if (task.status !== 'error') task.status = 'done';
        });
      }
    } catch (error) {
      Logger.error(LogModule.BATCH, '执行过程发生异常', error);
      const currentTask = this.queueState.tasks[this.queueState.currentTaskIndex];
      if (currentTask) {
        currentTask.status = 'error';
        currentTask.error = getErrorMessage(error);
      }
    } finally {
      if (this.executionId === currentExecutionId) {
        this.queueState.isRunning = false;
      }
      this.notifyProgress(true);
    }
  }

  /** 分析历史聊天需要补全的任务 */
  async analyzeHistory(
    startFloor = 0,
    endFloor?: number,
    types?: BatchTaskType[]
  ): Promise<HistoryAnalysis> {
    try {
      const task = new HistoryTask(startFloor, endFloor, types);
      const previewTasks = await task.estimate();
      const countOf = (type: BatchTaskType) =>
        previewTasks.find((t) => t.type === type)?.progress.total || 0;

      return {
        startFloor: task.startFloor,
        endFloor: task.endFloor ?? startFloor,
        summaryTasks: countOf('summary'),
        entityTasks: countOf('entity'),
        trimTasks: countOf('trim'),
        embedTasks: countOf('embed'),
        archiveTasks: countOf('archive'),
      };
    } catch (e: unknown) {
      Logger.error(LogModule.BATCH, '分析历史失败', { error: getErrorMessage(e) });
      return {
        startFloor,
        endFloor: endFloor ?? startFloor,
        summaryTasks: 0,
        entityTasks: 0,
        trimTasks: 0,
        embedTasks: 0,
        archiveTasks: 0,
      };
    }
  }

  /** 启动历史批量处理 */
  async startHistory(startFloor = 0, endFloor?: number, types?: BatchTaskType[]): Promise<void> {
    notificationService.info('批量处理已启动', 'Engram Batch');
    await this.execute(new HistoryTask(startFloor, endFloor, types));
    this.notifyCompletion('批量处理全部完成', '批量处理结束，部分任务失败，请查看控制台');
  }

  /** 外部文件分片批量导入 */
  async importText(text: string, config: ImportConfig): Promise<void> {
    if (!text || text.trim().length === 0) {
      notificationService.warning('导入文本为空', 'Engram Batch');
      return;
    }

    notificationService.info(`开始准备导入长文本 (共 ${text.length} 字符)`, 'Engram Batch');
    await this.execute(new ImportTextTask(text, config));
    this.notifyCompletion('长文本导入完成并已量化落库', '文本导入发生错误，请查看控制台');
  }

  private notifyCompletion(successMessage: string, errorMessage: string): void {
    const finalState = this.getQueueState();
    if (finalState.tasks.some((t) => t.status === 'error')) {
      notificationService.error(errorMessage, 'Engram Batch');
    } else if (!finalState.isPaused && !finalState.isRunning && finalState.tasks.length > 0) {
      notificationService.success(successMessage, 'Engram Batch');
    }
  }

  /** 当前队列快照 */
  get queue(): BatchQueue {
    return this.getQueueState();
  }

  pause(): void {
    if (!this.queueState.isRunning || this.queueState.isPaused) return;
    this.queueState.isPaused = true;
    this.pausePromise = new Promise<void>((resolve) => {
      this.pauseResolve = resolve;
    });
    this.notifyProgress(true);
  }

  resume(): void {
    if (!this.queueState.isRunning || !this.queueState.isPaused) return;
    this.queueState.isPaused = false;
    if (this.pauseResolve) {
      this.pauseResolve();
      this.pauseResolve = null;
      this.pausePromise = null;
    }
    this.notifyProgress(true);
  }

  /** 中止并清理队列，isRunning 由 execute() 的 finally 释放 */
  stop(): void {
    this.stopSignal = true;
    this.queueState.isPaused = false;
    if (this.pauseResolve) {
      this.pauseResolve();
      this.pauseResolve = null;
      this.pausePromise = null;
    }

    this.queueState.tasks.forEach((task) => {
      if (task.status === 'pending' || task.status === 'running') {
        task.status = 'skipped';
      }
    });
    this.notifyProgress(true);

    const stopExecutionId = this.executionId;
    setTimeout(() => {
      if (this.executionId === stopExecutionId && !this.queueState.isRunning) {
        this.clearQueue();
      }
    }, STOP_CLEAR_DELAY_MS);

    notificationService.success('已中止批处理操作', 'Engram Batch');
  }
}

export const batchProcessor = new BatchProcessor();
