import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { FC } from 'react';

import { EntityType } from '@/config/memory/defaults';
import { stringifyYaml } from '@/core/utils';
import type { EntityNode } from '@/types/graph';
import { ModernButton as Button } from '@/ui/components/core/Button';

type Profile = Record<string, unknown>;

type ValueKind = 'text' | 'list' | 'number' | 'boolean' | 'json';

/** 结构化编辑器可创建的值类型 */
type ProfileValue = string | string[] | number | boolean | Record<string, unknown>;

const KIND_OPTIONS: Array<{ value: ValueKind; label: string }> = [
  { value: 'text', label: '文本' },
  { value: 'list', label: '多值' },
  { value: 'number', label: '数字' },
  { value: 'boolean', label: '布尔' },
  { value: 'json', label: '对象' },
];

const inputClass =
  'w-full min-w-0 rounded-md border border-border/60 bg-muted/30 px-2 py-1.5 text-sm outline-none transition-colors focus:border-primary focus:bg-background';

function detectKind(value: unknown): ValueKind {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return 'list';
  if (typeof value === 'string') return 'text';
  return 'json';
}

function createValue(kind: ValueKind): ProfileValue {
  switch (kind) {
    case 'list':
      return [];
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'json':
      return {};
    default:
      return '';
  }
}

/** 对象类字段单独持有文本状态，避免每次按键都往 profile 写入半截 JSON。 */
const JsonValueInput: FC<{ value: unknown; onCommit: (next: unknown) => void }> = ({
  value,
  onCommit,
}) => {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [error, setError] = useState<string | null>(null);

  const handleChange = (next: string) => {
    setText(next);
    try {
      const parsed: unknown = JSON.parse(next);
      setError(null);
      onCommit(parsed);
    } catch {
      setError('JSON 格式不完整');
    }
  };

  return (
    <div className="min-w-0">
      <textarea
        value={text}
        onChange={(event) => handleChange(event.target.value)}
        rows={3}
        spellCheck={false}
        className="custom-scrollbar w-full min-w-0 resize-y rounded-md border border-border/60 bg-muted/30 p-2 font-mono text-xs outline-none focus:border-primary focus:bg-background"
      />
      {error && <p className="mt-1 text-[10px] text-destructive">{error}</p>}
    </div>
  );
};

