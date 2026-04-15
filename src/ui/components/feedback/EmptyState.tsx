import type { LucideIcon } from 'lucide-react';
import { PackageOpen } from 'lucide-react';
import type { ElementType, ReactNode, FC } from 'react';

interface EmptyStateProps {
  /** 显示的图标组件 */
  icon?: LucideIcon | ElementType;
  /** 主标标题 */
  title: string;
  /** 描述文本 */
  description?: string;
  /** 可选的操作按钮或内容 */
  action?: ReactNode;
  /** 自定义类名 */
  className?: string;
}

/**
 * EmptyState - 统一的空状态占位组件
 *
 * 用于列表为空、未选择详情等场景
 */
export const EmptyState: FC<EmptyStateProps> = ({
  icon: Icon = PackageOpen,
  title,
  description,
  action,
  className = '',
}) => {
  return (
    <div
      className={`animate-in fade-in flex h-full min-h-[200px] flex-col items-center justify-center gap-4 p-8 text-muted-foreground duration-300 ${className}`}
    >
      <div className="bg-muted/30 rounded-full p-4">
        <Icon size={48} className="text-foreground opacity-20" />
      </div>
      <div className="max-w-[280px] space-y-1 text-center">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        {description && (
          <p className="text-muted-foreground/80 text-xs leading-relaxed">{description}</p>
        )}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
};
