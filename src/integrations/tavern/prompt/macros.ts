import { DEFAULT_ENTITY_INJECT_LIMIT, DEFAULT_RERANK_CONFIG } from '@/config/rag/defaults';
import { get, subscribe } from '@/config/settings';
import { Logger } from '@/core/logger';
import { getCurrentTavernCharacter } from '@/core/utils';
import { getLiveActivatedWorldInfo } from '@/integrations/tavern';
import { recallCache } from '@/modules/rag';
import { useMemoryStore } from '@/state/memoryStore';
import type { CustomMacro } from '@/types/macro';

import { getChatHistory } from '../chat/chatHistory';
import { getSTContext } from '../core/context';

/**
 * MacroService 类
 * 注册 Engram 宏与缓存刷新。
 */
let isInitialized = false;

/**
 * 初始化并注册所有 Engram 宏
 */
export async function MacroServiceInit(): Promise<void> {
  if (isInitialized) return;

  try {
    const context = getSTContext();

    if (!context?.registerMacro) {
      Logger.warn('MacroService', 'SillyTavern registerMacro API 不可用');
      return;
    }

    // --- 注册宏 ---

    // --- 注册宏 ---

    // {{engramSummaries}} - 从 IndexedDB 获取当前聊天的所有事件摘要
    registerMacro(
      'engramSummaries',
      () => {
        // 宏替换是同步的，使用缓存值
        return cachedSummaries;
      },
      'Engram: 当前聊天的所有事件摘要 (从 IndexedDB)'
    );

    // {{worldbookContext}} - 获取激活的世界书内容
    registerMacro(
      'worldbookContext',
      () => {
        // 宏替换是同步的，使用缓存值
        return cachedWorldbookContext;
      },
      'Engram: 当前激活的世界书内容'
    );

    // {{userInput}} - 当前用户输入
    registerMacro(
      'userInput',
      () => {
        return cachedUserInput;
      },
      'Engram: 当前用户输入'
    );

    // {{chatHistory}} - 最近对话历史 (从配置读取 floorInterval - bufferSize)
    registerMacro(
      'chatHistory',
      () => {
        return getChatHistory();
      },
      'Engram: 最近对话历史 (从总结配置读取数量)'
    );

    // {{context}} - 角色卡设定（同酒馆 description）
    registerMacro(
      'context',
      () => {
        return cachedCharDescription;
      },
      'Engram: 角色卡设定'
    );

    // {{engramGraph}} - 事件和实体的结构化 JSON
    registerMacro(
      'engramGraph',
      () => {
        return cachedGraphData;
      },
      'Engram: 事件和实体的结构化 JSON (用于图谱构建)'
    );

    // {{engramArchivedSummaries}} - 已归档的历史摘要 (绿灯事件)
    registerMacro(
      'engramArchivedSummaries',
      () => {
        return cachedArchivedSummaries;
      },
      'Engram: 已归档的历史摘要 (绿灯事件)'
    );

    // {{userPersona}} - 用户角色设定
    registerMacro(
      'userPersona',
      () => {
        // 实时优先：由于人设切换频繁，此处优先读取酒馆原生变量
        const liveDescription = getSTContext()?.powerUserSettings?.persona_description;
        return typeof liveDescription === 'string' ? liveDescription : cachedUserPersona;
      },
      'Engram: 用户角色设定 (酒馆 Persona Description)'
    );

    // {{engramEntityStates}} - 实体状态
    registerMacro(
      'engramEntityStates',
      () => {
        return cachedEntityStates;
      },
      'Engram: 实体状态 (角色/场景/物品)'
    );

    isInitialized = true;
    Logger.success('MacroService', '全局宏已注册', {
      macros: [
        '{{engramSummaries}}',
        '{{worldbookContext}}',
        '{{userInput}}',
        '{{chatHistory}}',
        '{{context}}',
        '{{engramGraph}}',
        '{{engramArchivedSummaries}}',
        '{{userPersona}}',
        '{{engramEntityStates}}',
      ],
    });

    // 初始化缓存
    await refreshCache();

    // 监听聊天切换事件，刷新缓存
    const eventSource = context.eventSource;
    if (eventSource) {
      eventSource.on('chat_id_changed', () => {
        Logger.info('MacroService', '聊天切换，清理旧缓存');
        clearCache();
        refreshCache().catch((e) => Logger.warn('MacroService', '刷新缓存失败', e));
      });

      // 监听酒馆设置更新（通常包含人设描述变更）
      eventSource.on('settings_updated', () => {
        refreshCache().catch((e) => Logger.warn('MacroService', '酒馆设置更新后刷新缓存失败', e));
      });
    }

    // 监听 Engram 自身设置更新，避免 worldbookContext 使用陈旧缓存
    // 例如关闭世界书主开关 / EJS 开关后，宏应立即反映最新配置
    subscribe(() => {
      cachedWorldbookContext = '';
      refreshWorldbookCache().catch((e) =>
        Logger.warn('MacroService', 'Engram 设置更新后刷新世界书缓存失败', e)
      );
      refreshUserPersona();
      refreshCustomMacros();
    });
  } catch (e) {
    Logger.error('MacroService', '初始化失败', e);
  }
}

