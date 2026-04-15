import type { FC, ReactNode } from 'react';

interface SettingsSectionProps {
  title: string;
  children: ReactNode;
  description?: string;
  actions?: ReactNode;
  className?: string;
}

export const SettingsSection: FC<SettingsSectionProps> = ({
  title,
  children,
  description,
  actions,
  className = '',
}) => {
  return (
    <section className={className}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            {title}
          </h3>
          {description && (
            <p className="text-muted-foreground/70 mt-1 max-w-2xl whitespace-normal break-words text-xs leading-5">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      {children}
    </section>
  );
};
