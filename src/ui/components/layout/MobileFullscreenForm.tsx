import { ArrowLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ReactNode, FC } from 'react';
import { createPortal } from 'react-dom';

interface MobileFullscreenFormProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
}

export const MobileFullscreenForm: FC<MobileFullscreenFormProps> = ({
  title,
  onClose,
  children,
  actions,
}) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // 组件卸载时可能需要锁定背景滚动，但为了不干涉全局先保持简单
    return () => setMounted(false);
  }, []);

  const content = (
    <div className="engram-app-root" style={{ display: 'contents' }}>
      <div
        className="animate-in slide-in-from-right-4 bg-background/95 fixed inset-0 z-[99999] flex flex-col text-foreground backdrop-blur-3xl duration-200"
        style={{ width: '100vw', height: '100dvh' }}
      >
        {/* 头部 */}
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
          <button onClick={onClose} className="rounded p-1 hover:bg-accent">
            <ArrowLeft size={20} />
          </button>
          <h2 className="flex-1 text-lg font-light">{title}</h2>
          {actions}
        </div>

        {/* 内容区域 */}
        <div className="no-scrollbar flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );

  // 为了完全覆盖所有 SillyTavern UI（包括 header 和其他 fixed 元素），将全屏表单直接渲染到 document.body
  if (!mounted) return null;
  return createPortal(content, document.body);
};
