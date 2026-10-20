/**
 * useRegexRules - 正则替换规则管理
 */

import { useState, useCallback } from 'react';

import { DEFAULT_REGEX_RULES } from '@/config/regex/defaults';
import {
  getRegexRules as getSettingsRegexRules,
  setRegexRules as setSettingsRegexRules,
} from '@/config/settings';
import { regexProcessor } from '@/core/regex';
import type { RegexRule } from '@/types/regex';

export interface UseRegexRulesReturn {
  regexRules: RegexRule[];
  editingRule: RegexRule | null;
  hasChanges: boolean;

  selectRule: (id: string) => void;
  addRule: () => void;
  updateRule: (updates: Partial<RegexRule>) => void;
  toggleRule: (id: string) => void;
  deleteRule: (id: string) => void;
  resetRules: () => void;
  reorderRules: (rules: RegexRule[]) => void;
  saveRegexRules: () => Promise<void>;
}

export function useRegexRules(): UseRegexRulesReturn {
  // 惰性初始化：同步读取本地设置，替代 effect + setState
  const [regexRules, setRegexRules] = useState<RegexRule[]>(() => {
    const savedRules = getSettingsRegexRules();
    return savedRules && savedRules.length > 0 ? savedRules : [...DEFAULT_REGEX_RULES];
  });
  const [editingRule, setEditingRule] = useState<RegexRule | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const selectRule = useCallback(
    (id: string) => {
      const rule = regexRules.find((r) => r.id === id);
      setEditingRule(rule || null);
    },
    [regexRules]
  );

  const addRule = useCallback(() => {
    const newRule: RegexRule = {
      id: `rule_${Date.now()}`,
      name: '新规则',
      pattern: '',
      replacement: '',
      enabled: true,
      flags: 'gi',
      scope: 'both',
      description: '',
    };
    setRegexRules((prev) => [...prev, newRule]);
    setEditingRule(newRule);
    setHasChanges(true);
  }, []);

  const updateRule = useCallback(
    (updates: Partial<RegexRule>) => {
      if (!editingRule) return;
      const updated = { ...editingRule, ...updates };
      setEditingRule(updated);
      setRegexRules((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setHasChanges(true);
    },
    [editingRule]
  );

  const toggleRule = useCallback((id: string) => {
    setRegexRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)));
    setHasChanges(true);
  }, []);

  const deleteRule = useCallback((id: string) => {
    setRegexRules((prev) => prev.filter((r) => r.id !== id));
    setEditingRule((current) => (current?.id === id ? null : current));
    setHasChanges(true);
  }, []);

  const resetRules = useCallback(() => {
    setRegexRules([...DEFAULT_REGEX_RULES]);
    setEditingRule(null);
    setHasChanges(true);
  }, []);

  const reorderRules = useCallback((newOrder: RegexRule[]) => {
    setRegexRules(newOrder);
    setHasChanges(true);
  }, []);

  const saveRegexRules = useCallback(async () => {
    setSettingsRegexRules(regexRules);
    // 同步更新 Processor
    regexProcessor.setRules(regexRules);
    setHasChanges(false);
  }, [regexRules]);

  return {
    regexRules,
    editingRule,
    hasChanges,
    selectRule,
    addRule,
    updateRule,
    toggleRule,
    deleteRule,
    resetRules,
    reorderRules,
    saveRegexRules,
  };
}
