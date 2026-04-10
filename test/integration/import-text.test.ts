import { describe, expect, it, vi, beforeEach } from 'vitest';

// 1. 全局 Mock
vi.mock('@/core/logger', () => ({
    Logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn((...args) => console.error(...args)),
        success: vi.fn(),
    },
    LogModule: {
        BATCH: 'BATCH',
        MEMORY: 'MEMORY',
    },
}));

vi.mock('@/config/settings', () => ({
    SettingsManager: {
        get: vi.fn(() => ({
            vectorConfig: { enabled: true }
        })),
    }
}));

vi.mock('@/modules/rag/embedding/EmbeddingService', () => ({
    embeddingService: {
        setConfig: vi.fn(),
        embedEvent: vi.fn().mockResolvedValue(true),
    }
}));

const mocks = vi.hoisted(() => ({
    mockWorkflowEngine: {
        run: vi.fn().mockResolvedValue([{ id: 'mock-event-1' }])
    },
    mockBatchUtils: {
        chunkText: vi.fn(() => ['chunk1']),
        summarizeChunk: vi.fn().mockResolvedValue('{"events":[]}')
    }
}));

vi.mock('@/modules/workflow/core/WorkflowEngine', () => ({
    WorkflowEngine: mocks.mockWorkflowEngine
}));

// mock specific workflow creations
vi.mock('@/modules/workflow/definitions/EntityWorkflow', () => ({
    createEntityWorkflow: vi.fn(() => ({ name: 'EntityWorkflow_Mock' }))
}));

// mock SaveEvent and ParseJson classes (needed for instance check in ImportTextTask)
vi.mock('@/modules/workflow/steps/persistence/SaveEvent', () => ({
    SaveEvent: class SaveEvent { name = 'SaveEvent' }
}));
vi.mock('@/modules/workflow/steps/processing/ParseJson', () => ({
    ParseJson: class ParseJson { name = 'ParseJson' }
}));

vi.mock('@/modules/batch/utils/BatchUtils', () => ({
    BatchUtils: mocks.mockBatchUtils
}));

import { ImportTextTask } from '@/modules/batch/tasks/ImportTextTask';

describe('ImportTextTask Integration Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should extract entity in detailed mode after saving events', async () => {
        const checkStopSignal = vi.fn(() => false);
        const updateContext = vi.fn();
        
        mocks.mockBatchUtils.chunkText.mockReturnValue(['This is chunk 1 text']);
        mocks.mockBatchUtils.summarizeChunk.mockResolvedValue('{"events":[{"summary":"mock"}]}');
        
        // Let's pretend WorkflowEngine.run returns some saved events on the first call
        mocks.mockWorkflowEngine.run.mockResolvedValueOnce([{ id: 'evt-1' }]);
        // Second call would be EntityWorkflow, let it return true
        mocks.mockWorkflowEngine.run.mockResolvedValueOnce({ success: true });

        const task = new ImportTextTask('Full text', {
            mode: 'detailed',
            chunkSize: 2000,
            overlapSize: 200
        });

        const tasks = await task.estimate();
        const generator = task.execute(tasks, checkStopSignal, updateContext);

        for await (const _ of generator) {
            // consume generator
        }

        // Verify WorkflowEngine was called twice for derailed mode chunks
        expect(mocks.mockWorkflowEngine.run).toHaveBeenCalledTimes(2);

        // First call should be ImportFlow (ParseJson + SaveEvent)
        const firstCallArg = mocks.mockWorkflowEngine.run.mock.calls[0];
        expect(firstCallArg[0].name).toBe('ImportFlow');
        expect(firstCallArg[1].input.isImport).toBe(true);
        expect(firstCallArg[1].input.range).toEqual([0, 0]);

        // Second call should be EntityWorkflow 
        const secondCallArg = mocks.mockWorkflowEngine.run.mock.calls[1];
        expect(secondCallArg[0].name).toBe('EntityWorkflow_Mock');
        expect(secondCallArg[1].input.isImport).toBe(true);
        expect(secondCallArg[1].input.chatHistory).toBe('This is chunk 1 text');
        expect(secondCallArg[1].input.range).toEqual([0, 0]);
        // Also check category for ExtractEntity
        expect(secondCallArg[1].config.category).toBe('entity_extraction');
    });

    it('should fallback to FastFlow if detailed summary fails, without extracting entities', async () => {
        const checkStopSignal = vi.fn(() => false);
        const updateContext = vi.fn();
        
        mocks.mockBatchUtils.chunkText.mockReturnValue(['This is chunk 1 text']);
        // Summary returns null (i.e. fails to summarize but doesn't throw)
        mocks.mockBatchUtils.summarizeChunk.mockResolvedValue(null);
        
        // FastFlow runs and returns events
        mocks.mockWorkflowEngine.run.mockResolvedValueOnce([{ id: 'evt-fallback' }]);

        const task = new ImportTextTask('Full text', {
            mode: 'detailed',
            chunkSize: 2000,
            overlapSize: 200
        });

        const tasks = await task.estimate();
        const generator = task.execute(tasks, checkStopSignal, updateContext);

        for await (const _ of generator) {
            // consume generator
        }

        // Verify WorkflowEngine was called only once (for ImportFastFlow)
        expect(mocks.mockWorkflowEngine.run).toHaveBeenCalledTimes(1);

        const firstCallArg = mocks.mockWorkflowEngine.run.mock.calls[0];
        expect(firstCallArg[0].name).toBe('ImportFastFlow');
    });
});
