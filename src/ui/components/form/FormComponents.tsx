import { ChevronDown, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode, FC, CSSProperties } from 'react';

import { Switch } from '@/ui/components/core/Switch';

interface FormSectionProps {
  title: string | ReactNode;
  description?: string | ReactNode;
  children: ReactNode;
  className?: string;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}

export const FormSection: FC<FormSectionProps> = ({
  title,
  description,
  children,
  className = '',
  collapsible = false,
  defaultCollapsed = false,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(collapsible ? defaultCollapsed : false);

  return (
    <div className={`mb-8 ${className}`}>
      <div
        className={`mb-4 ${collapsible ? 'group flex cursor-pointer select-none items-center justify-between' : ''}`}
        onClick={() => collapsible && setIsCollapsed(!isCollapsed)}
      >
        <div>
          <h3 className="flex items-center gap-2 text-sm font-medium text-primary">{title}</h3>
          {description && (
            <p className="mt-1 break-words text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        {collapsible && (
          <ChevronDown
            size={16}
            className={`text-muted-foreground transition-transform duration-200 ${isCollapsed ? '-rotate-90' : 'rotate-0'}`}
          />
        )}
      </div>
      <div className={`space-y-4 transition-all duration-300 ${isCollapsed ? 'hidden' : 'block'}`}>
        {children}
      </div>
    </div>
  );
};

interface BaseFieldProps {
  label: string | ReactNode;
  description?: string | ReactNode;
  error?: string;
  required?: boolean;
  className?: string;
}

interface TextFieldProps extends BaseFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'password' | 'email' | 'url' | 'number';
  disabled?: boolean;
  readOnly?: boolean;
  multiline?: boolean;
  rows?: number;
}

/**
 * 极简文本输入框 - 无背景，只有底部衬线
 * 使用内联 style 覆盖酒馆全局 CSS
 */
export const TextField: FC<TextFieldProps> = ({
  label,
  description,
  error,
  required,
  className = '',
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled,
  readOnly,
  multiline,
  rows = 3,
}) => {
  // 内联样式强制覆盖酒馆 CSS
  const inputStyle: CSSProperties = {
    background: 'transparent',
    backgroundColor: 'transparent',
    border: 'none',
    borderBottom: '1px solid var(--border)',
    borderRadius: 0,
    boxShadow: 'none',
    outline: 'none',
    padding: '8px 0',
    fontSize: '14px',
    width: '100%',
    color: 'var(--foreground, inherit)',
  };

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label className="flex items-center gap-1 text-xs text-muted-foreground">
        {label}
        {required && <span className="text-destructive">*</span>}
      </label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={readOnly}
          rows={rows}
          style={inputStyle}
          className="placeholder:text-muted-foreground/40 min-h-[80px] resize-y font-mono transition-colors focus:border-primary disabled:opacity-50"
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={readOnly}
          style={inputStyle}
          className="placeholder:text-muted-foreground/40 transition-colors focus:border-primary disabled:opacity-50"
        />
      )}
      {description && (
        <p className="text-muted-foreground/70 break-words text-[10px]">{description}</p>
      )}
      {error && <p className="text-[10px] text-destructive">{error}</p>}
    </div>
  );
};

interface NumberFieldProps extends BaseFieldProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}

/**
 * 极简数字输入 - 细线滑块 + 底部衬线输入框
 * 完全使用 div 模拟滑块外观，input opacity=0 负责交互
 */

export const NumberField: FC<NumberFieldProps> = ({
  label,
  description,
  error,
  required,
  className = '',
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
}) => {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          {label}
          {required && <span className="text-destructive">*</span>}
        </label>
        <div className="flex items-center justify-end gap-1 sm:justify-normal">
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="mx-0.5 w-20 border-0 border-b border-transparent bg-transparent px-0 py-0 text-right text-base font-medium text-foreground outline-none transition-colors [appearance:textfield] focus:border-border focus:text-primary [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          {suffix && <span className="text-sm font-medium text-muted-foreground">{suffix}</span>}
        </div>
      </div>

      {description && (
        <p className="text-muted-foreground/70 break-words text-[10px]">{description}</p>
      )}
      {error && <p className="text-[10px] text-destructive">{error}</p>}
    </div>
  );
};

interface SelectOption {
  value: string;
  label: string;
}

interface SelectFieldProps extends BaseFieldProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
}

/**
 * 极简下拉框 - 无背景，只有底部衬线
 * 使用内联 style 覆盖酒馆全局 CSS
 */
export const SelectField: FC<SelectFieldProps> = ({
  label,
  description,
  error,
  required,
  className = '',
  value,
  onChange,
  options,
  placeholder = '请选择...',
  disabled,
}) => {
  // 内联样式强制覆盖
  const selectStyle: CSSProperties = {
    background: 'transparent',
    backgroundColor: 'transparent',
    border: 'none',
    borderBottom: '1px solid var(--border)',
    borderRadius: 0,
    boxShadow: 'none',
    outline: 'none',
    padding: '8px 24px 8px 0',
    fontSize: '14px',
    width: '100%',
    cursor: 'pointer',
    color: 'var(--foreground, inherit)',
    appearance: 'none' as const,
    WebkitAppearance: 'none' as const,
  };

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label className="flex items-center gap-1 text-xs text-muted-foreground">
        {label}
        {required && <span className="text-destructive">*</span>}
      </label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          style={selectStyle}
          className="transition-colors focus:border-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="" disabled className="bg-popover text-muted-foreground">
            {placeholder}
          </option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-popover text-foreground">
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={14}
          className="text-muted-foreground/50 pointer-events-none absolute right-0 top-1/2 -translate-y-1/2"
        />
      </div>
      {description && (
        <p className="text-muted-foreground/70 break-words text-[10px]">{description}</p>
      )}
      {error && <p className="text-[10px] text-destructive">{error}</p>}
    </div>
  );
};

