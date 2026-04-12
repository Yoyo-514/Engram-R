import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/core/logger', () => ({
  Logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
  LogModule: {
    DATA_SYNC: 'DATA_SYNC',
  },
}));

vi.mock('@/integrations/tavern', () => ({
  getSTContext: vi.fn(() => ({ chatId: 'test_sync' })),
  getRequestHeaders: vi.fn(() => ({})),
  TavernEventType: { CHAT_CHANGED: 'chat_changed' },
  EventBus: { on: vi.fn() },
}));

vi.mock('@/data/db', () => ({
  getDbForChat: vi.fn(),
  exportChatData: vi.fn(),
  importChatData: vi.fn(),
}));

vi.mock('@/config/settings', () => ({
  SettingsManager: {
    getSettings: vi.fn(() => ({ syncConfig: { enabled: false, autoSync: false } })),
  },
}));

vi.mock('@/ui/services/NotificationService', () => ({
  notificationService: {
    warning: vi.fn(),
    success: vi.fn(),
  },
}));

describe('SyncService in non-DOM environment', () => {
  const originalDocument = (globalThis as any).document;

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
    if (originalDocument === undefined) {
      delete (globalThis as any).document;
    } else {
      (globalThis as any).document = originalDocument;
    }
  });

  it('should not throw when document is unavailable', async () => {
    vi.useFakeTimers();
    delete (globalThis as any).document;

    await import('@/data/SyncService');
    await vi.advanceTimersByTimeAsync(2100);

    expect((globalThis as any).document).toBeUndefined();
  });
});
