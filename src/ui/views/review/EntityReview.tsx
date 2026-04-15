import { AlertTriangle, Edit2, Save, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FC } from 'react';

import { EntityType } from '@/config/memory/defaults';
import { deepClone, stringifyYaml } from '@/core/utils';
import type { EntityNode } from '@/types/graph';
import { ModernButton as Button } from '@/ui/components/core/Button';

interface EntityReviewProps {
  data: {
    newEntities: EntityNode[];
    updatedEntities: EntityNode[];
    error?: string;
  };
  onChange: (newData: { newEntities: EntityNode[]; updatedEntities: EntityNode[] }) => void;
}

interface DiffOperation {
  path: string;
  op: string;
  value?: unknown;
  oldValue?: unknown;
}

// 扩展类型以包含 diff 信息
interface EntityNodeWithDiff extends EntityNode {
  _diff?: DiffOperation[];
  _original?: EntityNode;
}

export const EntityReview: FC<EntityReviewProps> = ({ data, onChange }) => {
  const [newEntities, setNewEntities] = useState<EntityNodeWithDiff[]>(data.newEntities || []);
  const [updatedEntities, setUpdatedEntities] = useState<EntityNodeWithDiff[]>(
    data.updatedEntities || []
  );
  const [editingEntity, setEditingEntity] = useState<{
    list: 'new' | 'updated';
    index: number;
    entity: EntityNodeWithDiff;
  } | null>(null);
  const [previewDescription, setPreviewDescription] = useState<string>('');
  const [isEditorExpanded, setIsEditorExpanded] = useState<boolean>(true);
  const [isPreviewExpanded, setIsPreviewExpanded] = useState<boolean>(true);

  // Sync when external data changes
  useEffect(() => {
    setNewEntities(data.newEntities || []);
    setUpdatedEntities(data.updatedEntities || []);
  }, [data]);

  // Update preview when editing entity changes
  useEffect(() => {
    if (editingEntity) {
      updatePreview(editingEntity.entity);
    }
  }, [editingEntity]);

  const updatePreview = (entity: EntityNode) => {
    try {
      const entityObj = { profile: entity.profile };
      const yamlContent = stringifyYaml(entityObj);
      setPreviewDescription(`${entity.name}\n${yamlContent.trim()}`);
    } catch (_error) {
      // If JSON is invalid during typing, we might not have a valid object to dump.
      // But here entity.profile is already an object (parsed from JSON input).
      // So this catch is for yaml dump errors.
    }
  };

  const notifyChange = (n: EntityNodeWithDiff[], u: EntityNodeWithDiff[]) => {
    onChange({ newEntities: n, updatedEntities: u });
  };

  const handleRemove = (list: 'new' | 'updated', index: number) => {
    if (list === 'new') {
      const next = newEntities.filter((_, i) => i !== index);
      setNewEntities(next);
      notifyChange(next, updatedEntities);
    } else {
      const next = updatedEntities.filter((_, i) => i !== index);
      setUpdatedEntities(next);
      notifyChange(newEntities, next);
    }
  };

  const handleEditStart = (list: 'new' | 'updated', index: number, entity: EntityNodeWithDiff) => {
    setEditingEntity({ list, index, entity: deepClone(entity) });
  };

  const handleEditSave = () => {
    if (!editingEntity) return;
    const { list, index, entity } = editingEntity;

    // V1.5: Enforce Standard YAML Description Format on Save
    // We use the calculated preview as the source of truth for description
    if (previewDescription) {
      entity.description = previewDescription;
    }

    if (list === 'new') {
      const next = [...newEntities];
      next[index] = entity;
      setNewEntities(next);
      notifyChange(next, updatedEntities);
    } else {
      const next = [...updatedEntities];
      next[index] = entity;
      delete next[index]._diff;
      setUpdatedEntities(next);
      notifyChange(newEntities, next);
    }
    setEditingEntity(null);
  };

  const handleEditCancel = () => {
    setEditingEntity(null);
  };

  return (
    <div className="flex flex-col gap-6 font-sans">
      <div className="bg-muted/20 border-border/50 rounded-md border p-3 text-sm text-muted-foreground">
        请确认本次提取的结果。点击卡片可进行编辑，点击右上角删除可移除。
      </div>

      {data.error && (
        <div className="bg-destructive/10 border-destructive/20 flex items-center gap-2 rounded-md border p-3 text-sm text-destructive">
          <AlertTriangle size={16} />
          <span>提取过程发生错误: {data.error}</span>
        </div>
      )}

      {/* Editing Modal/Overlay */}
      {editingEntity && (
        <div className="bg-background/80 animate-in fade-in fixed inset-0 z-[12000] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="animate-in zoom-in-95 mx-auto flex h-[90dvh] w-full max-w-6xl flex-col gap-4 overflow-hidden rounded-lg border border-border bg-popover p-6 shadow-2xl">
            <div className="mb-2 flex shrink-0 items-center justify-between border-b pb-2">
              <h3 className="text-lg font-bold">编辑实体</h3>
              <div className="text-xs text-muted-foreground">
                保存时将自动使用右侧预览的 YAML 格式
              </div>
            </div>

            <div className="grid shrink-0 grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-muted-foreground">名称 (Name)</label>
                <input
                  className="rounded-md border border-border bg-muted p-2 text-sm"
                  value={editingEntity.entity.name}
                  onChange={(e) =>
                    setEditingEntity({
                      ...editingEntity,
                      entity: { ...editingEntity.entity, name: e.target.value },
                    })
                  }
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-muted-foreground">类型 (Type)</label>
                <select
                  className="rounded-md border border-border bg-muted p-2 text-sm"
                  value={editingEntity.entity.type}
                  onChange={(e) =>
                    setEditingEntity({
                      ...editingEntity,
                      entity: { ...editingEntity.entity, type: e.target.value as EntityType },
                    })
                  }
                >
                  {Object.values(EntityType).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Vertical Edit & Preview View */}
            <div className="flex min-h-0 w-full flex-1 flex-col gap-4 overflow-hidden">
              {/* Profile JSON Editor Panel */}
              <div
                className={`bg-muted/10 flex flex-col gap-2 rounded-md border border-border p-4 transition-all ${isEditorExpanded ? 'min-h-0 flex-1' : 'shrink-0'}`}
              >
                <button
                  className="group flex w-full cursor-pointer items-center justify-between"
                  onClick={() => setIsEditorExpanded(!isEditorExpanded)}
                >
                  <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                    <Edit2 size={14} />
                    编辑属性 (Edit Profile JSON)
                  </div>
                  <div className="text-muted-foreground group-hover:text-foreground">
                    {isEditorExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </div>
                </button>

                {isEditorExpanded && (
                  <textarea
                    className="bg-muted/50 border-border/50 focus:ring-primary/20 custom-scrollbar min-h-0 w-full flex-1 resize-none whitespace-pre-wrap break-all rounded-md border p-3 font-mono text-xs outline-none focus:ring-2"
                    value={JSON.stringify(editingEntity.entity.profile, null, 2)}
                    onChange={(e) => {
                      try {
                        const parsed: unknown = JSON.parse(e.target.value);
                        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                          return;
                        }
                        setEditingEntity({
                          ...editingEntity,
                          entity: {
                            ...editingEntity.entity,
                            profile: parsed as Record<string, unknown>,
                          },
                        });
                      } catch (_error) {
                        // Ignore parse error while typing
                      }
                    }}
                  />
                )}
              </div>

              {/* New Description Preview Panel */}
              <div
                className={`border-primary/20 bg-primary/5 flex flex-col gap-2 rounded-md border p-4 transition-all ${isPreviewExpanded ? 'min-h-0 flex-1' : 'shrink-0'}`}
              >
                <button
                  className="group flex w-full cursor-pointer items-center justify-between"
                  onClick={() => setIsPreviewExpanded(!isPreviewExpanded)}
                >
                  <div className="flex items-center gap-2 text-xs font-bold text-primary">
                    <span className="inline-block h-2 w-2 rounded-full bg-primary"></span>
                    新烧录文本预览 (New Description Preview)
                  </div>
                  <div className="text-muted-foreground group-hover:text-primary">
                    {isPreviewExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </div>
                </button>

                {isPreviewExpanded && (
                  <div className="bg-background/50 border-primary/10 custom-scrollbar min-h-0 w-full flex-1 select-text overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-all rounded-md border p-3 font-mono text-xs text-foreground">
                    {previewDescription}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-2 flex shrink-0 justify-end gap-2 border-t border-border pt-2">
              <Button label="取消" onClick={handleEditCancel} />
              <Button label="确认更新" onClick={handleEditSave} primary icon={Save} />
            </div>
          </div>
        </div>
      )}

      {/* Updated Entities Section (Show first as they are usually more critical) */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-amber-500">
          <span className="h-2 w-2 rounded-full bg-amber-500" />
          更新实体 ({updatedEntities.length})
        </div>

        {updatedEntities.length === 0 ? (
          <div className="pl-4 text-xs italic text-muted-foreground">无实体变更</div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {updatedEntities.map((entity, idx) => (
              <EntityCard
                key={idx}
                entity={entity}
                type="updated"
                onRemove={() => handleRemove('updated', idx)}
                onEdit={() => handleEditStart('updated', idx, entity)}
              />
            ))}
          </div>
        )}
      </div>

      {/* New Entities Section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-green-500">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          新增实体 ({newEntities.length})
        </div>

        {newEntities.length === 0 ? (
          <div className="pl-4 text-xs italic text-muted-foreground">无新增实体</div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {newEntities.map((entity, idx) => (
              <EntityCard
                key={idx}
                entity={entity}
                type="new"
                onRemove={() => handleRemove('new', idx)}
                onEdit={() => handleEditStart('new', idx, entity)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// Helper to format values for display
const formatValue = (value: unknown) => {
  if (typeof value === 'object' && value !== null) {
    const str = JSON.stringify(value);
    return str.length > 60 ? str.slice(0, 60) + '...' : str;
  }
  return String(value);
};

// Sub-component for individual card
const EntityCard: FC<{
  entity: EntityNodeWithDiff;
  type: 'new' | 'updated';
  onRemove: () => void;
  onEdit: () => void;
}> = ({ entity, type, onRemove, onEdit }) => {
  const isUpdated = type === 'updated';
  const borderColor = isUpdated ? 'border-amber-500/30' : 'border-green-500/30';
  const bgColor = isUpdated ? 'bg-amber-500/5' : 'bg-green-500/5';
  const textColor = isUpdated ? 'text-amber-500' : 'text-green-500';

  return (
    <div
      className={`group relative rounded-lg border p-4 ${borderColor} ${bgColor} cursor-pointer transition-all hover:bg-opacity-20`}
      onClick={onEdit}
    >
      <div className="absolute right-2 top-2 flex items-center gap-1 opacity-100 transition-opacity group-hover:opacity-100 sm:opacity-0">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="bg-background/50 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
          title="编辑"
        >
          <Edit2 size={14} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="bg-background/50 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-background hover:text-destructive"
          title="移除"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-base font-bold text-foreground">{entity.name}</span>
          <span
            className={`rounded border border-current px-1.5 py-0.5 text-[10px] uppercase opacity-80 ${textColor}`}
          >
            {entity.type}
          </span>
        </div>

        {/* Diff View for Updated Entities */}
        {isUpdated && entity._diff ? (
          <div className="bg-background/50 mt-1 flex flex-col gap-1 rounded p-2.5 font-mono text-xs">
            {entity._diff.map((op, i) => (
              <div key={i} className="flex items-baseline gap-2 break-all">
                {/* Path */}
                <span className="text-foreground/80 min-w-[30px] shrink-0 font-medium">
                  {op.path}
                </span>

                <div className="flex flex-wrap items-center gap-1.5">
                  {/* Old Value (Red) - for replace/remove */}
                  {(op.op === 'replace' || op.op === 'remove') && op.oldValue !== undefined && (
                    <span className="decoration-destructive/40 bg-destructive/5 border-destructive/10 rounded border px-1 text-destructive line-through">
                      {formatValue(op.oldValue)}
                    </span>
                  )}

                  {/* Arrow for replace */}
                  {op.op === 'replace' && (
                    <span className="text-[10px] text-muted-foreground">➜</span>
                  )}

                  {/* New Value (Green) - for replace/add */}
                  {(op.op === 'replace' || op.op === 'add') && op.value !== undefined && (
                    <span className="rounded border border-green-500/20 bg-green-500/10 px-1 font-semibold text-green-600 dark:text-green-400">
                      {formatValue(op.value)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="line-clamp-3 break-words text-xs leading-relaxed text-muted-foreground">
            {entity.description}
          </div>
        )}
      </div>
    </div>
  );
};
