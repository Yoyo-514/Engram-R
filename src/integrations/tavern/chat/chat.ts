import { Logger } from '@/core/logger';
import { getCurrentTavernCharacter, getTavernHelper } from '@/core/utils';

import { getSTContext, type RawSTChatMessage } from '../core/context';

const MODULE = 'TavernChat';

function assertValidRange(start: number, end: number): void {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) {
    throw new Error(`Invalid hide range: ${start}-${end}`);
  }
}

async function persistChat(): Promise<void> {
  const ctx = getSTContext();

  if (ctx && typeof ctx.saveChat === 'function') {
    await ctx.saveChat();
    Logger.debug(MODULE, 'Chat saved after message mutation');
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

export async function injectMessage(
  role: 'user' | 'char',
  content: string,
  name?: string
): Promise<void> {
  try {
    const ctx = getSTContext();
    if (!ctx) {
      throw new Error('ST Context unavailable');
    }

    const senderName = name || (role === 'user' ? ctx.name1 : ctx.name2);

    if (!ctx.chat) {
      throw new Error('Chat array unavailable');
    }

    const char = getCurrentTavernCharacter();

    const forceAvatar =
      role === 'char' && typeof ctx.characterId === 'number' ? char?.avatar : undefined;

    const newMessage: RawSTChatMessage = {
      name: senderName,
      is_user: role === 'user',
      is_system: false,
      mes: content,
    };

    const canUseAddOneMessage = typeof ctx?.addOneMessage === 'function';

    if (canUseAddOneMessage) {
      ctx.addOneMessage(newMessage, {
        scroll: true,
      });
      Logger.debug(MODULE, 'Message injected via addOneMessage');
    } else {
      ctx.chat.push(newMessage);
      Logger.warn(MODULE, 'addOneMessage unavailable, fallback to ctx.chat.push');
    }

    await persistChat();

    Logger.info(MODULE, 'Message injected', {
      role,
      length: content.length,
      forceAvatar: Boolean(forceAvatar),
      usedAddOneMessage: canUseAddOneMessage,
    });
  } catch (error) {
    Logger.error(MODULE, 'Failed to inject message', error);
    throw error;
  }
}
