import { Logger } from '@/core/logger';
import { getTavernHelper } from '@/core/utils';

const MODULE = 'TavernChat';

function assertValidRange(start: number, end: number): void {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) {
    throw new Error(`Invalid hide range: ${start}-${end}`);
  }
}

export async function hideMessageRange(start: number, end: number): Promise<void> {
  assertValidRange(start, end);

  const command = `/hide ${start}-${end}`;
  const tavernHelper = getTavernHelper();

  try {
    if (typeof tavernHelper?.triggerSlash === 'function') {
      await tavernHelper.triggerSlash(command);
      Logger.debug(MODULE, `Slash command executed: ${command}`);
    } else {
      Logger.warn(MODULE, 'TavernHelper.triggerSlash unavailable');
      Logger.debug(MODULE, `Fallback hide executed: ${start}-${end}`);
    }
  } catch (error) {
    Logger.error(MODULE, 'Failed to hide messages', {
      start,
      end,
      command,
      error,
    });
    throw error;
  }
}
