import { AlertTriangle, Edit2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { FC } from 'react';

import { deepClone } from '@/core/utils';
import type { EntityNode } from '@/types/graph';

import { EntityEditorModal } from './EntityEditorModal';

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
  diff?: DiffOperation[];
}

/** 剥离审阅期附带的 diff，避免写回实体数据 */
function toEntityNode(entity: EntityNodeWithDiff): EntityNode {
  if (!entity.diff) return entity;
  const next = { ...entity };
  delete next.diff;
  return next;
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

  // Sync when external data changes（渲染期间调整 state，替代 effect 同步）
  const [prevData, setPrevData] = useState(data);
  if (prevData !== data) {
    setPrevData(data);
    setNewEntities(data.newEntities || []);
    setUpdatedEntities(data.updatedEntities || []);
  }

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

  const handleEditSave = (nextEntity: EntityNode) => {
    if (!editingEntity) return;
    const { list, index } = editingEntity;
    const saved = toEntityNode({ ...nextEntity, diff: editingEntity.entity.diff });

    if (list === 'new') {
      const next = [...newEntities];
      next[index] = saved;
      setNewEntities(next);
      notifyChange(next, updatedEntities);
    } else {
      const next = [...updatedEntities];
      next[index] = saved;
      setUpdatedEntities(next);
      notifyChange(newEntities, next);
    }
    setEditingEntity(null);
  };

  const handleEditCancel = () => {
    setEditingEntity(null);
  };

  return (
    <div className="flex min-w-0 flex-col gap-6 font-sans">
      <div className="rounded-md border border-border/50 bg-muted/20 p-3 text-sm text-muted-foreground">
        请确认本次提取的结果。点击卡片可进行编辑，点击右上角删除可移除。
      </div>

      {data.error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle size={16} />
          <span>提取过程发生错误: {data.error}</span>
        </div>
      )}

      {editingEntity && (
        <EntityEditorModal
          entity={editingEntity.entity}
          onCancel={handleEditCancel}
          onSave={handleEditSave}
        />
      )}

      {/* Updated Entities Section (Show first as they are usually more critical) */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-warning">
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
        <div className="flex items-center gap-2 text-sm font-medium text-success">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          新增实体 ({newEntities.length})
        </div>

        {newEntities.length === 0 ? (
          <div className="pl-4 text-xs italic text-muted-foreground">无新增实体</div>
        ) : (
          <div className="cq-2 gap-3">
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
  const borderColor = isUpdated ? 'border-warning/30' : 'border-success/30';
  const bgColor = isUpdated ? 'bg-warning/5' : 'bg-success/5';
  const textColor = isUpdated ? 'text-warning' : 'text-success';

  return (
    <div
      className={`group relative min-w-0 overflow-hidden rounded-lg border p-4 ${borderColor} ${bgColor} cursor-pointer transition-all hover:bg-opacity-20`}
      onClick={onEdit}
    >
      <div className="absolute right-2 top-2 flex items-center gap-1 opacity-100 transition-opacity group-hover:opacity-100 sm:opacity-0">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="rounded-md bg-background/50 p-1.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
          title="编辑"
        >
          <Edit2 size={14} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="rounded-md bg-background/50 p-1.5 text-muted-foreground transition-colors hover:bg-background hover:text-destructive"
          title="移除"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex min-w-0 items-start gap-2 pr-14">
          <span className="min-w-0 flex-1 break-words text-base font-bold text-foreground">
            {entity.name}
          </span>
          <span
            className={`shrink-0 rounded border border-current px-1.5 py-0.5 text-[10px] uppercase opacity-80 ${textColor}`}
          >
            {entity.type}
          </span>
        </div>

        {/* Diff View for Updated Entities */}
        {isUpdated && entity.diff ? (
          <div className="mt-1 flex flex-col gap-1 rounded bg-background/50 p-2.5 font-mono text-xs">
            {entity.diff.map((op, i) => (
              <div
                key={i}
                className="flex min-w-0 flex-col gap-1 break-words sm:flex-row sm:items-baseline sm:gap-2"
              >
                {/* Path */}
                <span className="min-w-0 max-w-full break-words font-medium text-foreground/80">
                  {op.path}
                </span>

                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  {/* Old Value (Red) - for replace/remove */}
                  {(op.op === 'replace' || op.op === 'remove') && op.oldValue !== undefined && (
                    <span className="max-w-full break-all rounded border border-destructive/10 bg-destructive/5 px-1 text-destructive line-through decoration-destructive/40">
                      {formatValue(op.oldValue)}
                    </span>
                  )}

                  {/* Arrow for replace */}
                  {op.op === 'replace' && (
                    <span className="text-[10px] text-muted-foreground">➜</span>
                  )}

                  {/* New Value (Green) - for replace/add */}
                  {(op.op === 'replace' || op.op === 'add') && op.value !== undefined && (
                    <span className="max-w-full break-all rounded border border-value/20 bg-value/10 px-1 font-semibold text-value">
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