const FieldRow: FC<{
  name: string;
  value: unknown;
  onChange: (next: unknown) => void;
  onRemove: () => void;
}> = ({ name, value, onChange, onRemove }) => {
  const kind = detectKind(value);

  return (
    <div className="flex min-w-0 items-start gap-2 rounded-md border border-border/40 bg-card/40 p-2">
      <span className="w-24 shrink-0 truncate pt-1.5 font-mono text-xs text-meta" title={name}>
        {name}
      </span>
      <div className="min-w-0 flex-1">
        {kind === 'list' && (
          <input
            value={(value as string[]).join(', ')}
            onChange={(event) =>
              onChange(
                event.target.value
                  .split(/[,，]/)
                  .map((item) => item.trim())
                  .filter(Boolean)
              )
            }
            placeholder="用逗号分隔"
            className={inputClass}
          />
        )}
        {kind === 'text' && (
          <input
            value={value as string}
            onChange={(event) => onChange(event.target.value)}
            className={inputClass}
          />
        )}
        {kind === 'number' && (
          <input
            type="number"
            value={value as number}
            onChange={(event) => onChange(Number(event.target.value))}
            className={inputClass}
          />
        )}
        {kind === 'boolean' && (
          <label className="flex cursor-pointer items-center gap-2 pt-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={value as boolean}
              onChange={(event) => onChange(event.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--primary)]"
            />
            {value ? '是' : '否'}
          </label>
        )}
        {kind === 'json' && <JsonValueInput value={value} onCommit={onChange} />}
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 rounded p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        title="删除该字段"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
};

interface EntityEditorModalProps {
  entity: EntityNode;
  onCancel: () => void;
  onSave: (next: EntityNode) => void;
}

export const EntityEditorModal: FC<EntityEditorModalProps> = ({ entity, onCancel, onSave }) => {
  const [name, setName] = useState(entity.name);
  const [type, setType] = useState(entity.type);
  const [aliases, setAliases] = useState(entity.aliases.join(', '));
  const [description, setDescription] = useState(entity.description);
  const [profile, setProfile] = useState<Profile>({ ...entity.profile });

  const [newKey, setNewKey] = useState('');
  const [newKind, setNewKind] = useState<ValueKind>('text');

  const setField = (key: string, value: unknown) =>
    setProfile((prev) => ({ ...prev, [key]: value }));

  const removeField = (key: string) =>
    setProfile((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });

  const addField = () => {
    const key = newKey.trim();
    if (!key || key in profile) return;
    setField(key, createValue(newKind));
    setNewKey('');
  };

  const generatedYaml = `${name}\n${stringifyYaml({ profile }).trim()}`;

  const handleSave = () => {
    onSave({
      ...entity,
      name: name.trim() || entity.name,
      type,
      aliases: aliases
        .split(/[,，]/)
        .map((item) => item.trim())
        .filter(Boolean),
      description,
      profile,
    });
  };

  return (
    <div className="animate-in fade-in fixed inset-0 z-[12000] flex items-stretch justify-center bg-background/80 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="engram-acrylic cq animate-in zoom-in-95 mx-auto flex h-[100dvh] w-full max-w-5xl flex-col overflow-hidden p-4 pt-[max(1rem,env(safe-area-inset-top))] shadow-[var(--shadow-3)] sm:h-[88dvh] sm:rounded-xl sm:border sm:border-border sm:p-6">
        <div className="mb-3 flex shrink-0 items-center justify-between gap-3 border-b border-border/60 pb-2">
          <h3 className="min-w-0 truncate text-base font-semibold">编辑实体</h3>
          <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
            属性保存后会写入 profile，并同步生成烧录文本
          </span>
        </div>

        <div className="custom-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto overflow-x-hidden pr-1">
          <div className="cq-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-meta">名称</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-meta">类型</span>
              <select
                value={type}
                onChange={(event) => setType(event.target.value as EntityType)}
                className={inputClass}
              >
                {Object.values(EntityType).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-xs text-meta">别名（逗号分隔）</span>
              <input
                value={aliases}
                onChange={(event) => setAliases(event.target.value)}
                className={inputClass}
              />
            </label>
          </div>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-medium text-muted-foreground">属性 (profile)</h4>
              <span className="text-[10px] text-muted-foreground/70">
                {Object.keys(profile).length} 个字段
              </span>
            </div>

            {Object.entries(profile).map(([key, value]) => (
              <FieldRow
                key={key}
                name={key}
                value={value}
                onChange={(next) => setField(key, next)}
                onRemove={() => removeField(key)}
              />
            ))}

            <div className="flex min-w-0 items-center gap-2 pt-1">
              <input
                value={newKey}
                onChange={(event) => setNewKey(event.target.value)}
                placeholder="新字段名"
                className="min-w-0 flex-1 rounded-md border border-dashed border-border/60 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-primary"
              />
              <select
                value={newKind}
                onChange={(event) => setNewKind(event.target.value as ValueKind)}
                className="shrink-0 rounded-md border border-border/60 bg-muted/30 px-2 py-1.5 text-xs outline-none"
              >
                {KIND_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={addField}
                disabled={!newKey.trim()}
                className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-30"
                title="添加字段"
              >
                <Plus size={16} />
              </button>
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h4 className="shrink-0 text-xs font-medium text-muted-foreground">
                烧录文本 (description)
              </h4>
              <button
                type="button"
                onClick={() => setDescription(generatedYaml)}
                className="shrink-0 text-[11px] text-primary transition-colors hover:text-primary/80"
              >
                按 profile 重新生成
              </button>
            </div>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={6}
              spellCheck={false}
              className="custom-scrollbar w-full resize-y rounded-md border border-border/60 bg-muted/30 p-2 font-mono text-xs outline-none focus:border-primary focus:bg-background"
            />
          </section>

          <section className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground">当前 profile 的 YAML</h4>
            <pre className="custom-scrollbar max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border/40 bg-muted/20 p-2 font-mono text-[11px] text-muted-foreground">
              {stringifyYaml({ profile }).trim()}
            </pre>
          </section>
        </div>

        <div className="mt-3 flex shrink-0 justify-end gap-2 border-t border-border/60 pt-3">
          <Button label="取消" onClick={onCancel} />
          <Button label="确认更新" primary onClick={handleSave} />
        </div>
      </div>
    </div>
  );
};
