import type { ReactNode, FC } from 'react';

interface PageTitleProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
}

export const PageTitle: FC<PageTitleProps> = ({ title, subtitle, actions, className = '' }) => (
  <div
    className={`animate-in fade-in slide-in-from-bottom-2 mb-5 flex min-w-0 flex-col items-start justify-between gap-3 duration-500 sm:flex-row ${className}`}
  >
    <div className="min-w-0 flex-1">
      <h1 className="min-w-0 break-words text-xl font-medium tracking-tight text-foreground">
        {title}
      </h1>
      {subtitle && (
        <p className="mt-1 whitespace-normal break-words text-sm text-muted-foreground">
          {subtitle}
        </p>
      )}
    </div>
    {actions && (
      <div className="flex w-full min-w-0 flex-wrap gap-2 sm:w-auto sm:justify-end">{actions}</div>
    )}
  </div>
);
