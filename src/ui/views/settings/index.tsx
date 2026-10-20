import { Database, Workflow } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { FC } from 'react';

import { PageTitle } from '@/ui/components/display/PageTitle';
import { LayoutTabs } from '@/ui/components/layout/LayoutTabs';
import type { Tab } from '@/ui/components/layout/TabPills';

import { DatabaseManagementSection } from './components/DatabaseManagementSection';
import { FeatureSettingsSection } from './components/FeatureSettingsSection';

const SETTINGS_TABS: Tab[] = [
  { id: 'features', label: '功能', icon: <Workflow size={14} /> },
  { id: 'database', label: '数据库', icon: <Database size={14} /> },
];

export const Settings: FC = () => {
  const [activeTab, setActiveTab] = useState<string>('features');

  const content = useMemo(() => {
    switch (activeTab) {
      case 'database':
        return <DatabaseManagementSection />;
      default:
        return <FeatureSettingsSection />;
    }
  }, [activeTab]);

  return (
    <div className="animate-in fade-in flex min-h-full flex-col">
      <PageTitle breadcrumbs={['设置']} title="全局选项" subtitle="管理功能与数据库配置" />

      <LayoutTabs tabs={SETTINGS_TABS} activeTab={activeTab} onChange={setActiveTab} />

      <div className="min-h-0 flex-1 overflow-x-hidden px-4 py-6 md:p-6">
        <div className="space-y-8">{content}</div>
      </div>
    </div>
  );
};
