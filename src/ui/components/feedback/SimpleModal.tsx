import { X } from 'lucide-react';
import type { ReactNode, FC } from 'react';

interface SimpleModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string | ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: string; // e.g., 'max-w-md', 'max-w-2xl'
}

/**
 * 通用简易模态框组件 (SimpleModal)
 * 提供标准的居中弹窗, 半透明遮罩, 标题栏和关闭按钮
 */
export const SimpleModal: FC<SimpleModalProps> = ({
  isOpen,
  onClose,
  title,
  icon,
  children,
  footer,
  maxWidth = 'max-w-md',
}) => {
  if (!isOpen) return null;

  return (
    <div className="animate-in fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm duration-200">
      <div
        className={`w-full ${maxWidth} flex max-h-[90vh] flex-col rounded-lg border border-border bg-background shadow-xl`}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h3 className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium text-foreground">
            {icon && <span className="shrink-0 text-primary">{icon}</span>}
            <span className="min-w-0 break-words">{title}</span>
          </h3>
          <button
            onClick={onClose}
            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            title="关闭"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body (Scrollable) */}
        <div className="flex-1 overflow-auto">{children}</div>

        {/* Footer (Optional) */}
        {footer && (
          <div className="shrink-0 border-t border-border bg-muted/20 px-4 py-3">{footer}</div>
        )}
      </div>
    </div>
  );
};
