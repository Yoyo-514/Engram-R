import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode, FC, CSSProperties, RefObject } from 'react';

import { useConfigStore } from '@/state/configStore';
import { useResponsive } from '@/ui/hooks/useResponsive';

import { MobileFullscreenForm } from './MobileFullscreenForm';

interface MasterDetailLayoutProps {
  /** 列表区域内容 */
  list: ReactNode;
  /** 详情区域内容 */
  detail: ReactNode;
  /** 顶部工具栏/搜索栏 (可选) */
  header?: ReactNode;
  /** PC端列表宽度，默认 '30%'，最小 '240px' */
  listWidth?: string;
  /** 列表区域 Ref (用于控制滚动) */
  listRef?: RefObject<HTMLDivElement | null>;

  // --- 移动端相关配置 ---

  /** 移动端详情页是否打开 */
  mobileDetailOpen?: boolean;
  /** 移动端关闭详情页回调 */
  onMobileDetailClose?: () => void;
  /** 移动端详情页标题 */
  mobileDetailTitle?: string;
  /** 移动端详情页顶部操作按钮 */
  mobileDetailActions?: ReactNode;

  /** 容器类名 */
  className?: string;
  /** 内联样式 */
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
  const enableAnimations = useConfigStore((state) => state.enableAnimations);

  // 移动端全屏详情页
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
      {/* 顶部工具栏 (搜索框等) */}
      {header && <div className="mb-4 shrink-0 px-1">{header}</div>}

      {/* 主内容区 - 双栏布局 */}
      <div className="relative flex min-h-0 flex-1 gap-6 overflow-hidden">
        {/* 左侧：列表区域 - 使用 framer-motion layout 平滑改变宽度 */}
        <motion.div
          layout={enableAnimations}
          initial={false}
          animate={{
            width: isMobile ? '100%' : listWidth,
            minWidth: isMobile ? 'auto' : '240px',
          }}
          transition={
            enableAnimations ? { type: 'spring', bounce: 0.1, duration: 0.4 } : { duration: 0 }
          }
          className={`flex min-h-0 shrink-0 flex-col ${isMobile ? 'w-full' : 'border-border/50 border-r pr-4'} `}
          ref={listRef}
        >
          {list}
        </motion.div>

        {/* 右侧：详情区域 - 优雅滑入进场 */}
        {!isMobile && (
          <>
            {enableAnimations ? (
              <AnimatePresence mode="wait">
                {detail && (
                  <motion.div
                    key="detail-pane"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20, position: 'absolute', right: 0 }}
                    transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
                    className="flex min-h-0 min-w-0 flex-1 flex-col"
                  >
                    {detail}
                  </motion.div>
                )}
              </AnimatePresence>
            ) : (
              detail && (
                <div key="detail-pane" className="flex min-h-0 min-w-0 flex-1 flex-col">
                  {detail}
                </div>
              )
            )}
          </>
        )}
      </div>
    </div>
  );
};
