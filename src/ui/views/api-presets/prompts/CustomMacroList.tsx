/**
 * CustomMacroList - 自定义宏列表组件
 * V0.9.2: 简化为卡片列表，点击后右侧编辑
 */

import { AnimatePresence, motion } from 'framer-motion';
import { Braces, Plus, Power, Trash2 } from 'lucide-react';
import type { FC } from 'react';

import type { CustomMacro } from '@/types/macro';

interface CustomMacroListProps {
  macros: CustomMacro[];
  selectedId: string | null;
  onSelect: (macro: CustomMacro) => void;
  onAdd: () => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

export const CustomMacroList: FC<CustomMacroListProps> = ({
  macros,
  selectedId,
  onSelect,
  onAdd,
  onToggle,
  onDelete,
}) => {
  return (
    <div className="flex h-full flex-col gap-4">
      {/* 头部操作栏 */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          自定义宏
        </h3>
        <button
          className="text-muted-foreground transition-colors hover:text-foreground"
          onClick={onAdd}
          title="添加新宏"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* 说明 */}
      <div className="bg-muted/30 border-border/50 rounded border px-2 py-1.5 text-xs leading-relaxed text-muted-foreground">
        自定义宏可在模板中使用 <code className="rounded bg-muted px-1">{`{{宏名}}`}</code> 引用
      </div>

      {/* 宏列表 */}
      <motion.div layout className="no-scrollbar flex flex-1 flex-col gap-1 overflow-y-auto">
        <AnimatePresence initial={false}>
          {macros.map((macro) => (
            <motion.div
              layout
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -10, transition: { duration: 0.2 } }}
              transition={{ duration: 0.3 }}
              key={macro.id}
              className={`group flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-all duration-200 ${
                selectedId === macro.id
                  ? 'bg-accent/50 border-input'
                  : 'hover:bg-muted/50 border-transparent bg-transparent hover:border-border'
              } ${!macro.enabled && 'opacity-50'} `}
              onClick={() => onSelect(macro)}
            >
              {/* 状态图标 */}
              <button
                className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-colors ${
                  macro.enabled
                    ? selectedId === macro.id
                      ? 'bg-primary/20 text-primary'
                      : 'bg-muted text-primary'
                    : 'bg-muted text-muted-foreground'
                } `}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(macro.id);
                }}
                title={macro.enabled ? '点击禁用' : '点击启用'}
              >
                <Power size={14} />
              </button>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <code
                    className={`truncate text-sm font-medium ${selectedId === macro.id ? 'text-primary' : 'text-foreground'}`}
                  >
                    {`{{${macro.name}}}`}
                  </code>
                </div>
                <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                  {macro.content
                    ? macro.content.slice(0, 50) + (macro.content.length > 50 ? '...' : '')
                    : '(空内容)'}
                </p>
              </div>

              {/* 删除按钮 */}
              <button
                className={`hover:bg-destructive/10 rounded p-1.5 text-muted-foreground transition-colors hover:text-destructive ${selectedId === macro.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(macro.id);
                }}
                title="删除"
              >
                <Trash2 size={12} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>

        {macros.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-12 text-muted-foreground">
            <Braces size={24} className="opacity-50" />
            <p className="text-xs">暂无自定义宏</p>
            <button className="text-xs text-primary hover:underline" onClick={onAdd}>
              添加第一个宏
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
};
