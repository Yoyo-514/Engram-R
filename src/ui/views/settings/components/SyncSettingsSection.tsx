import { useState } from 'react';
import type { FC } from 'react';

import { getSettings, set } from '@/config/settings';
import { Logger, LogModule } from '@/core/logger';
import { syncService } from '@/data/SyncService';
import { getCurrentChatId } from '@/integrations/tavern';
import { Switch } from '@/ui/components/core/Switch';

import { SettingsSection } from './SettingsSection';

export const SyncSettingsSection: FC = () => {
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
    const next = { ...syncConfig, [key]: checked };
    setSyncConfig(next);
    set('syncConfig', next);
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
    <SettingsSection title="同步" description="管理多端数据同步与手动恢复操作。">
      <div className="bg-muted/30 space-y-4 rounded-lg border border-border p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="bg-primary/10 flex-shrink-0 rounded-lg p-2 text-primary">
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
                <h4 className="truncate font-medium text-heading">多端数据同步 (Beta)</h4>
                {syncStatus !== 'idle' && (
                  <span
                    className={`text-xs ${
                      syncStatus === 'error'
                        ? 'text-red-500'
                        : syncStatus === 'success'
                          ? 'text-green-500'
                          : 'animate-pulse text-blue-500'
                    }`}
                  >
                    {syncMessage}
                  </span>
                )}
              </div>
              <p className="line-clamp-2 text-sm text-muted-foreground">
                利用酒馆文件读写接口存储与同步
              </p>
            </div>
          </div>
          <Switch checked={syncConfig.enabled} onChange={handleConfigChange('enabled')} />
        </div>

        {syncConfig.enabled && (
          <div className="space-y-3 border-t border-border pl-14 pt-3">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <span className="text-sm text-muted-foreground">自动同步</span>
                <p className="text-muted-foreground/60 text-xs">数据变动3秒后自动上传</p>
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
                <p className="text-muted-foreground/60 text-xs">
                  {lastSyncTime > 0 ? new Date(lastSyncTime).toLocaleString() : '暂无记录'}
                </p>
              </div>
              <button
                onClick={handleManualSync}
                disabled={syncStatus === 'syncing'}
                className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
              >
                立即同步
              </button>
            </div>

            <ul className="text-muted-foreground/60 bg-background/50 mt-2 list-inside list-disc rounded p-2 text-xs">
              <li>数据存储路径: `data/default-user/files/Engram_sync_{chatId ?? '未知'}.json`</li>
              <li>跨设备同步需手动点击"上传"或开启自动同步</li>
              <li>请定期备份重要数据</li>
            </ul>
          </div>
        )}

        <div className="border-border/50 flex flex-col gap-2 border-t pt-2 sm:flex-row sm:justify-end">
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
            className="w-full rounded border border-border bg-background px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-blue-500/10 hover:text-blue-500 sm:w-auto"
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
            className="w-full rounded border border-border bg-background px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-orange-500/10 hover:text-orange-500 sm:w-auto"
          >
            强制下载 (覆盖本地)
          </button>
        </div>
      </div>
    </SettingsSection>
  );
};
