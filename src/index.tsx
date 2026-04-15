/**
 * Engram - Graph RAG 记忆操作系统
 * 入口文件
 */

import { createElement } from 'react';
import { createRoot } from 'react-dom/client';

import {
  initializeEngram,
  setGlobalRenderer,
  setReactRenderer,
  setQuickPanelCallback,
} from '@/integrations/tavern';
import { GlobalOverlayContent } from '@/ui/components/overlay/GlobalOverlayContent';

import App from './App';

import './ui/styles/main.css';

// 全局 QuickPanel 状态
let quickPanelOpen = false;
let setQuickPanelOpenCallback: ((open: boolean) => void) | null = null;

// 全局 CommandPalette 控制
let openCommandPaletteCallback: (() => void) | null = null;

/**
 * 切换快捷面板（供键盘快捷键调用）
 */
export function toggleQuickPanel(): void {
  if (setQuickPanelOpenCallback) {
    quickPanelOpen = !quickPanelOpen;
    setQuickPanelOpenCallback(quickPanelOpen);
  }
}

/**
 * 打开命令面板（供键盘快捷键调用）
 */
export function openCommandPalette(): void {
  if (openCommandPaletteCallback) {
    openCommandPaletteCallback();
  }
}

/**
 * 设置 CommandPalette 打开回调
 */
export function setCommandPaletteCallback(callback: () => void): void {
  openCommandPaletteCallback = callback;
}

// 设置 React 渲染器
setReactRenderer((container: HTMLElement, onClose: () => void) => {
  const root = createRoot(container);
  root.render(createElement(App, { onClose }));
  return root;
});

// 设置全局渲染器 (RevisionModal + QuickPanel)
setGlobalRenderer((container: HTMLElement) => {
  const root = createRoot(container);
  root.render(
    <GlobalOverlayContent
      initialQuickPanelOpen={quickPanelOpen}
      onQuickPanelStateChange={(setter) => {
        setQuickPanelOpenCallback = setter;
      }}
    />
  );
  return root;
});

// 设置 QuickPanel 按钮回调
setQuickPanelCallback(() => {
  if (setQuickPanelOpenCallback) {
    setQuickPanelOpenCallback(true);
  }
});

// 等待 DOM 加载完成后初始化
const initEngramOnLoad = () => {
  void initializeEngram();
  document.removeEventListener('DOMContentLoaded', initEngramOnLoad);
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initEngramOnLoad);
} else {
  void initializeEngram();
}

// Engram initialization handled in STBridge
