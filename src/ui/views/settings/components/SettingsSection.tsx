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
        <div>
          <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            {title}
          </h3>
          {description && <p className="mt-1 text-xs text-muted-foreground/70">{description}</p>}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      {children}
    </section>
  );
};
