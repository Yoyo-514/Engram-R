import { beforeEach, describe, expect, it } from 'vitest';

import { LogLevel } from '@/config/logger/defaults';
import { Logger } from '@/core/logger';

describe('Logger', () => {
  beforeEach(() => {
    Logger.init({ maxEntries: 5000, minLevel: LogLevel.DEBUG });
  });

  it('truncates oversized object payloads', () => {
    const bigValue = 'x'.repeat(10_000);
    Logger.info('Test', 'big object payload', { value: bigValue });

    const entry = Logger.getLogs().find((l) => l.message === 'big object payload');
    expect(entry).toBeDefined();
    const data = entry!.data as { __truncated?: boolean; preview?: string };
    expect(data.__truncated).toBe(true);
    expect(data.preview!.length).toBeLessThan(5000);
  });

  it('truncates oversized string payloads', () => {
    const bigValue = 'y'.repeat(20_000);
    Logger.warn('Test', 'big string payload', bigValue);

    const entry = Logger.getLogs().find((l) => l.message === 'big string payload');
    expect(entry).toBeDefined();
    expect(typeof entry!.data).toBe('string');
    expect((entry!.data as string).length).toBeLessThan(10_000);
  });

  it('keeps small payloads intact', () => {
    const data = { a: 1, b: 'two' };
    Logger.info('Test', 'small payload', data);

    const entry = Logger.getLogs().find((l) => l.message === 'small payload');
    expect(entry!.data).toEqual(data);
  });

  it('lazily trims cache above maxEntries', () => {
    Logger.init({ maxEntries: 10, minLevel: LogLevel.DEBUG });
    for (let i = 0; i < 20; i++) {
      Logger.debug('Test', `entry ${i}`);
    }

    const logs = Logger.getLogs();
    // 惰性裁剪：缓存允许短暂超过上限（不超过 125%），触发裁剪后回到 maxEntries
    expect(logs.length).toBeLessThanOrEqual(Math.ceil(10 * 1.25));
    // FIFO：最早的初始化日志已被挤出缓存
    expect(logs.some((l) => l.message === 'Logger 初始化完成')).toBe(false);
  });
});
