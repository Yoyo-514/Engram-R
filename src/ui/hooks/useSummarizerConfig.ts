/**
 * useSummarizerConfig - 摘要和精简配置管理 Hook
 *
 * 兼容旧调用方，内部已收口到 configStore。
 */
import { useCallback } from 'react';

import { eventTrimmer } from '@/modules/memory';
import { useConfigStore } from '@/state/configStore';
import type { SummarizerConfig, TrimmerConfig } from '@/types/memory';

export interface UseSummarizerConfigReturn {
  summarizerSettings: SummarizerConfig;
  trimConfig: TrimmerConfig;

  updateSummarizerSettings: (settings: SummarizerConfig) => void;
  updateTrimmerConfig: (config: TrimmerConfig) => void;

  saveSummarizerConfig: () => Promise<void>;
  hasChanges: boolean;
}

export function useSummarizerConfig(): UseSummarizerConfigReturn {
  const {
    summarizerConfig,
    trimmerConfig,
    updateConfig,
    saveConfig,
    hasChanges,
  } = useConfigStore();

  const updateSummarizerSettings = useCallback(
    (settings: SummarizerConfig) => {
      updateConfig('summarizerConfig', settings);
    },
    [updateConfig]
  );

  const updateTrimmerConfig = useCallback(
    (config: TrimmerConfig) => {
      updateConfig('trimmerConfig', config);
      eventTrimmer.updateConfig(config);
    },
    [updateConfig]
  );

  const saveSummarizerConfig = useCallback(async (): Promise<void> => {
    saveConfig();
  }, [saveConfig]);

  return {
    summarizerSettings: summarizerConfig,
    trimConfig: trimmerConfig,
    updateSummarizerSettings,
    updateTrimmerConfig,
    saveSummarizerConfig,
    hasChanges,
  };
}
