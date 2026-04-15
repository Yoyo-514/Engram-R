/**
 * QuickPanel - V0.8 快捷面板组件
 *
 * 独立于主面板的可拖拽悬浮面板
 * 用于快捷切换预处理模式、查看 RAG 状态等
 *
 * 注意：预置的模式只是 UI 占位，需要用户在 API 配置 → 提示词模板中
 * 创建对应分类的模板并启用才能生效。
 */

/**
 * QuickPanel - V0.8 快捷面板组件
 *
 * 独立于主面板的可拖拽悬浮面板
 * 用于快捷切换预处理模式、查看 RAG 状态等
 */

import {
  AlertCircle,
  BrainCircuit,
  Clapperboard,
  FileCog,
  FolderOpen,
  Paintbrush,
  Search,
  Settings2,
  Wand2,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { DEFAULT_PREPROCESS_CONFIG } from '@/config/preprocess/defaults';
import { get, set, subscribe } from '@/config/settings';
import { NAV_ITEMS } from '@/constants/navigation';
import { Logger } from '@/core/logger';
import { openMainPanel } from '@/integrations/tavern';
import { preprocessor } from '@/modules/preprocess';
import type { EngramRuntimeSettings } from '@/types/config';
import type { PreprocessConfig } from '@/types/preprocess';
import type { PromptTemplate } from '@/types/prompt';
import type { RecallConfig } from '@/types/rag';
import { Switch } from '@/ui/components/core/Switch';
import { FloatingPanel } from '@/ui/components/overlay/FloatingPanel';

interface QuickPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const NAV_QUICK_LINKS = [
  {
    id: 'memory-list',
    label: '记忆列表',
    description: '事件流与编辑',
    icon: FolderOpen,
    path: 'memory:list',
  },
  {
    id: 'memory-entities',
    label: '实体列表',
    description: '实体管理视图',
    icon: BrainCircuit,
    path: 'memory:entities',
  },
  {
    id: 'processing-summary',
    label: '摘要配置',
    description: '总结与精简参数',
    icon: FileCog,
    path: 'processing:summary',
  },
  {
    id: 'processing-recall',
    label: '召回配置',
    description: 'RAG 检索参数',
    icon: Search,
    path: 'processing:recall',
  },
  {
    id: 'presets-model',
    label: '模型配置',
    description: 'LLM / 向量 / Rerank',
    icon: FileCog,
    path: 'presets:model:llm',
  },
  {
    id: 'presets-prompt',
    label: '提示词模板',
    description: '模板与自定义宏',
    icon: Wand2,
    path: 'presets:prompt:templates',
  },
  {
    id: 'devlog-model',
    label: '模型日志',
    description: '查看 LLM 通信记录',
    icon: Clapperboard,
    path: 'devlog:model',
  },
  {
    id: 'settings',
    label: '全局设置',
    description: '外观与全局选项',
    icon: Settings2,
    path: 'settings',
  },
] as const;

const BUILTIN_ICON_MAP: Record<string, LucideIcon> = {
  builtin_query_enhance: Search,
  builtin_plot_director: Clapperboard,
  builtin_description_enhance: Paintbrush,
  builtin_agentic_recall: BrainCircuit,
};

export function QuickPanel({ isOpen, onClose }: QuickPanelProps) {
  const [panelTab, setPanelTab] = useState<'preprocess' | 'navigate'>('preprocess');
  const [config, setConfig] = useState<PreprocessConfig>(
    preprocessor.getConfig() || DEFAULT_PREPROCESS_CONFIG
  );
  const [recallConfig, setRecallConfig] = useState<RecallConfig | null>(
    get('runtimeSettings')?.recallConfig ?? null
  );
  const [templates, setTemplates] = useState<PromptTemplate[]>(
    get('runtimeSettings')?.promptTemplates ?? []
  );

  const availableModes = useMemo(() => {
    return templates
      .filter((template) => template.category === 'preprocess')
      .map((template) => ({
        id: template.id,
        name: template.name,
        description: `${template.userPromptTemplate.slice(0, 30).replace(/\n/g, ' ')}...`,
        icon: BUILTIN_ICON_MAP[template.id] || Wand2,
      }));
  }, [templates]);

  // 使用事件订阅替代轮询同步配置机制
  useEffect(() => {
    if (!isOpen) return;

    const syncData = () => {
      // 1. Preprocessing Config
      const newPre = preprocessor.getConfig() || DEFAULT_PREPROCESS_CONFIG;
      setConfig((prev) => (JSON.stringify(prev) !== JSON.stringify(newPre) ? newPre : prev));

      // 2. Recall Config & Templates
      const runtimeSettings: EngramRuntimeSettings | null = get('runtimeSettings');
      if (runtimeSettings) {
        const newRecall = runtimeSettings.recallConfig ?? null;
        setRecallConfig((prev) =>
          JSON.stringify(prev) !== JSON.stringify(newRecall) ? newRecall : prev
        );

        const newTemplates = runtimeSettings.promptTemplates ?? [];
        setTemplates((prev) =>
          JSON.stringify(prev) !== JSON.stringify(newTemplates) ? newTemplates : prev
        );
      }
    };

    syncData(); // 初始化读取

    // 订阅设置更改事件
    const unsubscribe = subscribe(syncData);

    return () => {
      unsubscribe();
    };
  }, [isOpen]);

  // 切换启用状态
  const handleToggle = useCallback(() => {
    const currentRecallState = recallConfig?.usePreprocessing ?? false;
    const newState = !currentRecallState;

    Logger.debug('QuickPanel', '切换预处理状态', { from: currentRecallState, to: newState });

    // 读取最新设置以防覆盖
    const runtimeSettings: EngramRuntimeSettings | null = get('runtimeSettings');
    if (runtimeSettings && runtimeSettings.recallConfig) {
      const newRecallConfig = { ...runtimeSettings.recallConfig, usePreprocessing: newState };
      set('runtimeSettings', {
        ...runtimeSettings,
        recallConfig: newRecallConfig,
      });
    }

    // 更新 Preprocessor Config
    const newPreConfig = { ...config, enabled: newState };
    setConfig(newPreConfig);
    set('preprocessConfig', newPreConfig);
  }, [config, recallConfig]);

  // 切换模式
  const handleModeChange = useCallback(
    (templateId: string) => {
      Logger.debug('QuickPanel', '切换预处理模式', { templateId });

      // 1. 更新 Preprocessor Config
      const newPreConfig = { ...config, templateId: templateId, enabled: true };
      setConfig(newPreConfig);
      set('preprocessConfig', newPreConfig);

      // 2. 确保全局 Recall Config 也是开启的
      const runtimeSettings: EngramRuntimeSettings | null = get('runtimeSettings');
      if (runtimeSettings && runtimeSettings.recallConfig) {
        if (!runtimeSettings.recallConfig.usePreprocessing) {
          const newRecallConfig = { ...runtimeSettings.recallConfig, usePreprocessing: true };
          set('runtimeSettings', {
            ...runtimeSettings,
            recallConfig: newRecallConfig,
          });
        }
      }
    },
    [config]
  );

  const handleNavigate = useCallback(
    (path: string) => {
      openMainPanel();
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('engram:navigate', { detail: path }));
      }, 0);
      onClose();
    },
    [onClose]
  );

  const quickNavItems = useMemo(() => {
    const primaryItems = NAV_ITEMS.filter((item) => item.id !== 'dashboard').map((item) => ({
      id: item.id,
      label: item.label,
      description: '打开对应主页面',
      icon: item.icon,
      path: item.path.replace(/^\//, ''),
    }));

    return [
      ...NAV_QUICK_LINKS,
      ...primaryItems.filter((item) => !NAV_QUICK_LINKS.some((link) => link.path === item.path)),
    ];
  }, []);

  return (
    <FloatingPanel isOpen={isOpen} onClose={onClose} title="Engram 快捷面板" width={300}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setPanelTab('preprocess')}
            className={`rounded-md px-3 py-2 text-sm transition-colors ${panelTab === 'preprocess' ? 'bg-primary/15 border-primary/40 border text-primary' : 'bg-muted/30 border border-border text-muted-foreground'}`}
          >
            预处理
          </button>
          <button
            onClick={() => setPanelTab('navigate')}
            className={`rounded-md px-3 py-2 text-sm transition-colors ${panelTab === 'navigate' ? 'bg-primary/15 border-primary/40 border text-primary' : 'bg-muted/30 border border-border text-muted-foreground'}`}
          >
            导航
          </button>
        </div>

        {panelTab === 'preprocess' && (
          <>
            <div
              className="flex items-center justify-between rounded-md p-2"
              style={{
                backgroundColor: 'var(--surface, rgba(255,255,255,0.05))',
                border: '1px solid var(--border, rgba(255,255,255,0.1))',
              }}
            >
              <div className="flex items-center gap-2">
                <Search size={14} style={{ color: 'var(--primary, #ef7357)' }} />
                <span className="text-sm font-medium">输入预处理</span>
              </div>
              <Switch
                checked={recallConfig?.usePreprocessing ?? config.enabled}
                onChange={handleToggle}
              />
            </div>

            {(recallConfig?.usePreprocessing ?? config.enabled) && (
              <div
                className="flex items-center justify-between rounded-md p-2"
                style={{
                  backgroundColor: 'var(--surface, rgba(255,255,255,0.05))',
                  border: '1px solid var(--border, rgba(255,255,255,0.1))',
                }}
              >
                <div className="flex items-center gap-2 pl-2">
                  <span className="text-xs text-muted-foreground">预览修订</span>
                </div>
                <Switch
                  checked={config.preview}
                  onChange={() => {
                    const newConfig = { ...config, preview: !config.preview };
                    setConfig(newConfig);
                    set('preprocessConfig', newConfig);
                  }}
                />
              </div>
            )}

            {(recallConfig?.usePreprocessing ?? config.enabled) && (
              <div className="space-y-2">
                <div className="px-1 text-xs" style={{ color: 'var(--muted-foreground, #888)' }}>
                  预处理模式
                </div>

                {availableModes.length === 0 ? (
                  <div
                    className="mt-2 flex items-start gap-2 rounded-md p-2 text-xs"
                    style={{
                      backgroundColor: 'rgba(var(--primary-rgb, 239,115,87), 0.1)',
                      border: '1px solid rgba(var(--primary-rgb, 239,115,87), 0.3)',
                      color: 'var(--muted-foreground, #888)',
                    }}
                  >
                    <AlertCircle
                      size={14}
                      style={{ color: 'var(--primary, #ef7357)', flexShrink: 0, marginTop: 2 }}
                    />
                    <span>
                      暂无预处理模板。请前往 API 配置 → 提示词模板中创建 'preprocessing'
                      类别的模板。
                    </span>
                  </div>
                ) : (
                  <div className="custom-scrollbar max-h-48 space-y-1 overflow-y-auto pr-1">
                    {availableModes.map((mode) => {
                      const Icon = mode.icon;
                      const isSelected = config.templateId === mode.id;
                      return (
                        <button
                          key={mode.id}
                          onClick={() => handleModeChange(mode.id)}
                          className="flex w-full items-center gap-3 rounded-md p-2 text-left transition-all"
                          style={{
                            backgroundColor: isSelected
                              ? 'rgba(var(--primary-rgb, 239,115,87), 0.15)'
                              : 'var(--surface, rgba(255,255,255,0.05))',
                            border: isSelected
                              ? '1px solid var(--primary, #ef7357)'
                              : '1px solid var(--border, rgba(255,255,255,0.1))',
                            color: 'var(--foreground, #fff)',
                          }}
                        >
                          <Icon
                            size={16}
                            style={{
                              color: isSelected
                                ? 'var(--primary, #ef7357)'
                                : 'var(--muted-foreground, #888)',
                            }}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">{mode.name}</div>
                            <div
                              className="truncate text-xs"
                              style={{ color: 'var(--muted-foreground, #888)' }}
                            >
                              {mode.description}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div
              className="pt-2 text-center text-xs"
              style={{
                borderTop: '1px solid var(--border, rgba(255,255,255,0.1))',
                color: 'var(--muted-foreground, #888)',
              }}
            >
              {(recallConfig?.usePreprocessing ?? config.enabled)
                ? availableModes.find((m) => m.id === config.templateId)?.name
                  ? `已启用 · ${availableModes.find((m) => m.id === config.templateId)?.name}`
                  : '已启用 · 未知模板'
                : '预处理已禁用'}
            </div>
          </>
        )}

        {panelTab === 'navigate' && (
          <div className="space-y-2">
            <div className="px-1 text-xs text-muted-foreground">快捷跳转</div>
            <div className="custom-scrollbar max-h-72 space-y-1 overflow-y-auto pr-1">
              {quickNavItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavigate(item.path)}
                    className="bg-muted/30 hover:border-primary/40 hover:bg-primary/5 flex w-full items-center gap-3 rounded-md border border-border p-2 text-left transition-all"
                  >
                    <Icon size={16} className="shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{item.label}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {item.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div
              className="pt-2 text-center text-xs"
              style={{
                borderTop: '1px solid var(--border, rgba(255,255,255,0.1))',
                color: 'var(--muted-foreground, #888)',
              }}
            >
              支持记住主页面与部分子标签路径
            </div>
          </div>
        )}
      </div>
    </FloatingPanel>
  );
}
