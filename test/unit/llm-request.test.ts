import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobContext } from '@/modules/workflow/core/JobContext';

const { generateMock, logSendMock, logReceiveMock } = vi.hoisted(() => ({
    generateMock: vi.fn(),
    logSendMock: vi.fn(() => 'log-1'),
    logReceiveMock: vi.fn(),
}));

vi.mock('@/integrations/llm/Adapter', () => ({
    llmAdapter: {
        generate: generateMock,
    },
}));

vi.mock('@/core/logger/ModelLogger', () => ({
    ModelLogger: {
        logSend: logSendMock,
        logReceive: logReceiveMock,
    },
}));

vi.mock('@/integrations/tavern', () => ({
    getCurrentCharacter: vi.fn(() => ({ name: 'Char' })),
    getCurrentModel: vi.fn(() => 'TestModel'),
}));

vi.mock('@/core/logger', () => ({
    Logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        success: vi.fn(),
    },
}));

vi.mock('@/config/settings', () => ({
    SettingsManager: {
        get: vi.fn(() => ({})),
    },
}));

import { LlmRequest } from '@/modules/workflow/steps/execution/LlmRequest';

describe('LlmRequest', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        generateMock.mockResolvedValue({
            success: true,
            content: 'done',
            tokenUsage: { prompt: 1, completion: 1, total: 2 },
        });
    });

    it('should pass signal and generationId to adapter and clear it afterwards', async () => {
        const step = new LlmRequest();
        const signal: NonNullable<JobContext['signal']> = { cancelled: false };
        const context: JobContext = {
            id: 'wf_test',
            trigger: 'manual',
            config: {},
            input: {},
            prompt: {
                system: 'sys',
                user: 'user',
            },
            metadata: {
                startTime: Date.now(),
                stepsExecuted: [],
            },
            signal,
        };

        await step.execute(context);

        expect(generateMock).toHaveBeenCalledTimes(1);
        expect(generateMock).toHaveBeenCalledWith(
            expect.objectContaining({
                systemPrompt: 'sys',
                userPrompt: 'user',
                signal,
                generationId: expect.stringMatching(/^engram_wf_test_/),
            })
        );
        expect(signal.generationId).toBeUndefined();
    });
});
