import { Logger } from '@/core/logger';
import { getSTContext, RawSTChatMessage } from '../core/context';
import { getTavernHelper } from '@/core/utils';

const MODULE = 'TavernChat';

interface HideChatModule {
  hideChatMessageRange?: (start: number, end: number, includeSystem?: boolean) => Promise<void>;
}

interface ScriptCharacter {
  avatar?: string;
}

interface ScriptModule {
  characters?: ScriptCharacter[];
  saveChat?: () => Promise<void>;
  reloadCurrentChat?: () => Promise<void>;
}

async function importHideChatModule(): Promise<HideChatModule> {
  const importPath = '/scripts/chats.js';
  return (await import(/* @vite-ignore */ importPath)) as HideChatModule;
}

async function importScriptModule(): Promise<ScriptModule> {
  const scriptPath = '/script.js';
  return (await import(/* @vite-ignore */ scriptPath)) as ScriptModule;
}

function getCharacterAvatar(scriptModule: ScriptModule, characterId: number): string | undefined {
  return scriptModule.characters?.[characterId]?.avatar;
}

/**
 * 隐藏指定范围的消息
 * @param start 起始楼层
 * @param end 结束楼层
 */
export async function hideMessageRange(start: number, end: number): Promise<void> {
  try {
    const command = `/hide ${start}-${end}`;

    const tavernhelper = getTavernHelper();
    if (!tavernhelper) {
        return;
      }

    // 优先使用官方扩展支持的斜杠指令触发器（高兼容性）
    if (typeof tavernhelper.triggerSlash === 'function') {
      await tavernhelper.triggerSlash(command);
      Logger.debug(MODULE, `Slash command execution: ${command}`);
    } else {
      // 降级：如果不可用，尝试兼容之前的做法
      Logger.warn(MODULE, 'TavernHelper.triggerSlash is unavailable. Executing fallback hiding.');
      const chatsModule = await importHideChatModule();
      if (typeof chatsModule.hideChatMessageRange === 'function') {
        await chatsModule.hideChatMessageRange(start, end, false);
      }
    }

    // 统一在执行隐藏后尝试强制保存聊天状态，避免刷新后隐藏失效（SillyTavern 的常见坑）
    setTimeout(() => {
      void (async () => {
        try {
          const scriptModule = await importScriptModule();
          if (typeof scriptModule.saveChat === 'function') {
            await scriptModule.saveChat();
            Logger.debug(MODULE, `Chat explicitly saved after hiding range: ${start}-${end}`);
          }
        } catch (e) {
          Logger.warn(MODULE, 'Failed to explicitly save chat after hiding.', e);
        }
      })();
    }, 800);
  } catch (e) {
    Logger.error(MODULE, 'Failed to hide messages:', e);
  }
}

/**
 * 注入一条消息到聊天记录
 * @param role 角色 ('user' | 'char')
 * @param content 消息内容
 * @param name 发送者名称 (可选，默认使用当前角色或用户名)
 */
export async function injectMessage(
  role: 'user' | 'char',
  content: string,
  name?: string
): Promise<void> {
  try {
    const ctx = getSTContext();
    if (!ctx) throw new Error('ST Context unavailable');

    const senderName = name || (role === 'user' ? ctx.name1 : ctx.name2);

    // 动态导入 chats.js 中的核心函数
    const scriptModule = await importScriptModule();

    if (!ctx.chat) throw new Error('Chat array unavailable');

    const forceAvatar =
      role === 'char' && typeof ctx.characterId === 'number'
        ? getCharacterAvatar(scriptModule, ctx.characterId)
        : undefined;

    const newMessage: RawSTChatMessage = {
      name: senderName,
      is_user: role === 'user',
      is_system: false,
      mes: content,
    };

    // 3. 推入聊天记录
    ctx.chat.push(newMessage);

    // 4. 保存并刷新
    if (typeof scriptModule.saveChat === 'function') {
      await scriptModule.saveChat();
    }

    // 5. 刷新界面
    if (typeof scriptModule.reloadCurrentChat === 'function') {
      await scriptModule.reloadCurrentChat();
    }

    Logger.info(MODULE, '已注入消息', { role, length: content.length });
  } catch (e) {
    Logger.error(MODULE, 'Failed to inject message:', e);
    throw e;
  }
}