interface SwitchFieldProps extends Omit<BaseFieldProps, 'required'> {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  compact?: boolean;
}

/**
 * 极简开关 - 胶囊形轨道 + 圆点
 * 优化可视性，遵循无框流体设计
 */
export const SwitchField: FC<SwitchFieldProps> = ({
  label,
  description,
  error,
  className = '',
  checked,
  onChange,
  disabled,
  compact,
}) => {
  return (
    <div
      className={`flex items-start justify-between gap-4 ${compact ? 'py-0' : 'py-1'} ${className} ${disabled ? 'pointer-events-none opacity-50' : ''}`}
    >
      {label && (
        <div className="min-w-0 flex-1">
          <label
            className="block cursor-pointer truncate text-xs text-foreground"
            onClick={() => !disabled && onChange(!checked)}
          >
            {label}
          </label>
          {description && (
            <p className="text-muted-foreground/70 mt-0.5 break-words text-[10px]">{description}</p>
          )}
          {error && <p className="mt-0.5 text-[10px] text-destructive">{error}</p>}
        </div>
      )}

      {/* 开关按钮 - 使用共享组件 */}
      <Switch checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
};

/**
 * 可搜索下拉框 - 用于大量选项的模型选择
 * 点击展开下拉，支持输入搜索过滤
 */
interface SearchableSelectFieldProps extends BaseFieldProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  emptyText?: string;
}

export const SearchableSelectField: FC<SearchableSelectFieldProps> = ({
  label,
  description,
  error,
  required,
  className = '',
  value,
  onChange,
  options,
  placeholder = '请选择...',
  disabled,
  emptyText = '无可用选项',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 过滤选项
  const filteredOptions = options.filter(
    (opt) =>
      opt.label.toLowerCase().includes(search.toLowerCase()) ||
      opt.value.toLowerCase().includes(search.toLowerCase())
  );

  // 当前选中的 label
  const selectedLabel = options.find((opt) => opt.value === value)?.label || value || placeholder;

  // 点击外部关闭（仅在 isOpen 时绑定，避免多实例事件泄漏）
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // 打开时聚焦搜索框
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSelect = (optValue: string) => {
    onChange(optValue);
    setIsOpen(false);
    setSearch('');
  };

  return (
    <div className={`flex flex-col gap-1 ${className}`} ref={containerRef}>
      <label className="flex items-center gap-1 text-xs text-muted-foreground">
        {label}
        {required && <span className="text-destructive">*</span>}
      </label>

      {/* 触发按钮 */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className="relative w-full cursor-pointer border-0 border-b border-border bg-transparent py-2 pr-6 text-left text-sm text-foreground transition-colors focus:border-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={value ? '' : 'text-muted-foreground'}>{selectedLabel}</span>
        <ChevronDown
          size={14}
          className={`text-muted-foreground/50 absolute right-0 top-1/2 -translate-y-1/2 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* 下拉面板 - 使用 glass-panel 实现正确的模糊效果 */}
      {isOpen && (
        <div
          className="glass-panel animate-in fade-in slide-in-from-top-1 absolute z-50 mt-1 flex max-h-64 w-full flex-col overflow-hidden rounded-lg border border-border shadow-xl duration-150"
          style={{ top: '100%', left: 0, right: 0 }}
        >
          {/* 搜索框 */}
          <div className="flex items-center gap-2 border-b border-border p-2">
            <Search size={14} className="flex-shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索模型..."
              className="placeholder:text-muted-foreground/50 flex-1 border-none bg-transparent text-sm text-foreground outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="rounded p-0.5 hover:bg-muted"
              >
                <X size={12} className="text-muted-foreground" />
              </button>
            )}
          </div>

          {/* 选项列表 */}
          <div className="max-h-48 overflow-y-auto">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt) => (
                <div
                  key={opt.value}
                  onClick={() => handleSelect(opt.value)}
                  className={`cursor-pointer truncate px-3 py-2 text-sm transition-colors ${
                    opt.value === value
                      ? 'bg-primary/15 text-primary'
                      : 'text-foreground hover:bg-muted'
                  }`}
                  title={opt.label}
                >
                  {opt.label}
                </div>
              ))
            ) : (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                {search ? '无匹配结果' : emptyText}
              </div>
            )}
          </div>

          {/* 选项计数 */}
          {options.length > 10 && (
            <div className="text-muted-foreground/70 border-t border-border px-3 py-1 text-xs">
              {filteredOptions.length} / {options.length} 个模型
            </div>
          )}
        </div>
      )}

      {description && (
        <p className="text-muted-foreground/70 break-words text-[10px]">{description}</p>
      )}
      {error && <p className="text-[10px] text-destructive">{error}</p>}
    </div>
  );
};
