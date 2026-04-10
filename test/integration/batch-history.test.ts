import { describe, expect, it, vi, beforeEach } from 'vitest';

// 1. 全局 Mock
vi.mock('@/core/logger', () => ({
    Logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        success: vi.fn(),
    },
    LogModule: {
        BATCH: 'BATCH',
        MEMORY: 'MEMORY',
    },
}));

// 使用 vi.hoisted 解决变量提升问题
const mocks = vi.hoisted(() => ({
    mockSummarizer: {
        triggerSummary: vi.fn().mockResolvedValue({ success: true }),
        getStatus: vi.fn(() => ({ currentFloor: 10 })),
        getConfig: vi.fn(() => ({ floorInterval: 20, bufferSize: 10 })),
    },
    mockEntityBuilder: {
        extractByRange: vi.fn().mockResolvedValue({ success: true }),
        getConfig: vi.fn(() => ({ enabled: true, floorInterval: 50 })),
    },
    mockEventTrimmer: {
        trim: vi.fn().mockResolvedValue({ success: true }),
        getConfig: vi.fn(() => ({ enabled: true, countLimit: 5 })),
    },
    mockChatManager: {
        getState: vi.fn().mockResolvedValue({ current_floor: 100 }),
    }
}));

vi.mock('@/modules/memory', () => ({
    summarizerService: mocks.mockSummarizer,
}));

vi.mock('@/modules/memory/EntityBuilder', () => ({
    entityBuilder: mocks.mockEntityBuilder,
}));

vi.mock('@/modules/memory/EntityExtractor', () => ({
    entityBuilder: mocks.mockEntityBuilder,
}));

vi.mock('@/modules/memory/EventTrimmer', () => ({
    eventTrimmer: mocks.mockEventTrimmer,
}));

vi.mock('@/data/ChatManager', () => ({
    chatManager: mocks.mockChatManager,
}));

// Mock MacroService
vi.mock('@/integrations/tavern', () => ({
    MacroService: {
        getCurrentMessageCount: vi.fn(() => 100),
    }
}));

import { HistoryTask } from '@/modules/batch/tasks/HistoryTask';

describe('HistoryTask Integration Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('estimate', () => {
        it('should correctly calculate task range and counts', async () => {
            const task = new HistoryTask(1, 50, ['summary', 'entity']);
            const tasks = await task.estimate();

            const summaryTasks = tasks.filter(t => t.type === 'summary');
            const entityTasks = tasks.filter(t => t.type === 'entity');

            expect(summaryTasks.length).toBe(1);
            expect(entityTasks.length).toBe(1);
            expect(summaryTasks[0].progress.total).toBe(3);
        });

        it('should handle zero or negative startFloor by clamping to 1', async () => {
            const task = new HistoryTask(0, 5, ['summary']);
            const tasks = await task.estimate();
            const summaryTask = tasks.find(t => t.type === 'summary');
            expect(summaryTask?.floorRange?.start).toBe(1);
        });
    });

    describe('execute', () => {
        it('should call services with correct parameters during execution', async () => {
            const task = new HistoryTask(1, 5, ['summary', 'entity']);
            const subTasks = await task.estimate();
            
            const checkStopSignal = vi.fn(() => false);
            const updateContext = vi.fn();

            const generator = task.execute(subTasks, checkStopSignal, updateContext);
            
            for await (const _ of generator) {
                // ...
            }

            expect(mocks.mockSummarizer.triggerSummary).toHaveBeenCalledWith(true, [1, 5]);
            expect(mocks.mockEntityBuilder.extractByRange).toHaveBeenCalledWith([1, 5], true);
        });

        it('should stop execution when stop signal is triggered', async () => {
            const task = new HistoryTask(1, 10, ['summary', 'entity']);
            const subTasks = await task.estimate();
            
            let stop = false;
            const checkStopSignal = vi.fn(() => stop);
            const updateContext = vi.fn();

            // 在第一个任务调用后立即停止
            mocks.mockSummarizer.triggerSummary.mockImplementationOnce(async () => {
                stop = true;
                return { success: true };
            });

            const generator = task.execute(subTasks, checkStopSignal, updateContext);
            
            for await (const _ of generator) {
                // ...
            }

            expect(mocks.mockSummarizer.triggerSummary).toHaveBeenCalled();
            // 因为在 summary 结束后 yield 之前就 checkSignal 了，或者在 main loop 检查了，entity 不该被调
            expect(mocks.mockEntityBuilder.extractByRange).not.toHaveBeenCalled();
        });
    });
});
