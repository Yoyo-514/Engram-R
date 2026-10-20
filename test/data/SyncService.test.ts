import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { syncService } from '@/data/SyncService';

import { DATA_SYNC_OPTIONS } from '../../engram.config';
const ports = vi.hoisted(() => ({
  config: { enabled: false, autoSync: true },
  listeners: new Set<() => void>(),
  events: new Map<string, () => void>(),
  fetch: vi.fn<typeof fetch>(),
  importing: vi.fn<(db: unknown, data: unknown) => Promise<void>>(),
  metaGet: vi.fn<(key: string) => Promise<{ value: number } | undefined>>(),
  metaPut: vi.fn<(value: unknown) => Promise<string>>(),
}));
vi.mock('@/config/settings', () => ({
  getSettings: () => ({ syncConfig: ports.config }),
  subscribe: (fn: () => void) => {
    ports.listeners.add(fn);
    return () => ports.listeners.delete(fn);
  },
}));
vi.mock('@/integrations/tavern', () => ({
  events: { CHAT_CHANGED: 'chat' },
  getSTContext: () => ({ chatId: 'chat' }),
  getRequestHeaders: () => ({ 'Content-Type': 'application/json' }),
  eventBus: {
    on: (event: string, fn: () => void) => {
      ports.events.set(event, fn);
      return () => ports.events.delete(event);
    },
  },
}));
vi.mock('@/data/db', () => ({
  getDbForChat: () => ({
    meta: { get: ports.metaGet, put: ports.metaPut },
    events: { count: async () => 0 },
    entities: { count: async () => 0 },
  }),
  exportChatData: async () => ({ meta: { lastModified: 1 }, events: [], entities: [] }),
  importChatData: ports.importing,
}));
vi.mock('@/core/logger', async () => ({
  ...(await import('@/core/logger/LogModule')),
  Logger: {
    debug: vi.fn<(...a: unknown[]) => void>(),
    info: vi.fn<(...a: unknown[]) => void>(),
    warn: vi.fn<(...a: unknown[]) => void>(),
    error: vi.fn<(...a: unknown[]) => void>(),
    success: vi.fn<(...a: unknown[]) => void>(),
  },
}));
vi.mock('@/ui/services/NotificationService', () => ({
  notificationService: {
    warning: vi.fn<(...a: unknown[]) => void>(),
    success: vi.fn<(...a: unknown[]) => void>(),
  },
}));
let service: typeof syncService;
let doc: EventTarget & { visibilityState: string };
const dump = { meta: { lastModified: 2 }, events: [], entities: [] };
function configure(enabled: boolean, autoSync = true) {
  ports.config = { enabled, autoSync };
  for (const fn of ports.listeners) fn();
}
beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.clearAllMocks();
  ports.listeners.clear();
  ports.events.clear();
  ports.config = { enabled: false, autoSync: true };
  ports.fetch.mockImplementation(async () => new Response('', { status: 404 }));
  ports.importing.mockResolvedValue(undefined);
  ports.metaGet.mockResolvedValue({ value: 1 });
  ports.metaPut.mockResolvedValue('lastModified');
  doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  vi.stubGlobal('document', doc);
  vi.stubGlobal('fetch', ports.fetch);
  vi.stubGlobal(
    'FileReader',
    class extends EventTarget {
      result = '';
      readAsDataURL(blob: Blob) {
        void blob.arrayBuffer().then((buffer) => {
          this.result = 'data:application/json;base64,' + Buffer.from(buffer).toString('base64');
          this.dispatchEvent(new Event('load'));
        });
      }
    }
  );
  service = (await import('@/data/SyncService')).syncService;
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe('同步生命周期与去重', () => {
  it('默认关闭时构造与启动不注册宿主事件或后台定时器', () => {
    expect(vi.getTimerCount()).toBe(0);
    service.start();
    service.start();
    expect(ports.events.size).toBe(0);
    expect(ports.listeners.size).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('开关即时绑定与解绑，反复启动保持单订阅', async () => {
    service.start();
    service.start();
    configure(true);
    expect(ports.events.size).toBe(1);
    await service.autoSyncDownload('chat');
    configure(false);
    expect(ports.events.size).toBe(0);
    const count = ports.fetch.mock.calls.length;
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(ports.fetch).toHaveBeenCalledTimes(count);
    configure(true, false);
    expect(ports.events.size).toBe(0);
  });
  it('同一聊天的并发自动检查合并，结束后允许再检查', async () => {
    service.start();
    configure(true);
    ports.events.get('chat')?.();
    doc.dispatchEvent(new Event('visibilitychange'));
    await service.autoSyncDownload('chat');
    expect(ports.fetch).toHaveBeenCalledTimes(1);
    await service.autoSyncDownload('chat');
    expect(ports.fetch).toHaveBeenCalledTimes(2);
  });
  it('关停会取消已排队上传', async () => {
    service.start();
    configure(true);
    await service.autoSyncDownload('chat');
    ports.fetch.mockClear();
    service.scheduleUpload('chat');
    service.scheduleUpload('chat');
    configure(false);
    await vi.advanceTimersByTimeAsync(DATA_SYNC_OPTIONS.uploadDelayMs);
    expect(ports.fetch).not.toHaveBeenCalled();
  });
  it('远端状态到达时自动同步已关闭则不导入', async () => {
    let finish!: (value: { exists: boolean; timestamp: number }) => void;
    vi.spyOn(service, 'getRemoteStatus').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    ports.config = { enabled: true, autoSync: true };
    const pending = service.autoSyncDownload('chat');
    ports.config = { enabled: false, autoSync: true };
    finish({ exists: true, timestamp: 2 });
    await pending;
    expect(ports.importing).not.toHaveBeenCalled();
    expect(ports.fetch).not.toHaveBeenCalled();
  });
  it('并发下载逐次释放导入锁，无延迟释放窗口', async () => {
    ports.fetch.mockImplementation(async () => new Response(JSON.stringify(dump)));
    let endA!: () => void;
    let endB!: () => void;
    ports.importing
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            endA = resolve;
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            endB = resolve;
          })
      );
    const a = service.download('a'),
      b = service.download('b');
    await vi.waitFor(() => expect(ports.importing).toHaveBeenCalledTimes(2));
    endA();
    expect(await a).toBe('success');
    await vi.advanceTimersByTimeAsync(1000);
    expect(service.isImportingState).toBe(true);
    endB();
    expect(await b).toBe('success');
    expect(service.isImportingState).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('手动上传保留文件名、base64与数据格式，关闭自动同步也可使用', async () => {
    ports.fetch.mockImplementation(async () => new Response('{}'));
    expect(await service.upload('chat/1')).toBe(true);
    const [url, options] = ports.fetch.mock.calls[0];
    const body = JSON.parse(String(options?.body));
    expect(url).toBe('/api/files/upload');
    expect(body.name).toBe('Engram_sync_chat_1.json');
    expect(JSON.parse(Buffer.from(body.data, 'base64').toString('utf8'))).toEqual({
      meta: { lastModified: 1 },
      events: [],
      entities: [],
    });
  });
  it('手动下载无数据和远端清理保留原返回协议', async () => {
    expect(await service.download('chat')).toBe('no_data');
    expect(service.isImportingState).toBe(false);
    await service.purge('chat');
    expect(ports.fetch.mock.calls.at(-1)).toMatchObject([
      '/api/files/delete',
      { method: 'POST', body: JSON.stringify({ path: 'Engram_sync_chat.json' }) },
    ]);
  });
});
