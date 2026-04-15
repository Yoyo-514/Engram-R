import { useCallback, useEffect, useState } from 'react';

import { get, set } from '@/config/settings';
import { getTavernHelper } from '@/core/utils';
import { getWorldbookScopes, getWorldbookStructure } from '@/integrations/tavern';
import type { EngramRuntimeSettings } from '@/types/config';
import type { WorldbookConfig, WorldbookProfile } from '@/types/worldbook';

export interface UseWorldInfoReturn {
  worldbookStructure: Record<string, any[]>;
  disabledEntries: Record<string, number[]>;
  disabledWorldbooks: string[];
  currentCharWorldbook: string | null;
  worldbookConfig: WorldbookConfig | undefined;
  worldbookProfiles: WorldbookProfile[];
  worldbookScopes: { global: string[]; chat: string[]; installed: string[] };

  toggleWorldbook: (name: string, disabled: boolean) => void;
  toggleEntry: (worldbook: string, uid: number, disabled: boolean) => void;
  updateWorldbookConfig: (config: WorldbookConfig) => void;

  addProfile: (profile: WorldbookProfile) => void;
  updateProfile: (id: string, updates: Partial<WorldbookProfile>) => void;
  deleteProfile: (id: string) => void;

  refreshWorldbooks: () => Promise<void>;
  saveWorldInfo: () => Promise<void>;
  hasChanges: boolean;
}

export function useWorldInfo(): UseWorldInfoReturn {
  const [worldbookStructure, setWorldbookStructure] = useState<Record<string, unknown[]>>({});
  const [disabledEntries, setDisabledEntries] = useState<Record<string, number[]>>(
    get('runtimeSettings')?.worldbookConfig?.disabledEntries || {}
  );
  const [disabledWorldbooks, setDisabledWorldbooks] = useState<string[]>([]);
  const [currentCharWorldbook, setCurrentCharWorldbook] = useState<string | null>(null);
  const [worldbookConfig, setWorldbookConfig] = useState<WorldbookConfig>(
    get('runtimeSettings')?.worldbookConfig
  );
  const [worldbookProfiles, setWorldbookProfiles] = useState<WorldbookProfile[]>(
    get('runtimeSettings')?.worldbookProfiles || []
  );
  const [worldbookScopes, setWorldbookScopes] = useState<{
    global: string[];
    chat: string[];
    installed: string[];
  }>({ global: [], chat: [], installed: [] });
  const [hasChanges, setHasChanges] = useState(false);

  const loadWorldbookState = useCallback(async () => {
    // 1. 加载结构
    const structure = await getWorldbookStructure();
    setWorldbookStructure(structure);

    // 加载作用域
    const scopes = getWorldbookScopes();
    setWorldbookScopes(scopes);

    // 2. 加载当前角色状态 (仅记录当前角色世界书用于 fallback)
    const helper = getTavernHelper();
    const charBooks = helper?.getCharWorldbookNames?.('current');
    if (charBooks?.primary) {
      setCurrentCharWorldbook(charBooks.primary);
    }

    // 3. 加载设置
    const runtimeSettings = get('runtimeSettings');
    const config = runtimeSettings?.worldbookConfig;
    setWorldbookConfig(config);
    if (config?.disabledWorldbooks) {
      setDisabledWorldbooks(config.disabledWorldbooks);
    }
    if (config?.disabledEntries) {
      setDisabledEntries(config.disabledEntries);
    }
    setWorldbookProfiles(runtimeSettings?.worldbookProfiles || []);
  }, []);

  useEffect(() => {
    void loadWorldbookState();
  }, [loadWorldbookState]);

  const toggleWorldbook = useCallback((name: string, disabled: boolean) => {
    setDisabledWorldbooks((prev) => {
      const next = disabled ? [...new Set([...prev, name])] : prev.filter((n) => n !== name);
      setWorldbookConfig((prevConfig: WorldbookConfig) => ({
        ...prevConfig,
        disabledWorldbooks: next,
      }));
      return next;
    });
    setHasChanges(true);
  }, []);

  const toggleEntry = useCallback((worldbook: string, uid: number, disabled: boolean) => {
    setDisabledEntries((prev) => {
      const currentList = prev[worldbook] || [];
      const nextList = disabled
        ? [...new Set([...currentList, uid])]
        : currentList.filter((id) => id !== uid);
      return { ...prev, [worldbook]: nextList };
    });
    setHasChanges(true);
  }, []);

  const updateWorldbookConfig = useCallback((config: WorldbookConfig) => {
    setWorldbookConfig(config);
    if (config.disabledWorldbooks) {
      setDisabledWorldbooks(config.disabledWorldbooks);
    }
    setHasChanges(true);
  }, []);

  const addProfile = useCallback((profile: WorldbookProfile) => {
    setWorldbookProfiles((prev) => [...prev, profile]);
    setHasChanges(true);
  }, []);

  const updateProfile = useCallback((id: string, updates: Partial<WorldbookProfile>) => {
    setWorldbookProfiles((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...updates, updatedAt: Date.now() } : p))
    );
    setHasChanges(true);
  }, []);

  const deleteProfile = useCallback((id: string) => {
    setWorldbookProfiles((prev) => prev.filter((p) => p.id !== id));
    setHasChanges(true);
  }, []);

  const saveWorldInfo = useCallback(async () => {
    // 保存全局配置和Profiles
    const currentSettings = (get('runtimeSettings') || {}) as EngramRuntimeSettings;
    const newWorldbookConfig = {
      ...currentSettings.worldbookConfig,
      ...worldbookConfig,
      disabledWorldbooks: disabledWorldbooks,
      disabledEntries: disabledEntries,
    };

    set('runtimeSettings', {
      ...currentSettings,
      worldbookConfig: newWorldbookConfig,
      worldbookProfiles: worldbookProfiles,
    });

    // 角色世界书的本地状态废弃，统一写入上述全局 config
    setHasChanges(false);
  }, [disabledWorldbooks, disabledEntries, worldbookConfig, worldbookProfiles]);

  return {
    worldbookStructure,
    disabledEntries,
    disabledWorldbooks,
    currentCharWorldbook,
    worldbookConfig,
    worldbookProfiles,
    worldbookScopes,
    toggleWorldbook,
    toggleEntry,
    updateWorldbookConfig,
    addProfile,
    updateProfile,
    deleteProfile,
    refreshWorldbooks: loadWorldbookState,
    saveWorldInfo,
    hasChanges,
  };
}
