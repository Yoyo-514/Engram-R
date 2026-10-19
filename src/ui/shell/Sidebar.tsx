import { Github, X } from 'lucide-react';
import type { FC } from 'react';

import { EngramTextLogo } from '@/ui/assets/icons/EngramTextLogo';

import manifest from '../../../manifest.json';
import { NAV_ITEMS } from './navigation';

interface SidebarProps {
  activeTab: string;
  onNavigate: (tab: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

/** 桌面侧栏与移动抽屉使用同一份导航内容，通过响应式样式切换布局。 */
export const Sidebar: FC<SidebarProps> = ({ activeTab, onNavigate, isOpen, onClose }) => {
  const activePage = activeTab.split(':')[0];

  return (
    <>
      {isOpen && (
        <button
          className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm md:hidden"
          onClick={onClose}
          aria-label="关闭导航"
        />
      )}
      <aside
        id="engram-navigation"
        className={`border-border/50 fixed inset-y-0 left-0 z-[70] w-64 max-w-[80vw] shrink-0 flex-col border-r bg-sidebar p-4 shadow-xl md:static md:z-40 md:flex md:w-40 md:max-w-none md:px-2 md:shadow-none ${isOpen ? 'flex' : 'hidden'}`}
      >
        <div className="mb-4 flex items-center justify-between md:hidden">
          <span className="font-semibold text-sidebar-foreground">导航</span>
          <button
            onClick={onClose}
            className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            aria-label="关闭导航"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto" aria-label="主导航">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onNavigate(item.id);
                  onClose();
                }}
                aria-current={isActive ? 'page' : undefined}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm transition-colors md:gap-2 md:px-2 md:py-2 md:text-xs ${
                  isActive
                    ? 'bg-primary/10 font-medium text-primary'
                    : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                }`}
              >
                <Icon size={18} strokeWidth={isActive ? 2 : 1.5} className="shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <footer className="border-border/30 mt-4 space-y-3 border-t pt-4">
          <a
            href="https://github.com/Yoyo-514/Engram-R"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <Github size={16} strokeWidth={1.5} />
            <span>项目主页</span>
          </a>
          <div className="flex items-center gap-2 px-2 text-muted-foreground">
            <EngramTextLogo height={12} />
            <span className="text-xs">v{manifest.version}</span>
          </div>
        </footer>
      </aside>
    </>
  );
};
