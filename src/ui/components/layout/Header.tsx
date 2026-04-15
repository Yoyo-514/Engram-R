import { motion } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import type { FC } from 'react';

import { EngramIcon } from '@/ui/assets/icons/EngramIcon';
import { CommandPalette } from '@/ui/components/overlay/CommandPalette';

interface HeaderProps {
  onToggleSidebar: () => void;
  isMobile: boolean;
  onClose?: () => void;
  onNavigate: (path: string) => void;
}

const Header: FC<HeaderProps> = ({
  onToggleSidebar,
  isMobile: _isMobile, // Deprecated prop, handled by CSS
  onClose,
  onNavigate,
}) => {
  return (
    <header className="z-50 flex h-10 w-full flex-shrink-0 items-center justify-between bg-transparent px-4 transition-all duration-300">
      {/* Left: Logo & Mobile Toggle */}
      <div className="flex w-16 items-center gap-3 md:w-64">
        {/* Mobile Menu Toggle */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          className="-ml-2 rounded-md p-2 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground md:hidden"
          onClick={onToggleSidebar}
          title="菜单"
        >
          <Menu size={18} />
        </motion.button>

        {/* Logo - PC 端显示图形+文字 */}
        <div className="hidden items-center gap-2 md:flex">
          <EngramIcon size={18} className="text-primary" />
          <span className="font-semibold tracking-tight text-sidebar-foreground">Engram</span>
        </div>
      </div>

      {/* Center: Spacer */}
      <div className="flex-1" />

      {/* Right: Window Controls */}
      <div className="flex items-center gap-1 md:gap-2">
        <CommandPalette onNavigate={onNavigate} />
        <div className="mx-1 h-4 w-[1px] bg-border" />
        <motion.button
          whileTap={{ scale: 0.9 }}
          className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground"
          onClick={onClose}
          title="关闭扩展"
        >
          <X size={20} />
        </motion.button>
      </div>
    </header>
  );
};

export default Header;
