/**
 * STContext - SillyTavern 上下文获取模块
 *
 * 统一的上下文获取入口，消除各模块重复定义。
 * 负责从 window.SillyTavern 对象中安全地提取状态。
 */

import { Logger } from '@/core/logger';

const MODULE = 'STContext';

// SillyTavern 全局类型声明已移至 @types/global.d.ts

export type RawSTContext = typeof SillyTavern;
type RawSTChatMessage = SillyTavern.ChatMessage;

interface SillyTavernHost {
  getContext?: () => unknown;
  eventSource?: unknown;
  extensionSettings?: unknown;
  saveSettingsDebounced?: unknown;
}

function getSillyTavernHost(): unknown {
  return (window as Window & { SillyTavern?: unknown }).SillyTavern;
}

function isSillyTavernHost(value: unknown): value is SillyTavernHost {
  return !!value && typeof value === 'object';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function isRawSTContext(value: unknown): value is RawSTContext {
  return isRecord(value);
}

function getContextCandidate(host: SillyTavernHost): unknown {
  const hostRecord = isRecord(host) ? host : {};

  if (typeof host.getContext === 'function') {
    const context = host.getContext();
    if (isRecord(context)) {
      return {
        ...hostRecord,
        ...context,
        eventSource: context.eventSource ?? hostRecord.eventSource,
        extensionSettings: context.extensionSettings ?? hostRecord.extensionSettings,
        saveSettingsDebounced: context.saveSettingsDebounced ?? hostRecord.saveSettingsDebounced,
      };
    }
  }

  return hostRecord;
}

function normalizeChatMessage(message: RawSTChatMessage): STMessage {
  return {
    mes: message.mes,
    is_user: message.is_user,
    is_system: message.is_system,
    is_hidden: undefined,
    name: message.name,
    extra: isRecord(message.extra) ? message.extra : undefined,
    force_avatar: undefined,
  };
}

function parseCharacterId(value: string | number | null | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

/** ST 上下文类型 */
type EventCallback = (data: unknown) => void;

type MacroHandler = (context?: unknown) => string | Promise<string>;

export interface STContext {
  chat: STMessage[];
  characters: STCharacter[];
  name1: string; // 用户名
  name2: string; // 角色名
  characterId: number | null;
  chatId: string;
  // 事件系统
  eventSource?: {
    on: (event: string, callback: EventCallback) => void;
    once: (event: string, callback: EventCallback) => void;
    emit: (event: string, data: unknown) => void;
    removeListener: (event: string, callback: EventCallback) => void;
  };
  event_types?: Record<string, string>;
  // 工具函数
  getRequestHeaders?: (options?: { omitContentType?: boolean }) => Record<string, string>;
  // Token 计数
  getTokenCountAsync?: (text: string) => Promise<number>;
  // 生成控制
  stopGeneration?: () => void;

  // 宏系统
  registerMacro?: (
    key: string,
    value: string | ((uid: string) => string),
    description?: string
  ) => void;
  macros?: {
    register: (
      name: string,
      options: {
        handler: MacroHandler;
        description?: string;
        category?: string;
        returnType?: string;
        strictArgs?: boolean;
        [key: string]: unknown;
      }
    ) => void;
  };

  // 聊天元数据
  chat_metadata?: Record<string, unknown>;
  powerUserSettings?: PowerUserSettingsLike;
  // 扩展配置
  extensionSettings?: Record<string, unknown>;
}

/** ST 消息类型 */
export interface STMessage {
  mes: string;
  is_user: boolean;
  is_system?: boolean;
  is_hidden?: boolean;
  name: string;
  send_date?: number;
  extra?: Record<string, unknown>;
  force_avatar?: string; // 有时用于强制显示特定头像
}

/** ST 角色类型 */
interface STCharacter {
  name: string;
  avatar: string;
  description: string;
}

/**
 * 获取 SillyTavern 上下文
 * @returns ST 上下文对象，或 null（如果不可用）
 */
export function getSTContext(): STContext | null {
  const ctx = getRawSTContext();
  if (!ctx) {
    return null;
  }

  const chat = Array.isArray(ctx.chat) ? ctx.chat.map(normalizeChatMessage) : [];
  const characters = Array.isArray(ctx.characters)
    ? ctx.characters.map((character) => ({
        name: character.name,
        avatar: character.avatar,
        description: character.description,
      }))
    : [];

  return {
    chat,
    characters,
    name1: typeof ctx.name1 === 'string' ? ctx.name1 : '',
    name2: typeof ctx.name2 === 'string' ? ctx.name2 : '',
    characterId: parseCharacterId(ctx.characterId),
    chatId: typeof ctx.chatId === 'string' ? ctx.chatId : '',
    eventSource: ctx.eventSource,
    event_types: ctx.eventTypes,
    getRequestHeaders: ctx.getRequestHeaders,
    getTokenCountAsync: ctx.getTokenCountAsync,
    stopGeneration: ctx.stopGeneration,
    registerMacro: ctx.registerMacro,
    chat_metadata: ctx.chatMetadata,
    powerUserSettings: ctx.powerUserSettings,
    extensionSettings: ctx.extensionSettings,
  };
}

export function getRawSTContext(): RawSTContext | null {
  try {
    const host = getSillyTavernHost();
    if (!isSillyTavernHost(host)) {
      return null;
    }

    const context = getContextCandidate(host);
    return isRawSTContext(context) ? context : null;
  } catch (e) {
    Logger.warn(MODULE, '无法获取 ST 上下文', e);
    return null;
  }
}

/**
 * 获取当前聊天记录
 */
export function getCurrentChat(): STMessage[] {
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
export function getCurrentCharacter(): { name: string; id: number } | null {
  const ctx = getSTContext();
  if (!ctx || ctx.characterId === null) return null;
  return {
    name: ctx.name2,
    id: ctx.characterId,
  };
}

/**
 * 获取当前模型名称 (尝试从全局变量获取)
 */
export function getCurrentModel(): string | undefined {
  try {
    return window.selected_model || undefined;
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
export function getRequestHeaders(options?: { omitContentType?: boolean }): Record<string, string> {
  const ctx = getSTContext();
  if (ctx?.getRequestHeaders) {
    return ctx.getRequestHeaders(options);
  }
  // Fallback: 如果拿不到 context，至少返回 Content-Type
  return { 'Content-Type': 'application/json' };
}
