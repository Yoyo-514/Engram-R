import { GripVertical, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FC, MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface FloatingPanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  initialPosition?: { x: number; y: number };
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  resizable?: boolean;
}

export const FloatingPanel: FC<FloatingPanelProps> = ({
  isOpen,
  onClose,
  title,
  children,
  initialPosition,
  width: initialWidth = 320,
  minWidth = 280,
  maxWidth = 600,
  minHeight = 150,
  resizable = true,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(initialPosition ?? { x: 100, y: 100 });
  const [size, setSize] = useState<{ width: number; height: number | 'auto' }>({
    width: initialWidth,
    height: 'auto',
  });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const resizeStart = useRef({ width: 0, height: 0, x: 0, y: 0 });
  const positionRef = useRef(position);
  positionRef.current = position;

  useEffect(() => {
    if (isOpen && !initialPosition) {
      setPosition({
        x: Math.max(50, (window.innerWidth - initialWidth) / 2),
        y: Math.max(50, window.innerHeight - 450),
      });
    }
  }, [initialPosition, initialWidth, isOpen]);

  useEffect(() => {
    const handleWindowResize = () => {
      if (!panelRef.current) {
        return;
      }

      const currentWidth = size.width;
      const nextPosition = positionRef.current;
      const newX = Math.max(0, Math.min(window.innerWidth - currentWidth, nextPosition.x));
      const newY = Math.max(0, Math.min(window.innerHeight - 100, nextPosition.y));

      if (newX !== nextPosition.x || newY !== nextPosition.y) {
        setPosition({ x: newX, y: newY });
      }
    };

    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, [size.width]);

  const handleMouseDown = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (!panelRef.current) {
      return;
    }

    const rect = panelRef.current.getBoundingClientRect();
    dragOffset.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback(
    (event: globalThis.MouseEvent) => {
      if (isDragging) {
        const newX = Math.max(
          0,
          Math.min(window.innerWidth - size.width, event.clientX - dragOffset.current.x)
        );
        const newY = Math.max(
          0,
          Math.min(window.innerHeight - 100, event.clientY - dragOffset.current.y)
        );
        setPosition({ x: newX, y: newY });
        return;
      }

      if (isResizing && panelRef.current) {
        const deltaX = event.clientX - resizeStart.current.x;
        const deltaY = event.clientY - resizeStart.current.y;
        const newWidth = Math.max(minWidth, Math.min(maxWidth, resizeStart.current.width + deltaX));
        const newHeight = Math.max(minHeight, resizeStart.current.height + deltaY);
        setSize({ width: newWidth, height: newHeight });
      }
    },
    [isDragging, isResizing, maxWidth, minHeight, minWidth, size.width]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsResizing(false);
  }, []);

  const handleResizeStart = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!panelRef.current) {
      return;
    }

    const rect = panelRef.current.getBoundingClientRect();
    resizeStart.current = {
      width: rect.width,
      height: rect.height,
      x: event.clientX,
      y: event.clientY,
    };
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isDragging && !isResizing) {
      return;
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp, isDragging, isResizing]);

  if (!isOpen) {
    return null;
  }

  return createPortal(
    <div className="engram-app-root" style={{ display: 'contents' }}>
      <div
        ref={panelRef}
        className="engram-animate-scale-in fixed z-[11000] flex flex-col overflow-hidden rounded-lg border border-border shadow-2xl"
        style={{
          left: position.x,
          top: position.y,
          width: size.width,
          height: size.height === 'auto' ? 'auto' : size.height,
          minHeight,
          backgroundColor: 'var(--popover, #1a1a2e)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        }}
      >
        <div
          className="flex select-none items-center justify-between border-b border-border px-3 py-2"
          onMouseDown={handleMouseDown}
          style={{
            cursor: isDragging ? 'grabbing' : 'grab',
            backgroundColor: 'var(--surface, rgba(255,255,255,0.05))',
          }}
        >
          <div className="flex items-center gap-2">
            <GripVertical size={14} className="text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">{title}</span>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground transition-all duration-[var(--duration-fast)] hover:rotate-90 hover:bg-accent hover:text-foreground"
            style={{ backgroundColor: 'transparent' }}
            aria-label="关闭"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-3">{children}</div>

        {resizable && (
          <div
            className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize"
            onMouseDown={handleResizeStart}
            style={{
              background: 'linear-gradient(135deg, transparent 50%, var(--border, #333) 50%)',
            }}
          />
        )}
      </div>
    </div>,
    document.body
  );
};
