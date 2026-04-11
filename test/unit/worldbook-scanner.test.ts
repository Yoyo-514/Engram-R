import { beforeEach, describe, expect, it, vi } from 'vitest';

const getEntriesMock = vi.fn();
const getTavernHelperMock = vi.fn();
const getSettingsMock = vi.fn();

vi.mock('@/integrations/tavern/worldbook/crud', () => ({
  getEntries: getEntriesMock,
}));

vi.mock('@/integrations/tavern/worldbook/adapter', () => ({
  getTavernHelper: getTavernHelperMock,
}));

vi.mock('@/config/settings', () => ({
  SettingsManager: {
    getSettings: getSettingsMock,
  },
}));

describe('WorldbookScannerService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should skip scanning when worldbook feature is disabled', async () => {
    getSettingsMock.mockReturnValue({
      apiSettings: {
        worldbookConfig: {
          enabled: false,
          includeGlobal: true,
          disabledWorldbooks: [],
          disabledEntries: {},
        },
      },
    });

    getTavernHelperMock.mockReturnValue({
      getGlobalWorldbookNames: () => ['GlobalBook'],
      getCharWorldbookNames: () => ({ primary: null, additional: [] }),
    });

    getEntriesMock.mockResolvedValue([
      {
        uid: 1,
        world: 'GlobalBook',
        name: 'Hero',
        content: 'Hero entry',
        enabled: true,
        constant: true,
        keys: [],
        order: 1,
      },
    ]);

    const { WorldbookScannerService } = await import('@/integrations/tavern/worldbook/scanner');
    await expect(WorldbookScannerService.scanWorldbook('GlobalBook', 'hero')).resolves.toBe('');
  });

  it('should exclude global books when includeGlobal is false', async () => {
    getSettingsMock.mockReturnValue({
      apiSettings: {
        worldbookConfig: {
          enabled: true,
          includeGlobal: false,
          disabledWorldbooks: [],
          disabledEntries: {},
        },
      },
    });

    getTavernHelperMock.mockReturnValue({
      getGlobalWorldbookNames: () => ['GlobalBook'],
      getCharWorldbookNames: () => ({ primary: 'ChatBook', additional: [] }),
    });

    getEntriesMock.mockImplementation(async (worldbookName: string) => {
      if (worldbookName === 'GlobalBook') {
        return [
          {
            uid: 1,
            world: 'GlobalBook',
            name: 'Global Hero',
            content: 'Global entry',
            enabled: true,
            constant: true,
            keys: [],
            order: 1,
          },
        ];
      }

      return [
        {
          uid: 2,
          world: 'ChatBook',
          name: 'Chat Hero',
          content: 'Chat entry',
          enabled: true,
          constant: true,
          keys: [],
          order: 1,
        },
      ];
    });

    const { WorldbookScannerService } = await import('@/integrations/tavern/worldbook/scanner');
    await expect(WorldbookScannerService.getActivatedWorldInfo(['hero'])).resolves.toBe(
      'Chat entry'
    );
  });
});
