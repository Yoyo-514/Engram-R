import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { FC, ReactNode } from 'react';

import { hasUnreadUpdate as unreadUpdated } from '@/core/updater/Updater';
import { useConfigStore } from '@/state/configStore';
import { UpdateNotice } from '@/ui/components/feedback/UpdateNotice';
import Header from '@/ui/components/layout/Header';
import { Sidebar } from '@/ui/components/layout/Sidebar';
import { GlobalStyles } from '@/ui/styles/GlobalStyles';

interface MainLayoutProps {
  children: ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onClose: () => void;
}

export const MainLayout: FC<MainLayoutProps> = ({ children, activeTab, setActiveTab, onClose }) => {
  const { enableAnimations } = useConfigStore();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showUpdateNotice, setShowUpdateNotice] = useState(false);
  const [hasUnreadUpdate, setHasUnreadUpdate] = useState(false);

  useEffect(() => {
    const checkUpdate = async () => {
      try {
        const unread = await unreadUpdated();
        setHasUnreadUpdate(unread);
      } catch (error) {
        console.debug('[Engram] 检查更新失败', error);
      }
    };

    void checkUpdate();
  }, []);

  const handleShowUpdateNotice = () => {
    setShowUpdateNotice(true);
  };

  const handleCloseUpdateNotice = () => {
    setShowUpdateNotice(false);
    setHasUnreadUpdate(false);
  };

  return (
    <div
      className={`selection:bg-primary/30 absolute inset-0 flex h-full w-full overflow-hidden bg-background font-sans text-foreground selection:text-primary ${!enableAnimations ? 'engram-no-animations' : ''}`}
      id="engram-layout-root"
    >
      <GlobalStyles />

      <UpdateNotice isOpen={showUpdateNotice} onClose={handleCloseUpdateNotice} />

      <Sidebar
        activeTab={activeTab}
        onNavigate={setActiveTab}
        isMobile={false}
        onShowUpdateNotice={handleShowUpdateNotice}
        hasUnreadUpdate={hasUnreadUpdate}
      />

      <Sidebar
        activeTab={activeTab}
        onNavigate={setActiveTab}
        isMobile={true}
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        onShowUpdateNotice={handleShowUpdateNotice}
        hasUnreadUpdate={hasUnreadUpdate}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="bg-sidebar/95 z-50 flex flex-shrink-0 flex-col border-b border-border backdrop-blur transition-all duration-300">
          <Header
            onToggleSidebar={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            isMobile={false}
            onClose={onClose}
            onNavigate={(path) => setActiveTab(path.replace('/', ''))}
          />

          <div
            id="engram-header-extension"
            className="z-40 flex-shrink-0 bg-transparent transition-all empty:hidden"
          />
        </div>

        <main className="relative flex w-full flex-1 flex-col overflow-hidden bg-background">
          {enableAnimations ? (
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15, scale: 0.98 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className="h-full w-full flex-1 overflow-y-auto overflow-x-hidden scroll-smooth px-4 pb-8 pt-0 md:px-8 md:pb-12 lg:px-12 lg:pb-16"
              >
                <div className="mx-auto min-h-full max-w-6xl pb-20">{children}</div>
              </motion.div>
            </AnimatePresence>
          ) : (
            <div className="h-full w-full flex-1 overflow-y-auto overflow-x-hidden scroll-smooth px-4 pb-8 pt-0 md:px-8 md:pb-12 lg:px-12 lg:pb-16">
              <div className="mx-auto min-h-full max-w-6xl pb-20">{children}</div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
