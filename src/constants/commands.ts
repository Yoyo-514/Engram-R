/**
 * Command Palette 命令配置
 */
import { Settings, Home } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface CommandItem {
  id: string;
  icon: LucideIcon;
  label: string;
  description?: string;
  action: (navigate: (path: string) => void) => void;
  keywords: string[]; // 用于搜索匹配
  type: 'navigation' | 'action';
}

export const COMMANDS: CommandItem[] = [
  // Sub-view Navigation (Deep Links)
  // These are NOT in the main sidebar, so we keep them here.
  {
    id: 'nav-prompt',
    icon: Settings,
    label: '管理提示词模板',
    description: '编辑和导入 Prompt 模板',
    action: (nav) => nav('presets:prompt'),
    keywords: ['prompt', 'template', '提示词', '模板'],
    type: 'navigation',
  },
  {
    id: 'nav-regex',
    icon: Settings,
    label: '管理正则脚本',
    description: '配置自定义 Regex 替换规则',
    action: (nav) => nav('presets:regex'),
    keywords: ['regex', 'rule', '正则', '脚本'],
    type: 'navigation',
  },
  {
    id: 'nav-worldbook',
    icon: Home,
    label: '世界书配置',
    description: '管理 World Info 和 Lorebook',
    action: (nav) => nav('presets:worldbook'),
    keywords: ['world', 'book', 'lore', '世界书'],
    type: 'navigation',
  },
];
