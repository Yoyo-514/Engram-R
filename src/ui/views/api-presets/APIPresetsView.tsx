/**
 * API 预设配置视图
 *
 * 支持移动端 Master-Detail 布局：
 * - 桌面端：左侧列表 + 右侧编辑
 * - 移动端：列表全屏 → 点击 → 编辑全屏
 */

import { Braces, Cpu, FileText, Key, Layers, Plus, Regex, Save } from 'lucide-react';
import { useState } from 'react';
import type { ElementType, FC } from 'react';

import { useConfigStore } from '@/state/configStore';
import type { CustomMacro } from '@/types/macro';
// Components
import { EmptyState } from '@/ui/components/feedback/EmptyState';
import { LayoutTabs } from '@/ui/components/layout/LayoutTabs';
import { MasterDetailLayout } from '@/ui/components/layout/MasterDetailLayout';
import { MobileFullscreenForm } from '@/ui/components/layout/MobileFullscreenForm'; // Added import
import { TabPills } from '@/ui/components/layout/TabPills';
import { useResponsive } from '@/ui/hooks/useResponsive';
import { notificationService } from '@/ui/services/NotificationService';

// Hooks
import { useLLMPresets } from '../../hooks/useLLMPresets';
import { useRegexRules } from '../../hooks/useRegexRules';
import { useWorldInfo } from '../../hooks/useWorldInfo';
import { LLMPresetForm } from './models/LLMPresetForm';
import { RerankConfigForm } from './models/RerankConfigForm';
import { VectorConfigForm } from './models/VectorConfigForm';
import { CustomMacroForm } from './prompts/CustomMacroForm';
import { CustomMacroList } from './prompts/CustomMacroList';
import { PromptTemplateForm } from './prompts/PromptTemplateForm';
import { PromptTemplateList } from './prompts/PromptTemplateList';
import { RegexRuleForm } from './regex/RegexRuleForm';
import { RegexRuleList } from './regex/RegexRuleList';
import { PresetCard } from './shared/PresetCard';
import { WorldbookConfigForm } from './worldbook/WorldbookConfigForm';

// Tab 类型
type MainTabType = 'model' | 'prompt' | 'regex' | 'worldbook';
type ModelSubTabType = 'llm' | 'vector' | 'rerank';
type PromptSubTabType = 'templates' | 'macros'; // 提示词模板子 Tab

// 子 Tab 配置
const MODEL_SUB_TABS: { id: ModelSubTabType; label: string; icon: ElementType }[] = [
  { id: 'llm', label: 'LLM 预设', icon: Key },
  { id: 'vector', label: '向量化', icon: Cpu },
  { id: 'rerank', label: 'Rerank', icon: Layers },
];

interface APIPresetsProps {
  onNavigate?: (path: string) => void;
  initialTab?: MainTabType;
  initialTabPath?: string;
}

const MAIN_TABS = ['model', 'prompt', 'regex', 'worldbook'] as const;
const MODEL_SUB_TAB_IDS = ['llm', 'vector', 'rerank'] as const;
const PROMPT_SUB_TAB_IDS = ['templates', 'macros'] as const;

