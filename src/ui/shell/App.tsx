import type { ComponentProps, FC } from 'react';
import { useCallback, useEffect, useState } from 'react';

import { get, set } from '@/config/settings';
import { engramEventBus } from '@/core/events';
import { APIPresets } from '@/ui/views/api-presets/APIPresetsView';
import { DevLog } from '@/ui/views/dev-log';
import { MemoryStream } from '@/ui/views/memory-stream';
import { ProcessingView } from '@/ui/views/processing/ProcessingView';
import { Settings } from '@/ui/views/settings';

import { AppLayout } from './AppLayout';
import { resolveTab } from './navigation';

interface AppProps {
  onClose: () => void;
}

const App: FC<AppProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState(() => resolveTab(get('lastOpenedTab')));

  const handleNavigate = useCallback((path: string) => {
    const tab = resolveTab(path);
    setActiveTab(tab);
    set('lastOpenedTab', tab);
  }, []);

  useEffect(() => {
    const subscription = engramEventBus.on<string>('UI_NAVIGATE_REQUEST', handleNavigate);
    return () => subscription.unsubscribe();
  }, [handleNavigate]);

  const renderContent = () => {
    const [page, ...subtabParts] = activeTab.split(':');
    const subtab = subtabParts.join(':') || undefined;

    switch (page) {
      case 'presets':
        return (
          <APIPresets
            onNavigate={handleNavigate}
            initialTab={subtabParts[0] as ComponentProps<typeof APIPresets>['initialTab']}
            initialTabPath={subtab}
          />
        );
      case 'devlog':
        return <DevLog initialTab={subtab as ComponentProps<typeof DevLog>['initialTab']} />;
      case 'settings':
        return <Settings />;
      case 'processing':
        return (
          <ProcessingView
            onNavigate={handleNavigate}
            initialTab={subtab as ComponentProps<typeof ProcessingView>['initialTab']}
          />
        );
      default:
        return (
          <MemoryStream initialTab={subtab as ComponentProps<typeof MemoryStream>['initialTab']} />
        );
    }
  };

  return (
    <AppLayout activeTab={activeTab} onNavigate={handleNavigate} onClose={onClose}>
      {renderContent()}
    </AppLayout>
  );
};

export default App;
