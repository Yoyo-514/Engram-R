import { Cpu, Key, ListTree, Settings, Terminal, type LucideIcon } from 'lucide-react';

interface NavItem {
  id: string;
  icon: LucideIcon;
  label: string;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'memory', icon: ListTree, label: '记忆' },
  { id: 'processing', icon: Cpu, label: '处理' },
  { id: 'presets', icon: Key, label: '模型与提示词' },
  { id: 'devlog', icon: Terminal, label: '日志' },
  { id: 'settings', icon: Settings, label: '设置' },
];

/** 持久化页面和跨模块导航统一从这里解析，已撤销的页面回到记忆列表。 */
export function resolveTab(path: string): string {
  const tab = path.replace(/^\//, '');
  const page = tab.split(':')[0];
  return NAV_ITEMS.some((item) => item.id === page) ? tab : 'memory';
}
