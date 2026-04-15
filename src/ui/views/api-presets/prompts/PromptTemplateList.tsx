import { AnimatePresence, motion } from 'framer-motion';
import { FileText, Plus, RotateCcw } from 'lucide-react';
import type { FC } from 'react';

import { PROMPT_CATEGORIES } from '@/config/prompt/defaults';
import { createPromptTemplate } from '@/config/prompt/factories';
import type { PromptTemplate } from '@/types/prompt';

import { PromptTemplateCard } from './PromptTemplateCard';

interface PromptTemplateListProps {
  templates: PromptTemplate[];
  selectedId: string | null;
  onSelect: (template: PromptTemplate) => void;
  onAdd: (template: PromptTemplate) => void;
  onUpdate: (template: PromptTemplate) => void;
  onDelete: (template: PromptTemplate) => void;
  /** V1.0.2: 重置所有模板为默认 */
  onResetAll?: () => void;
}

export const PromptTemplateList: FC<PromptTemplateListProps> = ({
  templates,
  selectedId,
  onSelect,
  onAdd,
  onUpdate,
  onDelete,
  onResetAll,
}) => {
  // 新建模板
  const handleAdd = () => {
    const newTemplate = createPromptTemplate(`新模板 ${templates.length + 1}`, 'summary');
    onAdd(newTemplate);
    onSelect(newTemplate);
  };

  // 复制模板
  const handleCopy = (template: PromptTemplate) => {
    const copy = createPromptTemplate(`${template.name} (副本)`, template.category, {
      enabled: false, // 副本默认不启用
      boundPresetId: template.boundPresetId,
      systemPrompt: template.systemPrompt,
      userPromptTemplate: template.userPromptTemplate,
    });
    onAdd(copy);
  };

  // 切换启用状态
  const handleToggleEnabled = (template: PromptTemplate, enabled: boolean) => {
    // 如果启用，同分类的其他模板要禁用（每个分类只有一个启用）
    if (enabled) {
      templates
        .filter((t) => t.category === template.category && t.id !== template.id && t.enabled)
        .forEach((t) => onUpdate({ ...t, enabled: false }));
    }
    onUpdate({ ...template, enabled });
  };

  // 导入覆盖模板
  const handleImport = (importedTemplate: PromptTemplate) => {
    onUpdate(importedTemplate);
  };

  // 按分类分组
  const groupedTemplates = PROMPT_CATEGORIES.map((category) => ({
    ...category,
    templates: templates.filter((t) => t.category === category.value),
  })).filter((group) => group.templates.length > 0);

  return (
    <div className="flex h-full flex-col gap-4">
      {/* 头部操作栏 */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          提示词模板
        </h3>
        <div className="flex items-center gap-1">
          {onResetAll && (
            <button
              className="p-1 text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => {
                if (
                  confirm(
                    '确定要重置所有内置模板为默认值吗？\n\n这将恢复所有内置模板的原始内容，但不会删除你创建的自定义模板。'
                  )
                ) {
                  onResetAll();
                }
              }}
              title="重置所有模板为默认"
            >
              <RotateCcw size={14} />
            </button>
          )}
          <button
            className="p-1 text-muted-foreground transition-colors hover:text-foreground"
            onClick={handleAdd}
            title="新建模板"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      {/* 模板列表 */}
      <div className="no-scrollbar flex flex-1 flex-col gap-6 overflow-y-auto">
        {groupedTemplates.map((group) => (
          <motion.div layout key={group.value} className="flex flex-col gap-2">
            <motion.div
              layout
              className="flex items-center gap-2 px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
            >
              {group.label}
              <div className="h-px flex-1 bg-border"></div>
            </motion.div>
            <motion.div layout className="flex flex-col gap-1">
              <AnimatePresence initial={false}>
                {group.templates.map((template) => (
                  <motion.div
                    key={template.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: -10, transition: { duration: 0.2 } }}
                    transition={{ duration: 0.3 }}
                  >
                    <PromptTemplateCard
                      template={template}
                      isSelected={selectedId === template.id}
                      onSelect={() => onSelect(template)}
                      onCopy={() => handleCopy(template)}
                      onDelete={() => onDelete(template)}
                      onToggleEnabled={(enabled) => handleToggleEnabled(template, enabled)}
                      onImport={handleImport}
                      onResetToDefault={(resetTemplate) => onUpdate(resetTemplate)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        ))}

        {templates.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-12 text-muted-foreground">
            <FileText size={24} className="opacity-50" />
            <p className="text-xs">暂无模板</p>
          </div>
        )}
      </div>
    </div>
  );
};
