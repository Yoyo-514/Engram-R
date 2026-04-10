/**
 * Batch 模块共有类型定义
 */

/** 任务类型 */
export type BatchTaskType = 'summary' | 'entity' | 'trim' | 'embed' | 'archive' | 'import';

/** 任务状态 */
export type BatchTaskStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped';

/** 单个批处理子任务描述 （用于进度条和队列展现） */
export interface BatchTask {
    id: string;
    type: BatchTaskType;
    status: BatchTaskStatus;
    progress: { current: number; total: number };
    floorRange?: { start: number; end: number };
    error?: string;
    name?: string; // 可选的展现名，如 "导入文本片段"
}

/** 批处理队列公共状态 */
export interface BatchQueue {
    tasks: BatchTask[];
    isRunning: boolean;
    isPaused: boolean;
    currentTaskIndex: number;
    overallProgress: { current: number; total: number };
}

/** 进度回调签名 */
export type BatchProgressCallback = (queue: BatchQueue) => void;

/**
 * 抽象任务接口：所有被 BatchEngine 调度的长程任务都必须实现该接口
 */
export interface IBatchTaskHandler {
    /** 任务类型标识 */
    readonly type: string;

    /** 预估生成的子任务队列 */
    estimate(): Promise<BatchTask[]>;

    /**
     * 核心执行迭代器 (Generator)
     * 通过 yield yield 出单个子任务的状态更新，Engine 会等待其 resolve 并收集
     * 如果抛出异常，Engine 将捕获并中止后续列队
     */
    execute(
        tasks: BatchTask[],
        checkStopSignal: () => boolean,
        updateContext: (taskIndex: number, progressCurrent: number) => void
    ): AsyncGenerator<void, void, unknown>;
}

/** UI 解析历史分析结果使用的数据结构 */
export interface HistoryAnalysis {
    startFloor: number;
    endFloor: number;
    estimatedTokens: number;
    summaryTasks: number;
    entityTasks: number;
    trimTasks: number;
    embedTasks: number;
    archiveTasks: number;
}

/** 外部文本导入模式 */
export type ImportMode = 'fast' | 'detailed';
