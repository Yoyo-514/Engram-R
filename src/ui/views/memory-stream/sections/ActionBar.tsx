import {
  ArrowDownUp,
  Database,
  FileText,
  Filter,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { FC } from 'react';

import { getEntityStates, getSummaries } from '@/integrations/tavern';

import type { SortOrder, ViewTab } from '../hooks/useMemoryStream';

interface ActionBarProps {
  viewTab: ViewTab;
  isMobile: boolean;
  hasChanges: boolean;
  pendingCount: number;
  checkedCount: number;
  isLoading: boolean;
  isReembedding: boolean;
  sortOrder: SortOrder;
  showActiveOnly: boolean;
  showMobileActions: boolean;

  // Callbacks
  onSave: () => void;
  onRefresh: () => void;
  onBatchDelete: () => void;
  onImportClick: () => void;
  onReembed: () => void;
  onSortToggle: () => void;
  onActiveToggle: () => void;
  onPreviewClick: (content: string) => void;
  onMobileActionsToggle: () => void;
  onMobileActionsClose: () => void;
  onCreate?: () => void;
}

export const ActionBar: FC<ActionBarProps> = ({
  viewTab,
  isMobile,
  hasChanges,
  pendingCount,
  checkedCount,
  isLoading,
  isReembedding,
  sortOrder,
  showActiveOnly,
  showMobileActions,
  onSave,
  onRefresh,
  onBatchDelete,
  onImportClick,
  onReembed,
  onSortToggle,
  onActiveToggle,
  onPreviewClick,
  onMobileActionsToggle,
  onMobileActionsClose,
  onCreate,
}) => {
  const handlePreviewOpen = () => {
    const summaries = getSummaries() || '(无剧情摘要)';
    const entities = getEntityStates() || '(无实体状态)';
    onPreviewClick(
      `--- [Engram Summaries] ---\n${summaries}\n\n--- [Engram Entity States] ---\n${entities}`
    );
  };

  return (
    <div className="relative flex items-center gap-1.5 md:gap-2">
      {/* 保存按钮 - 有修改时显示 */}
      {hasChanges && (
        <button
          className="border-primary/50 inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
          onClick={onSave}
        >
          <Save size={12} />
          {isMobile ? pendingCount : `保存 (${pendingCount})`}
        </button>
      )}

      {/* 刷新按钮 */}
      <button
        onClick={onRefresh}
        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground"
        title="刷新"
      >
        <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
      </button>

      {/* 批量删除 */}
      {checkedCount > 0 && (
        <button
          onClick={onBatchDelete}
          className="hover:bg-destructive/10 flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-destructive transition-colors"
        >
          <Trash2 size={12} />
          {!isMobile && `删除 (${checkedCount})`}
        </button>
      )}

      {!isMobile ? (
        // =============== 桌面端工具栏 ===============
        <div className="ml-1 flex items-center gap-2">
          {/* 手动添加按钮 */}
          {onCreate && (
            <button
              onClick={onCreate}
              className="inline-flex items-center gap-1.5 rounded px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              title={viewTab === 'list' ? '手动添加事件' : '手动添加实体'}
            >
              <Plus size={12} />
              添加
            </button>
          )}
          <button
            onClick={onImportClick}
            className="inline-flex items-center gap-1.5 rounded px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            title="导入历史分卷/外部库"
          >
            <Database size={12} />
            合并导入
          </button>

          {viewTab === 'list' && (
            <button
              onClick={onReembed}
              disabled={isReembedding}
              className="inline-flex items-center gap-1.5 rounded px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              title="重新嵌入所有事件"
            >
              <Sparkles size={12} className={isReembedding ? 'animate-pulse' : ''} />
              {isReembedding ? '嵌入中...' : '重嵌'}
            </button>
          )}

          <div className="mx-1 h-4 w-[1px] bg-border" />

          {viewTab === 'list' && (
            <button
              onClick={onSortToggle}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground"
              title={sortOrder === 'asc' ? '当前: 旧 -> 新' : '当前: 新 -> 旧'}
            >
              <ArrowDownUp
                size={14}
                className={sortOrder === 'desc' ? 'rotate-180 text-primary' : ''}
              />
            </button>
          )}

          {viewTab === 'list' && (
            <button
              onClick={onActiveToggle}
              className={`rounded-md p-1.5 transition-colors ${showActiveOnly ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              title={showActiveOnly ? '显示全部' : '只看激活 (Recall)'}
            >
              <Filter size={14} />
            </button>
          )}

          <button
            onClick={handlePreviewOpen}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground"
            title="查看当前注入内容"
          >
            <FileText size={14} />
          </button>
        </div>
      ) : (
        // =============== 移动端折叠菜单 ===============
        <div className="relative">
          <button
            onClick={onMobileActionsToggle}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="1" />
              <circle cx="19" cy="12" r="1" />
              <circle cx="5" cy="12" r="1" />
            </svg>
          </button>

          {showMobileActions && (
            <>
              <div className="fixed inset-0 z-40" onClick={onMobileActionsClose} />
              <div className="absolute right-0 top-full z-50 mt-2 flex w-40 flex-col rounded-md border border-border bg-background py-1 shadow-lg">
                {onCreate && (
                  <button
                    onClick={() => {
                      onCreate();
                      onMobileActionsClose();
                    }}
                    className="flex items-center gap-2 px-3 py-2 text-left text-xs text-foreground hover:bg-muted"
                  >
                    <Plus size={14} className="text-primary" />
                    {viewTab === 'list' ? '添加事件' : '添加实体'}
                  </button>
                )}
                <button
                  onClick={() => {
                    onImportClick();
                    onMobileActionsClose();
                  }}
                  className="flex items-center gap-2 px-3 py-2 text-left text-xs text-foreground hover:bg-muted"
                >
                  <Database size={14} className="text-muted-foreground" />
                  合并导入
                </button>

                {viewTab === 'list' && (
                  <>
                    <button
                      onClick={() => {
                        onReembed();
                        onMobileActionsClose();
                      }}
                      disabled={isReembedding}
                      className="flex items-center gap-2 px-3 py-2 text-left text-xs text-foreground hover:bg-muted disabled:opacity-50"
                    >
                      <Sparkles
                        size={14}
                        className={
                          isReembedding ? 'animate-pulse text-primary' : 'text-muted-foreground'
                        }
                      />
                      {isReembedding ? '嵌入中...' : '重嵌'}
                    </button>

                    <button
                      onClick={() => {
                        onSortToggle();
                        onMobileActionsClose();
                      }}
                      className="flex items-center gap-2 px-3 py-2 text-left text-xs text-foreground hover:bg-muted"
                    >
                      <ArrowDownUp
                        size={14}
                        className={
                          sortOrder === 'desc' ? 'rotate-180 text-primary' : 'text-muted-foreground'
                        }
                      />
                      排序: {sortOrder === 'asc' ? '旧到新' : '新到旧'}
                    </button>

                    <button
                      onClick={() => {
                        onActiveToggle();
                        onMobileActionsClose();
                      }}
                      className="flex items-center gap-2 px-3 py-2 text-left text-xs text-foreground hover:bg-muted"
                    >
                      <Filter
                        size={14}
                        className={showActiveOnly ? 'text-primary' : 'text-muted-foreground'}
                      />
                      {showActiveOnly ? '显示全部' : '只看激活'}
                    </button>
                  </>
                )}

                <button
                  onClick={() => {
                    handlePreviewOpen();
                    onMobileActionsClose();
                  }}
                  className="flex items-center gap-2 px-3 py-2 text-left text-xs text-foreground hover:bg-muted"
                >
                  <FileText size={14} className="text-muted-foreground" />
                  宏预览
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
