import { Logger } from '@/core/logger';
import { getTavernContext } from '@/core/utils';
import { getChatHistorySegments } from '@/integrations/tavern';
import { regexProcessor } from '@/modules/workflow/steps';

export interface PreparedSummaryContext {
  chatId: string;
  baseFloor: number;
  range: [number, number];
  preparedThroughFloor: number;
  isComplete: boolean;
  chatHistory: string;
  createdAt: number;
}

interface WarmOptions {
  chatId: string | null;
  baseFloor: number;
  targetFloor: number;
}

interface PreparedRangeOptions {
  chatId: string | null;
  baseFloor: number;
  range: [number, number];
}

const WARM_BATCH_SIZE = 4;

class SummaryPreparationCache {
  private chatId: string | null = null;
  private baseFloor = 0;
  private builtThroughFloor = 0;
  private warmTargetFloor = 0;
  private segments: string[] = [];
  private warmPromise: Promise<void> | null = null;
  private revision = regexProcessor.getRevision();
  private generation = 0;

  reset(chatId: string | null, baseFloor = 0): void {
    this.chatId = chatId;
    this.baseFloor = baseFloor;
    this.builtThroughFloor = baseFloor;
    this.warmTargetFloor = baseFloor;
    this.segments = [];
    this.revision = regexProcessor.getRevision();
    this.generation += 1;
    this.warmPromise = null;
  }

  scheduleWarm(options: WarmOptions): void {
    const { chatId, baseFloor, targetFloor } = options;
    if (!chatId || targetFloor <= baseFloor) {
      return;
    }

    this.ensureScope(chatId, baseFloor);
    if (targetFloor <= this.warmTargetFloor) {
      return;
    }

    this.warmTargetFloor = targetFloor;
    void this.ensureWarmLoop(true).catch((error) => {
      Logger.warn('SummaryPreparationCache', 'Background warm failed', error);
    });
  }

  async getPreparedRange(options: PreparedRangeOptions): Promise<PreparedSummaryContext | null> {
    const { chatId, baseFloor, range } = options;
    if (!chatId) {
      return null;
    }

    this.ensureScope(chatId, baseFloor);
    this.warmTargetFloor = Math.max(this.warmTargetFloor, range[1]);

    if (this.builtThroughFloor < range[1]) {
      void this.ensureWarmLoop(true).catch((error) => {
        Logger.warn('SummaryPreparationCache', 'Foreground catch-up scheduling failed', error);
      });
    }

    if (this.chatId !== chatId || this.baseFloor !== baseFloor) {
      return null;
    }

    if (this.builtThroughFloor < range[0]) {
      return null;
    }

    const startIndex = range[0] - (this.baseFloor + 1);
    const preparedThroughFloor = Math.min(range[1], this.builtThroughFloor);
    const endIndexExclusive = preparedThroughFloor - this.baseFloor;

    if (startIndex < 0 || endIndexExclusive < startIndex) {
      return null;
    }

    if (endIndexExclusive > this.segments.length) {
      return null;
    }

    return {
      chatId,
      baseFloor: this.baseFloor,
      range: [range[0], range[1]],
      preparedThroughFloor,
      isComplete: preparedThroughFloor >= range[1],
      chatHistory: this.segments.slice(startIndex, endIndexExclusive).join('\n\n'),
      createdAt: Date.now(),
    };
  }

  private ensureScope(chatId: string, baseFloor: number): void {
    const revision = regexProcessor.getRevision();
    if (
      this.chatId !== chatId ||
      this.baseFloor !== baseFloor ||
      this.revision !== revision ||
      this.builtThroughFloor < baseFloor
    ) {
      this.reset(chatId, baseFloor);
    }
  }

  private async ensureWarmLoop(background: boolean): Promise<void> {
    if (this.warmPromise) {
      await this.warmPromise;
      return;
    }

    const generation = this.generation;
    this.warmPromise = this.runWarmLoop(generation, background);

    try {
      await this.warmPromise;
    } finally {
      if (this.generation === generation) {
        this.warmPromise = null;
      }
    }
  }

  private async runWarmLoop(generation: number, background: boolean): Promise<void> {
    if (background) {
      await this.yieldToMainThread();
    }

    while (generation === this.generation && this.builtThroughFloor < this.warmTargetFloor) {
      const nextFloor = this.builtThroughFloor + 1;
      const batchEndFloor = Math.min(this.warmTargetFloor, nextFloor + WARM_BATCH_SIZE - 1);
      const batchSegments = getChatHistorySegments([nextFloor, batchEndFloor]);

      if (batchSegments.length === 0) {
        break;
      }

      this.segments.push(...batchSegments);
      this.builtThroughFloor = nextFloor + batchSegments.length - 1;
      await this.yieldToMainThread();
    }
  }

  private async yieldToMainThread(): Promise<void> {
    await new Promise<void>((resolve) => {
      globalThis.setTimeout(resolve, 0);
    });
  }
}

export const summaryPreparationCache = new SummaryPreparationCache();

export function getCurrentSummaryPreparationChatId(): string | null {
  return getTavernContext()?.chatId || null;
}
