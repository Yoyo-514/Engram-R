import type { FC, ReactNode } from 'react';

type StatTone = 'default' | 'primary' | 'warning' | 'danger';

interface StatTileProps {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: StatTone;
  size?: 'sm' | 'lg';
  /** 数值行内附加内容，例如设置按钮 */
  action?: ReactNode;
  className?: string;
}

const TONE_CLASS: Record<StatTone, string> = {
  default: 'text-foreground/80',
  primary: 'text-primary/80',
  warning: 'text-warning',
  danger: 'text-destructive',
};

export const StatTile: FC<StatTileProps> = ({
  label,
  value,
  hint,
  tone = 'default',
  size = 'lg',
  action,
  className = '',
}) => (
  <div className={`min-w-0 ${className}`}>
    <span className="mb-1 block whitespace-normal break-words text-[10px] uppercase tracking-wider text-muted-foreground">
      {label}
    </span>
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <span
        className={`min-w-0 break-words font-mono ${size === 'lg' ? 'text-xl' : 'text-sm'} ${TONE_CLASS[tone]}`}
      >
        {value}
      </span>
      {action}
    </div>
    {hint && <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>}
  </div>
);
