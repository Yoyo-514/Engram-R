import {
  BrainCircuit,
  Clapperboard,
  Copy,
  Download,
  FolderInput,
  Paintbrush,
  Power,
  RotateCcw,
  Search,
  Trash2,
  Wand2,
  type LucideIcon,
} from 'lucide-react';
import { useRef } from 'react';
import type { FC, MouseEvent, ChangeEvent } from 'react';

import { PROMPT_CATEGORIES } from '@/config/prompt/defaults';
import { createPromptTemplate } from '@/config/prompt/factories';
import { getBuiltInTemplateByCategory, getBuiltInTemplateById } from '@/config/prompt/templates';
import { Logger, LogModule } from '@/core/logger';
import { parseYaml, stringifyYaml } from '@/core/utils';
import type { PromptCategory, PromptTemplate } from '@/types/prompt';
import { notificationService } from '@/ui/services/NotificationService';

interface PromptTemplateCardProps {
  template: PromptTemplate;
  isSelected?: boolean;
  onSelect?: () => void;
  onCopy?: () => void;
  onDelete?: () => void;
  onToggleEnabled?: (enabled: boolean) => void;
  onImport?: (template: PromptTemplate) => void;
  onResetToDefault?: (template: PromptTemplate) => void;
}

/**
 * 获取分类标签颜色类名
 */
function getCategoryColorClass(category: PromptCategory): string {
  switch (category) {
    case 'summary':
      return 'text-label bg-label/10 border border-label/20';
    case 'trim':
      return 'text-emphasis bg-emphasis/10 border border-emphasis/20';
    case 'preprocess':
      return 'text-value bg-value/10 border border-value/20';
    default:
      return 'text-muted-foreground bg-muted border border-border';
  }
}

/**
 * 获取分类标签文本
 */
function getCategoryLabel(category: PromptCategory): string {
  return (
    PROMPT_CATEGORIES.find((c: { value: PromptCategory; label: string }) => c.value === category)
      ?.label || category
  );
}

