import type { ButtonHTMLAttributes, ElementType, FC } from 'react';

interface ModernButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: ElementType;
  label: string;
  primary?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const ModernButton: FC<ModernButtonProps> = ({
  icon: Icon,
  label,
  primary = false,
  size = 'md',
  className = '',
  ...props
}) => (
  <button
    className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors duration-[var(--duration-fast)] disabled:cursor-not-allowed disabled:opacity-50 ${size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-5 py-2.5 text-sm'} ${
      primary
        ? 'border border-transparent bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:bg-primary/80'
        : 'border border-border bg-card text-foreground hover:bg-accent active:bg-muted'
    } ${className} `}
    {...props}
  >
    {Icon && <Icon size={size === 'sm' ? 14 : 16} className="shrink-0" />}
    <span className="min-w-0 whitespace-normal break-words">{label}</span>
  </button>
);
