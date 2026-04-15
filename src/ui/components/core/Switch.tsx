import type { FC, MouseEvent } from 'react';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  /**
   * 自定义 ID，通常不需要，除非做 Label 关联
   */
  id?: string;
}

/**
 * 极简开关按钮 (Atomic)
 * Tech Slot 风格: 纤细轨道 + 辉光 Thumb
 */
export const Switch: FC<SwitchProps> = ({
  checked,
  onChange,
  disabled = false,
  className = '',
  id,
}) => {
  const handleClick = (e: MouseEvent) => {
    if (!disabled) {
      e.stopPropagation(); // 防止冒泡触发父级点击
      onChange(!checked);
    }
  };

  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      onClick={handleClick}
      disabled={disabled}
      className={`relative inline-flex h-3.5 w-9 shrink-0 cursor-pointer items-center rounded-full border transition-all duration-[var(--duration-normal)] ease-[var(--ease-out)] focus:outline-none active:scale-95 ${
        checked
          ? 'bg-primary/20 border-primary/50 shadow-[0_0_10px_rgba(var(--primary),0.2)]'
          : 'border-border bg-black/20 shadow-inner'
      } ${disabled ? 'cursor-not-allowed opacity-50' : ''} ${className} `}
    >
      {/* 辉光 Thumb */}
      <span
        className={`pointer-events-none inline-block h-2.5 w-2.5 transform rounded-full shadow-sm ring-0 transition-all duration-[var(--duration-normal)] ease-[var(--ease-spring)] ${
          checked
            ? 'border-primary-foreground/20 border bg-primary shadow-[0_0_8px_rgba(var(--primary),0.8)]'
            : 'border border-transparent bg-muted-foreground opacity-60'
        } `}
        style={{ transform: checked ? 'translateX(24px)' : 'translateX(2px)' }}
      />
    </button>
  );
};