export const PromptTemplateCard: FC<PromptTemplateCardProps> = ({
  template,
  isSelected = false,
  onSelect,
  onCopy,
  onDelete,
  onToggleEnabled,
  onImport,
  onResetToDefault,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 导出单个模板
  const handleExport = (e: MouseEvent) => {
    e.stopPropagation();
    const exportData = {
      name: template.name,
      category: template.category,
      boundPresetId: template.boundPresetId,
      systemPrompt: template.systemPrompt,
      userPromptTemplate: template.userPromptTemplate,
      injectionMode: template.injectionMode,
    };

    const yamlString = stringifyYaml(exportData);

    const blob = new Blob([yamlString], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `engram_template_${template.name.replace(/\s+/g, '_')}.yaml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 导入模板（覆盖当前）
  const handleImportClick = (e: MouseEvent) => {
    e.stopPropagation();
    fileInputRef.current?.click();
  };

  function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object';
  }

  function isPromptCategory(value: unknown): value is PromptCategory {
    return (
      value === 'summary' ||
      value === 'trim' ||
      value === 'preprocessing' ||
      value === 'entity_extraction'
    );
  }

  const handleImportFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !onImport) return;

    const reader = new FileReader();
    reader.addEventListener('load', (e: ProgressEvent<FileReader>) => {
      try {
        const content = typeof e.target?.result === 'string' ? e.target.result : '';
        const data = parseYaml<Record<string, unknown>>(content);
        const rawTemplate = isRecord(data?.template) ? data.template : data;

        if (!isRecord(rawTemplate)) {
          Logger.error(LogModule.TAVERN, 'Invalid template format during import', data);
          notificationService.error('导入失败: 无效的模板文件格式');
          return;
        }

        const name = typeof rawTemplate.name === 'string' ? rawTemplate.name.trim() : '';
        const category = isPromptCategory(rawTemplate.category) ? rawTemplate.category : undefined;

        if (!name || !category) {
          Logger.error(LogModule.TAVERN, 'Invalid template fields during import', rawTemplate);
          notificationService.error('导入失败: 模板缺少有效的名称或分类');
          return;
        }

        const importedTemplate = createPromptTemplate(name, category, {
          enabled: template.enabled,
          isBuiltIn: template.isBuiltIn,
          boundPresetId:
            typeof rawTemplate.boundPresetId === 'string' ? rawTemplate.boundPresetId : null,
          systemPrompt:
            typeof rawTemplate.systemPrompt === 'string' ? rawTemplate.systemPrompt : '',
          userPromptTemplate:
            typeof rawTemplate.userPromptTemplate === 'string'
              ? rawTemplate.userPromptTemplate
              : '',
          injectionMode:
            rawTemplate.injectionMode === 'replace' ||
            rawTemplate.injectionMode === 'append' ||
            rawTemplate.injectionMode === 'prepend'
              ? rawTemplate.injectionMode
              : undefined,
        });

        importedTemplate.id = template.id;
        onImport(importedTemplate);
        notificationService.success(`模板 "${importedTemplate.name}" 导入成功`);
        Logger.info(LogModule.TAVERN, `Prompt template imported: ${importedTemplate.name}`);
      } catch (err) {
        Logger.error(LogModule.TAVERN, 'Failed to parse template file', err);
        notificationService.error('导入失败: 无法解析文件');
      }
    });
    reader.readAsText(file);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const isPreprocessing = template.category === 'preprocess';

  return (
    <div
      className={`group relative cursor-pointer rounded-lg border p-3 transition-all duration-200 ${
        isSelected
          ? 'bg-accent/50 border-input'
          : 'hover:bg-muted/50 border-transparent bg-transparent hover:border-border'
      } ${!template.enabled && !isPreprocessing && 'opacity-50'} `}
      onClick={onSelect}
    >
      <div className="flex items-start gap-3">
        {/* 状态图标 */}
        {!isPreprocessing ? (
          <button
            className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-colors ${
              template.enabled
                ? 'bg-primary/10 text-primary'
                : 'hover:bg-muted/80 bg-muted text-muted-foreground'
            } `}
            onClick={(e) => {
              e.stopPropagation();
              onToggleEnabled?.(!template.enabled);
            }}
            title={template.enabled ? '点击禁用' : '点击启用'}
          >
            <Power size={16} />
          </button>
        ) : (
          // 预处理模板：内置模板使用专属图标，自建模板用通用图标
          (() => {
            const BUILTIN_ICON_MAP: Record<string, LucideIcon> = {
              builtin_query_enhance: Search,
              builtin_plot_director: Clapperboard,
              builtin_description_enhance: Paintbrush,
              builtin_agentic_recall: BrainCircuit,
            };
            const Icon = BUILTIN_ICON_MAP[template.id] || Wand2;
            return (
              <div
                className="bg-value/10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-value"
                title="预处理模板 (在快捷面板中激活)"
              >
                <Icon size={16} />
              </div>
            );
          })()
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h4
              className={`truncate text-sm font-medium ${isSelected ? 'text-heading' : 'text-muted-foreground group-hover:text-heading'} ${!template.enabled && !isPreprocessing && 'line-through'}`}
            >
              {template.name}
            </h4>

            {/* 标签 */}
            <div className="flex flex-shrink-0 items-center gap-1.5">
              <span
                className={`rounded-sm px-1.5 py-0.5 text-[10px] font-medium ${getCategoryColorClass(template.category)}`}
              >
                {getCategoryLabel(template.category)}
              </span>
              {template.isBuiltIn && (
                <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  BUILTIN
                </span>
              )}
            </div>
          </div>

          <div className="text-muted-foreground/70 mt-1 flex items-center justify-between font-mono text-[10px]">
            <span className="max-w-[120px] truncate">
              {template.boundPresetId ? `BOUND: ${template.boundPresetId}` : 'DEFAULT PRESET'}
            </span>
          </div>
        </div>
      </div>

      {/* Action Buttons - Visible on hover or selected */}
      <div
        className={`mt-2 flex justify-end gap-1 ${isSelected || 'opacity-0 group-hover:opacity-100'} transition-opacity`}
      >
        <button
          className="rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground"
          onClick={handleImportClick}
          title="Import"
        >
          <FolderInput size={12} />
        </button>
        <button
          className="rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground"
          onClick={handleExport}
          title="Export"
        >
          <Download size={12} />
        </button>
        <button
          className="rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            onCopy?.();
          }}
          title="Copy"
        >
          <Copy size={12} />
        </button>
        {template.isBuiltIn && (
          <button
            className="hover:bg-emphasis/10 rounded p-1.5 text-muted-foreground transition-colors hover:text-emphasis"
            onClick={(e) => {
              e.stopPropagation();
              // 优先尝试通过 ID 精确匹配 (V0.8.6 Fix)
              let defaultTemplate: PromptTemplate | null | undefined = getBuiltInTemplateById(
                template.id
              );

              // 如果找不到 (可能是旧数据的随机 ID)，回退到分类匹配
              // 注意：对于 preprocessing 分类，分类匹配可能不准确，建议刷新页面以触发 ID 迁移
              if (!defaultTemplate) {
                defaultTemplate = getBuiltInTemplateByCategory(template.category);
              }

              if (defaultTemplate && onResetToDefault) {
                // 保留当前模板的 ID 和 enabled 状态，替换内容
                onResetToDefault({
                  ...defaultTemplate,
                  id: template.id,
                  enabled: template.enabled,
                  extraWorldbooks: template.extraWorldbooks, // V1.3.3: 保留绑定的世界书
                });
              }
            }}
            title="恢复默认"
          >
            <RotateCcw size={12} />
          </button>
        )}
        {!template.isBuiltIn && (
          <button
            className="hover:bg-destructive/10 rounded p-1.5 text-muted-foreground transition-colors hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.();
            }}
            title="Delete"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".yaml,.yml,.json"
        onChange={handleImportFile}
        className="hidden"
      />
    </div>
  );
};
