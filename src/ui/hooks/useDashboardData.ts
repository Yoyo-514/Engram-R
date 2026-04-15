/**
 * useDashboardData - Dashboard 数据聚合 Hook
 *
 * V0.9.5: 提供 Dashboard 所需的所有数据
 * - System Health: 连接状态、待处理进度
 * - Memory Stats: 事件/实体统计
 * - Feature Status: 功能开关状态
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { DEFAULT_BRAIN_RECALL_CONFIG } from '@/config/rag/defaults';
import { get, set, type EngramSettings } from '@/config/settings';
import { Logger, LogModule } from '@/core/logger';
import { tryGetDbForChat } from '@/data/db';
import { getSTContext, getCurrentChatId, getSummaries } from '@/integrations/tavern';
import { summarizerService } from '@/modules/memory';
import { brainRecallCache } from '@/modules/rag/retrieval/BrainRecallCache';

// ==================== 类型定义 ====================

export interface FeatureStatus {
  summarizer: boolean;
  entity: boolean;
  embedding: boolean;
  recall: boolean;
  preprocess: boolean;
}

export interface MemoryStats {
  eventCount: number;
  entityCount: number;
  entityByType: Record<string, number>;
  archivedCount: number;
  activeCount: number;
  estimatedTokens: number;
}

export interface SystemHealth {
  isConnected: boolean;
  characterName: string;
  currentFloor: number;
  lastSummarizedFloor: number;
  pendingFloors: number;
  floorInterval: number;
  isSummarizing: boolean;
}

export interface BrainStats {
  shortTermCount: number;
  shortTermLimit: number;
  workingCount: number;
  workingLimit: number;
  topItems: { id: string; label: string; score: number }[];
}

export interface ContextStats {
  injectedLength: number;
  estimatedTokens: number;
}

export interface DashboardData {
  system: SystemHealth;
  memory: MemoryStats;
  features: FeatureStatus;
  brainStats: BrainStats;
  contextStats: ContextStats;
  globalStats: EngramSettings['statistics'];
  isLoading: boolean;
}

// ==================== Hook ====================

export function useDashboardData(refreshInterval = 2000): DashboardData & {
  toggleFeature: (feature: keyof FeatureStatus) => void;
  refresh: () => Promise<void>;
} {
  const [isLoading, setIsLoading] = useState(true);
  const [system, setSystem] = useState<SystemHealth>({
    isConnected: false,
    characterName: 'Unknown',
    currentFloor: 0,
    lastSummarizedFloor: 0,
    pendingFloors: 0,
    floorInterval: 10,
    isSummarizing: false,
  });
  const [memory, setMemory] = useState<MemoryStats>({
    eventCount: 0,
    entityCount: 0,
    entityByType: {},
    archivedCount: 0,
    activeCount: 0,
    estimatedTokens: 0,
  });
  const [features, setFeatures] = useState<FeatureStatus>({
    summarizer: true,
    entity: false,
    embedding: false,
    recall: true,
    preprocess: false,
  });
  const [brainStats, setBrainStats] = useState<BrainStats>({
    shortTermCount: 0,
    shortTermLimit: 0,
    workingCount: 0,
    workingLimit: 0,
    topItems: [],
  });
  const [contextStats, setContextStats] = useState<ContextStats>({
    injectedLength: 0,
    estimatedTokens: 0,
  });
  const [globalStats, setGlobalStats] = useState<EngramSettings['statistics']>({
    firstUseAt: null,
    activeDays: [],
    totalTokens: 0,
    totalLlmCalls: 0,
    totalEvents: 0,
    totalEntities: 0,
    totalRagInjections: 0,
  });

  const isMounted = useRef(true);
  const lastDbModified = useRef<number>(0);

  // Atomic fetchers
  const fetchSystemHealth = useCallback(() => {
    const stContext = getSTContext();
    const summarizerStatus = summarizerService.getStatus();
    const summarizerConfig = summarizerService.getConfig();

    if (!isMounted.current) return;
    setSystem({
      isConnected: !!stContext,
      characterName: stContext?.name2 || 'Unknown',
      currentFloor: summarizerStatus.currentFloor,
      lastSummarizedFloor: summarizerStatus.lastSummarizedFloor,
      pendingFloors: summarizerStatus.pendingFloors,
      floorInterval: summarizerConfig.floorInterval || 10,
      isSummarizing: summarizerStatus.isSummarizing,
    });
  }, []);

  const fetchGlobalStats = useCallback(() => {
    const currentStats = get('statistics') || {
      firstUseAt: null,
      activeDays: [],
      totalTokens: 0,
      totalLlmCalls: 0,
      totalEvents: 0,
      totalEntities: 0,
      totalRagInjections: 0,
    };
    if (!isMounted.current) return;
    setGlobalStats(currentStats);
  }, []);

  const fetchMemoryStats = useCallback(async () => {
    const chatId = getCurrentChatId();
    if (!chatId) return;

    const db = tryGetDbForChat(chatId);
    if (!db) return;

    const metaMod = await db.meta.get('lastModified');
    const currentMod = (metaMod?.value as number) || 0;

    if (currentMod !== lastDbModified.current || lastDbModified.current === 0) {
      const eventCount = await db.events.count();
      const entityCount = await db.entities.count();

      // P1 Fix: 使用游标遍历进行类型统计，避免将整表读入内存
      const entityByType: Record<string, number> = {};
      // Using Table.each iteration to minimize memory allocations
      await db.entities.each((entity) => {
        const t = entity.type || 'unknown';
        entityByType[t] = (entityByType[t] || 0) + 1;
      });

      const archivedCount = await db.events.filter((e) => !!e.is_archived).count();

      const sampleEvents = await db.events.limit(100).toArray();
      const avgLen =
        sampleEvents.length > 0
          ? sampleEvents.reduce((s, e) => s + (e.summary?.length || 0), 0) / sampleEvents.length
          : 0;
      const estimatedTokens = Math.ceil((avgLen * eventCount) / 4);

      if (!isMounted.current) return;
      setMemory({
        eventCount,
        entityCount,
        entityByType,
        archivedCount,
        activeCount: eventCount - archivedCount,
        estimatedTokens,
      });
      lastDbModified.current = currentMod;
    }
  }, []);

  const fetchFeatureStatus = useCallback(async () => {
    const runtimeSettings = get('runtimeSettings');
    const currentSummarizerConfig = summarizerService.getConfig();
    const entityConfig = runtimeSettings?.entityExtractConfig;
    const embeddingConfig = runtimeSettings?.embeddingConfig;
    const recallConfig = runtimeSettings?.recallConfig;
    const preprocessConfig = get('preprocessConfig') as { enabled?: boolean } | undefined;

    if (!isMounted.current) return;
    setFeatures({
      summarizer: currentSummarizerConfig.enabled !== false,
      entity: !!entityConfig?.enabled,
      embedding: !!embeddingConfig?.enabled,
      recall: recallConfig?.enabled !== false,
      preprocess: !!preprocessConfig?.enabled,
    });
  }, []);

  const fetchBrainStats = useCallback(() => {
    try {
      const snapshot = brainRecallCache.getShortTermSnapshot();
      const brainruntimeSettings = get('runtimeSettings');
      const brainConfig =
        brainruntimeSettings?.recallConfig?.brainRecall || DEFAULT_BRAIN_RECALL_CONFIG;

      const workingItems = snapshot.filter((s) => s.tier === 'working');
      const topActiveItems = snapshot.slice(0, 3).map((s) => ({
        id: s.id,
        label: s.label,
        score: s.finalScore,
      }));

      const contextText = getSummaries();

      if (!isMounted.current) return;
      setBrainStats({
        shortTermCount: snapshot.length,
        shortTermLimit: brainConfig.shortTermLimit,
        workingCount: workingItems.length,
        workingLimit: brainConfig.workingLimit,
        topItems: topActiveItems,
      });

      setContextStats({
        injectedLength: contextText.length,
        estimatedTokens: Math.ceil(contextText.length / 4),
      });
    } catch (e) {
      Logger.warn(LogModule.DASHBOARD, '加载 Brain Stats 失败', e);
      if (isMounted.current) {
        setBrainStats({
          shortTermCount: 0,
          shortTermLimit: 0,
          workingCount: 0,
          workingLimit: 0,
          topItems: [],
        });
      }
    }
  }, []);

  // 主刷新回调，编排原子获取函数
  const refresh = useCallback(async () => {
    try {
      fetchSystemHealth();
      fetchGlobalStats();
      await fetchMemoryStats();
      await fetchFeatureStatus();
      fetchBrainStats();

      if (isMounted.current) setIsLoading(false);
    } catch (error) {
      Logger.error(LogModule.DASHBOARD, '刷新 Dashboard 数据失败', { error });
      if (isMounted.current) setIsLoading(false);
    }
  }, [fetchSystemHealth, fetchGlobalStats, fetchMemoryStats, fetchFeatureStatus, fetchBrainStats]);

  // 切换功能开关
  // 保持对外回调为 void，避免在事件属性中直接传递 Promise-returning function
  const toggleFeature = useCallback(
    (feature: keyof FeatureStatus) => {
      void (async () => {
        try {
          // 1. 读取最新配置（使用完整 defaults 作为 fallback，防止丢失嵌套字段）
          const runtimeSettings = get('runtimeSettings');
          const currentSummarizerConfig = summarizerService.getConfig();

          // 2. 获取当前功能状态并计算新值
          let nextVal: boolean;

          switch (feature) {
            case 'summarizer': {
              nextVal = !(currentSummarizerConfig.enabled !== false);
              summarizerService.updateConfig({ enabled: nextVal });
              break;
            }
            case 'entity': {
              const entityConfig = runtimeSettings.entityExtractConfig;
              nextVal = !(entityConfig?.enabled ?? false);
              set('runtimeSettings', {
                ...runtimeSettings,
                entityExtractConfig: {
                  ...entityConfig,
                  enabled: nextVal,
                },
              });
              break;
            }
            case 'embedding': {
              const embeddingConfig = runtimeSettings.embeddingConfig;
              nextVal = !(embeddingConfig?.enabled ?? false);
              set('runtimeSettings', {
                ...runtimeSettings,
                embeddingConfig: {
                  ...embeddingConfig!,
                  enabled: nextVal,
                },
              });
              break;
            }
            case 'recall': {
              const recallConfig = runtimeSettings.recallConfig;
              nextVal = !(recallConfig?.enabled !== false);
              set('runtimeSettings', {
                ...runtimeSettings,
                recallConfig: {
                  ...recallConfig,
                  enabled: nextVal,
                },
              });
              break;
            }
            case 'preprocess': {
              const currentPreprocessingConfig = get('preprocessConfig') || {};
              nextVal = !(currentPreprocessingConfig as { enabled?: boolean })?.enabled;
              set('preprocessConfig', {
                ...currentPreprocessingConfig,
                enabled: nextVal,
              });

              set('runtimeSettings', {
                ...runtimeSettings,
                recallConfig: {
                  ...runtimeSettings.recallConfig,
                  usePreprocessing: nextVal,
                },
              });
              break;
            }
            default:
              return;
          }

          // 3. 同步更新 UI state（纯函数，无副作用）
          setFeatures((prev) => ({ ...prev, [feature]: nextVal }));

          // 4. 刷新确保与底层同步
          await refresh();
        } catch (error) {
          Logger.error(LogModule.DASHBOARD, '切换 Dashboard 功能开关失败', { feature, error });
        }
      })();
    },
    [refresh]
  );

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const refreshRef = useRef(refresh);

  // 保持 ref 中的 refresh 永远是最新版本，避免定时器闭包拿到旧回调
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  // 初始加载 + 定时刷新 (Phase 3 Performance)
  useEffect(() => {
    isMounted.current = true;
    void refreshRef.current(); // 立即执行一次
    let isTabActive = document.visibilityState === 'visible';

    // 动态调整轮询帧率：活动时高频查询，放到后台时降低查询频率
    const scheduleTimer = () => {
      if (timerRef.current) clearInterval(timerRef.current);
      const currentInterval = isTabActive ? refreshInterval : refreshInterval * 5; // 后台延长 5 倍间隙
      timerRef.current = setInterval(() => {
        if (isMounted.current) void refreshRef.current();
      }, currentInterval);
    };

    const handleVisibilityChange = () => {
      isTabActive = document.visibilityState === 'visible';
      scheduleTimer();
      if (isTabActive) {
        void refreshRef.current(); // 使用最新 ref 避免闭包陷阱
      }
    };

    scheduleTimer();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMounted.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshInterval]);

  return {
    system,
    memory,
    features,
    brainStats,
    contextStats,
    globalStats,
    isLoading,
    toggleFeature,
    refresh,
  };
}
