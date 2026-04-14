import type { FC } from 'react';
import { Suspense, lazy, useEffect, useState } from 'react';
import { get, set } from '@/config/settings';
import { EventBus } from '@/core/events';
import { getLatestVersion, hasUnreadUpdate } from '@/core/updater/Updater';
import { MainLayout } from '@/ui/components/layout/MainLayout';
import { notificationService } from '@/ui/services/NotificationService';
import { Dashboard } from '@/ui/views/dashboard';

const DevLog = lazy(() => import('@/ui/views/dev-log').then((m) => ({ default: m.DevLog })));
const APIPresets = lazy(() =>
  import('@/ui/views/api-presets/APIPresetsView').then((m) => ({ default: m.APIPresets }))
);
const Settings = lazy(() => import('@/ui/views/settings').then((m) => ({ default: m.Settings })));
const MemoryStream = lazy(() =>
  import('@/ui/views/memory-stream').then((m) => ({ default: m.MemoryStream }))
);
const ProcessingView = lazy(() =>
  import('@/ui/views/processing/ProcessingView').then((m) => ({ default: m.ProcessingView }))
);
const DocsView = lazy(() => import('@/ui/views/docs').then((m) => ({ default: m.DocsView })));

const LoadingFallback = () => (
  <div className="flex h-full items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  </div>
);

interface AppProps {
  onClose: () => void;
}

const App: FC<AppProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState(
    () => get('lastOpenedTab') || 'dashboard'
  );

  const handleNavigate = (path: string) => {
    const cleanPath = path.replace(/^\//, '') || 'dashboard';
    console.debug('[Engram] Navigating to:', cleanPath);
    setActiveTab(cleanPath);
    set('lastOpenedTab', cleanPath);
  };

  useEffect(() => {
    const subscription = EventBus.on<string>('UI_NAVIGATE_REQUEST', (path) => {
      console.debug('[Engram] 收到导航请求:', path);
      handleNavigate(path);
    });

    const handleWindowNavigate = (event: Event) => {
      const path = (event as CustomEvent<string>).detail;
      console.debug('[Engram] 收到窗口导航请求:', path);
      if (path) {
        handleNavigate(path);
      }
    };

    window.addEventListener('engram:navigate', handleWindowNavigate as EventListener);
    return () => {
      subscription.unsubscribe();
      window.removeEventListener('engram:navigate', handleWindowNavigate as EventListener);
    };
  }, []);

  useEffect(() => {
    const checkUpdate = async () => {
      try {
        const hasUnread = await hasUnreadUpdate();
        if (!hasUnread) {
          return;
        }

        const latestVersion = await getLatestVersion();
        notificationService.info(`发现新版本 v${latestVersion}，点击查看更新`, 'Engram 更新', {
          action: { goto: 'settings' },
        });
      } catch (error) {
        console.debug('[Engram] 更新检测失败:', error);
      }
    };

    const timer = setTimeout(() => {
      void checkUpdate();
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  const renderContent = () => {
    const [page, ...subtabParts] = activeTab.split(':');
    const subtab = subtabParts.join(':') || undefined;

    switch (page) {
      case 'dashboard':
        return <Dashboard onNavigate={handleNavigate} />;
      case 'presets':
        return (
          <APIPresets
            onNavigate={handleNavigate}
            initialTab={subtabParts[0] as 'model' | 'prompt' | 'regex' | 'worldbook' | undefined}
            initialTabPath={subtab}
          />
        );
      case 'devlog':
        return <DevLog initialTab={subtab as 'runtime' | 'model'} />;
      case 'settings':
        return <Settings />;
      case 'memory':
        return <MemoryStream initialTab={subtab as 'list' | 'entities' | undefined} />;
      case 'processing':
        return (
          <ProcessingView
            onNavigate={handleNavigate}
            initialTab={
              subtab as 'summary' | 'vectorization' | 'recall' | 'entity' | 'batch' | undefined
            }
          />
        );
      case 'docs':
        return <DocsView initialTab={subtab} />;
      default:
        return <Dashboard onNavigate={handleNavigate} />;
    }
  };

  return (
    <MainLayout activeTab={activeTab} setActiveTab={handleNavigate} onClose={onClose}>
      <Suspense fallback={<LoadingFallback />}>{renderContent()}</Suspense>
    </MainLayout>
  );
};

export default App;
