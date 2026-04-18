/**
 * useSummarizerConfig - 摘要和精简配置管理 Hook
 *
 * 管理 summarizerService 运行态配置与 trimmerConfig 持久化字段
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { DEFAULT_SUMMARIZER_CONFIG, DEFAULT_TRIMMER_CONFIG } from '@/config/memory/defaults';
import { createDebouncedPersistence, deepClone } from '@/core/utils';
import { get, set } from '@/config/settings';
import { eventTrimmer, summarizerService } from '@/modules/memory';
import type { SummarizerConfig, TrimmerConfig } from '@/types/memory';

export interface UseSummarizerConfigReturn {
  summarizerSettings: SummarizerConfig;
  trimConfig: TrimmerConfig;

  updateSummarizerSettings: (settings: SummarizerConfig) => void;
  updateTrimmerConfig: (config: TrimmerConfig) => void;

  saveSummarizerConfig: () => Promise<void>;
  hasChanges: boolean;
}

interface PersistedSummarizerState {
  summarizerSettings: SummarizerConfig;
  trimConfig: TrimmerConfig;
}

function getPersistedSummarizerState(): PersistedSummarizerState {
  return {
    summarizerSettings: {
      ...DEFAULT_SUMMARIZER_CONFIG,
      ...summarizerService.getConfig(),
    },
    trimConfig: {
      ...DEFAULT_TRIMMER_CONFIG,
      ...get('trimmerConfig'),
    },
  };
}

export function useSummarizerConfig(): UseSummarizerConfigReturn {
  const [initialState] = useState<PersistedSummarizerState>(() => getPersistedSummarizerState());
  const [summarizerSettings, setSummarizerSettings] = useState<SummarizerConfig>(
    initialState.summarizerSettings
  );
  const [trimConfig, setTrimmerConfig] = useState<TrimmerConfig>(initialState.trimConfig);
  const [hasChanges, setHasChanges] = useState(false);

  const persistenceRef = useRef(
    createDebouncedPersistence<PersistedSummarizerState>({
      initialValue: initialState,
      persist: (nextValue) => {
        set('summarizerConfig', nextValue.summarizerSettings);
        set('trimmerConfig', nextValue.trimConfig);
      },
    })
  );

  const schedulePersistence = useCallback((nextState: PersistedSummarizerState) => {
    const persistence = persistenceRef.current;
    const changed = persistence.hasChanges(nextState);

    if (changed) {
      persistence.schedule(nextState);
    }

    setHasChanges(changed);
  }, []);

  // 加载初始配置
  const loadConfig = useCallback(async (): Promise<void> => {
    try {
      const persistedState = getPersistedSummarizerState();
      setSummarizerSettings(persistedState.summarizerSettings);
      setTrimmerConfig(persistedState.trimConfig);
      persistenceRef.current.cancel();
      persistenceRef.current.syncSnapshot(persistedState);
      setHasChanges(false);
    } catch (e) {
      console.error('Failed to load summarizer config:', e);
    }
  }, []);

  useEffect(() => {
    void loadConfig();

    return () => {
      persistenceRef.current.cancel();
    };
  }, [loadConfig]);

  // 更新 Summarizer Settings
  const updateSummarizerSettings = useCallback(
    (settings: SummarizerConfig) => {
      setSummarizerSettings(settings);
      schedulePersistence({
        summarizerSettings: deepClone(settings),
        trimConfig: deepClone(trimConfig),
      });
      // 注意：SummarizerService 的更新通常是即时的，这里只是 UI 状态
      // 实际应用会在 SummaryPanel 中同步运行态，再由这里统一去抖持久化
    },
    [schedulePersistence, trimConfig]
  );

  // 更新 Trim Config
  const updateTrimmerConfig = useCallback(
    (config: TrimmerConfig) => {
      setTrimmerConfig(config);
      schedulePersistence({
        summarizerSettings: deepClone(summarizerSettings),
        trimConfig: deepClone(config),
      });
    },
    [schedulePersistence, summarizerSettings]
  );

  // 保存配置
  const saveSummarizerConfig = useCallback(async (): Promise<void> => {
    try {
      const nextState: PersistedSummarizerState = {
        summarizerSettings: deepClone(summarizerSettings),
        trimConfig: deepClone(trimConfig),
      };

      persistenceRef.current.cancel();
      persistenceRef.current.syncSnapshot(nextState);

      set('summarizerConfig', nextState.summarizerSettings);
      set('trimmerConfig', nextState.trimConfig);

      // 同步运行态 EventTrimmer，避免自动触发仍使用旧阈值
      eventTrimmer.updateConfig(nextState.trimConfig);

      setHasChanges(false);
    } catch (e) {
      console.error('Failed to save summarizer config:', e);
    }
  }, [summarizerSettings, trimConfig]);

  return {
    summarizerSettings,
    trimConfig,
    updateSummarizerSettings,
    updateTrimmerConfig,
    saveSummarizerConfig,
    hasChanges,
  };
}
