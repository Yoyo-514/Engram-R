import {
  FileText,
  Database,
  Layers,
  Network,
  ScrollText,
  BookOpen,
  Search,
  Save,
} from 'lucide-react';
/**
 * ProcessingView - 处理中心视图容器
 *
 * 只负责框架和 Tab 切换，具体业务逻辑在子组件中
 * 类似 APIPresetsView 的架构设计
 */
import { useState } from 'react';
import type { FC } from 'react';

import { PageTitle } from '@/ui/components/display/PageTitle';
import { Divider } from '@/ui/components/layout/Divider';
import { LayoutTabs } from '@/ui/components/layout/LayoutTabs';
import { QuickLinks, type QuickLink } from '@/ui/components/layout/QuickLinks';
import { type Tab } from '@/ui/components/layout/TabPills';
import { useConfig } from '@/ui/hooks/useConfig';
import { useSummarizerConfig } from '@/ui/hooks/useSummarizerConfig';

import { BatchProcessingPanel } from './BatchProcessingPanel';
import { EntityConfigPanel } from './EntityConfigPanel';
import { RecallPanel } from './RecallPanel';
import { SummaryPanel } from './SummaryPanel';
import { VectorizationPanel } from './VectorizationPanel';

type ProcessingTab = 'summary' | 'vectorization' | 'recall' | 'entity' | 'batch';

// 主 Tab 配置 - V0.9.6: 添加批量处理
const MAIN_TABS: Tab[] = [
  { id: 'summary', label: '记忆摘要', icon: <FileText size={16} /> },
  { id: 'entity', label: '实体提取', icon: <Network size={16} /> },
  { id: 'vectorization', label: '向量化', icon: <Database size={16} /> },
  { id: 'recall', label: '召回配置', icon: <Search size={16} /> },
  { id: 'batch', label: '批量处理', icon: <Layers size={16} /> },
];

// 快速跳转链接配置（使用 page:subtab 格式精确跳转）
const QUICK_LINKS: QuickLink[] = [
  { id: 'devlog', label: '模型日志', icon: ScrollText, linkTo: 'devlog:model' },
  { id: 'presets', label: '提示词模板', icon: BookOpen, linkTo: 'presets:prompt' },
];

interface ProcessingViewProps {
  onNavigate?: (path: string) => void;
  initialTab?: ProcessingTab;
}

interface TabInfo {
  title: string;
  subtitle: string;
}

const TAB_INFO: Record<ProcessingTab, TabInfo> = {
  summary: { title: '记忆摘要', subtitle: '查看和管理自动生成的剧情摘要' },
  vectorization: { title: '向量化', subtitle: '管理记忆事件的向量嵌入状态' },
  recall: { title: '召回配置', subtitle: '配置 RAG 召回策略和参数' },
  entity: { title: '实体提取', subtitle: '配置实体提取规则和提取结果' },
  batch: { title: '批量处理', subtitle: '批量处理历史消息和外部文本导入' },
};

export const ProcessingView: FC<ProcessingViewProps> = ({ onNavigate }) => {
  const [activeTab, setActiveTab] = useState<ProcessingTab>('summary');
  const currentInfo = TAB_INFO[activeTab];

  // Unified State Management
  const {
    recallConfig,
    rerankConfig,
    entityExtractConfig,
    embeddingConfig,
    vectorConfig,
    updateRecallConfig,
    updateRerankConfig,
    updateEntityExtractConfig,
    updateEmbeddingConfig,
    saveConfig,
    hasChanges: configHasChanges,
  } = useConfig();

  const {
    summarizerSettings,
    trimConfig,
    updateSummarizerSettings,
    updateTrimmerConfig,
    saveSummarizerConfig,
    hasChanges: summarizerHasChanges,
  } = useSummarizerConfig();

  // Unified Save Handler
  const handleSave = async () => {
    if (configHasChanges) saveConfig();
    if (summarizerHasChanges) await saveSummarizerConfig();
    // Optional: Toast notification here
    // alert('配置已保存');
  };

  const hasChanges = configHasChanges || summarizerHasChanges;

  return (
    <div className="animate-in fade-in flex h-full w-full flex-col overflow-x-hidden">
      {/* 页面标题 - 统一样式：大标题 + 简短介绍 */}
      <PageTitle
        breadcrumbs={['数据处理']}
        title={currentInfo.title}
        subtitle={currentInfo.subtitle}
        className="mb-6"
      />
      <Divider className="mb-6" />

      {/* 标签导航 - 自动 Portal 到 Header */}
      <LayoutTabs
        tabs={MAIN_TABS}
        activeTab={activeTab}
        onChange={(id: string) => setActiveTab(id as ProcessingTab)}
        actions={
          <div className="flex items-center gap-2">
            {hasChanges && (
              <button
                className="border-primary/50 inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                onClick={handleSave}
              >
                <Save size={12} />
                保存
              </button>
            )}
            <QuickLinks links={QUICK_LINKS} onNavigate={(path) => onNavigate?.(path)} />
          </div>
        }
      />

      {/* 内容区域 */}
      <div className="no-scrollbar flex-1 overflow-y-auto">
        {/* 记忆摘要 Tab - 使用 SummaryPanel 组件 */}
        {activeTab === 'summary' && (
          <SummaryPanel
            summarizerSettings={summarizerSettings}
            trimConfig={trimConfig}
            onSummarizerSettingsChange={updateSummarizerSettings}
            onTrimmerConfigChange={updateTrimmerConfig}
          />
        )}

        {/* 向量化 Tab - V0.7 使用 VectorizationPanel */}
        {activeTab === 'vectorization' && (
          <VectorizationPanel
            config={embeddingConfig}
            vectorConfig={vectorConfig}
            onConfigChange={(updates) => updateEmbeddingConfig({ ...embeddingConfig, ...updates })}
          />
        )}

        {/* 召回配置 Tab - V0.8.5 */}
        {activeTab === 'recall' && (
          <RecallPanel
            recallConfig={recallConfig}
            rerankConfig={rerankConfig}
            onRecallConfigChange={updateRecallConfig}
            onRerankConfigChange={updateRerankConfig}
          />
        )}

        {/* 实体提取 Tab - V0.9 */}
        {activeTab === 'entity' && (
          <EntityConfigPanel config={entityExtractConfig} onChange={updateEntityExtractConfig} />
        )}

        {/* 批量处理 Tab - V0.9.6 */}
        {activeTab === 'batch' && <BatchProcessingPanel />}
      </div>
    </div>
  );
};
