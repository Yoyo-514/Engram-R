import { Dexie } from 'dexie';
import { RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { FC } from 'react';

import { getSettings, set } from '@/config/settings';
import { Logger, LogModule } from '@/core/logger';
import { deleteDatabase, getDatabaseStats, listDatabaseSummaries } from '@/data/db';
import { getCurrentChatId } from '@/integrations/tavern';
import { useMemoryStore } from '@/state/memoryStore';
import type { DatabaseStats, DatabaseSummary } from '@/types/database';
import { Switch } from '@/ui/components/core/Switch';
import { ItemCard } from '@/ui/components/display/ItemCard';
import { notificationService } from '@/ui/services/NotificationService';

import { SettingsSection } from './SettingsSection';

const getDefaultLinkedDeletion = () => getSettings().linkedDeletion;

export const DatabaseManagementSection: FC = () => {
  const memoryStore = useMemoryStore();
  const currentChatId = getCurrentChatId();
  const currentDatabaseName = currentChatId ? `Engram_${currentChatId}` : '';

  const [linkedDeletion, setLinkedDeletion] = useState(getDefaultLinkedDeletion());
  const [databaseSummaries, setDatabaseSummaries] = useState<DatabaseSummary[]>([]);
  const [selectedDatabase, setSelectedDatabase] = useState<string>('');
  const [selectedDatabases, setSelectedDatabases] = useState<string[]>([]);
  const [selectedStats, setSelectedStats] = useState<DatabaseStats | null>(null);
  const [isLoadingDatabases, setIsLoadingDatabases] = useState(false);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [isDeletingSelected, setIsDeletingSelected] = useState(false);

  const currentDatabaseSummary = useMemo(
    () => databaseSummaries.find((item) => item.name === currentDatabaseName) ?? null,
    [databaseSummaries, currentDatabaseName]
  );

  const historicalDatabases = useMemo(
    () => databaseSummaries.filter((item) => item.name !== currentDatabaseName),
    [databaseSummaries, currentDatabaseName]
  );

  const groupedDatabases = useMemo(() => {
    const groups = new Map<string, DatabaseSummary[]>();
    for (const item of historicalDatabases) {
      const groupKey = item.characterName || '未识别角色';
      const existing = groups.get(groupKey);
      if (existing) {
        existing.push(item);
      } else {
        groups.set(groupKey, [item]);
      }
    }
    return Array.from(groups.entries()).map(([groupName, items]) => ({ groupName, items }));
  }, [historicalDatabases]);

  const persistLinkedDeletion = (updates: Partial<typeof linkedDeletion>) => {
    const next = { ...linkedDeletion, ...updates };
    setLinkedDeletion(next);
    set('linkedDeletion', next);
  };

  const loadAvailableDatabases = async () => {
    setIsLoadingDatabases(true);
    try {
      const summaries = await listDatabaseSummaries(currentChatId || undefined);
      setDatabaseSummaries(summaries);
      setSelectedDatabase((currentSelected) => {
        if (currentSelected && summaries.some((item) => item.name === currentSelected)) {
          return currentSelected;
        }
        return summaries.find((item) => item.name !== currentDatabaseName)?.name || '';
      });
      setSelectedDatabases((currentSelected) =>
        currentSelected.filter((name) => summaries.some((item) => item.name === name))
      );
    } catch (error) {
      notificationService.error('加载数据库列表失败', 'Engram 设置');
      Logger.error(LogModule.DATA_DB, 'Failed to load database summaries', error);
    } finally {
      setIsLoadingDatabases(false);
    }
  };

  const loadDatabaseStats = async (databaseName: string) => {
    const chatId = databaseName.replace(/^Engram_/, '');
    if (!chatId) {
      setSelectedStats(null);
      return;
    }

    setIsLoadingStats(true);
    try {
      const stats = await getDatabaseStats(chatId);
      setSelectedStats(stats);
    } catch (error) {
      setSelectedStats(null);
      Logger.error(LogModule.DATA_DB, 'Failed to load database stats', error);
    } finally {
      setIsLoadingStats(false);
    }
  };

  useEffect(() => {
    void loadAvailableDatabases();
  }, []);

  useEffect(() => {
    if (!selectedDatabase) {
      setSelectedStats(null);
      return;
    }
    void loadDatabaseStats(selectedDatabase);
  }, [selectedDatabase]);

  const handleReset = async () => {
    if (!currentChatId) {
      alert('当前未连接聊天，无法重置数据库。');
      return;
    }

    if (
      !confirm('这会清空当前聊天数据库中的 Engram 数据，但不会删除全局世界书槽位。是否继续？') ||
      !confirm('请再次确认要重置当前聊天数据库。')
    ) {
      return;
    }

    try {
      await memoryStore.clearChatDatabase();
      notificationService.success('当前聊天数据库已重置', 'Engram 设置');
      await loadAvailableDatabases();
    } catch (error) {
      notificationService.error(
        `重置失败: ${error instanceof Error ? error.message : String(error)}`,
        'Engram 设置'
      );
    }
  };

  const handleDeleteCurrent = async () => {
    if (!currentChatId) {
      alert('当前未连接聊天，无法删除数据库。');
      return;
    }

    if (
      !confirm('这会删除当前聊天对应的 Engram 数据库。是否继续？') ||
      !confirm('请再次确认要删除当前聊天数据库。')
    ) {
      return;
    }

    try {
      await memoryStore.deleteChatDatabase();
      notificationService.success('当前聊天数据库已删除', 'Engram 设置');
      await loadAvailableDatabases();
    } catch (error) {
      notificationService.error(
        `删除失败: ${error instanceof Error ? error.message : String(error)}`,
        'Engram 设置'
      );
    }
  };

  const toggleDatabaseSelection = (databaseName: string) => {
    setSelectedDatabases((current) =>
      current.includes(databaseName)
        ? current.filter((item) => item !== databaseName)
        : [...current, databaseName]
    );
    setSelectedDatabase(databaseName);
  };

  const handleDeleteSelectedDatabase = async () => {
    if (selectedDatabases.length === 0) {
      notificationService.warning('请先选择要删除的历史数据库', 'Engram 设置');
      return;
    }

    const invalid = selectedDatabases.find((name) => !name.replace(/^Engram_/, ''));
    if (invalid) {
      notificationService.error(`数据库名称无效: ${invalid}`, 'Engram 设置');
      return;
    }

    if (
      !confirm(
        `即将删除 ${selectedDatabases.length} 个历史数据库：\n${selectedDatabases.join('\n')}`
      )
    ) {
      return;
    }

    setIsDeletingSelected(true);
    try {
      await Promise.all(
        selectedDatabases.map((databaseName) => {
          const chatId = databaseName.replace(/^Engram_/, '');
          return deleteDatabase(chatId);
        })
      );
      notificationService.success(`已删除 ${selectedDatabases.length} 个历史数据库`, 'Engram 设置');
      setSelectedDatabases([]);
      await loadAvailableDatabases();
    } catch (error) {
      notificationService.error(
        `批量删除失败: ${error instanceof Error ? error.message : String(error)}`,
        'Engram 设置'
      );
    } finally {
      setIsDeletingSelected(false);
    }
  };

  const selectedSummary = selectedDatabase
    ? (databaseSummaries.find((item) => item.name === selectedDatabase) ?? null)
    : null;

  return (
    <SettingsSection
      title="数据库"
      description="集中查看当前聊天数据库、历史数据库与本地统计信息。"
    >
      <div className="space-y-4">
        <div className="bg-muted/30 space-y-4 rounded-lg border border-border p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex w-full min-w-0 flex-1 items-center gap-3">
              <div className="flex-shrink-0 rounded-lg bg-red-500/10 p-2 text-red-500">
                <Trash2 size={20} />
              </div>
              <div className="w-full min-w-0 flex-1">
                <h4 className="text-sm font-medium leading-5 text-foreground sm:truncate">
                  联动删除
                </h4>
                <p className="mt-1 whitespace-normal break-words text-sm leading-5 text-muted-foreground sm:line-clamp-2">
                  删除聊天时，自动清理对应的 IndexedDB 分片与同步文件残留。
                </p>
              </div>
            </div>
            <Switch
              checked={linkedDeletion.enabled}
              onChange={(checked) => persistLinkedDeletion({ enabled: checked })}
            />
          </div>

          {linkedDeletion.enabled && (
            <div className="space-y-3 border-t border-border pt-3">
              <p className="text-muted-foreground/80 whitespace-normal break-words text-xs leading-5">
                该选项只处理聊天数据库与 `Engram_sync_*.json` 文件。
              </p>
            </div>
          )}
        </div>

        <div className="bg-muted/30 space-y-4 rounded-lg border border-border p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex w-full min-w-0 flex-1 items-center gap-3">
              <div className="bg-primary/10 flex-shrink-0 rounded-lg p-2 text-primary">
                <RefreshCw size={20} />
              </div>
              <div className="w-full min-w-0 flex-1">
                <h4 className="text-sm font-medium leading-5 text-foreground sm:truncate">
                  数据库维护
                </h4>
                <p className="mt-1 whitespace-normal break-words text-sm leading-5 text-muted-foreground sm:line-clamp-2">
                  快速管理当前聊天数据库与历史数据库。
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <h5 className="text-sm font-medium text-foreground">当前聊天数据库</h5>
              <p className="mt-1 whitespace-normal break-words text-xs leading-5 text-muted-foreground">
                当前会话数据库会单独展示，但仍沿用统一的卡片选择、统计与维护流程。
              </p>
            </div>

            {currentDatabaseName ? (
              <div className="space-y-3">
                <ItemCard
                  compact
                  selected={selectedDatabase === currentDatabaseName}
                  onClick={() => setSelectedDatabase(currentDatabaseName)}
                  title={currentDatabaseSummary?.chatId ?? currentChatId ?? '当前聊天'}
                  subtitle={
                    currentDatabaseSummary?.lastModified
                      ? new Date(currentDatabaseSummary.lastModified).toLocaleString()
                      : '当前聊天无数据库记录'
                  }
                  meta="CURRENT"
                  badges={[
                    { text: '当前聊天', color: 'primary' as const },
                    ...(currentDatabaseSummary?.characterName
                      ? [{ text: currentDatabaseSummary.characterName, color: 'blue' as const }]
                      : []),
                  ]}
                  className="border-primary/30 bg-background/60 border"
                />

                <div className="bg-background/60 grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="w-full min-w-0">
                    <div className="text-[11px] text-muted-foreground">数据库名称</div>
                    <div className="whitespace-normal break-words text-sm font-medium text-foreground">
                      {currentDatabaseName}
                    </div>
                  </div>
                  <div className="w-full min-w-0">
                    <div className="text-[11px] text-muted-foreground">聊天 ID</div>
                    <div className="whitespace-normal break-words text-sm font-medium text-foreground">
                      {currentDatabaseSummary?.chatId ?? currentChatId ?? '-'}
                    </div>
                  </div>
                  <div className="w-full min-w-0">
                    <div className="text-[11px] text-muted-foreground">角色</div>
                    <div className="whitespace-normal break-words text-sm font-medium text-foreground">
                      {currentDatabaseSummary?.characterName ?? '未识别角色'}
                    </div>
                  </div>
                  <div className="w-full min-w-0">
                    <div className="text-[11px] text-muted-foreground">状态</div>
                    <div className="text-sm font-medium text-foreground">当前聊天</div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                  <button
                    onClick={handleReset}
                    className="w-full min-w-0 max-w-full basis-full whitespace-normal break-words rounded-md border border-border bg-background px-3 py-2 text-center text-xs font-medium text-yellow-600 transition-colors hover:bg-muted"
                  >
                    重置当前聊天数据库
                  </button>
                  <button
                    onClick={handleDeleteCurrent}
                    className="w-full min-w-0 max-w-full basis-full whitespace-normal break-words rounded-md border border-border bg-background px-3 py-2 text-center text-xs font-medium text-red-600 transition-colors hover:bg-red-500/10"
                  >
                    删除当前聊天数据库
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-background/40 whitespace-normal rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                当前未连接聊天，无法执行当前数据库操作。
              </div>
            )}
          </div>

          <div className="space-y-3 border-t border-border pt-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
              <div className="w-full min-w-0">
                <h5 className="text-sm font-medium text-foreground">历史数据库清理</h5>
                <p className="mt-1 whitespace-normal break-words text-xs leading-5 text-muted-foreground">
                  仅显示当前聊天之外的 Engram 数据库，减少误删风险。
                </p>
              </div>
              <button
                onClick={loadAvailableDatabases}
                disabled={isLoadingDatabases}
                className="max-w-full whitespace-normal rounded-md border border-border bg-background px-3 py-2 text-center text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
              >
                刷新列表
              </button>
            </div>

            <div className="flex flex-col gap-3">
              {historicalDatabases.length === 0 ? (
                <div className="bg-background/40 rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                  没有可清理的历史数据库。
                </div>
              ) : (
                <div className="space-y-3">
                  {groupedDatabases.map(({ groupName, items }) => (
                    <div key={groupName} className="space-y-2">
                      <div className="break-words text-xs font-medium text-muted-foreground">
                        {groupName} · {items.length} 个聊天库
                      </div>
                      <div className="flex flex-col gap-2">
                        {items.map((item) => (
                          <ItemCard
                            key={item.name}
                            compact
                            selected={selectedDatabase === item.name}
                            onClick={() => setSelectedDatabase(item.name)}
                            title={item.chatId}
                            subtitle={
                              item.lastModified
                                ? new Date(item.lastModified).toLocaleString()
                                : '暂无修改记录'
                            }
                            badges={[
                              ...(selectedDatabases.includes(item.name)
                                ? [{ text: '已选中', color: 'emerald' as const }]
                                : []),
                              ...(item.isCurrent
                                ? [{ text: '当前聊天', color: 'primary' as const }]
                                : []),
                            ]}
                            actions={[
                              {
                                icon: selectedDatabases.includes(item.name) ? '−' : '+',
                                title: selectedDatabases.includes(item.name)
                                  ? '取消批量选择'
                                  : '加入批量删除列表',
                                onClick: (e) => {
                                  e.stopPropagation();
                                  toggleDatabaseSelection(item.name);
                                },
                              },
                            ]}
                            className="bg-background/60 border border-border"
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="bg-background/60 whitespace-normal break-words rounded-lg border border-border p-3 text-xs leading-5 text-muted-foreground">
                {selectedSummary
                  ? `聊天 ID: ${selectedSummary.chatId} · 角色: ${selectedSummary.characterName ?? '未识别角色'} · 当前聊天: ${selectedSummary.isCurrent ? '是' : '否'}`
                  : currentDatabaseName
                    ? `当前聊天数据库: ${currentDatabaseName}`
                    : '当前未连接聊天。'}
              </div>

              <div className="bg-background/60 grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="w-full min-w-0">
                  <div className="text-[11px] text-muted-foreground">事件数</div>
                  <div className="text-sm font-medium text-foreground">
                    {isLoadingStats ? '加载中...' : (selectedStats?.eventCount ?? '-')}
                  </div>
                </div>
                <div className="w-full min-w-0">
                  <div className="text-[11px] text-muted-foreground">实体数</div>
                  <div className="text-sm font-medium text-foreground">
                    {isLoadingStats ? '加载中...' : (selectedStats?.entityCount ?? '-')}
                  </div>
                </div>
                <div className="w-full min-w-0">
                  <div className="text-[11px] text-muted-foreground">归档数据</div>
                  <div className="break-words text-sm font-medium text-foreground">
                    {isLoadingStats
                      ? '加载中...'
                      : `${selectedStats?.archivedEventCount ?? 0} 事件 / ${selectedStats?.archivedEntityCount ?? 0} 实体`}
                  </div>
                </div>
                <div className="w-full min-w-0">
                  <div className="text-[11px] text-muted-foreground">嵌入完成</div>
                  <div className="break-words text-sm font-medium text-foreground">
                    {isLoadingStats
                      ? '加载中...'
                      : `${selectedStats?.embeddedEventCount ?? 0} 事件 / ${selectedStats?.embeddedEntityCount ?? 0} 实体`}
                  </div>
                </div>
                <div className="sm:col-span-2 lg:col-span-4">
                  <div className="text-[11px] text-muted-foreground">最后修改时间</div>
                  <div className="break-words text-sm font-medium text-foreground">
                    {isLoadingStats
                      ? '加载中...'
                      : selectedStats?.lastModified
                        ? new Date(selectedStats.lastModified).toLocaleString()
                        : '暂无修改记录'}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <div className="text-xs text-muted-foreground">
                  已选择 {selectedDatabases.length} 个历史数据库
                </div>
                <button
                  onClick={handleDeleteSelectedDatabase}
                  disabled={
                    isDeletingSelected ||
                    historicalDatabases.length === 0 ||
                    selectedDatabases.length === 0
                  }
                  className="w-full min-w-0 max-w-full basis-full whitespace-normal break-words rounded-md border border-border bg-background px-3 py-2 text-center text-xs font-medium text-red-600 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                >
                  删除选中的历史数据库
                </button>
              </div>
            </div>
          </div>

          <div className="bg-background/40 whitespace-normal break-words rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
            IndexedDB 版本: {Dexie.semVer || 'Dexie'}
            {currentDatabaseName ? ` · 当前数据库: ${currentDatabaseName}` : ' · 当前未连接聊天'}
          </div>
        </div>
      </div>
    </SettingsSection>
  );
};
