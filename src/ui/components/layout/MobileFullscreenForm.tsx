import { ArrowLeft } from 'lucide-react';
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
  const content = (
    <div className="engram-app-root" style={{ display: 'contents' }}>
      <div
        className="engram-acrylic animate-in fixed inset-0 z-[99999] flex flex-col text-foreground"
        style={{ width: '100vw', height: '100dvh' }}
      >
        {/* 头部 */}
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
          <button onClick={onClose} aria-label="返回列表" className="rounded p-1 hover:bg-accent">
            <ArrowLeft size={20} />
          </button>
          <h2 className="min-w-0 flex-1 break-words text-lg font-light">{title}</h2>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>

        {/* 内容区域 */}
        <div className="no-scrollbar flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );

  // 为了完全覆盖所有 SillyTavern UI（包括 header 和其他 fixed 元素），将全屏表单直接渲染到 document.body
  return createPortal(content, document.body);
};
