/**
 * useSummarizerConfig - 摘要和精简配置管理 Hook
 *
 * 管理 summarizerService 运行态配置与 trimmerConfig 持久化字段
 */
import { useState, useCallback, useEffect } from 'react';

import { DEFAULT_SUMMARIZER_CONFIG, DEFAULT_TRIMMER_CONFIG } from '@/config/memory/defaults';
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

export function useSummarizerConfig(): UseSummarizerConfigReturn {
  // 状态
  const [summarizerSettings, setSummarizerSettings] =
    useState<SummarizerConfig>(DEFAULT_SUMMARIZER_CONFIG);
  const [trimConfig, setTrimmerConfig] = useState<TrimmerConfig>(DEFAULT_TRIMMER_CONFIG);
  const [hasChanges, setHasChanges] = useState(false);

  // 加载初始配置
  const loadConfig = useCallback(async (): Promise<void> => {
    try {
      // 加载 Summarizer Service 状态
      const {
        enabled,
        triggerMode,
        floorInterval,
        worldbookMode,
        previewEnabled,
        promptTemplateId,
        llmPresetId,
        bufferSize,
        autoHide,
      } = summarizerService.getConfig();
      setSummarizerSettings({
        enabled,
        triggerMode,
        floorInterval,
        worldbookMode,
        previewEnabled,
        promptTemplateId,
        llmPresetId,
        bufferSize,
        autoHide,
      });

      // 加载 Trimmer Config
      const savedTrimmerConfig = get('trimmerConfig');
      if (savedTrimmerConfig) {
        setTrimmerConfig({ ...DEFAULT_TRIMMER_CONFIG, ...savedTrimmerConfig });
      }
    } catch (e) {
      console.error('Failed to load summarizer config:', e);
    }
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  // 更新 Summarizer Settings
  const updateSummarizerSettings = useCallback((settings: SummarizerConfig) => {
    setSummarizerSettings(settings);
    setHasChanges(true);
    // 注意：SummarizerService 的更新通常是即时的，这里只是 UI 状态
    // 实际应用会在 saveSummarizerConfig 中处理
  }, []);

  // 更新 Trim Config
  const updateTrimmerConfig = useCallback((config: TrimmerConfig) => {
    setTrimmerConfig(config);
    setHasChanges(true);
  }, []);

  // 保存配置
  const saveSummarizerConfig = useCallback(async (): Promise<void> => {
    try {
      // 1. 保存 Summarizer Service 配置
      const {
        enabled,
        triggerMode,
        floorInterval,
        worldbookMode,
        previewEnabled,
        promptTemplateId,
        llmPresetId,
        bufferSize,
        autoHide,
      } = summarizerSettings;

      summarizerService.updateConfig({
        enabled,
        triggerMode,
        floorInterval,
        worldbookMode,
        previewEnabled,
        promptTemplateId,
        llmPresetId,
        bufferSize,
        autoHide,
      });

      // 2. 保存 Trimmer Config 到 SettingsManager
      set('trimmerConfig', trimConfig);

      // 3. 同步运行态 EventTrimmer，避免自动触发仍使用旧阈值
      eventTrimmer.updateConfig(trimConfig);

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
