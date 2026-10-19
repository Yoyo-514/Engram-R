import { useSyncExternalStore } from 'react';
import type { FC } from 'react';
import { createPortal } from 'react-dom';

import { TabPills, type TabPillsProps } from './TabPills';

/** 将页面标签渲染到应用壳层的页头扩展区域。 */
export const LayoutTabs: FC<TabPillsProps> = (props) => {
  // 首次渲染时页头尚未提交到 DOM，提交后重新读取挂载点。
  const mounted = useSyncExternalStore(
    (notify) => {
      notify();
      return () => {};
    },
    () => document.getElementById('engram-header-extension') !== null,
    () => false
  );

  const container = document.getElementById('engram-header-extension');

  if (!mounted || !container) {
    return null;
  }

  const headerProps = {
    ...props,
    sticky: false,
    className: `!mb-0 !border-0 !bg-transparent px-4 ${props.className || ''}`,
  };

  return createPortal(<TabPills {...headerProps} />, container);
};
