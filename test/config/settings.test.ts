import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const host = vi.hoisted(() => ({
  context: null as {
    extensionSettings: Record<string, unknown>;
    saveSettingsDebounced: ReturnType<typeof vi.fn<() => void>>;
  } | null,
}));

vi.mock('@/integrations/tavern/core/context', () => ({
  getRawSTContext: () => host.context,
}));
vi.mock('@/core/logger', async () => ({
  ...(await import('@/core/logger/LogModule')),
  Logger: {
    debug: vi.fn<(...args: unknown[]) => void>(),
    info: vi.fn<(...args: unknown[]) => void>(),
    warn: vi.fn<(...args: unknown[]) => void>(),
    error: vi.fn<(...args: unknown[]) => void>(),
  },
}));

beforeEach(() => {
  vi.resetModules();
  host.context = { extensionSettings: {}, saveSettingsDebounced: vi.fn<() => void>() };
});
afterEach(() => {
  vi.useRealTimers();
});

describe('酒馆设置', () => {
  it('宿主就绪前返回稳定的初始快照', async () => {
    host.context = null;
    const settings = await import('@/config/settings');
    expect(settings.getSettings()).toBe(settings.getSettings());
    expect(settings.get('runtimeSettings').embeddingConfig).toBeDefined();
  });

  it('首次绑定补齐缺失字段，并保留用户的值和空列表', async () => {
    host.context!.extensionSettings.engram = {
      runtimeSettings: { llmPresets: [], promptTemplates: [], customMacros: [] },
      summarizerConfig: { floorInterval: 35 },
      linkedDeletion: { enabled: false },
      syncConfig: { enabled: true },
    };
    const settings = await import('@/config/settings');
    const saved = settings.getSettings();
    expect(saved.runtimeSettings.llmPresets).toEqual([]);
    expect(saved.runtimeSettings.promptTemplates).toEqual([]);
    expect(saved.runtimeSettings.customMacros).toEqual([]);
    expect(saved.runtimeSettings.embeddingConfig).toBeDefined();
    expect(saved.summarizerConfig.floorInterval).toBe(35);
    expect(saved.summarizerConfig.previewEnabled).toBeTypeOf('boolean');
    expect(saved.trimmerConfig.keepRecentCount).toBeTypeOf('number');
    expect(saved.linkedDeletion).toMatchObject({ enabled: false, deleteIndexedDB: true });
    expect(saved.syncConfig).toEqual({ enabled: true, autoSync: true });
    expect(host.context!.extensionSettings.engram).toBe(saved);
    expect(host.context!.saveSettingsDebounced).toHaveBeenCalledTimes(1);
  });

  it('普通读取保持宿主对象引用且不重复申请保存', async () => {
    const settings = await import('@/config/settings');
    const saved = settings.getSettings();
    host.context!.saveSettingsDebounced.mockClear();
    expect(settings.getSettings()).toBe(saved);
    expect(settings.get('runtimeSettings')).toBe(saved.runtimeSettings);
    expect(settings.get('summarizerConfig')).toBe(saved.summarizerConfig);
    expect(host.context!.saveSettingsDebounced).not.toHaveBeenCalled();
  });

  it('宿主替换设置后读取新对象并补齐默认值', async () => {
    const settings = await import('@/config/settings');
    const previous = settings.getSettings();
    host.context!.extensionSettings.engram = { lastOpenedTab: 'presets' };
    const next = settings.getSettings();
    expect(next).not.toBe(previous);
    expect(next.lastOpenedTab).toBe('presets');
    expect(next.runtimeSettings.vectorConfig).toBeDefined();
    expect(settings.getSettings()).toBe(next);
  });

  it('单字段更新只通知和申请保存各一次，取消订阅后停止通知', async () => {
    const settings = await import('@/config/settings');
    await settings.initSettings();
    host.context!.saveSettingsDebounced.mockClear();
    const listener = vi.fn<() => void>();
    const unsubscribe = settings.subscribe(listener);
    settings.set('lastOpenedTab', 'presets');
    expect(settings.get('lastOpenedTab')).toBe('presets');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(host.context!.saveSettingsDebounced).toHaveBeenCalledTimes(1);
    unsubscribe();
    settings.set('lastOpenedTab', 'memory');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('提示词优先匹配已保存模板，缺失时按内置 ID 查找', async () => {
    const settings = await import('@/config/settings');
    const runtime = settings.get('runtimeSettings');
    const builtin = runtime.promptTemplates[0];
    const custom = { ...builtin, name: '自定义名称' };
    settings.set('runtimeSettings', { ...runtime, promptTemplates: [custom] });
    expect(settings.getPromptTemplateById(builtin.id)).toBe(custom);
    settings.set('runtimeSettings', { ...runtime, promptTemplates: [] });
    expect(settings.getPromptTemplateById(builtin.id)).toMatchObject({ id: builtin.id });
    expect(settings.getPromptTemplateById('missing-template')).toBeNull();
  });

  it('正则列表接口保持原有读写格式', async () => {
    const settings = await import('@/config/settings');
    settings.getSettings();
    settings.setRegexRules([]);
    expect(settings.getRegexRules()).toEqual([]);
    expect(settings.get('regexRules')).toBe(settings.getRegexRules());
  });

  it('宿主等待使用传入超时，超时后返回 false', async () => {
    vi.useFakeTimers();
    host.context = null;
    const settings = await import('@/config/settings');
    const ready = settings.waitUntilReady(400, 100);
    await vi.advanceTimersByTimeAsync(400);
    expect(await ready).toBe(false);
  });

  it('初始化超时后返回 false', async () => {
    vi.useFakeTimers();
    host.context = null;
    const settings = await import('@/config/settings');
    const initialized = settings.initSettings();
    await vi.runAllTimersAsync();
    expect(await initialized).toBe(false);
  });
});

describe('配置响应式视图', () => {
  it('宿主延后就绪时刷新提前创建的 store', async () => {
    vi.useFakeTimers();
    host.context = null;
    const settings = await import('@/config/settings');
    const { useConfigStore } = await import('@/state/configStore');
    const initialized = settings.initSettings();
    host.context = {
      extensionSettings: { engram: { summarizerConfig: { floorInterval: 75 } } },
      saveSettingsDebounced: vi.fn<() => void>(),
    };
    await vi.advanceTimersByTimeAsync(200);
    expect(await initialized).toBe(true);
    expect(useConfigStore.getState().summarizerConfig.floorInterval).toBe(75);
    expect(useConfigStore.getState().hasChanges).toBe(false);
  });

  it('顶层配置即时可读且只申请一次宿主保存', async () => {
    const settings = await import('@/config/settings');
    const { useConfigStore } = await import('@/state/configStore');
    host.context!.saveSettingsDebounced.mockClear();
    useConfigStore.getState().updateConfig('summarizerConfig', (previous) => ({
      ...previous,
      floorInterval: 45,
    }));
    expect(settings.get('summarizerConfig').floorInterval).toBe(45);
    expect(useConfigStore.getState().summarizerConfig).toBe(settings.get('summarizerConfig'));
    expect(useConfigStore.getState().hasChanges).toBe(true);
    expect(host.context!.saveSettingsDebounced).toHaveBeenCalledTimes(1);
  });

  it('运行态字段更新保留模型预设与世界书配置', async () => {
    const settings = await import('@/config/settings');
    const { useConfigStore } = await import('@/state/configStore');
    const before = settings.get('runtimeSettings');
    host.context!.saveSettingsDebounced.mockClear();
    useConfigStore.getState().updateConfig('entityExtractConfig', (previous) => ({
      ...previous,
      previewEnabled: !previous.previewEnabled,
    }));
    const after = settings.get('runtimeSettings');
    expect(after.entityExtractConfig.previewEnabled).toBe(
      !before.entityExtractConfig.previewEnabled
    );
    expect(after.llmPresets).toBe(before.llmPresets);
    expect(after.worldbookConfig).toBe(before.worldbookConfig);
    expect(useConfigStore.getState().entityExtractConfig).toBe(after.entityExtractConfig);
    expect(host.context!.saveSettingsDebounced).toHaveBeenCalledTimes(1);
  });

  it('完整替换运行配置时允许省略可选嵌入配置', async () => {
    const settings = await import('@/config/settings');
    const { useConfigStore } = await import('@/state/configStore');
    const original = settings.get('runtimeSettings').embeddingConfig;
    const runtime = { ...settings.get('runtimeSettings') };
    delete runtime.embeddingConfig;
    settings.set('runtimeSettings', runtime);
    expect(settings.get('runtimeSettings').embeddingConfig).toEqual(original);
    expect(useConfigStore.getState().embeddingConfig).toEqual(original);
  });

  it('函数更新使用最新宿主值，并同步宿主外部更新', async () => {
    const settings = await import('@/config/settings');
    const { useConfigStore } = await import('@/state/configStore');
    settings.set('summarizerConfig', { ...settings.get('summarizerConfig'), floorInterval: 50 });
    expect(useConfigStore.getState().summarizerConfig.floorInterval).toBe(50);
    useConfigStore.getState().updateConfig('summarizerConfig', (previous) => ({
      ...previous,
      floorInterval: previous.floorInterval + 5,
    }));
    expect(settings.get('summarizerConfig').floorInterval).toBe(55);
  });

  it('宏的增改、启停与删除即时更新同一份配置', async () => {
    const settings = await import('@/config/settings');
    const { useConfigStore } = await import('@/state/configStore');
    settings.set('runtimeSettings', { ...settings.get('runtimeSettings'), customMacros: [] });
    host.context!.saveSettingsDebounced.mockClear();
    useConfigStore.getState().addCustomMacro();
    const macro = settings.get('runtimeSettings').customMacros[0];
    expect(macro).toMatchObject({ name: 'new_macro', content: '', enabled: true });
    useConfigStore.getState().updateCustomMacro(macro.id, { content: '新内容' });
    expect(settings.get('runtimeSettings').customMacros[0].content).toBe('新内容');
    useConfigStore.getState().toggleCustomMacro(macro.id);
    expect(settings.get('runtimeSettings').customMacros[0].enabled).toBe(false);
    useConfigStore.getState().deleteCustomMacro(macro.id);
    expect(settings.get('runtimeSettings').customMacros).toEqual([]);
    expect(useConfigStore.getState().customMacros).toEqual([]);
    expect(host.context!.saveSettingsDebounced).toHaveBeenCalledTimes(4);
  });

  it('手动保存不回写旧快照或覆盖外部编辑，保存后清除改动标记', async () => {
    const settings = await import('@/config/settings');
    const { useConfigStore } = await import('@/state/configStore');
    useConfigStore.getState().updateConfig('summarizerConfig', (previous) => ({
      ...previous,
      floorInterval: 45,
    }));
    settings.set('runtimeSettings', {
      ...settings.get('runtimeSettings'),
      llmPresets: settings.get('runtimeSettings').llmPresets.map((preset) => ({
        ...preset,
        name: '外部编辑后的名称',
      })),
    });
    const runtime = settings.get('runtimeSettings');
    host.context!.saveSettingsDebounced.mockClear();
    useConfigStore.getState().saveConfig();
    expect(settings.get('runtimeSettings')).toBe(runtime);
    expect(settings.get('runtimeSettings').llmPresets[0].name).toBe('外部编辑后的名称');
    expect(settings.get('summarizerConfig').floorInterval).toBe(45);
    expect(useConfigStore.getState().hasChanges).toBe(false);
    expect(host.context!.saveSettingsDebounced).toHaveBeenCalledTimes(1);
  });
});
