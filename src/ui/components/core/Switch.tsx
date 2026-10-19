import type { FC, MouseEvent } from 'react';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export const Switch: FC<SwitchProps> = ({
  checked,
  onChange,
  disabled = false,
  className = '',
  id,
}) => {
  const handleClick = (event: MouseEvent) => {
    event.stopPropagation();
    onChange(!checked);
  };

  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      onClick={handleClick}
      disabled={disabled}
      className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border border-transparent transition-colors duration-[var(--duration-fast)] disabled:cursor-not-allowed disabled:opacity-50 ${checked ? 'bg-primary' : 'bg-sidebar-border'} ${className}`}
    >
      <span
        className="pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-[var(--duration-fast)]"
        style={{ transform: checked ? 'translateX(20px)' : 'translateX(4px)' }}
      />
    </button>
  );
};
