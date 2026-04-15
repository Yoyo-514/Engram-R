/**
 * STContext - SillyTavern 上下文获取模块
 *
 * 统一的上下文获取入口，消除各模块重复定义。
 * 负责从 window.SillyTavern 对象中安全地提取状态。
 */

import { Logger } from '@/core/logger';
import { getCurrentTavernCharacter, getTavernContext } from '@/core/utils';
import type { TavernContext, TavernCharacter } from '@/core/utils';

const MODULE = 'STContext';

export type RawSTChatMessage = SillyTavern.ChatMessage;

function parseCharacterId(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value !== 'string') {
    const strValue = String(value);
    const trimmed = strValue.trim();
    return trimmed;
  }

  return value as string;
}

/**
 * 获取 SillyTavern 上下文
 * @returns ST 上下文对象，或 null（如果不可用）
 */
export function getSTContext(): TavernContext | null {
  const ctx = getRawSTContext();
  if (!ctx) {
    return null;
  }

  return {
    ...ctx,
    characterId: parseCharacterId(ctx.characterId),
  };
}

export function getRawSTContext(): TavernContext | null | undefined {
  try {
    return getTavernContext();
  } catch (e) {
    Logger.warn(MODULE, '无法获取 ST 上下文', e);
    return null;
  }
}

/**
 * 获取当前聊天记录
 */
export function getCurrentChat(): RawSTChatMessage[] {
  const ctx = getSTContext();
  return ctx?.chat || [];
}

/**
 * 获取当前聊天 ID
 */
export function getCurrentChatId(): string | null {
  const ctx = getSTContext();
  return ctx?.chatId || null;
}

/**
 * 获取当前角色信息
 */
export function getCurrentCharacter(): {
  name: string;
  id: string;
  character: TavernCharacter;
} | null {
  const ctx = getSTContext();
  const character = getCurrentTavernCharacter(ctx);
  if (!ctx || !ctx.characterId || !character) return null;
  return {
    name: character.name || ctx.name2,
    id: ctx.characterId,
    character,
  };
}

/**
 * 获取当前模型名称 (尝试从全局变量获取)
 */
export function getCurrentModel(): string | undefined {
  try {
    const ctx = getSTContext();
    const model = ctx?.getChatCompletionModel();
    return model || undefined;
  } catch {
    return undefined;
  }
}

/**
 * 检查 ST 上下文是否可用
 */
export function isSTAvailable(): boolean {
  return getSTContext() !== null;
}

/**
 * 获取请求头 (包含 CSRF Token)
 */
export function getRequestHeaders(): Record<string, string> {
  const ctx = getSTContext();
  if (ctx?.getRequestHeaders) {
    return ctx.getRequestHeaders();
  }
  // Fallback: 如果拿不到 context，至少返回 Content-Type
  return { 'Content-Type': 'application/json' };
}
