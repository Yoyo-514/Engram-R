import { Database, Paintbrush2, Settings as SettingsIcon, Workflow } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { FC } from 'react';

import { PageTitle } from '@/ui/components/display/PageTitle';
import { LayoutTabs } from '@/ui/components/layout/LayoutTabs';
import type { Tab } from '@/ui/components/layout/TabPills';

import { AppearanceSettingsSection } from './components/AppearanceSettingsSection';
import { DatabaseManagementSection } from './components/DatabaseManagementSection';
import { FeatureSettingsSection } from './components/FeatureSettingsSection';
import { SyncSettingsSection } from './components/SyncSettingsSection';

const SETTINGS_TABS: Tab[] = [
  { id: 'appearance', label: '外观', icon: <Paintbrush2 size={14} /> },
  { id: 'features', label: '功能', icon: <Workflow size={14} /> },
  { id: 'database', label: '数据库', icon: <Database size={14} /> },
  { id: 'sync', label: '同步', icon: <SettingsIcon size={14} /> },
];

export const Settings: FC = () => {
  const [activeTab, setActiveTab] = useState<string>('appearance');

  const content = useMemo(() => {
    switch (activeTab) {
      case 'features':
        return <FeatureSettingsSection />;
      case 'database':
        return <DatabaseManagementSection />;
      case 'sync':
        return <SyncSettingsSection />;
      case 'appearance':
      default:
        return <AppearanceSettingsSection />;
    }
  }, [activeTab]);

  return (
    <div className="animate-in fade-in flex h-full flex-col">
      <PageTitle breadcrumbs={['设置']} title="全局选项" subtitle="按模块管理外观、功能、数据库与同步配置" />

      <LayoutTabs tabs={SETTINGS_TABS} activeTab={activeTab} onChange={setActiveTab} />

      <div className="overflow-x-hidden px-4 py-6 md:p-6">
        <div className="space-y-8">{content}</div>
      </div>
    </div>
  );
};
