import { getSettings, loadSettings, set } from '@/config/settings';
import { Logger, LogModule } from '@/core/logger';
import { getCurrentChatId } from '@/integrations/tavern';
import { summarizerService } from '@/modules/memory';
import { preprocessor } from '@/modules/preprocessing';
import { DEFAULT_PREPROCESSING_CONFIG } from '@/modules/preprocessing/types';
import { useMemoryStore } from '@/state/memoryStore';
import { Switch } from '@/ui/components/core/Switch';
import { PageTitle } from '@/ui/components/display/PageTitle';
import { notificationService } from '@/ui/services/NotificationService';
import { NumberField } from '@/ui/components/form/FormComponents';
import { Eye, RefreshCw, Settings as SettingsIcon, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FC } from 'react';
import { useConfigStore } from '@/state/configStore';
import { ThemeSelector } from './components/ThemeSelector';
import { deleteDatabase, listAllDatabases } from '@/data/db';
import { Dexie } from 'dexie';
import { getTheme, setTheme } from '@/ui/services';
import { syncService } from '@/data/SyncService';

export const Settings: FC = () => {
  const { enableAnimations, updateEnableAnimations, saveConfig } = useConfigStore();
  const [previewEnabled, setPreviewEnabled] = useState(
    getSettings().summarizerConfig?.previewEnabled ?? true
  );
  const [preprocessingPreviewEnabled, setPreprocessingPreviewEnabled] = useState(
    getSettings().preprocessingConfig?.preview ?? DEFAULT_PREPROCESSING_CONFIG.preview
  );

  // HACK: 强制刷新引用
  const [, forceUpdate] = useState({});

  useEffect(() => {
    loadSettings();
  }, []);

  const [linkedDeletion, setLinkedDeletion] = useState(getSettings().linkedDeletion);

  const refreshTheme = () => setTheme(getTheme());

  return (
    <div className="flex flex-col h-full animate-in fade-in">
      <PageTitle breadcrumbs={['设置']} title="全局选项" subtitle="扩展全局选项与外观配置" />
      <div className="px-4 py-6 md:p-6 space-y-8 overflow-x-hidden">
        {/* Theme Section */}
        <section>
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
            外观
          </h3>
          <div className="space-y-4">
            <ThemeSelector />

            {/* 动画设置开关 (V1.4.6) */}
            <div className="bg-muted/30 border border-border rounded-lg p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary flex-shrink-0">
                    <Sparkles size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="font-medium text-foreground truncate">启用 UI 动画</h4>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      开启或关闭开场、切页及交互动画，关闭可提升低配设备的响应速度
                    </p>
                  </div>
                </div>
                <Switch
                  checked={enableAnimations}
                  onChange={(checked) => {
                    updateEnableAnimations(checked);
                    saveConfig();
                  }}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Glass Settings Section (Visual) */}
        <section>
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
            毛玻璃特效 (Glass Effect)
          </h3>
          <div className="bg-muted/30 border border-border rounded-lg p-4 space-y-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="min-w-0 flex-1">
                  <h4 className="font-medium text-foreground truncate">启用毛玻璃</h4>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    开启后，面板背景将具有磨砂质感
                  </p>
                </div>
              </div>
              <Switch
                checked={getSettings().glassSettings?.enabled ?? true}
                onChange={(checked) => {
                  const current = getSettings();
                  const newSettings = {
                    ...current.glassSettings,
                    enabled: checked,
                  };
                  set('glassSettings', newSettings);
                  refreshTheme();
                  forceUpdate({});
                }}
              />
            </div>

            {(getSettings().glassSettings?.enabled ?? true) && (
              <>
                <NumberField
                  label="不透明度 (Opacity)"
                  description="调整面板背景的遮罩强度，数值越低越透明"
                  value={getSettings().glassSettings?.opacity ?? 0.8}
                  onChange={(val) => {
                    const current = getSettings();
                    const newSettings = {
                      ...current.glassSettings,
                      opacity: val,
                    };
                    set('glassSettings', newSettings);
                    refreshTheme();
                    forceUpdate({});
                  }}
                  min={0}
                  max={1}
                  step={0.05}
                />
                <NumberField
                  label="背景磨砂 (Blur)"
                  description="调整背景模糊程度 (px)"
                  value={getSettings().glassSettings?.blur ?? 10}
                  onChange={(val) => {
                    const current = getSettings();
                    const newSettings = {
                      ...current.glassSettings,
                      blur: val,
                    };
                    set('glassSettings', newSettings);
                    refreshTheme();
                    forceUpdate({});
                  }}
                  min={0}
                  max={50}
                  step={1}
                />
              </>
            )}
          </div>
        </section>

        {/* Summarizer Section */}
        <section>
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
            功能
          </h3>

          <div className="bg-muted/30 border border-border rounded-lg p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="p-2 rounded-lg bg-primary/10 text-primary flex-shrink-0">
                  <Eye size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="font-medium text-heading truncate">启用修订模式</h4>
                  <p className="text-sm text-meta line-clamp-2">在写入长期记忆前，弹出预览窗口</p>
                </div>
              </div>
              <Switch
                checked={previewEnabled}
                onChange={(checked) => {
                  setPreviewEnabled(checked);
                  summarizerService.updateConfig({ previewEnabled: checked });
                }}
              />
            </div>
          </div>
        </section>

        {/* Preprocessing Section */}
        <section>
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
            输入预处理
          </h3>
          <div className="bg-muted/30 border border-border rounded-lg p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="p-2 rounded-lg bg-primary/10 text-primary flex-shrink-0">
                  <Eye size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="font-medium text-heading truncate">预处理修订模式</h4>
                  <p className="text-sm text-meta line-clamp-2">在注入用户输入前，弹出预览窗口</p>
                </div>
              </div>
              <Switch
                checked={preprocessingPreviewEnabled}
                onChange={(checked) => {
                  setPreprocessingPreviewEnabled(checked);
                  const currentConfig = preprocessor.getConfig();
                  preprocessor.saveConfig({
                    ...currentConfig,
                    preview: checked,
                  });
                }}
              />
            </div>
          </div>
        </section>

        {/* Data Management Section */}
        <section>
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
            数据管理
          </h3>

          <div className="bg-muted/30 border border-border rounded-lg p-4 space-y-4">
            {/* 联动删除 */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="p-2 rounded-lg bg-red-500/10 text-red-500 flex-shrink-0">
                  <Trash2 size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="font-medium text-foreground truncate">联动删除</h4>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    删除角色/聊天时，自动清理记忆库
                  </p>
                </div>
              </div>
              <Switch
                checked={linkedDeletion.enabled}
                onChange={(checked) => {
                  const newSettings = { ...linkedDeletion, enabled: checked };
                  setLinkedDeletion(newSettings);
                  set('linkedDeletion', newSettings);
                }}
              />
            </div>

            {linkedDeletion.enabled && (
              <div className="pl-14 space-y-3 border-t border-border pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">删除前确认</span>
                  <Switch
                    checked={linkedDeletion.showConfirmation}
                    onChange={(checked) => {
                      const newSettings = {
                        ...linkedDeletion,
                        showConfirmation: checked,
                      };
                      setLinkedDeletion(newSettings);
                      set('linkedDeletion', newSettings);
                    }}
                    className="scale-90"
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <span className="text-sm text-muted-foreground block truncate">
                      删除聊天时同步删除 Worldbook
                    </span>
                    <p className="text-xs text-muted-foreground/60 line-clamp-2">
                      危险: 多聊天共享 Worldbook 时可能误删
                    </p>
                  </div>
                  <Switch
                    checked={linkedDeletion.deleteChatWorldbook ?? false}
                    onChange={(checked) => {
                      const newSettings = {
                        ...linkedDeletion,
                        deleteChatWorldbook: checked,
                      };
                      setLinkedDeletion(newSettings);
                      set('linkedDeletion', newSettings);
                    }}
                    className="scale-90"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Database Operations */}
          <DatabaseOperations />

          {/* Data Synchronization Section */}
          <SyncSection />
        </section>

        {/* Future settings sections can go here */}
        <div className="mt-8 pt-8 border-t border-border">
          <div className="flex flex-col items-center justify-center text-muted-foreground gap-2 py-8 opacity-50">
            <SettingsIcon size={32} />
            <p className="text-sm">更多设置开发中...</p>
          </div>
        </div>
      </div>
    </div>
  );
};

// 提取的 SyncSection 组件避免重新渲染整个 Settings
const SyncSection: FC = () => {
  const [syncConfig, setSyncConfig] = useState(
    getSettings().syncConfig || {
      enabled: false,
      autoSync: true,
    }
  );
  const [syncStatus, setSyncStatus] = useState<'idle' | 'check' | 'syncing' | 'success' | 'error'>(
    'idle'
  );
  const [syncMessage, setSyncMessage] = useState<string>('');
  const [lastSyncTime, setLastSyncTime] = useState<number>(0);
  const chatId = getCurrentChatId();

  const handleConfigChange = (key: keyof typeof syncConfig) => (checked: boolean) => {
    const newConfig = { ...syncConfig, [key]: checked };
    setSyncConfig(newConfig);
    set('syncConfig', newConfig);
  };

  const handleManualSync = async () => {
    try {
      setSyncStatus('check');
      setSyncMessage('检查中...');

      if (!chatId) {
        alert('请先打开一个聊天以进行同步测试');
        setSyncStatus('idle');
        setSyncMessage('');
        return;
      }

      setSyncStatus('syncing');
      setSyncMessage('同步中...');

      // 使用 autoSync 智能同步
      const result = await syncService.autoSync(chatId);

      setLastSyncTime(Date.now());

      switch (result) {
        case 'downloaded':
          setSyncStatus('success');
          setSyncMessage('已从服务端恢复');
          break;
        case 'uploaded':
          setSyncStatus('success');
          setSyncMessage('已上传至服务端');
          break;
        case 'synced':
          setSyncStatus('success');
          setSyncMessage('无需同步');
          break;
        case 'ignored':
          setSyncStatus('idle');
          setSyncMessage('服务端无数据');
          break;
        case 'error':
        default:
          setSyncStatus('error');
          setSyncMessage('同步失败');
          break;
      }

      if (result !== 'error') {
        setTimeout(() => {
          setSyncStatus('idle');
          setSyncMessage('');
        }, 3000);
      }
    } catch (e) {
      console.error(e);
      setSyncStatus('error');
      setSyncMessage('发生异常');
    }
  };

  return (
    <div className="bg-muted/30 border border-border rounded-lg p-4 mt-4">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="p-2 rounded-lg bg-primary/10 text-primary flex-shrink-0">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 16h5v5" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h4 className="font-medium text-heading truncate">多端数据同步 (Beta)</h4>
              {syncStatus !== 'idle' && (
                <span
                  className={`text-xs ${
                    syncStatus === 'error'
                      ? 'text-red-500'
                      : syncStatus === 'success'
                        ? 'text-green-500'
                        : 'text-blue-500 animate-pulse'
                  }`}
                >
                  {syncMessage}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground line-clamp-2">
              利用酒馆文件读写接口存储与同步
            </p>
          </div>
        </div>
        <Switch checked={syncConfig.enabled} onChange={handleConfigChange('enabled')} />
      </div>

      {syncConfig.enabled && (
        <div className="pl-14 space-y-3 border-t border-border pt-3">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <span className="text-sm text-muted-foreground">自动同步</span>
              <p className="text-xs text-muted-foreground/60">数据变动3秒后自动上传</p>
            </div>
            <Switch
              checked={syncConfig.autoSync}
              onChange={handleConfigChange('autoSync')}
              className="scale-90"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <span className="text-sm text-muted-foreground">上次同步</span>
              <p className="text-xs text-muted-foreground/60">
                {lastSyncTime > 0 ? new Date(lastSyncTime).toLocaleString() : '暂无记录'}
              </p>
            </div>
            <button
              onClick={handleManualSync}
              disabled={syncStatus === 'syncing'}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-background border border-border hover:bg-muted transition-colors disabled:opacity-50"
            >
              立即同步
            </button>
          </div>

          <ul className="mt-2 text-xs text-muted-foreground/60 p-2 bg-background/50 rounded list-disc list-inside">
            <li>
              数据存储路径: `data/default-user/files/Engram_sync_
              {chatId ?? '未知'}.json`
            </li>
            <li>跨设备同步需手动点击"上传"或开启自动同步</li>
            <li>请定期备份重要数据</li>
          </ul>
        </div>
      )}
      {/* 强制操作区 - 仅用于调试或手动恢复 */}
      <div className="flex flex-col sm:flex-row gap-2 sm:justify-end pt-2 border-t border-border/50">
        <button
          onClick={async () => {
            try {
              setSyncStatus('syncing');
              setSyncMessage('强制上传中...');
              if (!chatId) throw new Error('未连接到聊天');

              const success = await syncService.upload(chatId);

              if (success) {
                setSyncStatus('success');
                setSyncMessage('上传成功');
                setLastSyncTime(Date.now());
              } else {
                throw new Error('上传失败');
              }
            } catch (e) {
              Logger.error(LogModule.DATA_SYNC, 'Manual upload failed', e);
              setSyncStatus('error');
              setSyncMessage('上传错误: ' + String(e));
            }
          }}
          className="w-full sm:w-auto px-2 py-1 text-[10px] font-medium rounded bg-background border border-border hover:bg-blue-500/10 text-muted-foreground hover:text-blue-500 transition-colors"
        >
          强制上传 (覆盖服务端)
        </button>
        <button
          onClick={async () => {
            try {
              setSyncStatus('syncing');
              setSyncMessage('强制下载中...');
              if (!chatId) throw new Error('未连接到聊天');

              const result = await syncService.download(chatId);

              if (result === 'success') {
                setSyncStatus('success');
                setSyncMessage('下载并导入成功');
                setLastSyncTime(Date.now());
              } else {
                throw new Error(result === 'no_data' ? '服务端无数据' : '下载失败');
              }
            } catch (e) {
              Logger.error(LogModule.DATA_SYNC, 'Manual download failed', e);
              setSyncStatus('error');
              setSyncMessage('下载错误: ' + String(e));
            }
          }}
          className="w-full sm:w-auto px-2 py-1 text-[10px] font-medium rounded bg-background border border-border hover:bg-orange-500/10 text-muted-foreground hover:text-orange-500 transition-colors"
        >
          强制下载 (覆盖本地)
        </button>
      </div>
    </div>
  );
};

const DatabaseOperations: FC = () => {
  const memoryStore = useMemoryStore();
  const [availableDatabases, setAvailableDatabases] = useState<string[]>([]);
  const [selectedDatabase, setSelectedDatabase] = useState<string>('');
  const [isLoadingDatabases, setIsLoadingDatabases] = useState(false);
  const [isDeletingSelected, setIsDeletingSelected] = useState(false);

  // 强制刷新状态
  const [, forceUpdate] = useState({});

  const loadAvailableDatabases = async () => {
    setIsLoadingDatabases(true);
    try {
      const dbNames = await listAllDatabases();
      const existingDbNames = await Promise.all(
        dbNames.map(async (name) => ((await Dexie.exists(name)) ? name : null))
      );
      const filteredDbs = existingDbNames.filter((name): name is string => Boolean(name));

      setAvailableDatabases(filteredDbs);
      setSelectedDatabase((currentSelected) => {
        if (currentSelected && filteredDbs.includes(currentSelected)) {
          return currentSelected;
        }
        return filteredDbs[0] || '';
      });
    } catch (e) {
      notificationService.error('获取历史数据库列表失败', 'Engram 设置');
      Logger.error(LogModule.DATA_DB, '加载历史数据库列表失败', e);
    } finally {
      setIsLoadingDatabases(false);
    }
  };

  useEffect(() => {
    void loadAvailableDatabases();
  }, []);

  const refreshDatabaseList = async () => {
    await loadAvailableDatabases();
    forceUpdate({});
  };

  const handleReset = async () => {
    const chatId = getCurrentChatId();
    if (!chatId) {
      alert('未连接到聊天');
      return;
    }

    if (
      confirm(
        '确定要清空当前聊天的 IndexedDB 数据吗？\n警告：这将删除所有记忆、实体和总结！数据库文件保留。'
      )
    ) {
      if (confirm('再次确认：此操作不可逆！')) {
        try {
          await memoryStore.clearChatDatabase();
          notificationService.success('当前聊天数据库已重置', 'Engram 设置');
          await refreshDatabaseList();
        } catch (error) {
          notificationService.error(
            `重置失败: ${error instanceof Error ? error.message : String(error)}`,
            'Engram 设置'
          );
        }
      }
    }
  };

  const handleDelete = async () => {
    const chatId = getCurrentChatId();
    if (!chatId) {
      alert('未连接到聊天');
      return;
    }

    if (
      confirm(
        '确定要彻底删除当前聊天的数据库文件吗？\n警告：这将完全移除 Engram 为此聊天存储的所有数据！'
      )
    ) {
      if (confirm('再次确认：这相当于完全卸载此聊天的记忆模块！')) {
        try {
          await memoryStore.deleteChatDatabase();
          notificationService.success('当前聊天数据库已删除', 'Engram 设置');
          await refreshDatabaseList();
        } catch (error) {
          notificationService.error(
            `删除失败: ${error instanceof Error ? error.message : String(error)}`,
            'Engram 设置'
          );
        }
      }
    }
  };

  const handleDeleteSelectedDatabase = async () => {
    if (!selectedDatabase) {
      notificationService.warning('请选择要删除的历史数据库', 'Engram 设置');
      return;
    }

    const chatId = selectedDatabase.replace(/^Engram_/, '');
    if (!chatId) {
      notificationService.error('所选数据库名称无效', 'Engram 设置');
      return;
    }

    if (!confirm(`确定要删除历史数据库 [${selectedDatabase}] 吗？此操作不可恢复。`)) {
      return;
    }

    setIsDeletingSelected(true);
    try {
      await deleteDatabase(chatId);
      notificationService.success(`已删除历史数据库 ${selectedDatabase}`, 'Engram 设置');
      await refreshDatabaseList();
    } catch (error) {
      notificationService.error(
        `删除历史数据库失败: ${error instanceof Error ? error.message : String(error)}`,
        'Engram 设置'
      );
    } finally {
      setIsDeletingSelected(false);
    }
  };

  return (
    <div className="bg-muted/30 border border-border rounded-lg p-4 mt-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="p-2 rounded-lg bg-primary/10 text-primary flex-shrink-0">
            <RefreshCw size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="font-medium text-heading truncate">手动维护</h4>
            <p className="text-sm text-meta line-clamp-2">手动清空或删除当前聊天的数据库</p>
          </div>
        </div>
      </div>

      <div className="pl-0 sm:pl-14 flex flex-col sm:flex-row gap-3 sm:gap-4">
        <button
          onClick={handleReset}
          className="w-full sm:w-auto px-3 py-1.5 text-xs font-medium rounded-md bg-background border border-border hover:bg-muted text-yellow-600 transition-colors"
        >
          重置当前数据 (保留DB)
        </button>
        <button
          onClick={handleDelete}
          className="w-full sm:w-auto px-3 py-1.5 text-xs font-medium rounded-md bg-background border border-border hover:bg-red-500/10 text-red-600 transition-colors"
        >
          删除数据库 (删库)
        </button>
      </div>

      <div className="pl-0 sm:pl-14 space-y-3 border-t border-border pt-4">
        <div>
          <h5 className="text-sm font-medium text-foreground">历史数据库清理</h5>
          <p className="text-xs text-muted-foreground mt-1">
            可手动删除当前聊天之外的残留 Engram 数据库，用于清理失效角色卡或历史会话遗留数据
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 sm:items-center min-w-0">
          <select
            value={selectedDatabase}
            onChange={(e) => setSelectedDatabase(e.target.value)}
            disabled={isLoadingDatabases || availableDatabases.length === 0}
            className="w-full min-w-0 sm:flex-1 p-2 text-sm bg-background border border-border rounded focus:ring-1 focus:ring-primary outline-none text-foreground disabled:opacity-50"
          >
            {availableDatabases.length === 0 ? (
              <option value="">未发现可清理的历史数据库</option>
            ) : (
              availableDatabases.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))
            )}
          </select>

          <button
            onClick={loadAvailableDatabases}
            disabled={isLoadingDatabases}
            className="w-full sm:w-auto px-3 py-2 text-xs font-medium rounded-md bg-background border border-border hover:bg-muted text-foreground transition-colors disabled:opacity-50"
          >
            刷新列表
          </button>

          <button
            onClick={handleDeleteSelectedDatabase}
            disabled={isDeletingSelected || availableDatabases.length === 0 || !selectedDatabase}
            className="w-full sm:w-auto px-3 py-2 text-xs font-medium rounded-md bg-background border border-border hover:bg-red-500/10 text-red-600 transition-colors disabled:opacity-50"
          >
            删除所选历史库
          </button>
        </div>
      </div>
    </div>
  );
};
