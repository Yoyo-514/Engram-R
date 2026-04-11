// Engram 常量配置
export * from './navigation';

import manifest from '../../manifest.json';

/** 版本号 */
export const VERSION = manifest.version;

/** Bridge 层使用的 DOM 与面板常量 */
export const ENGRAM_PANEL_ID = 'engram-panel-root';
export const ENGRAM_DRAWER_ID = 'engram-drawer';
export const ENGRAM_GLOBAL_OVERLAY_ID = 'engram-global-overlay';

export const DOM_IDS = {
  TOP_SETTINGS_HOLDER: '#top-settings-holder',
  WI_SP_BUTTON: '#WI-SP-button',
  LEFT_SEND_FORM: '#leftSendForm',
  QUICK_PANEL_TRIGGER: 'engram-quick-panel-trigger',
};
