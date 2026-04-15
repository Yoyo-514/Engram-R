import { Archive, ArchiveRestore, ChevronRight, Lock, LockOpen } from 'lucide-react';
import type { FC } from 'react';

/**
 * EntityCard - 实体卡片组件
 *
 * 显示单个 EntityNode 的摘要信息
 * 遵循「无框流体」设计
 * 文本层级：heading(名称) → label(类型) → foreground(描述) → meta(别名)
 */
import type { EntityNode } from '@/types/graph';

/**
 * 根据实体类型获取对应的主题颜色类名
 */
function getEntityTypeColor(type: string): string {
  switch (type.toLowerCase()) {
    case 'char':
    case 'character':
      return 'text-emphasis bg-emphasis/10 border-emphasis/20';
    case 'loc':
    case 'location':
      return 'text-value bg-value/10 border-value/20';
    case 'item':
      return 'text-label bg-label/10 border-label/20';
    case 'concept':
      return 'text-heading bg-heading/10 border-heading/20';
    default:
      return 'text-meta bg-muted/10 border-border';
  }
}

interface EntityCardProps {
  entity: EntityNode;
  isSelected?: boolean;
  isCompact?: boolean;
  onSelect?: () => void;
  onCheck?: (checked: boolean) => void;
  onArchive?: (isArchived: boolean) => void;
  onToggleLock?: (isLocked: boolean) => void;
  checked?: boolean;
}

export const EntityCard: FC<EntityCardProps> = ({
  entity,
  isSelected = false,
  isCompact = false,
  onSelect,
  onCheck,
  onArchive,
  onToggleLock,
  checked = false,
}) => {
  const isArchived = entity.is_archived;
  const isLocked = entity.is_locked;
  // 紧凑模式（移动端）
  if (isCompact) {
    return (
      <div
        className={`flex cursor-pointer items-center gap-3 border-b border-border p-3 transition-colors duration-150 ${isSelected ? 'border-l-2 border-l-primary bg-transparent' : 'hover:border-border'} ${isArchived ? 'opacity-50 grayscale-[0.5]' : ''} `}
        onClick={onSelect}
      >
        {/* 复选框 (通过包装层扩大热区并防止冒泡) */}
        <div
          className="-m-2 flex shrink-0 select-none items-center justify-center p-2"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => {
              onCheck?.(e.target.checked);
            }}
            className="h-4 w-4 cursor-pointer rounded border-border accent-primary"
          />
        </div>

        {/* 主内容 */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-heading">{entity.name}</span>
            <span
              className={`rounded-full border px-1.5 py-0.5 text-[10px] uppercase ${getEntityTypeColor(entity.type)}`}
            >
              {entity.type}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-meta">{entity.description}</p>
        </div>

        {/* 锁定按钮 (紧凑模式) */}
        <button
          className={`p-1 transition-colors ${isLocked ? 'text-emphasis' : 'text-meta opacity-40 hover:opacity-100'}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleLock?.(!isLocked);
          }}
          title={isLocked ? '解锁' : '锁定以防止自动归档'}
        >
          {isLocked ? <Lock size={12} /> : <LockOpen size={12} />}
        </button>

        {/* 归档按钮 (紧凑模式) */}
        <button
          className="hover:bg-muted/50 rounded p-1 px-2 transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            onArchive?.(!isArchived);
          }}
          title={isArchived ? '取消归档' : '归档实体'}
        >
          {isArchived ? (
            <ArchiveRestore size={14} />
          ) : (
            <Archive size={14} className="opacity-40 hover:opacity-100" />
          )}
        </button>

        {/* 箭头 */}
        <ChevronRight size={16} className="text-meta" />
      </div>
    );
  }

  // 桌面模式
  return (
    <div
      className={`group flex h-full cursor-pointer flex-col rounded-lg p-4 transition-all duration-150 ${
        isSelected
          ? 'border border-primary bg-transparent shadow-sm'
          : 'hover:border-border/50 bg-secondary/5 border border-transparent'
      } ${isArchived ? 'opacity-60 grayscale-[0.3]' : ''} `}
      onClick={onSelect}
    >
      {/* 头部：复选框 + 名称 + 类型 */}
      <div className="mb-2 flex items-center gap-3">
        <div
          className="-m-1.5 flex shrink-0 select-none items-center justify-center p-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => {
              onCheck?.(e.target.checked);
            }}
            className="h-4 w-4 cursor-pointer rounded border-border accent-primary"
          />
        </div>
        <span className="text-sm font-medium text-heading">{entity.name}</span>
        <span
          className={`rounded-full border px-1.5 py-0.5 text-[10px] uppercase ${getEntityTypeColor(entity.type)}`}
        >
          {entity.type}
        </span>

        {/* 锁定按钮 (桌面模式) */}
        <button
          className={`ml-auto rounded-md p-1.5 transition-all ${
            isLocked
              ? 'bg-emphasis/10 hover:bg-emphasis/20 text-emphasis'
              : 'hover:bg-muted/50 text-muted-foreground opacity-0 group-hover:opacity-100'
          } `}
          onClick={(e) => {
            e.stopPropagation();
            onToggleLock?.(!isLocked);
          }}
          title={isLocked ? '点击解锁' : '通过锁定记忆，可防止其在清理旧记忆时被自动归档'}
        >
          {isLocked ? <Lock size={14} /> : <LockOpen size={14} />}
        </button>

        {/* 归档按钮 (桌面模式) */}
        <button
          className={`rounded-md p-1.5 transition-all ${
            isArchived
              ? 'bg-primary/10 hover:bg-primary/20 text-primary'
              : 'hover:bg-muted/50 text-muted-foreground opacity-0 group-hover:opacity-100'
          } `}
          onClick={(e) => {
            e.stopPropagation();
            onArchive?.(!isArchived);
          }}
          title={isArchived ? '取消归档' : '将实体归档 (不再参与扫描召回)'}
        >
          {isArchived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
        </button>
      </div>

      {/* 描述文本 */}
      <p className="line-clamp-2 text-xs leading-relaxed text-meta">{entity.description}</p>

      {/* 触发关键词 (原别名) */}
      {entity.aliases && entity.aliases.length > 0 && (
        <div className="mt-auto flex items-center gap-1 pt-3 text-[10px] italic text-meta opacity-80">
          <span className="shrink-0 font-medium">触发关键词:</span>
          <span className="truncate">{entity.aliases.join(', ')}</span>
        </div>
      )}
    </div>
  );
};