export const APIPresets: FC<APIPresetsProps> = ({ initialTab, initialTabPath }) => {
  const [initialMainTab, initialNestedTab] = (initialTabPath || '').split(':');
  const resolvedMainTab = MAIN_TABS.includes(initialMainTab as MainTabType)
    ? (initialMainTab as MainTabType)
    : initialTab || 'model';

  // Tab 状态
  const [mainTab, setMainTab] = useState<MainTabType>(resolvedMainTab);
  const [modelSubTab, setModelSubTab] = useState<ModelSubTabType>(
    resolvedMainTab === 'model' && MODEL_SUB_TAB_IDS.includes(initialNestedTab as ModelSubTabType)
      ? (initialNestedTab as ModelSubTabType)
      : 'llm'
  );
  const [promptSubTab, setPromptSubTab] = useState<PromptSubTabType>(
    resolvedMainTab === 'prompt' &&
      PROMPT_SUB_TAB_IDS.includes(initialNestedTab as PromptSubTabType)
      ? (initialNestedTab as PromptSubTabType)
      : 'templates'
  );
  // 编辑中的自定义宏
  const [editingMacroId, setEditingMacroId] = useState<string | null>(null);

  // 移动端状态
  // 使用统一的 useResponsive Hook
  const { isMobile } = useResponsive();
  const [showMobileForm, setShowMobileForm] = useState(false);

  // 移动端 → 桌面端切换时自动关闭全屏表单（渲染期间调整 state，替代 effect 同步）
  const [prevIsMobile, setPrevIsMobile] = useState(isMobile);
  if (prevIsMobile !== isMobile) {
    setPrevIsMobile(isMobile);
    if (!isMobile) {
      setShowMobileForm(false);
    }
  }

  // 外部传入的初始 tab 路径变化时同步主/子 tab（渲染期间调整 state）
  const [prevInitialTabPath, setPrevInitialTabPath] = useState(initialTabPath);
  if (prevInitialTabPath !== initialTabPath) {
    setPrevInitialTabPath(initialTabPath);

    const [nextMainTab, nextNestedTab] = (initialTabPath || '').split(':');
    const resolvedNextMainTab = MAIN_TABS.includes(nextMainTab as MainTabType)
      ? (nextMainTab as MainTabType)
      : initialTab;

    if (resolvedNextMainTab) {
      setMainTab(resolvedNextMainTab);

      if (
        resolvedNextMainTab === 'model' &&
        MODEL_SUB_TAB_IDS.includes(nextNestedTab as ModelSubTabType)
      ) {
        setModelSubTab(nextNestedTab as ModelSubTabType);
      }

      if (
        resolvedNextMainTab === 'prompt' &&
        PROMPT_SUB_TAB_IDS.includes(nextNestedTab as PromptSubTabType)
      ) {
        setPromptSubTab(nextNestedTab as PromptSubTabType);
      }
    }
  }

  // 使用 Hook 管理业务状态
  // 使用组合 Hooks 管理业务状态
  const {
    llmPresets,
    selectedPresetId,
    promptTemplates,
    editingPreset,
    editingTemplate,
    hasChanges: llmHasChanges,
    selectPreset,
    addPreset,
    updatePreset,
    copyPreset,
    deletePreset,
    selectTemplate,
    addTemplate,
    updateTemplate,
    deleteTemplate,
    resetAllTemplates,
    saveLLMSettings,
  } = useLLMPresets();

  const {
    vectorConfig,
    rerankConfig,
    regexConfig,
    customMacros,
    updateConfig,
    addCustomMacro,
    updateCustomMacro,
    deleteCustomMacro,
    toggleCustomMacro,
    saveConfig,
    hasChanges: configHasChanges,
  } = useConfigStore();

  const {
    regexRules,
    editingRule,
    hasChanges: regexHasChanges,
    selectRule,
    addRule,
    updateRule,
    toggleRule,
    deleteRule,
    resetRules,
    reorderRules,
    saveRegexRules,
  } = useRegexRules();

  const {
    worldbookConfig,
    worldbookStructure,
    disabledEntries,
    hasChanges: worldbookHasChanges,
    updateWorldbookConfig,
    toggleWorldbook,
    toggleEntry,
    refreshWorldbooks,
    saveWorldInfo,
    worldbookScopes, // Added
  } = useWorldInfo();

  // 聚合保存
  const save = async () => {
    if (llmHasChanges) saveLLMSettings();
    if (configHasChanges) saveConfig();
    if (regexHasChanges) await saveRegexRules();
    if (worldbookHasChanges) await saveWorldInfo();
  };

  const hasChanges = llmHasChanges || configHasChanges || regexHasChanges || worldbookHasChanges;

  // 聚合 settings 对象以兼容旧代码解构（如果需要），或者直接替换下方 JSX 中的引用
  // 为了最小化 JSX 变动，我们重构 JSX 中的引用
  const settings = {
    llmPresets,
    selectedPresetId,
    vectorConfig,
    rerankConfig,
    promptTemplates,
    worldbookConfig,
    regexConfig,
    customMacros,
  };

  // 移动端选择处理
  const handleMobileSelect = (selectFn: () => void) => {
    selectFn();
    if (isMobile) {
      setShowMobileForm(true);
    }
  };

  const handleMobileClose = () => {
    setShowMobileForm(false);
  };

  // 判断当前是否应该使用 Master-Detail 布局 (需要独立滚动)
  const isMasterDetail =
    ['prompt', 'regex'].includes(mainTab) || (mainTab === 'model' && modelSubTab === 'llm');

  // =============== 移动端独立渲染 (顶层覆盖) ===============
  if (isMobile && showMobileForm) {
    // 1. LLM 预设编辑
    if (mainTab === 'model' && modelSubTab === 'llm' && editingPreset) {
      return (
        <MobileFullscreenForm
          title="编辑 LLM 预设"
          onClose={handleMobileClose}
          actions={
            hasChanges && (
              <button className="p-2 text-primary" onClick={save}>
                <Save size={18} />
              </button>
            )
          }
        >
          <LLMPresetForm preset={editingPreset} onChange={updatePreset} />
        </MobileFullscreenForm>
      );
    }

    // 2. 提示词模板 / 宏
    if (mainTab === 'prompt') {
      if (promptSubTab === 'templates' && editingTemplate) {
        return (
          <MobileFullscreenForm
            title="编辑提示词模板"
            onClose={handleMobileClose}
            actions={
              hasChanges && (
                <button className="p-2 text-primary" onClick={save}>
                  <Save size={18} />
                </button>
              )
            }
          >
            <PromptTemplateForm
              template={editingTemplate}
              llmPresets={settings.llmPresets}
              defaultPresetId={settings.selectedPresetId}
              onChange={updateTemplate}
            />
          </MobileFullscreenForm>
        );
      }
      if (promptSubTab === 'macros') {
        const editingMacro = (settings.customMacros || []).find(
          (m: CustomMacro) => m.id === editingMacroId
        );
        if (editingMacro) {
          return (
            <MobileFullscreenForm
              title="编辑自定义宏"
              onClose={handleMobileClose}
              actions={
                hasChanges && (
                  <button className="p-2 text-primary" onClick={save}>
                    <Save size={18} />
                  </button>
                )
              }
            >
              <CustomMacroForm
                macro={editingMacro}
                onChange={(updates) => updateCustomMacro(editingMacro.id, updates)}
              />
            </MobileFullscreenForm>
          );
        }
      }
    }

    // 3. 正则规则
    if (mainTab === 'regex' && editingRule) {
      return (
        <MobileFullscreenForm
          title="编辑正则规则"
          onClose={handleMobileClose}
          actions={
            hasChanges && (
              <button className="p-2 text-primary" onClick={save}>
                <Save size={18} />
              </button>
            )
          }
        >
          <RegexRuleForm rule={editingRule} onChange={updateRule} />
        </MobileFullscreenForm>
      );
    }
  }

  // =============== 主视图 ===============
  return (
    <div className="animate-in fade-in flex h-full flex-col">
      {/* 顶部标签栏 - 自动 Portal 到 Layout Header */}
      <LayoutTabs
        tabs={[
          { id: 'model', label: '模型配置' },
          { id: 'prompt', label: '提示词模板' },
          { id: 'regex', label: '正则规则' },
          { id: 'worldbook', label: '世界书' },
        ]}
        activeTab={mainTab}
        onChange={(id: string) => setMainTab(id as MainTabType)}
        actions={
          hasChanges && (
            <button
              className="inline-flex items-center gap-1.5 rounded border border-primary/50 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
              onClick={save}
            >
              <Save size={12} />
              保存
            </button>
          )
        }
      />

      <div
        className={`flex-1 ${isMasterDetail ? 'flex flex-col overflow-hidden' : 'no-scrollbar overflow-y-auto'}`}
      >
        {/* 模型配置 Tab */}
        {mainTab === 'model' && (
          <div className="flex flex-col gap-2">
            {/* 子 Tab - 使用负边距扩展到边缘 */}
            <TabPills
              tabs={MODEL_SUB_TABS.map((t) => ({ ...t, icon: <t.icon size={14} /> }))}
              activeTab={modelSubTab}
              onChange={(id: string) => setModelSubTab(id as ModelSubTabType)}
              sticky={false}
              top={0}
              className="!mb-4"
            />

            {/* LLM 预设 - Master-Detail */}
            {modelSubTab === 'llm' && (
              <MasterDetailLayout
                className="h-full"
                mobileDetailOpen={false} // Handled by early return
                onMobileDetailClose={handleMobileClose}
                listWidth="30%"
                list={
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        预设列表
                      </h3>
                      <button
                        className="text-muted-foreground transition-colors hover:text-foreground"
                        onClick={addPreset}
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                    <div className="flex flex-col gap-1">
                      {settings.llmPresets.map((preset) => (
                        <PresetCard
                          key={preset.id}
                          preset={preset}
                          isSelected={settings.selectedPresetId === preset.id}
                          onSelect={() => handleMobileSelect(() => selectPreset(preset))}
                          onEdit={() => handleMobileSelect(() => selectPreset(preset))}
                          onCopy={() => copyPreset(preset)}
                          onDelete={() => deletePreset(preset)}
                        />
                      ))}
                    </div>
                  </div>
                }
                detail={
                  editingPreset ? (
                    <div className="animate-in fade-in slide-in-from-right-2 duration-300">
                      <LLMPresetForm preset={editingPreset} onChange={updatePreset} />
                    </div>
                  ) : (
                    <EmptyState
                      icon={Key}
                      title="未选择预设"
                      description="选择从列表选择一个预设或创建新预设"
                    />
                  )
                }
              />
            )}

            {modelSubTab === 'vector' && (
              <VectorConfigForm
                config={settings.vectorConfig}
                onChange={(config) => updateConfig('vectorConfig', config)}
              />
            )}
            {modelSubTab === 'rerank' && (
              <RerankConfigForm
                config={settings.rerankConfig}
                onChange={(config) => updateConfig('rerankConfig', config)}
              />
            )}
          </div>
        )}

        {/* 提示词模板 Tab - Master-Detail */}
        {mainTab === 'prompt' && (
          <MasterDetailLayout
            listWidth="30%"
            list={
              <>
                {/* 子标签切换 */}
                <div className="mb-4 flex items-center gap-2">
                  <button
                    onClick={() => setPromptSubTab('templates')}
                    className={`text-xs font-bold uppercase tracking-wider transition-colors ${
                      promptSubTab === 'templates'
                        ? 'text-primary'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    提示词模板
                  </button>
                  <span className="text-muted-foreground/30">|</span>
                  <button
                    onClick={() => setPromptSubTab('macros')}
                    className={`text-xs font-bold uppercase tracking-wider transition-colors ${
                      promptSubTab === 'macros'
                        ? 'text-primary'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    自定义宏
                  </button>
                </div>

                {promptSubTab === 'templates' ? (
                  <PromptTemplateList
                    templates={settings.promptTemplates}
                    selectedId={editingTemplate?.id || null}
                    onSelect={(t) => handleMobileSelect(() => selectTemplate(t))}
                    onAdd={addTemplate}
                    onUpdate={updateTemplate}
                    onDelete={deleteTemplate}
                    onResetAll={resetAllTemplates}
                  />
                ) : (
                  <CustomMacroList
                    macros={settings.customMacros || []}
                    selectedId={editingMacroId}
                    onSelect={(macro) => handleMobileSelect(() => setEditingMacroId(macro.id))}
                    onAdd={addCustomMacro}
                    onToggle={toggleCustomMacro}
                    onDelete={deleteCustomMacro}
                  />
                )}
              </>
            }
            detail={
              promptSubTab === 'templates' ? (
                editingTemplate ? (
                  <div className="animate-in fade-in slide-in-from-right-2 duration-300">
                    <PromptTemplateForm
                      template={editingTemplate}
                      llmPresets={settings.llmPresets}
                      defaultPresetId={settings.selectedPresetId}
                      onChange={updateTemplate}
                    />
                  </div>
                ) : (
                  <EmptyState
                    icon={FileText}
                    title="未选择模板"
                    description="选择一个模板进行编辑"
                  />
                )
              ) : (
                (() => {
                  const editingMacro = (settings.customMacros || []).find(
                    (m: CustomMacro) => m.id === editingMacroId
                  );
                  return editingMacro ? (
                    <div className="animate-in fade-in slide-in-from-right-2 duration-300">
                      <CustomMacroForm
                        macro={editingMacro}
                        onChange={(updates) => updateCustomMacro(editingMacro.id, updates)}
                      />
                    </div>
                  ) : (
                    <EmptyState icon={Braces} title="未选择宏" description="选择一个宏进行编辑" />
                  );
                })()
              )
            }
          />
        )}

        {/* 正则规则 Tab - Master-Detail */}
        {mainTab === 'regex' && (
          <MasterDetailLayout
            mobileDetailOpen={false} // Already handled by early return
            onMobileDetailClose={handleMobileClose}
            listWidth="30%"
            list={
              <RegexRuleList
                rules={regexRules}
                selectedId={editingRule?.id || null}
                onSelect={(r) => handleMobileSelect(() => selectRule(r))}
                onToggle={toggleRule}
                onDelete={deleteRule}
                onAdd={() => handleMobileSelect(addRule)}
                onReset={() => {
                  resetRules();
                  notificationService.info('已恢复默认正则规则');
                }}
                onReorder={reorderRules}
                enableNativeRegex={settings.regexConfig?.enableNativeRegex ?? true}
                onToggleNativeRegex={(enabled) =>
                  updateConfig('regexConfig', {
                    ...settings.regexConfig,
                    enableNativeRegex: enabled,
                  })
                }
              />
            }
            detail={
              editingRule ? (
                <div className="animate-in fade-in slide-in-from-right-2 duration-300">
                  <RegexRuleForm rule={editingRule} onChange={updateRule} />
                </div>
              ) : (
                <EmptyState
                  icon={Regex}
                  title="未选择规则"
                  description="选择从列表选择一个规则或创建新规则"
                />
              )
            }
          />
        )}

        {/* 世界书配置 Tab */}
        {mainTab === 'worldbook' && (
          <div className="flex h-full flex-col gap-2">
            {/* 移除知识库方案子标签，仅保留全局设置 */}

            <div className="custom-scrollbar max-w-2xl flex-1 overflow-y-auto py-4">
              <WorldbookConfigForm
                config={
                  worldbookConfig || {
                    enabled: false,
                    includeGlobal: false,
                    disabledWorldbooks: [],
                  }
                }
                onChange={updateWorldbookConfig}
                worldbookStructure={Object.fromEntries(
                  Object.entries(worldbookStructure || {}).filter(([key]) => {
                    const scopes = worldbookScopes || { global: [], chat: [] };
                    return scopes.global.includes(key) || scopes.chat.includes(key);
                  })
                )}
                disabledEntries={disabledEntries}
                onToggleWorldbook={toggleWorldbook}
                onToggleEntry={toggleEntry}
                onRefresh={refreshWorldbooks}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
