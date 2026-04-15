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
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
            {icon && <span className="text-primary">{icon}</span>}
            {title}
          </h3>
          <button
            onClick={onClose}
            className="hover:bg-muted/50 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
            title="关闭"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body (Scrollable) */}
        <div className="flex-1 overflow-auto">{children}</div>

        {/* Footer (Optional) */}
        {footer && (
          <div className="bg-muted/20 shrink-0 border-t border-border px-4 py-3">{footer}</div>
        )}
      </div>
    </div>
  );
};
