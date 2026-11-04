import { Menu, X } from 'lucide-react';
import type { FC } from 'react';

import { EngramIcon } from '@/ui/assets/icons/EngramIcon';

interface HeaderProps {
  isMenuOpen: boolean;
  onToggleMenu: () => void;
  onClose: () => void;
}

export const Header: FC<HeaderProps> = ({ isMenuOpen, onToggleMenu, onClose }) => (
  <header className="flex min-h-12 w-full shrink-0 items-center gap-3 px-4 py-2">
    <button
      className="-ml-2 rounded-md p-2 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground md:hidden"
      onClick={onToggleMenu}
      aria-label="打开导航"
      aria-expanded={isMenuOpen}
      aria-controls="engram-navigation"
    >
      <Menu size={18} />
    </button>
    <div className="flex shrink-0 items-center gap-2">
      <EngramIcon size={18} className="text-primary" />
      <span className="font-semibold tracking-tight text-sidebar-foreground">Engram</span>
    </div>
    <p className="min-w-0 flex-1 text-xs text-muted-foreground">需要酒馆助手 Tavern Helper</p>
    <button
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
      onClick={onClose}
      aria-label="关闭扩展"
      title="关闭扩展"
    >
      <X size={20} />
    </button>
  </header>
);
