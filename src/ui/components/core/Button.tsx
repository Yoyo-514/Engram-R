import type { ButtonHTMLAttributes, ElementType, FC } from 'react';

interface ModernButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: ElementType;
  /** 图标附加类名，用于加载动画 */
  iconClassName?: string;
  label: string;
  primary?: boolean;
  /** 危险操作样式（停止、删除） */
  danger?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const ModernButton: FC<ModernButtonProps> = ({
  icon: Icon,
  iconClassName = '',
  label,
  primary = false,
  danger = false,
  size = 'md',
  className = '',
  ...props
}) => (
  <button
    className={`inline-flex min-w-0 max-w-full shrink-0 items-center justify-center gap-2 rounded-lg font-medium transition-colors duration-[var(--duration-fast)] disabled:cursor-not-allowed disabled:opacity-50 ${size === 'sm' ? 'min-h-8 px-3 py-1.5 text-xs' : 'min-h-11 px-5 py-2.5 text-sm'} ${
      primary
        ? 'border border-transparent bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:bg-primary/80'
        : danger
          ? 'border border-destructive/30 bg-card text-destructive hover:text-destructive/80 active:bg-muted'
          : 'border border-border bg-card text-foreground hover:bg-accent active:bg-muted'
    } ${className} `}
    {...props}
  >
    {Icon && <Icon size={size === 'sm' ? 14 : 16} className={`shrink-0 ${iconClassName}`} />}
    <span className="min-w-0 whitespace-normal break-words">{label}</span>
  </button>
);
