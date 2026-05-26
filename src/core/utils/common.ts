// 通用工具函数

/**
 * 格式化时间戳
 */
/**
 * 截断文本
 */
/**
 * 生成语义化短 UUID (例如 evt_A1b2C3)
 * 采用 Base62 字符集，默认 6 位长度，兼顾极短体积与防撞性能。
 * @param prefix 自定义前缀，如 'evt_' 或 'ent_'
 * @param length 随机串长度，默认为 6
 */
export function generateShortUUID(prefix: string, length: number = 6): string {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let result = prefix;
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * 延迟指定毫秒数 (用于重试退避)
 * @param ms 毫秒数
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 让出主线程，避免长流程连续同步步骤阻塞界面渲染。
 */
export function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

export function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}
