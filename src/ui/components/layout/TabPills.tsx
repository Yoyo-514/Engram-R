import type { ReactNode, FC } from 'react';

export interface Tab {
  id: string;
  label: string;
  icon?: ReactNode;
}

export interface TabPillsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (id: string) => void;
  sticky?: boolean;
  top?: number | string;
  className?: string;
  actions?: ReactNode;
}

/** 标签区独立横向滚动，操作区始终同行，避免移动端多出工具栏或空行。 */
export const TabPills: FC<TabPillsProps> = ({
  tabs,
  activeTab,
  onChange,
  sticky = true,
  top = 0,
  className = '',
  actions,
}) => (
  <div
    className={`mb-6 flex min-w-0 items-center justify-between gap-2 border-b border-border md:gap-4 ${sticky ? 'sticky z-20 -mx-4 -mt-4 bg-background/70 px-4 pb-0 pt-4 backdrop-blur-xl' : 'px-0'} ${className}`}
    style={sticky ? { top } : undefined}
  >
    <div className="no-scrollbar flex min-w-0 flex-1 gap-1 overflow-x-auto pb-1 md:gap-2">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          aria-pressed={activeTab === tab.id}
          className={`relative flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t-md px-3 py-2 text-sm transition-colors duration-[var(--duration-fast)] md:gap-2 md:px-4 ${activeTab === tab.id ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}
        >
          {tab.icon && <span className="h-4 w-4">{tab.icon}</span>}
          {tab.label}
          {activeTab === tab.id && (
            <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary" />
          )}
        </button>
      ))}
    </div>
    {actions && <div className="flex shrink-0 items-center justify-end gap-2 pb-1">{actions}</div>}
  </div>
);
