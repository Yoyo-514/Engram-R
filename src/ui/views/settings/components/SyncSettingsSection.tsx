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
      setSyncMessage('检查同步状态...');

      if (!chatId) {
        alert('当前没有连接会话，无法执行同步。');
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
          setSyncMessage('已下载远端数据');
          break;
        case 'uploaded':
          setSyncStatus('success');
          setSyncMessage('已上传本地数据');
          break;
        case 'synced':
          setSyncStatus('success');
          setSyncMessage('数据已同步');
          break;
        case 'ignored':
          setSyncStatus('idle');
          setSyncMessage('没有可同步的变更');
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
      setSyncMessage('同步请求失败');
    }
  };

  return (
    <SettingsSection title="同步" description="管理本地数据库与同步文件的同步行为。">
      <div className="bg-muted/30 space-y-4 rounded-lg border border-border p-4">
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex w-full min-w-0 flex-1 items-center gap-3">
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
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-sm font-medium leading-5 text-foreground sm:truncate">
                  多端数据同步 (Beta)
                </h4>
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
              <p className="mt-1 text-sm leading-5 text-muted-foreground sm:line-clamp-2">
                通过同步文件在不同端之间传递当前聊天的 Engram 数据。
              </p>
            </div>
          </div>
          <Switch checked={syncConfig.enabled} onChange={handleConfigChange('enabled')} />
        </div>

        {syncConfig.enabled && (
          <div className="space-y-3 border-t border-border pl-14 pt-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <span className="text-sm text-muted-foreground">自动同步</span>
                <p className="text-muted-foreground/60 text-xs">
                  每隔一段时间自动检查并同步本地与远端数据。
                </p>
              </div>
              <Switch
                checked={syncConfig.autoSync}
                onChange={handleConfigChange('autoSync')}
                className="scale-90"
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <span className="text-sm text-muted-foreground">上次同步时间</span>
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

            <ul className="bg-background/50 text-muted-foreground/60 mt-2 list-inside list-disc rounded p-2 text-xs">
              <li>
                同步文件路径:
                {` data/default-user/files/Engram_sync_${chatId ?? 'unknown'}.json`}
              </li>
              <li>上传会覆盖远端文件，下载会导入远端最新内容。</li>
              <li>请在目标端确认同步文件可访问后再执行操作。</li>
            </ul>
          </div>
        )}

        <div className="border-border/50 flex flex-col gap-2 border-t pt-2 sm:flex-row sm:justify-end">
          <button
            onClick={async () => {
              try {
                setSyncStatus('syncing');
                setSyncMessage('上传中...');
                if (!chatId) throw new Error('当前没有连接会话');

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
                setSyncMessage('上传失败: ' + String(e));
              }
            }}
            className="w-full rounded border border-border bg-background px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-blue-500/10 hover:text-blue-500 sm:w-auto"
          >
            仅上传同步文件
          </button>
          <button
            onClick={async () => {
              try {
                setSyncStatus('syncing');
                setSyncMessage('下载中...');
                if (!chatId) throw new Error('当前没有连接会话');

                const result = await syncService.download(chatId);

                if (result === 'success') {
                  setSyncStatus('success');
                  setSyncMessage('下载成功');
                  setLastSyncTime(Date.now());
                } else {
                  throw new Error(result === 'no_data' ? '远端没有可用数据' : '下载失败');
                }
              } catch (e) {
                Logger.error(LogModule.DATA_SYNC, 'Manual download failed', e);
                setSyncStatus('error');
                setSyncMessage('下载失败: ' + String(e));
              }
            }}
            className="w-full rounded border border-border bg-background px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-orange-500/10 hover:text-orange-500 sm:w-auto"
          >
            仅下载同步文件
          </button>
        </div>
      </div>
    </SettingsSection>
  );
};
