/**
 * CustomMacroForm - 自定义宏编辑表单
 * V0.9.2: 右侧详情页编辑（类似提示词模板）
 */
import type { FC } from 'react';

import type { CustomMacro } from '@/types/macro';
import { TextField, FormSection } from '@/ui/components/form/FormComponents';

interface CustomMacroFormProps {
  macro: CustomMacro;
  onChange: (updates: Partial<CustomMacro>) => void;
}

export const CustomMacroForm: FC<CustomMacroFormProps> = ({ macro, onChange }) => {
  return (
    <div className="flex flex-col gap-4">
      {/* 基本信息 */}
      <FormSection title="基本信息">
        <TextField
          label="宏名称"
          value={macro.name}
          onChange={(value) => onChange({ name: value })}
          placeholder="输入宏名称（不含花括号）"
          required
          description="在模板中使用 {{宏名称}} 引用"
        />
      </FormSection>

      {/* 宏内容 */}
      <FormSection title="宏内容">
        <TextField
          label="内容"
          value={macro.content}
          onChange={(value) => onChange({ content: value })}
          placeholder="输入宏内容（可为空，用户自行填写）"
          multiline
          rows={8}
        />
      </FormSection>

      {/* 使用说明 */}
      <div className="bg-muted/30 rounded border border-border px-3 py-2">
        <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          使用方式
        </div>
        <div className="text-xs leading-relaxed text-muted-foreground">
          <p>
            在任意提示词模板中使用{' '}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-primary">{`{{${macro.name || '宏名称'}}}`}</code>{' '}
            即可引用此宏的内容。
          </p>
          <p className="mt-1">宏内容会在每次刷新缓存时自动同步到 SillyTavern 宏系统。</p>
        </div>
      </div>
    </div>
  );
};
