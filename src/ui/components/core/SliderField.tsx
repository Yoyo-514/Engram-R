import { useRef, type FC } from 'react';

interface SliderFieldProps {
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
  className?: string;
}

/**
 * 极简滑块 (Atomic)
 * 纯 div 绘制轨道与 Thumb，隐藏原生 input 仅保留交互
 */
export const SliderField: FC<SliderFieldProps> = ({
  min,
  max,
  step = 1,
  value,
  onChange,
  className = '',
}) => {
  const touchStartValue = useRef(value);
  const range = max - min;
  const percentage = range === 0 ? 0 : Math.min(100, Math.max(0, ((value - min) / range) * 100));

  return (
    <div
      className={`group relative flex h-11 cursor-pointer items-center [@media(pointer:fine)]:h-5 ${className}`}
    >
      {/* 轨道底 */}
      <div
        className="absolute inset-x-0 top-1/2 h-1 rounded-full bg-border"
        style={{ transform: 'translateY(-50%)' }}
      />

      {/* 轨道填充 */}
      <div
        className="absolute left-0 top-1/2 h-1 rounded-full bg-primary"
        style={{ width: `${percentage}%`, transform: 'translateY(-50%)' }}
      />

      {/* Thumb - 纯 div 渲染 */}
      <div
        className="pointer-events-none absolute top-1/2 h-3 w-3 rounded-full bg-primary shadow-sm transition-transform duration-100 ease-out group-hover:scale-125"
        style={{
          left: `clamp(0.375rem, ${percentage}%, calc(100% - 0.375rem))`,
          transform: 'translate(-50%, -50%)',
        }}
      />

      {/* 交互层 - 隐藏原生 input */}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerDown={(event) => {
          if (event.pointerType === 'touch') touchStartValue.current = value;
        }}
        onPointerCancel={(event) => {
          // 竖向手势交给页面滚动时，撤回原生 range 在按下瞬间的跳值。
          if (event.pointerType === 'touch') onChange(touchStartValue.current);
        }}
        style={{
          position: 'absolute',
          inset: '0',
          width: '100%',
          height: '100%',
          opacity: 0,
          cursor: 'pointer',
          touchAction: 'pan-y',
          zIndex: 10,
          margin: 0,
          padding: 0,
        }}
      />
    </div>
  );
};

export type { SliderFieldProps };
