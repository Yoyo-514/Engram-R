import { ChevronRight } from 'lucide-react';
import type { ReactNode, FC } from 'react';
import { Fragment } from 'react';

interface PageTitleProps {
  title: string;
  breadcrumbs?: string[];
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
}

export const PageTitle: FC<PageTitleProps> = ({
  title,
  breadcrumbs = [],
  subtitle,
  actions,
  className = '',
}) => (
  <div
    className={`animate-in fade-in slide-in-from-bottom-2 mb-8 flex min-w-0 items-start justify-between gap-4 px-4 duration-500 md:px-0 ${className}`}
  >
    <div className="min-w-0 flex-1">
      <h1 className="flex min-w-0 flex-wrap items-center gap-2 break-words text-3xl font-light tracking-tight text-foreground">
        {breadcrumbs.map((crumb, index) => (
          <Fragment key={index}>
            <span className="text-muted-foreground/60 hover:text-foreground/80 min-w-0 break-words text-xl transition-colors">
              {crumb}
            </span>
            <ChevronRight size={20} className="text-muted-foreground/30 shrink-0 px-0.5" />
          </Fragment>
        ))}
        <span className="min-w-0 break-words text-foreground drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
          {title}
        </span>
      </h1>
      {subtitle && (
        <p className="mt-2 whitespace-normal break-words text-sm font-light text-muted-foreground">
          {subtitle}
        </p>
      )}
    </div>
    {actions && <div className="flex shrink-0 flex-wrap justify-end gap-2">{actions}</div>}
  </div>
);
