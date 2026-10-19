/** 初始化酒馆集成与记忆服务。 */
import { getRegexRules, initSettings } from '@/config/settings';
import { Logger } from '@/core/logger';
import { initCharacterDeleteService } from '@/data/CharacterCleanup';
import {
  checkTavernIntegration,
  createTopBarButton,
  MacroServiceInit,
  mountGlobalOverlay,
  initWorldBookSlot,
} from '@/integrations/tavern';
import { summarizerService, entityBuilder } from '@/modules/memory';
import { injector } from '@/modules/rag';
import { regexProcessor } from '@/modules/workflow/steps';

/**
 * 初始化 Engram 插件
 */
export async function initializeEngram(): Promise<void> {
  // 初始化日志系统
  Logger.init();

  Logger.info('STBridge', 'Engram 插件正在初始化...');

  // 初始化设置管理器
  const settingsReady = await initSettings();
  if (settingsReady) {
    Logger.info('STBridge', 'SettingsManager 初始化完成');
  } else {
    Logger.warn('STBridge', 'SettingsManager 初始化超时，后续流程将使用回退配置');
  }

  // 加载保存的正则规则到全局处理器
  const savedRegexRules = getRegexRules();
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

  // 启动实体提取服务
  try {
    entityBuilder.start();
    Logger.info('EntityBuilder', 'Service started');
  } catch (e) {
    Logger.warn('EntityBuilder', 'Service start failed', { error: String(e) });
  }

  // 创建酒馆顶栏入口
  createTopBarButton();

  // 启动动态上下文注入
  try {
    injector.init();
    Logger.info('Injector', '注入服务初始化完成');
  } catch (e) {
    Logger.warn('Injector', '注入服务初始化失败', { error: String(e) });
  }

  // 初始化宏服务与世界书插槽
  try {
    await initWorldBookSlot();
    await MacroServiceInit();
  } catch (e) {
    Logger.warn('MacroService', '宏服务/世界书初始化失败', { error: String(e) });
  }

  // 挂载全局悬浮层 (用于修订弹窗等)
  mountGlobalOverlay();

  // 初始化角色删除联动服务
  try {
    initCharacterDeleteService();
    Logger.info('STBridge', '角色联动清理服务初始化完成');
  } catch (e) {
    Logger.warn('STBridge', '角色联动清理服务初始化失败', { error: String(e) });
  }

  Logger.success('STBridge', 'Engram 初始化完成 - Where memories leave their trace.');
}
