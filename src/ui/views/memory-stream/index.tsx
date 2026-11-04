import { List, Save, Trash2, Users } from 'lucide-react';
import { useRef } from 'react';
import type { FC } from 'react';

import { LayoutTabs } from '@/ui/components/layout/LayoutTabs';
import { MasterDetailLayout } from '@/ui/components/layout/MasterDetailLayout';
import { MobileFullscreenForm } from '@/ui/components/layout/MobileFullscreenForm';

// Editor Components
import { EntityEditor } from './components/EntityEditor';
import { EventEditor, type EventEditorHandle } from './components/EventEditor';
// Hooks
import { useMemoryStream } from './hooks/useMemoryStream';
// Sections & Modals
import { ImportModal } from './modals/ImportModal';
import { PreviewModal } from './modals/PreviewModal';
import { ActionBar } from './sections/ActionBar';
import { EntityList } from './sections/EntityList';
import { EventList } from './sections/EventList';

const VIEW_TABS = [
  { id: 'list', label: '时间线', icon: <List size={14} /> },
  { id: 'entities', label: '实体', icon: <Users size={14} /> },
];

interface MemoryStreamProps {
  initialTab?: 'list' | 'entities';
}

export const MemoryStream: FC<MemoryStreamProps> = ({ initialTab }) => {
  const ms = useMemoryStream(initialTab);
  const editorRef = useRef<EventEditorHandle>(null);

  // =============== 移动端独立渲染 (顶层覆盖) ===============
  if (ms.isMobile && ms.viewMode === 'edit') {
    if (ms.viewTab === 'list' && ms.selectedEvent) {
      return (
        <MobileFullscreenForm
          title="编辑事件"
          onClose={ms.handleCloseEditor}
          actions={
            <div className="flex items-center">
              {ms.hasChanges && (
                <button
                  onClick={ms.handleBatchSave}
                  className="mr-1 rounded p-1.5 text-primary transition-colors hover:bg-primary/10"
                  title="保存"
                >
                  <Save size={16} />
                </button>
              )}
              <button
                onClick={() => ms.selectedId && ms.handleDelete(ms.selectedId)}
                className="mr-1 rounded p-1.5 text-destructive transition-colors hover:bg-destructive/10"
              >
                <Trash2 size={16} />
              </button>
            </div>
          }
        >
          <EventEditor
            ref={editorRef}
            event={ms.selectedEvent}
            isFullScreen={false}
            onSave={ms.handleEventChange}
            onDelete={ms.handleDelete}
            onClose={ms.handleCloseEditor}
          />
        </MobileFullscreenForm>
      );
    }

    if (ms.viewTab === 'entities' && ms.selectedEntity) {
      return (
        <MobileFullscreenForm
          title="编辑实体"
          onClose={ms.handleCloseEditor}
          actions={
            <div className="flex items-center">
              {ms.hasChanges && (
                <button
                  onClick={ms.handleBatchSave}
                  className="mr-1 rounded p-1.5 text-primary transition-colors hover:bg-primary/10"
                  title="保存"
                >
                  <Save size={16} />
                </button>
              )}
              <button
                onClick={() => ms.selectedId && ms.handleDelete(ms.selectedId)}
                className="mr-1 rounded p-1.5 text-destructive transition-colors hover:bg-destructive/10"
              >
                <Trash2 size={16} />
              </button>
            </div>
          }
        >
          <EntityEditor
            entity={ms.selectedEntity}
            isFullScreen={false}
            onSave={ms.handleEntityChange}
            onDelete={ms.handleDelete}
            onClose={ms.handleCloseEditor}
          />
        </MobileFullscreenForm>
      );
    }
  }

  return (
    <div className="animate-in fade-in absolute inset-0 flex flex-col overflow-hidden px-4 pb-4 pt-2 md:px-6 md:pb-6 md:pt-3">
      {/* Tab 导航 */}
      <LayoutTabs
        tabs={VIEW_TABS}
        activeTab={ms.viewTab}
        onChange={ms.handleTabChange}
        actions={
          <ActionBar
            viewTab={ms.viewTab}
            isMobile={ms.isMobile}
            hasChanges={ms.hasChanges}
            pendingCount={ms.pendingChanges.size + ms.pendingEntityChanges.size}
            checkedCount={ms.checkedIds.size}
            isLoading={ms.isLoading}
            isReembedding={ms.isReembedding}
            showMobileActions={ms.showMobileActions}
            onSave={ms.handleBatchSave}
            onRefresh={async () => {
              await ms.loadEvents();
              await ms.loadEntities();
            }}
            onBatchDelete={ms.handleBatchDelete}
            onImportClick={ms.handleOpenImportModal}
            onReembed={ms.handleReembedAll}
            onPreviewClick={(content) => {
              ms.setPreviewContent(content);
              ms.setShowPreview(true);
            }}
            onMobileActionsToggle={() => ms.setShowMobileActions(!ms.showMobileActions)}
            onMobileActionsClose={() => ms.setShowMobileActions(false)}
            onCreate={ms.viewTab === 'list' ? ms.handleCreateEvent : ms.handleCreateEntity}
          />
        }
      />

      {/* View Area */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <MasterDetailLayout
          listWidth={ms.viewMode === 'edit' ? '320px' : '100%'}
          mobileDetailOpen={false} // 我们手动在同级外挂移动端全屏表单
          list={
            ms.viewTab === 'list' ? (
              <EventList
                viewMode={ms.viewMode}
                isLoading={ms.isLoading}
                searchQuery={ms.searchQuery}
                setSearchQuery={ms.setSearchQuery}
                filteredEvents={ms.filteredEvents}
                groupedEvents={ms.groupedEvents}
                groupStartIndices={ms.groupStartIndices}
                checkedIds={ms.checkedIds}
                activeIds={ms.activeIds}
                selectedId={ms.selectedId}
                pendingChanges={ms.pendingChanges}
                sortOrder={ms.sortOrder}
                setSortOrder={ms.setSortOrder}
                showActiveOnly={ms.showActiveOnly}
                onActiveToggle={() => ms.setShowActiveOnly(!ms.showActiveOnly)}
                onSelect={ms.handleSelect}
                onCheck={ms.handleCheck}
                onCheckAll={ms.handleCheckAll}
                onGroupCheck={(group, checked) => {
                  ms.setCheckedIds((prev) => {
                    const newSet = new Set(prev);
                    group.events.forEach((ev) =>
                      checked ? newSet.add(ev.id) : newSet.delete(ev.id)
                    );
                    return newSet;
                  });
                }}
                onToggleLock={ms.handleToggleEventLock}
                onArchive={ms.handleToggleEventArchive}
                onDelete={ms.handleDelete}
              />
            ) : (
              <EntityList
                viewMode={ms.viewMode}
                isLoading={ms.isLoading}
                searchQuery={ms.searchQuery}
                setSearchQuery={ms.setSearchQuery}
                groupedEntities={ms.groupedEntities}
                checkedIds={ms.checkedIds}
                selectedId={ms.selectedId}
                entitySortMode={ms.entitySortMode}
                entityGroupMode={ms.entityGroupMode}
                setEntitySortMode={ms.setEntitySortMode}
                setEntityGroupMode={ms.setEntityGroupMode}
                showActiveOnly={ms.showActiveOnly}
                onActiveToggle={() => ms.setShowActiveOnly(!ms.showActiveOnly)}
                onSelect={ms.handleSelect}
                onCheck={ms.handleCheck}
                onCheckAll={ms.handleCheckAll}
                onArchive={ms.handleToggleArchive}
                onToggleLock={ms.handleToggleEntityLock}
              />
            )
          }
          detail={
            ms.viewMode === 'edit' && !ms.isMobile ? (
              <div className="h-full overflow-hidden bg-transparent">
                {ms.viewTab === 'list' && ms.selectedEvent && (
                  <EventEditor
                    ref={editorRef}
                    event={ms.selectedEvent}
                    isFullScreen={false} // PC 侧边栏模式
                    onSave={ms.handleEventChange}
                    onDelete={ms.handleDelete}
                    onClose={ms.handleCloseEditor}
                  />
                )}
                {ms.viewTab === 'entities' && ms.selectedEntity && (
                  <EntityEditor
                    entity={ms.selectedEntity}
                    isFullScreen={false}
                    onSave={ms.handleEntityChange}
                    onDelete={ms.handleDelete}
                    onClose={ms.handleCloseEditor}
                  />
                )}
              </div>
            ) : null
          }
        />
      </div>

      {/* Modals */}
      <PreviewModal
        isOpen={ms.showPreview}
        onClose={() => ms.setShowPreview(false)}
        content={ms.previewContent}
      />

      <ImportModal
        isOpen={ms.showImportModal}
        onClose={() => ms.setShowImportModal(false)}
        onExecute={ms.handleImportExecute}
        availableDbs={ms.availableDbs}
        selectedDb={ms.selectedDbToImport}
        onSelectDb={ms.setSelectedDbToImport}
      />
    </div>
  );
};
