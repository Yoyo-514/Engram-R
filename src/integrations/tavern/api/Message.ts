/**
 * MessageService - SillyTavern 消息服务封装
 *
 * 提供聊天消息获取、楼层计数等功能
 */

import { getCurrentTavernCharacter } from '@/core/utils';
import { getSTContext, isSTAvailable } from '@/integrations/tavern';
import type { RawSTChatMessage } from '@/integrations/tavern';

/** 消息角色类型 */
type MessageRole = 'user' | 'assistant' | 'system';

/** 酒馆消息结构 */
export interface TavernMessage {
  /** 消息 ID (楼层号) */
  id: number;
  /** 发送者角色 */
  role: MessageRole;
  /** 消息内容 */
  content: string;
  /** 发送者名称 */
  name: string;
  /** 原始消息对象引用 */
  raw?: unknown;
}

/** 消息查询选项 */
export interface GetMessagesOptions {
  /** 是否包含隐藏消息 */
  includeHidden?: boolean;
  /** 角色过滤 */
  role?: MessageRole | MessageRole[];
}

function getMessageRole(msg: RawSTChatMessage): MessageRole {
  const isNarrator = msg.extra?.type === 'narrator';

  if (isNarrator && !msg.is_user) {
    return 'system';
  }

  if (msg.is_user) {
    return 'user';
  }

  return 'assistant';
}

function isHiddenMessage(msg: RawSTChatMessage): boolean {
  return msg.is_system === true;
}

function convertMessage(msg: RawSTChatMessage, index: number): TavernMessage {
  return {
    id: index,
    role: getMessageRole(msg),
    content: msg.mes || '',
    name: msg.name || '',
    raw: msg,
  };
}

function normalizeRoles(role?: MessageRole | MessageRole[]): MessageRole[] | null {
  if (!role) {
    return null;
  }

  return Array.isArray(role) ? role : [role];
}

export function getAllMessages(options: GetMessagesOptions = {}): TavernMessage[] {
  const context = getSTContext();
  if (!context?.chat) {
    return [];
  }

  const roles = normalizeRoles(options.role);

  let messages = context.chat
    .map((msg, index) => ({ msg, index }))
    .filter(({ msg }) => options.includeHidden || !isHiddenMessage(msg))
    .map(({ msg, index }) => convertMessage(msg, index));

  if (roles) {
    messages = messages.filter((message) => roles.includes(message.role));
  }

  return messages;
}

export function getFloorCount(options: GetMessagesOptions = {}): number {
  return getAllMessages(options).length;
}

export function getCurrentCharacterName(): string | null {
  return getCurrentTavernCharacter(getSTContext())?.name || null;
}

export function isMessageServiceAvailable(): boolean {
  return isSTAvailable();
}