// --- 缓存 ---
let cachedSummaries: string = '';
let cachedWorldbookContext: string = '';
let cachedUserInput: string = '';
let cachedCharDescription: string = '';
// 图谱数据缓存
let cachedGraphData: string = '';
// 新增缓存
let cachedArchivedSummaries: string = '';
let cachedUserPersona: string = '';
// 自定义宏缓存
let cachedCustomMacros: Map<string, string> = new Map();
// 实体状态缓存
let cachedEntityStates: string = '';

/**
 * 获取缓存的事件摘要
 */
export function getSummaries(): string {
  return cachedSummaries;
}

/**
 * 获取缓存的实体状态
 */
export function getEntityStates(): string {
  return cachedEntityStates;
}

/**
 * 获取缓存的世界书上下文
 */
export function getWorldbookContext(): string {
  return cachedWorldbookContext;
}

/**
 * 设置用户输入（生成前缓存）
 */
export function setUserInput(input: string): void {
  cachedUserInput = input;
}

/**
 * 刷新所有缓存 (包括耗时的世界书扫描)
 * @param recalledIds 可选，RAG 召回的事件 ID 列表
 */
export async function refreshCache(recalledIds?: string[]): Promise<void> {
  await Promise.all([refreshEngramCache(recalledIds), refreshWorldbookCache()]);

  // 刷新用户设定 (轻量)
  refreshUserPersona();
  // 刷新自定义宏 (轻量)
  refreshCustomMacros();
}

/**
 * 清理所有缓存 (防止跨角色/对话泄露)
 */
export function clearCache(): void {
  cachedSummaries = '';
  cachedWorldbookContext = '';
  cachedUserInput = '';
  cachedCharDescription = '';
  cachedGraphData = '';
  cachedArchivedSummaries = '';
  cachedUserPersona = '';
  cachedCustomMacros.clear();
  cachedEntityStates = '';
}

/**
 * 仅刷新 Engram 相关的 DB 缓存 (快速)
 * 用于 Pipeline 结束后的快速更新，避免触发全量世界书扫描
 *
 * 未显式传入 recalledIds 时使用本轮近期召回记录。
 */
export async function refreshEngramCache(recalledIds?: string[]): Promise<void> {
  try {
    const store = useMemoryStore.getState();

    let effectiveRecalledIds = recalledIds;
    let effectiveEntityIds: string[] | undefined = undefined;

    try {
      // 动态导入避免循环依赖
      const snapshot = recallCache.getSnapshot(getSTContext()?.chatId);

      // 事件按注入上限（rerankConfig.topN）截断，避免短时记忆槽位全量放行归档事件
      if (!effectiveRecalledIds && snapshot.length > 0) {
        const rerankSettings = get('runtimeSettings')?.rerankConfig;
        const injectLimit = Math.max(1, rerankSettings?.topN ?? DEFAULT_RERANK_CONFIG.topN);
        effectiveRecalledIds = snapshot
          .filter((slot) => slot.category === 'event')
          .slice(0, injectLimit)
          .map((slot) => slot.id);
      }

      // 提取实体 ID（注入上限，防止实体状态文本撑爆 token）
      effectiveEntityIds = snapshot
        .filter((slot) => slot.category === 'entity')
        .slice(0, DEFAULT_ENTITY_INJECT_LIMIT)
        .map((slot) => slot.id);
    } catch (e) {
      Logger.debug('MacroService', '近期召回缓存获取失败，跳过', e);
    }

    // 1. 刷新事件摘要（带召回 ID）
    cachedSummaries = await store.getEventSummaries(effectiveRecalledIds);

    // 2. 刷新归档摘要
    await refreshArchivedSummaries();

    // 3. 刷新实体状态 (带召回 ID)
    cachedEntityStates = await store.getEntityStates(effectiveEntityIds);

    // 5. 刷新图谱数据 (可选，视性能而定)

    Logger.debug('MacroService', 'Engram DB 缓存已刷新', {
      summariesLength: cachedSummaries.length,
      recalledCount: effectiveRecalledIds?.length ?? 0,
    });
  } catch (e) {
    Logger.warn('MacroService', '刷新 Engram DB 缓存失败', e);
  }
}

/**
 * 仅刷新世界书上下文 (耗时操作)
 * 涉及全量历史扫描，仅在初始化或明确需要时调用
 */
export async function refreshWorldbookCache(): Promise<void> {
  try {
    // 刷新世界书上下文
    cachedWorldbookContext = await getLiveActivatedWorldInfo();

    // 刷新角色描述
    refreshCharDescription();

    Logger.debug('MacroService', '世界书上下文已刷新', {
      worldbookLength: cachedWorldbookContext.length,
    });
  } catch (e) {
    Logger.debug('MacroService', '获取世界书内容失败', e);
    cachedWorldbookContext = '';
  }
}

/**
 * 使用 RAG 召回的节点刷新缓存
 * 复用 getEventSummaries 逻辑，修复召回条目覆盖蓝灯事件和乱序问题
 * @param nodes RAG 召回的事件节点
 */
