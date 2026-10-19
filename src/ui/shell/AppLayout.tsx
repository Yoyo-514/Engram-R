import { useState } from 'react';
import type { FC, ReactNode } from 'react';

import { useConfigStore } from '@/state/configStore';
import { GlobalStyles } from '@/ui/styles/GlobalStyles';

import { Header } from './Header';
import { Sidebar } from './Sidebar';

interface AppLayoutProps {
  children: ReactNode;
  activeTab: string;
  onNavigate: (tab: string) => void;
  onClose: () => void;
}

export const AppLayout: FC<AppLayoutProps> = ({ children, activeTab, onNavigate, onClose }) => {
  const enableAnimations = useConfigStore((state) => state.enableAnimations);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div
      className={`selection:bg-primary/30 absolute inset-0 flex h-full w-full overflow-hidden bg-background font-sans text-foreground selection:text-primary ${!enableAnimations ? 'engram-no-animations' : ''}`}
      id="engram-layout-root"
    >
      <GlobalStyles />
      <Sidebar
        activeTab={activeTab}
        onNavigate={onNavigate}
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="bg-sidebar/95 z-50 flex shrink-0 flex-col border-b border-border backdrop-blur">
          <Header
            isMenuOpen={isMenuOpen}
            onToggleMenu={() => setIsMenuOpen((open) => !open)}
            onClose={onClose}
          />
          <div id="engram-header-extension" className="z-40 shrink-0 empty:hidden" />
        </div>

        <main className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-background">
          <div className="h-full w-full flex-1 overflow-y-auto overflow-x-hidden scroll-smooth px-4 pb-8">
            <div className="mx-auto h-full max-w-6xl">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
};
