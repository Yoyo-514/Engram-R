import { Check, Power } from 'lucide-react';
/**
 * ItemCard - 通用列表项卡片组件
 *
 * 应用「无框流体」设计语言 - 弱卡片化：
 * - 默认无边框，hover 时显示微妙分隔
 * - 选中态使用轻背景而非边框
 * - 用空间和层级区分区域
 */
import type { MouseEvent, ReactNode, FC } from 'react';

// 操作按钮配置
interface ItemAction {
  icon: ReactNode;
  onClick: (e: MouseEvent) => void;
  title?: string;
  danger?: boolean;
  hidden?: boolean;
}

// 标签配置
interface ItemBadge {
  text: string;
  color?: 'default' | 'primary' | 'blue' | 'purple' | 'orange' | 'emerald';
}

interface ItemCardProps {
  // 内容
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  badges?: ItemBadge[];

  // 状态
  selected?: boolean;
  disabled?: boolean;

  // 开关（可选）
  toggle?: {
    checked: boolean;
    onChange: (checked: boolean) => void;
  };

  // 操作
  onClick?: () => void;
  actions?: ItemAction[];

  // 样式
  className?: string;
  compact?: boolean;
}

// 标签颜色映射
const BADGE_COLORS: Record<NonNullable<ItemBadge['color']>, string> = {
  default: 'text-muted-foreground bg-muted/50',
  primary: 'text-primary bg-primary/10',
  blue: 'text-blue-500 bg-blue-500/10',
  purple: 'text-purple-500 bg-purple-500/10',
  orange: 'text-orange-500 bg-orange-500/10',
  emerald: 'text-emerald-500 bg-emerald-500/10',
};

export const ItemCard: FC<ItemCardProps> = ({
  icon,
  title,
  subtitle,
  meta,
  badges = [],
  selected = false,
  disabled = false,
  toggle,
  onClick,
  actions = [],
  className = '',
  compact = false,
}) => {
  const visibleActions = actions.filter((a) => !a.hidden);
  const hasToggle = !!toggle;
  return (
    <div
      className={`group relative flex w-full items-start gap-3 ${compact ? 'px-2 py-2' : 'px-3 py-3'} cursor-pointer rounded-lg transition-all duration-[var(--duration-fast)] ease-[var(--ease-out)] hover:translate-y-[-1px] hover:shadow-sm sm:items-center ${selected ? 'bg-accent/60' : 'hover:bg-muted/40'} ${disabled ? 'pointer-events-none opacity-50' : ''} ${className} `}
      onClick={onClick}
    >
      {/* 左侧：图标或开关 */}
      {(icon || hasToggle) && (
        <div className="flex-shrink-0">
          {hasToggle ? (
            <button
              className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                toggle.checked ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              } `}
              onClick={(e) => {
                e.stopPropagation();
                toggle.onChange(!toggle.checked);
              }}
            >
              <Power size={14} />
            </button>
          ) : (
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                selected ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
              } `}
            >
              {icon}
            </div>
          )}
        </div>
      )}

      {/* 内容区 */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            {/* 标题 */}
            <span
              className={`flex-1 break-words text-sm font-medium leading-5 transition-colors text-ellipsis overflow-hidden ${selected ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'} ${toggle && !toggle.checked ? 'line-through opacity-60' : ''} `}
            >
              {title}
            </span>

            {/* 标签 */}
            {badges.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {badges.map((badge, i) => (
                  <span
                    key={i}
                    className={`min-w-0 rounded-sm px-1.5 py-0.5 text-[10px] font-medium break-words ${BADGE_COLORS[badge.color || 'default']} `}
                  >
                    {badge.text}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 副标题/元信息 */}
          {(subtitle || meta) && (
            <div className="text-muted-foreground/70 flex w-full flex-col gap-1 text-[11px] sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
              {subtitle && (
                <span className="whitespace-normal break-words leading-5">{subtitle}</span>
              )}
              {meta && (
                <span className="whitespace-normal break-words font-mono sm:text-right">
                  {meta}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 右侧：选中指示器 */}
      {selected && !visibleActions.length && (
        <Check size={14} className="flex-shrink-0 text-primary" />
      )}

      {/* 右侧：操作按钮 */}
      {visibleActions.length > 0 && (
        <div
          className={`mt-2 flex self-end gap-0.5 transition-opacity sm:mt-1 ${selected ? 'opacity-100' : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100'}`}
        >
          {visibleActions.map((action, i) => (
            <button
              key={i}
              className={`rounded p-1.5 transition-colors ${
                action.danger
                  ? 'hover:bg-destructive/10 text-muted-foreground hover:text-destructive'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              } `}
              onClick={(e) => {
                e.stopPropagation();
                action.onClick(e);
              }}
              title={action.title}
            >
              {action.icon}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