export async function refreshCacheWithNodes(
  nodes: { id: string; summary: string }[]
): Promise<void> {
  try {
    const recalledIds = nodes.map((n) => n.id);
    const store = useMemoryStore.getState();

    // 1. 刷新事件摘要
    cachedSummaries = await store.getEventSummaries(recalledIds);

    // 2. 同步刷新实体状态（注入上限）
    try {
      const entityIds = recallCache
        .getSnapshot(getSTContext()?.chatId)
        .filter((slot) => slot.category === 'entity')
        .slice(0, DEFAULT_ENTITY_INJECT_LIMIT)
        .map((slot) => slot.id);
      cachedEntityStates = await store.getEntityStates(entityIds);
    } catch (e) {
      Logger.debug('MacroService', '刷新召回实体状态失败', e);
    }

    // RAG 召回只影响 Engram 侧摘要/实体状态，不必在发送前重复扫描世界书。
    // 保留已有 worldbook 缓存，可显著降低生成前的主线程阻塞。
    refreshCharDescription();
    refreshUserPersona();
    refreshCustomMacros();

    Logger.debug('MacroService', 'RAG 召回缓存已刷新', {
      summariesLength: cachedSummaries.length,
      entityStatesLength: cachedEntityStates.length,
      recalledCount: recalledIds.length,
    });
  } catch (e) {
    Logger.warn('MacroService', '刷新 RAG 召回缓存失败', e);
  }
}

/**
 * 刷新角色描述缓存
 */
export function refreshCharDescription(): void {
  try {
    const char = getCurrentTavernCharacter(getSTContext());
    cachedCharDescription = char?.description || '';
  } catch (e) {
    Logger.debug('MacroService', '刷新角色描述失败', e);
  }
}

/**
 * 刷新归档摘要缓存
 * 仅返回 is_archived=true 的事件摘要
 */
export async function refreshArchivedSummaries(): Promise<void> {
  try {
    const store = useMemoryStore.getState();
    cachedArchivedSummaries = await store.getArchivedEventSummaries();
    Logger.debug('MacroService', '归档摘要缓存已刷新', {
      length: cachedArchivedSummaries.length,
    });
  } catch (e) {
    Logger.warn('MacroService', '刷新归档摘要失败', e);
    cachedArchivedSummaries = '';
  }
}

/**
 * 刷新用户设定缓存
 * 从酒馆 power_user.persona_description 读取
 */
export function refreshUserPersona(): void {
  try {
    const powerUser = getSTContext()?.powerUserSettings;
    cachedUserPersona = powerUser?.persona_description || '';
    Logger.debug('MacroService', '用户设定缓存已刷新', {
      length: cachedUserPersona.length,
    });
  } catch (e) {
    Logger.debug('MacroService', '刷新用户设定失败', e);
    cachedUserPersona = '';
  }
}

/**
 * 刷新并注册自定义宏
 * 从 runtimeSettings.customMacros 读取用户定义的宏
 */
export function refreshCustomMacros(): void {
  try {
    const context = getSTContext();
    if (!context?.registerMacro) {
      Logger.debug('MacroService', '酒馆 registerMacro 不可用，跳过自定义宏注册');
      return;
    }

    // 从 runtimeSettings 读取自定义宏
    const runtimeSettings = get('runtimeSettings');
    const customMacros: CustomMacro[] = runtimeSettings?.customMacros || [];

    // 清空之前的缓存
    cachedCustomMacros.clear();

    // 注册每个启用的自定义宏
    for (const macro of customMacros) {
      if (!macro.enabled || !macro.name) continue;

      // 缓存内容
      cachedCustomMacros.set(macro.name, macro.content);

      // 动态注册到酒馆（使用闭包捕获宏名）
      const macroName = macro.name;
      registerMacro(
        macroName,
        () => cachedCustomMacros.get(macroName) ?? '',
        `Engram 自定义宏: {{${macroName}}}`
      );
    }

    Logger.debug('MacroService', '自定义宏已刷新', {
      count: cachedCustomMacros.size,
      names: Array.from(cachedCustomMacros.keys()),
    });
  } catch (e) {
    Logger.warn('MacroService', '刷新自定义宏失败', e);
  }
}

/**
 * 统一宏注册接口，兼容新旧 API
 * @param name 宏名称
 * @param handler 宏处理函数
 * @param description 宏描述
 */
export function registerMacro(name: string, handler: () => string, _description: string) {
  const context = getSTContext();

  // 兼容性修复: 强制使用旧版 registerMacro API
  // 新版 context.macros.register API 在某些 ST 版本中可能存在参数兼容问题导致 filter undefined 错误
  if (context?.registerMacro) {
    unregisterMacro(name);
    context.registerMacro(name, handler);
  } else {
    Logger.warn('MacroService', `无法注册宏 ${name}: 没有可用的 registerMacro API`);
  }
}

export function unregisterMacro(name: string) {
  const context = getSTContext();
  if (!context?.unregisterMacro) {
    return;
  }

  try {
    context.unregisterMacro(name);
  } catch (error) {
    Logger.debug('MacroService', `注销旧宏失败，继续覆盖注册: ${name}`, error);
  }
}
