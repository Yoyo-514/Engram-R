import { ChevronDown, Filter, RefreshCw, Search, Users } from 'lucide-react';
import { useState, type FC } from 'react';

import type { EntityNode } from '@/types/graph';
import { EmptyState } from '@/ui/components/feedback/EmptyState';

import { EntityCard } from '../components/EntityCard';
import type { EntityGroupMode, EntitySortMode, ViewMode } from '../hooks/useMemoryStream';
import type { EntityGroup } from '../utils/streamProcessors';

interface EntityListProps {
  viewMode: ViewMode;
  isLoading: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  groupedEntities: EntityGroup[];
  checkedIds: Set<string>;
  selectedId: string | null;
  entitySortMode: EntitySortMode;
  entityGroupMode: EntityGroupMode;
  setEntitySortMode: (mode: EntitySortMode) => void;
  setEntityGroupMode: (mode: EntityGroupMode) => void;
  showActiveOnly: boolean;
  onActiveToggle: () => void;

  // Callbacks
  onSelect: (id: string) => void;
  onCheck: (id: string, checked: boolean) => void;
  onArchive: (id: string, isArchived: boolean) => void;
  onToggleLock: (id: string, isLocked: boolean) => void;
}

const sortModeLabels: Record<EntitySortMode, string> = {
  updated_desc: '最近更新',
  updated_asc: '最早更新',
  name_asc: '名称 A-Z',
};

const groupModeLabels: Record<EntityGroupMode, string> = {
  none: '不分组',
  type: '按类型',
  archive: '按归档',
};

export const EntityList: FC<EntityListProps> = ({
  viewMode,
  isLoading,
  searchQuery,
  setSearchQuery,
  groupedEntities,
  checkedIds,
  selectedId,
  entitySortMode,
  entityGroupMode,
  setEntitySortMode,
  setEntityGroupMode,
  showActiveOnly,
  onActiveToggle,
  onSelect,
  onCheck,
  onArchive,
  onToggleLock,
}) => {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // 搜索时展开全部，方便定位（渲染期间调整 state，替代 effect 同步）
  const [prevSearchQuery, setPrevSearchQuery] = useState(searchQuery);
  if (prevSearchQuery !== searchQuery) {
    setPrevSearchQuery(searchQuery);
    if (searchQuery.trim()) {
      setCollapsedGroups(new Set());
    }
  }

  const totalCount = groupedEntities.reduce((acc, g) => acc + g.count, 0);

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {viewMode === 'browse' && (
        <div className="mb-4 shrink-0 space-y-3 px-1">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-1 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索实体..."
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid var(--border)',
                borderRadius: 0,
                outline: 'none',
                padding: '8px 0 8px 24px',
                fontSize: '14px',
                width: '100%',
                color: 'var(--foreground)',
              }}
              className="transition-colors placeholder:text-muted-foreground/40 focus:border-primary"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={entityGroupMode}
              onChange={(e) => setEntityGroupMode(e.target.value as EntityGroupMode)}
              className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
            >
              {Object.entries(groupModeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>

            <select
              value={entitySortMode}
              onChange={(e) => setEntitySortMode(e.target.value as EntitySortMode)}
              className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
            >
              {Object.entries(sortModeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>

            <button
              onClick={onActiveToggle}
              className={`inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-xs transition-colors ${
                showActiveOnly
                  ? 'border-primary/50 bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title={showActiveOnly ? '显示全部' : '只看激活 (Recall)'}
            >
              <Filter size={12} />
              {showActiveOnly ? '显示全部' : '只看激活'}
            </button>

            <span className="ml-auto text-[11px] text-muted-foreground">共 {totalCount} 项</span>
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-4 pr-1">
        {isLoading ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground">
            <RefreshCw size={24} className="animate-spin" />
            <p className="text-sm font-light">加载中...</p>
          </div>
        ) : totalCount === 0 ? (
          <EmptyState
            icon={Users}
            title={searchQuery ? '没有找到匹配的实体' : '暂无实体'}
            description={!searchQuery ? '请先执行实体提取' : undefined}
          />
        ) : (
          <div className="space-y-3">
            {groupedEntities.map((group) => {
              const isCollapsed = collapsedGroups.has(group.key);
              return (
                <div key={group.key} className="overflow-hidden rounded-md border border-border/40">
                  <button
                    onClick={() => toggleGroup(group.key)}
                    className="flex w-full items-center gap-2 bg-muted/20 px-3 py-2 text-left transition-colors hover:bg-muted/30"
                  >
                    <ChevronDown
                      size={14}
                      className={`transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
                    />
                    <span className="text-xs font-medium">{group.title}</span>
                    <span className="ml-auto text-[11px] text-muted-foreground">{group.count}</span>
                  </button>

                  {!isCollapsed && (
                    <div className="space-y-3 p-2">
                      {group.children.map((sub) => (
                        <div key={sub.key} className="space-y-2">
                          <div className="px-1 text-[11px] text-muted-foreground">
                            {sub.title}（{sub.entities.length}）
                          </div>

                          {sub.entities.length > 0 && (
                            <div
                              className={
                                viewMode === 'edit'
                                  ? 'flex flex-col gap-3'
                                  : 'grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3'
                              }
                            >
                              {sub.entities.map((entity: EntityNode) => (
                                <EntityCard
                                  key={entity.id}
                                  entity={entity}
                                  isSelected={viewMode === 'edit' && selectedId === entity.id}
                                  isCompact={viewMode === 'edit'}
                                  checked={checkedIds.has(entity.id)}
                                  onSelect={() => onSelect(entity.id)}
                                  onCheck={(checked) => onCheck(entity.id, checked)}
                                  onArchive={(isArchived) => onArchive(entity.id, isArchived)}
                                  onToggleLock={(isLocked) => onToggleLock(entity.id, isLocked)}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
