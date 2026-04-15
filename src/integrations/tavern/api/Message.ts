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

/**
 * 获取消息角色
 * 规则：
 * - 'system': extra?.type === 'narrator' && !is_user
 * - 'user': extra?.type !== 'narrator' && is_user
 * - 'assistant': extra?.type !== 'narrator' && !is_user
 */
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

/**
 * 判断消息是否为隐藏消息
 * 说明：
 * - 在当前类型定义里，is_system 实际表示“消息是否被隐藏且不会发给 LLM”
 */
function isHiddenMessage(msg: RawSTChatMessage): boolean {
  return msg.is_system === true;
}

/**
 * 将酒馆原始消息转换为统一格式
 */
function convertMessage(msg: RawSTChatMessage, index: number): TavernMessage {
  return {
    id: index,
    role: getMessageRole(msg),
    content: msg.mes || '',
    name: msg.name || '',
    raw: msg,
  };
}

/**
 * 标准化角色过滤参数
 */
function normalizeRoles(role?: MessageRole | MessageRole[]): MessageRole[] | null {
  if (!role) {
    return null;
  }

  return Array.isArray(role) ? role : [role];
}

/**
 * 获取当前聊天的所有消息
 * @param options 查询选项
 */
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

  // 角色过滤
  if (roles) {
    messages = messages.filter((message) => roles.includes(message.role));
  }

  return messages;
}

/**
 * 获取最近 N 条消息
 * @param count 消息数量
 * @param options 查询选项
 */
export function getRecentMessages(
  count: number,
  options: GetMessagesOptions = {}
): TavernMessage[] {
  const safeCount = Math.max(0, Math.floor(count));
  if (safeCount === 0) {
    return [];
  }

  const messages = getAllMessages(options);
  return messages.slice(-safeCount);
}

/**
 * 获取指定范围的消息
 * @param start 起始索引（包含）
 * @param end 结束索引（不包含）
 * @param options 查询选项
 */
export function getMessages(
  start: number,
  end?: number,
  options: GetMessagesOptions = {}
): TavernMessage[] {
  const messages = getAllMessages(options);
  return messages.slice(start, end);
}

/**
 * 获取当前楼层数（消息总数）
 * @param options 查询选项
 */
export function getFloorCount(options: GetMessagesOptions = {}): number {
  return getAllMessages(options).length;
}

/**
 * 获取最后一条消息
 * @param options 查询选项
 */
export function getLastMessage(options: GetMessagesOptions = {}): TavernMessage | null {
  const messages = getAllMessages(options);
  return messages.length > 0 ? messages[messages.length - 1] : null;
}

/**
 * 获取当前角色名称
 */
export function getCurrentCharacterName(): string | null {
  return getCurrentTavernCharacter(getSTContext())?.name || null;
}

/**
 * 格式化消息为纯文本（用于传给 LLM）
 * @param messages 消息数组
 * @param format 格式化模板
 */
export function formatMessagesAsText(
  messages: TavernMessage[],
  format: 'simple' | 'detailed' = 'simple'
): string {
  if (format === 'simple') {
    return messages.map((message) => `${message.name}: ${message.content}`).join('\n\n');
  }

  return messages
    .map((message) => `[${message.role.toUpperCase()}] ${message.name}:\n${message.content}`)
    .join('\n\n---\n\n');
}

/**
 * 检查 MessageService 是否可用
 */
export function isMessageServiceAvailable(): boolean {
  return isSTAvailable();
}
