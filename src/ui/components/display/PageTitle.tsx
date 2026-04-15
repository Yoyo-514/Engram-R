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
    className={`animate-in fade-in slide-in-from-bottom-2 mb-8 flex items-start justify-between px-4 duration-500 md:px-0 ${className}`}
  >
    <div>
      <h1 className="flex items-center gap-2 text-3xl font-light tracking-tight text-foreground">
        {breadcrumbs.map((crumb, index) => (
          <Fragment key={index}>
            <span className="text-muted-foreground/60 hover:text-foreground/80 text-xl transition-colors">
              {crumb}
            </span>
            <ChevronRight size={20} className="text-muted-foreground/30 px-0.5" />
          </Fragment>
        ))}
        <span className="text-foreground drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
          {title}
        </span>
      </h1>
      {subtitle && <p className="mt-2 text-sm font-light text-muted-foreground">{subtitle}</p>}
    </div>
    {actions && <div className="flex gap-2">{actions}</div>}
  </div>
);
