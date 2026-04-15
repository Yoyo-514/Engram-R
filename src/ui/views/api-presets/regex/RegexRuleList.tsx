import { AnimatePresence, Reorder } from 'framer-motion';
import { GripVertical, Plus, Power, Trash2 } from 'lucide-react';
import type { FC } from 'react';

import type { RegexRule } from '@/types/regex';
import { Switch } from '@/ui/components/core/Switch';

interface RegexRuleListProps {
  rules: RegexRule[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  onReset: () => void;
  onReorder: (rules: RegexRule[]) => void;
  enableNativeRegex?: boolean;
  onToggleNativeRegex?: (enabled: boolean) => void;
}

export const RegexRuleList: FC<RegexRuleListProps> = ({
  rules,
  selectedId,
  onSelect,
  onToggle,
  onDelete,
  onAdd,
  onReset,
  onReorder,
  enableNativeRegex,
  onToggleNativeRegex,
}) => {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          正则规则列表
        </h3>
        <div className="flex gap-2">
          <button
            className="text-[10px] text-muted-foreground transition-colors hover:text-destructive"
            onClick={onReset}
          >
            重置默认
          </button>
          <button
            className="hover:bg-primary/90 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-all active:scale-95"
            onClick={onAdd}
          >
            <Plus size={14} strokeWidth={2.5} />
            新增规则
          </button>
        </div>
      </div>

      {/* Native Compatibility Toggle */}
      <div className="bg-muted/10 border-border/50 mb-2 rounded-lg border p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-medium">酒馆原生 Regex 兼容</h4>
            <p className="mt-0.5 break-words text-xs text-muted-foreground">
              启用后将应用 SillyTavern 的 Regex 脚本
            </p>
          </div>

          <Switch
            checked={enableNativeRegex ?? true}
            onChange={(checked) => onToggleNativeRegex?.(checked)}
          />
        </div>
      </div>

      <Reorder.Group axis="y" values={rules} onReorder={onReorder} className="flex flex-col gap-1">
        <AnimatePresence initial={false}>
          {rules.map((rule) => (
            <Reorder.Item
              key={rule.id}
              value={rule}
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -10, transition: { duration: 0.2 } }}
              transition={{ duration: 0.3 }}
              className={`group flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-all duration-200 ${
                selectedId === rule.id
                  ? 'bg-accent/50 border-input'
                  : 'hover:bg-muted/50 border-transparent bg-transparent hover:border-border'
              } ${!rule.enabled && 'opacity-50'} `}
              onClick={() => onSelect(rule.id)}
            >
              {/* Drag Handle */}
              <div className="cursor-grab text-muted-foreground transition-colors hover:text-foreground active:cursor-grabbing">
                <GripVertical size={14} />
              </div>

              {/* Status/Toggle Icon */}
              <button
                className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                  rule.enabled
                    ? selectedId === rule.id
                      ? 'bg-primary/20 text-primary'
                      : 'bg-muted text-primary'
                    : 'bg-muted text-muted-foreground'
                } `}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(rule.id);
                }}
                title={rule.enabled ? '点击禁用' : '点击启用'}
              >
                <Power size={14} />
              </button>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <h4
                    className={`truncate text-sm font-medium ${selectedId === rule.id ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'} ${!rule.enabled && 'line-through opacity-50'}`}
                  >
                    {rule.name}
                  </h4>
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <code className="max-w-[120px] truncate rounded bg-muted px-1 font-mono text-[10px] text-muted-foreground">
                    /{rule.pattern}/{rule.flags}
                  </code>
                </div>
              </div>

              {/* Delete Action */}
              <div
                className={`flex items-center ${selectedId === rule.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}
              >
                <button
                  className="hover:bg-destructive/10 rounded p-1.5 text-muted-foreground transition-colors hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(rule.id);
                  }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </Reorder.Item>
          ))}
        </AnimatePresence>
      </Reorder.Group>

      {rules.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-xs text-muted-foreground">无规则</p>
        </div>
      )}
    </div>
  );
};
