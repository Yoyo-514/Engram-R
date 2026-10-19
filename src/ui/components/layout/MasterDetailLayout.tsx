import type { ReactNode, FC, CSSProperties, RefObject } from 'react';

import { useResponsive } from '@/ui/hooks/useResponsive';

import { MobileFullscreenForm } from './MobileFullscreenForm';

interface MasterDetailLayoutProps {
  list: ReactNode;
  detail: ReactNode;
  header?: ReactNode;
  listWidth?: string;
  listRef?: RefObject<HTMLDivElement | null>;
  mobileDetailOpen?: boolean;
  onMobileDetailClose?: () => void;
  mobileDetailTitle?: string;
  mobileDetailActions?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export const MasterDetailLayout: FC<MasterDetailLayoutProps> = ({
  list,
  detail,
  header,
  listRef,
  listWidth = '30%',
  mobileDetailOpen = false,
  onMobileDetailClose,
  mobileDetailTitle = '详情',
  mobileDetailActions,
  className = '',
  style,
}) => {
  const { isMobile } = useResponsive();

  if (isMobile && mobileDetailOpen) {
    return (
      <MobileFullscreenForm
        title={mobileDetailTitle}
        onClose={onMobileDetailClose || (() => {})}
        actions={mobileDetailActions}
      >
        {detail}
      </MobileFullscreenForm>
    );
  }

  return (
    <div className={`flex h-full flex-col overflow-hidden ${className}`} style={style}>
      {header && <div className="mb-4 shrink-0 px-1">{header}</div>}
      <div className="relative flex min-h-0 flex-1 gap-6 overflow-hidden">
        <div
          className={`flex min-h-0 shrink-0 flex-col ${isMobile ? 'w-full' : 'border-r border-border/50 pr-4'}`}
          style={{ width: isMobile ? '100%' : listWidth, minWidth: isMobile ? 'auto' : '240px' }}
          ref={listRef}
        >
          {list}
        </div>
        {!isMobile && detail && (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">{detail}</div>
        )}
      </div>
    </div>
  );
};
