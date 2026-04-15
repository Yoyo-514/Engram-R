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
import { ItemCard } from '@/ui/components/display/ItemCard';
import { useResponsive } from '@/ui/hooks/useResponsive';
import { Switch } from '@/ui/components/core/Switch';
import { notificationService } from '@/ui/services/NotificationService';

import { SettingsSection } from './SettingsSection';

const getDefaultLinkedDeletion = () => {
  return getSettings().linkedDeletion;
};

export const DatabaseManagementSection: FC = () => {
  const memoryStore = useMemoryStore();
  const { isMobile } = useResponsive();
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
    } catch (e) {
      notificationService.error('获取历史数据库列表失败', 'Engram 设置');
      Logger.error(LogModule.DATA_DB, '加载历史数据库列表失败', e);
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
    } catch (e) {
      setSelectedStats(null);
      Logger.error(LogModule.DATA_DB, '加载数据库统计失败', e);
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
      alert('未连接到聊天');
      return;
    }

    if (
      confirm(
        '确定要清空当前聊天的 IndexedDB 数据吗？\n警告：这将删除所有记忆、实体和总结！数据库文件保留。'
      ) && confirm('再次确认：此操作不可逆！')
    ) {
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
    }
  };

  const handleDeleteCurrent = async () => {
    if (!currentChatId) {
      alert('未连接到聊天');
      return;
    }

    if (
      confirm(
        '确定要彻底删除当前聊天的数据库文件吗？\n警告：这将完全移除 Engram 为此聊天存储的所有数据！'
      ) && confirm('再次确认：这相当于完全卸载此聊天的记忆模块！')
    ) {
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
        `确定要删除选中的 ${selectedDatabases.length} 个历史数据库吗？\n${selectedDatabases.join('\n')}`
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
      notificationService.success(
        `已删除 ${selectedDatabases.length} 个历史数据库`,
        'Engram 设置'
      );
      setSelectedDatabases([]);
      await loadAvailableDatabases();
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
    <SettingsSection title="数据管理" description="管理数据库清理、删除策略与本地维护操作。">
      <div className="space-y-4">
        <div className="bg-muted/30 space-y-4 rounded-lg border border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex-shrink-0 rounded-lg bg-red-500/10 p-2 text-red-500">
                <Trash2 size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="truncate font-medium text-foreground">联动删除</h4>
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  删除角色/聊天时，自动清理记忆库
                </p>
              </div>
            </div>
            <Switch
              checked={linkedDeletion.enabled}
              onChange={(checked) => persistLinkedDeletion({ enabled: checked })}
            />
          </div>

          {linkedDeletion.enabled && (
            <div className="space-y-3 border-t border-border pl-14 pt-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">删除前确认</span>
                <Switch
                  checked={linkedDeletion.showConfirmation}
                  onChange={(checked) => persistLinkedDeletion({ showConfirmation: checked })}
                  className="scale-90"
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-muted-foreground">
                    删除聊天时同步删除 Worldbook
                  </span>
                  <p className="text-muted-foreground/60 line-clamp-2 text-xs">
                    危险: 多聊天共享 Worldbook 时可能误删
                  </p>
                </div>
                <Switch
                  checked={linkedDeletion.deleteChatWorldbook ?? false}
                  onChange={(checked) => persistLinkedDeletion({ deleteChatWorldbook: checked })}
                  className="scale-90"
                />
              </div>
            </div>
          )}
        </div>

        <div className="bg-muted/30 space-y-4 rounded-lg border border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="bg-primary/10 flex-shrink-0 rounded-lg p-2 text-primary">
                <RefreshCw size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="truncate font-medium text-heading">数据库维护</h4>
                <p className="line-clamp-2 text-sm text-meta">
                  快速管理当前聊天数据库与历史遗留数据库
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3 pl-0 sm:pl-14">
            <div>
              <h5 className="text-sm font-medium text-foreground">当前聊天数据库</h5>
              <p className="mt-1 text-xs text-muted-foreground">
                当前会话数据库单独展示，但沿用统一的卡片选择、统计查看与危险操作语义
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
                      : '当前会话数据库'
                  }
                  meta={currentDatabaseSummary?.isOpen ? 'OPEN' : 'CURRENT'}
                  badges={[
                    { text: '当前聊天', color: 'primary' as const },
                    ...(currentDatabaseSummary?.characterName
                      ? [{ text: currentDatabaseSummary.characterName, color: 'blue' as const }]
                      : []),
                  ]}
                  className="border border-primary/30 bg-background/60"
                />

                <div className="grid gap-2 rounded-lg border border-border bg-background/60 p-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <div className="text-[11px] text-muted-foreground">数据库名</div>
                    <div className="break-all text-sm font-medium text-foreground">{currentDatabaseName}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-muted-foreground">聊天 ID</div>
                    <div className="break-all text-sm font-medium text-foreground">
                      {currentDatabaseSummary?.chatId ?? currentChatId ?? '-'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-muted-foreground">角色</div>
                    <div className="text-sm font-medium text-foreground">
                      {currentDatabaseSummary?.characterName ?? '未识别'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-muted-foreground">状态</div>
                    <div className="text-sm font-medium text-foreground">
                      {currentDatabaseSummary?.isOpen ? '已打开' : '待连接'}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                  <button
                    onClick={handleReset}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-yellow-600 transition-colors hover:bg-muted sm:w-auto"
                  >
                    重置当前数据（保留 DB）
                  </button>
                  <button
                    onClick={handleDeleteCurrent}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-500/10 sm:w-auto"
                  >
                    删除当前数据库
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-background/40 p-3 text-sm text-muted-foreground">
                当前未连接聊天，无法执行当前数据库操作
              </div>
            )}
          </div>

          <div className="space-y-3 border-t border-border pl-0 pt-4 sm:pl-14">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h5 className="text-sm font-medium text-foreground">历史数据库清理</h5>
                <p className="mt-1 text-xs text-muted-foreground">
                  仅显示当前聊天之外的 Engram 数据库，减少误删风险并提升列表操作效率
                </p>
              </div>
              <button
                onClick={loadAvailableDatabases}
                disabled={isLoadingDatabases}
                className="rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
              >
                刷新列表
              </button>
            </div>

            <div className="grid gap-3">
              {historicalDatabases.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-background/40 p-3 text-sm text-muted-foreground">
                  未发现可清理的历史数据库
                </div>
              ) : (
                <div className="space-y-3">
                  {groupedDatabases.map(({ groupName, items }) => (
                    <div key={groupName} className="space-y-2">
                      <div className="text-xs font-medium text-muted-foreground">
                        {groupName} · {items.length} 个聊天库
                      </div>
                      <div className={`grid gap-2 ${isMobile ? 'grid-cols-1' : 'grid-cols-2'}`}>
                        {items.map((item) => (
                          <ItemCard
                            key={item.name}
                            compact
                            selected={selectedDatabase === item.name}
                            onClick={() => setSelectedDatabase(item.name)}
                            title={item.chatId}
                            subtitle={item.lastModified ? new Date(item.lastModified).toLocaleString() : '暂无修改记录'}
                            meta={item.isOpen ? 'OPEN' : undefined}
                            badges={[
                              ...(selectedDatabases.includes(item.name)
                                ? [{ text: '已勾选', color: 'emerald' as const }]
                                : []),
                              ...(item.isCurrent ? [{ text: '当前聊天', color: 'primary' as const }] : []),
                              ...(item.isOpen ? [{ text: '已打开', color: 'blue' as const }] : []),
                            ]}
                            actions={[
                              {
                                icon: selectedDatabases.includes(item.name) ? '✓' : '+',
                                title: selectedDatabases.includes(item.name) ? '取消选择' : '加入批量选择',
                                onClick: (e) => {
                                  e.stopPropagation();
                                  toggleDatabaseSelection(item.name);
                                },
                              },
                            ]}
                            className="border border-border bg-background/60"
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-lg border border-border bg-background/60 p-3 text-xs text-muted-foreground">
                {selectedDatabase ? (
                  (() => {
                    const current = databaseSummaries.find((item) => item.name === selectedDatabase);
                    if (!current) return '未找到所选数据库信息';
                    return `聊天ID: ${current.chatId} ｜ 角色: ${current.characterName ?? '未识别'} ｜ 最近打开: ${current.isOpen ? '是' : '否'} ｜ 当前聊天: ${current.isCurrent ? '是' : '否'}`;
                  })()
                ) : currentDatabaseName ? (
                  `当前聊天数据库: ${currentDatabaseName}`
                ) : (
                  '未连接到聊天'
                )}
              </div>

              <div className="grid gap-2 rounded-lg border border-border bg-background/60 p-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <div className="text-[11px] text-muted-foreground">事件数</div>
                  <div className="text-sm font-medium text-foreground">
                    {isLoadingStats ? '加载中...' : selectedStats?.eventCount ?? '-'}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground">实体数</div>
                  <div className="text-sm font-medium text-foreground">
                    {isLoadingStats ? '加载中...' : selectedStats?.entityCount ?? '-'}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground">已归档</div>
                  <div className="text-sm font-medium text-foreground">
                    {isLoadingStats
                      ? '加载中...'
                      : `${selectedStats?.archivedEventCount ?? 0} 事件 / ${selectedStats?.archivedEntityCount ?? 0} 实体`}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground">已向量化</div>
                  <div className="text-sm font-medium text-foreground">
                    {isLoadingStats
                      ? '加载中...'
                      : `${selectedStats?.embeddedEventCount ?? 0} 事件 / ${selectedStats?.embeddedEntityCount ?? 0} 实体`}
                  </div>
                </div>
                <div className="sm:col-span-2 lg:col-span-4">
                  <div className="text-[11px] text-muted-foreground">最近修改</div>
                  <div className="text-sm font-medium text-foreground">
                    {isLoadingStats
                      ? '加载中...'
                      : selectedStats?.lastModified
                        ? new Date(selectedStats.lastModified).toLocaleString()
                        : '暂无记录'}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs text-muted-foreground">
                  已选择 {selectedDatabases.length} 个历史数据库
                </div>
                <button
                  onClick={handleDeleteSelectedDatabase}
                  disabled={isDeletingSelected || historicalDatabases.length === 0 || selectedDatabases.length === 0}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-500/10 disabled:opacity-50 sm:w-auto"
                >
                  批量删除所选历史库
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-dashed border-border bg-background/40 p-3 text-xs text-muted-foreground">
            IndexedDB 引擎: {Dexie.semVer || 'Dexie'}
            {currentDatabaseName ? ` ｜ 当前数据库: ${currentDatabaseName}` : ' ｜ 未连接到聊天'}
          </div>
        </div>
      </div>
    </SettingsSection>
  );
};
