import { ArrowDown, ArrowUp, Plus, Power, Trash2 } from 'lucide-react';
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
  // 顺序决定正则执行次序；显式上移、下移也适用于触屏和键盘操作。
  const moveRule = (index: number, offset: -1 | 1) => {
    const next = [...rules];
    const target = index + offset;
    [next[index], next[target]] = [next[target], next[index]];
    onReorder(next);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
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
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            onClick={onAdd}
          >
            <Plus size={14} strokeWidth={2.5} />
            新增规则
          </button>
        </div>
      </div>

      <div className="mb-2 rounded-lg border border-border/50 bg-muted/10 p-3">
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

      <div className="no-scrollbar -mr-2 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-2">
        {rules.map((rule, index) => (
          <div
            key={rule.id}
            className={`group flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${selectedId === rule.id ? 'border-primary/30 bg-primary/10' : 'border-transparent hover:border-border hover:bg-muted/50'} ${!rule.enabled ? 'opacity-50' : ''}`}
            onClick={() => onSelect(rule.id)}
          >
            <div className="flex shrink-0 flex-col gap-1">
              <button
                type="button"
                disabled={index === 0}
                aria-label={`上移 ${rule.name}`}
                title="上移"
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
                onClick={(event) => {
                  event.stopPropagation();
                  moveRule(index, -1);
                }}
              >
                <ArrowUp size={14} />
              </button>
              <button
                type="button"
                disabled={index === rules.length - 1}
                aria-label={`下移 ${rule.name}`}
                title="下移"
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
                onClick={(event) => {
                  event.stopPropagation();
                  moveRule(index, 1);
                }}
              >
                <ArrowDown size={14} />
              </button>
            </div>
            <button
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${rule.enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}
              onClick={(event) => {
                event.stopPropagation();
                onToggle(rule.id);
              }}
              title={rule.enabled ? '点击禁用' : '点击启用'}
            >
              <Power size={14} />
            </button>
            <div className="min-w-0 flex-1">
              <h4 className={`truncate text-sm font-medium ${!rule.enabled ? 'line-through' : ''}`}>
                {rule.name}
              </h4>
              <code className="mt-0.5 inline-block max-w-[120px] truncate rounded bg-muted px-1 font-mono text-[10px] text-muted-foreground">
                /{rule.pattern}/{rule.flags}
              </code>
            </div>
            <button
              className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              onClick={(event) => {
                event.stopPropagation();
                onDelete(rule.id);
              }}
              aria-label={`删除 ${rule.name}`}
              title="删除规则"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
      {rules.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-xs text-muted-foreground">无规则</p>
        </div>
      )}
    </div>
  );
};
