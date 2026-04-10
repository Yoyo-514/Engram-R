import { beforeEach, describe, expect, it, vi } from 'vitest';

const { infoMock, warnMock } = vi.hoisted(() => ({
    infoMock: vi.fn(),
    warnMock: vi.fn(),
}));

vi.mock('@/core/logger', () => ({
    Logger: {
        info: infoMock,
        warn: warnMock,
        debug: vi.fn(),
        error: vi.fn(),
        success: vi.fn(),
    },
    LogModule: {
        SYSTEM: 'SYSTEM',
    },
}));

import { StopGeneration } from '@/modules/workflow/steps/execution/StopGeneration';

describe('StopGeneration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (global as any).window = {};
    });

    it('should prefer stopGenerationById when generationId is available', async () => {
        const stopGenerationById = vi.fn().mockResolvedValue(true);
        const stopAllGeneration = vi.fn().mockResolvedValue(false);
        (global as any).window.stopGenerationById = stopGenerationById;
        (global as any).window.stopAllGeneration = stopAllGeneration;

        await StopGeneration.abort({
            cancelled: true,
            generationId: 'gen-123',
        });

        expect(stopGenerationById).toHaveBeenCalledWith('gen-123');
        expect(stopAllGeneration).not.toHaveBeenCalled();
    });

    it('should fall back to stopAllGeneration when there is no generationId', async () => {
        const stopAllGeneration = vi.fn().mockResolvedValue(true);
        (global as any).window.stopAllGeneration = stopAllGeneration;

        await StopGeneration.abort({
            cancelled: true,
        });

        expect(stopAllGeneration).toHaveBeenCalledTimes(1);
    });
});
