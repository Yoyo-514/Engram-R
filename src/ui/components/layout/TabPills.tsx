/**
 * TabPills - 主导航标签组件
 * 支持 sticky 固定在页面顶部
 * 支持右侧 actions 插槽
 */
import { motion } from 'framer-motion';
import type { ReactNode, FC } from 'react';

import { useConfigStore } from '@/state/configStore';

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
  top?: number | string; // 允许自定义吸顶距离
  className?: string;
  actions?: ReactNode; // 右侧操作区域
}

export const TabPills: FC<TabPillsProps> = ({
  tabs,
  activeTab,
  onChange,
  sticky = true,
  top = 0,
  className = '',
  actions,
}) => {
  const enableAnimations = useConfigStore((state) => state.enableAnimations);

  return (
    <div
      className={`mb-6 flex items-center justify-between gap-4 border-b border-border ${sticky ? 'glass-sticky sticky z-20 -mx-4 -mt-4 px-4 pb-0 pt-4 md:-mx-8 md:px-8 lg:-mx-12 lg:px-12' : 'px-0'} ${className} `}
      style={
        sticky
          ? {
              top,
            }
          : undefined
      }
    >
      {/* 左侧 Tabs (充当当前页面的标签页功能）*/}
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`group relative flex items-center gap-2 whitespace-nowrap px-4 py-1.5 text-sm ${enableAnimations ? 'transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)]' : ''} ${
              activeTab === tab.id
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            } `}
          >
            {tab.icon && (
              <span
                className={`h-4 w-4 ${enableAnimations ? 'transition-transform duration-[var(--duration-fast)] group-hover:scale-110' : ''}`}
              >
                {tab.icon}
              </span>
            )}
            {tab.label}
            {activeTab === tab.id &&
              (enableAnimations ? (
                <motion.div
                  layoutId="active-tab-indicator"
                  className="absolute -bottom-[1px] left-0 right-0 z-10 h-[2px] bg-primary shadow-[0_0_8px_var(--primary)]"
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              ) : (
                <div className="absolute -bottom-[1px] left-0 right-0 z-10 h-[2px] bg-primary" />
              ))}
          </button>
        ))}
      </div>

      {/* 右侧操作区域 */}
      {actions && <div className="flex shrink-0 items-center gap-2 pb-1">{actions}</div>}
    </div>
  );
};
