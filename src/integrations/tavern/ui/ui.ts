import { DOM_IDS, ENGRAM_DRAWER_ID, ENGRAM_GLOBAL_OVERLAY_ID, ENGRAM_PANEL_ID } from './constants';

export type ReactRenderer = (
  container: HTMLElement,
  onClose: () => void
) => { unmount?: () => void } | void;

// 入口先注册渲染器，再初始化宿主挂载节点。
let reactRenderer: ReactRenderer;
let globalRenderer: ReactRenderer;
let globalRoot: { unmount?: () => void } | null = null;
let panelElement: HTMLElement | null = null;
let reactRoot: { unmount?: () => void } | null = null;

export function setReactRenderer(renderer: ReactRenderer): void {
  reactRenderer = renderer;
}

export function setGlobalRenderer(renderer: ReactRenderer): void {
  globalRenderer = renderer;
}

/** 审阅弹窗独立于主面板，始终保留一个全局挂载点。 */
export function mountGlobalOverlay(): void {
  if (globalRoot) return;

  const overlay = document.createElement('div');
  overlay.id = ENGRAM_GLOBAL_OVERLAY_ID;
  overlay.className = 'pointer-events-none fixed inset-0 z-[11000] engram-app-root';
  document.body.appendChild(overlay);
  globalRoot = globalRenderer(overlay, () => {}) ?? null;
}

/** 将主面板入口放在酒馆顶栏，沿用宿主的 drawer 结构。 */
export function createTopBarButton(): void {
  const holder = document.querySelector(DOM_IDS.TOP_SETTINGS_HOLDER);
  if (!holder) return;

  const drawer = document.createElement('div');
  drawer.id = ENGRAM_DRAWER_ID;
  drawer.className = 'drawer';

  const toggle = document.createElement('div');
  toggle.className = 'drawer-toggle drawer-header';

  const icon = document.createElement('div');
  icon.id = 'engram-drawer-icon';
  icon.className = 'drawer-icon fa-solid fa-e fa-fw closedIcon';
  icon.title = 'Engram 记忆管理';
  icon.addEventListener('click', toggleMainPanel);

  toggle.appendChild(icon);
  drawer.appendChild(toggle);

  const wiButton = document.querySelector(DOM_IDS.WI_SP_BUTTON);
  if (wiButton) {
    holder.insertBefore(drawer, wiButton);
  } else {
    holder.appendChild(drawer);
  }
}

export function openMainPanel(): void {
  if (panelElement) return;

  panelElement = document.createElement('div');
  panelElement.id = ENGRAM_PANEL_ID;
  panelElement.className =
    'fixed inset-0 z-[10000] flex h-dvh w-screen flex-col overflow-hidden bg-background text-foreground engram-app-root';
  document.body.appendChild(panelElement);
  reactRoot = reactRenderer(panelElement, closeMainPanel) ?? null;
}

export function closeMainPanel(): void {
  if (!panelElement) return;

  reactRoot?.unmount?.();
  reactRoot = null;
  panelElement.remove();
  panelElement = null;
}

export function toggleMainPanel(): void {
  if (panelElement) {
    closeMainPanel();
  } else {
    openMainPanel();
  }
}
