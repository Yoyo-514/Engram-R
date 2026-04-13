/**
 * STBridge - SillyTavern API 桥接层
 *
 * 这是唯一与 SillyTavern 直接交互的模块。
 * 所有 window.SillyTavern、jQuery、eventSource 的调用都在这里统一管理。
 */
import { Logger } from '@/core/logger';
import { SettingsManager } from '@/config/settings';
import { regexProcessor } from '@/modules/workflow/steps';
import { summarizerService, entityBuilder } from '@/modules/memory';
import {
  checkTavernIntegration,
  createTopBarButton,
  MacroServiceInit,
  mountGlobalOverlay,
  toggleMainPanel,
  WorldBookSlotService,
  initQuickPanelButton,
} from '@/integrations/tavern';
import { ThemeManager } from '@/ui/services';
import { injector } from '@/modules/rag';
import { CharacterDeleteService } from '@/data/CharacterCleanup';
import { setupKeyboardShortcuts } from '@/core/utils';
import { openCommandPalette, toggleQuickPanel } from '@/index';

/**
 * 初始化 Engram 插件
 */
export async function initializeEngram(): Promise<void> {
  // 初始化日志系统
  Logger.init();

  Logger.info('STBridge', 'Engram 插件正在初始化...');

  // 初始化设置管理器
  const settingsReady = await SettingsManager.initSettings();
  if (settingsReady) {
    Logger.info('STBridge', 'SettingsManager 初始化完成');
  } else {
    Logger.warn('STBridge', 'SettingsManager 初始化超时，后续流程将使用回退配置');
  }

  // 加载保存的正则规则到全局处理器
  const savedRegexRules = SettingsManager.getRegexRules();
  if (savedRegexRules && savedRegexRules.length > 0) {
    regexProcessor.setRules(savedRegexRules);
    Logger.info('STBridge', `已加载 ${savedRegexRules.length} 条正则规则`);
  }

  // 检查酒馆接口对接状态
  try {
    const tavernStatus = await checkTavernIntegration();
    Logger.info('TavernAPI', '酒馆接口对接状态', tavernStatus);
  } catch (e) {
    Logger.warn('TavernAPI', '酒馆接口检查失败', { error: String(e) });
  }

  // 启动 Summarizer 服务
  try {
    await summarizerService.start();
    const status = summarizerService.getStatus();
    Logger.info('Summarizer', '服务已启动', status);
  } catch (e) {
    Logger.warn('Summarizer', '服务启动失败', { error: String(e) });
  }

  // Start Entity Extraction Service (V0.9.14)
  try {
    entityBuilder.start();
    Logger.info('EntityBuilder', 'Service started');
  } catch (e) {
    Logger.warn('EntityBuilder', 'Service start failed', { error: String(e) });
  }

  // 优先使用顶栏按钮，找不到则使用悬浮球
  createTopBarButton();

  // 初始化主题系统
  ThemeManager.init();

  // Initialize Injector Service (V0.4 - Dynamic Context)
  try {
    injector.init();
    Logger.info('Injector', '注入服务初始化完成');
  } catch (e) {
    Logger.warn('Injector', '注入服务初始化失败', { error: String(e) });
  }

  // Initialize MacroService (Global ST Macros) and Worldbook Slot
  try {
    await WorldBookSlotService.init();
    await MacroServiceInit();
  } catch (e) {
    Logger.warn('MacroService', '宏服务/世界书初始化失败', { error: String(e) });
  }

  // V0.8: Initialize QR 栏快捷按钮
  try {
    initQuickPanelButton();
    Logger.info('QuickPanelButton', 'QR 栏按钮初始化完成');
  } catch (e) {
    Logger.warn('QuickPanelButton', 'QR 栏按钮初始化失败', { error: String(e) });
  }

  // 挂载全局悬浮层 (用于修订弹窗等)
  mountGlobalOverlay();

  // 初始化角色删除联动服务
  try {
    CharacterDeleteService.init();
    Logger.info('STBridge', '角色联动清理服务初始化完成');
  } catch (e) {
    Logger.warn('STBridge', '角色联动清理服务初始化失败', { error: String(e) });
  }

  // V0.9.5: 初始化键盘快捷键
  try {
    setupKeyboardShortcuts({
      toggleMainPanel: toggleMainPanel,
      toggleQuickPanel: toggleQuickPanel,
      openCommandPalette: openCommandPalette,
    });
    Logger.info('STBridge', '键盘快捷键初始化完成');
  } catch (e) {
    Logger.warn('STBridge', '键盘快捷键初始化失败', { error: String(e) });
  }

  Logger.success('STBridge', 'Engram 初始化完成 - Where memories leave their trace.');
}
