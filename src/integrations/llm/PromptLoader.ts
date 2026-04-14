import { Logger, LogModule } from '@/core/logger';
import { parseYaml } from '@/core/utils';
import type { PromptCategory, PromptTemplate } from '@/types/prompt';

interface ImportMetaWithGlob extends ImportMeta {
  glob<T>(pattern: string, options: { eager: boolean; query: string }): Record<string, T>;
}

const promptFiles = (import.meta as ImportMetaWithGlob).glob<{ default: string }>(
  './prompts/*.yaml',
  {
    eager: true,
    query: '?raw',
  }
);

/**
 * PromptLoader - 提示词加载器
 * 负责从 YAML 文件加载内置提示词模板
 */
let templates: PromptTemplate[] = [];
let initialized = false;

function isPromptCategory(value: unknown): value is PromptCategory {
  return typeof value === 'string';
}

function parsePromptTemplate(rawContent: string, path: string, now: number): PromptTemplate | null {
  const parsed = parseYaml(rawContent);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    Logger.warn(LogModule.LLM, `Skipping invalid prompt template in ${path}: invalid YAML`);
    return null;
  }

  const record = parsed as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id : '';
  const name = typeof record.name === 'string' ? record.name : '';
  const category = isPromptCategory(record.category) ? record.category : 'summary';
  const enabled = typeof record.enabled === 'boolean' ? record.enabled : false;
  const systemPrompt = typeof record.systemPrompt === 'string' ? record.systemPrompt : '';
  const userPromptTemplate =
    typeof record.userPromptTemplate === 'string' ? record.userPromptTemplate : '';
  const injectionMode =
    record.injectionMode === 'replace' ||
    record.injectionMode === 'append' ||
    record.injectionMode === 'prepend'
      ? record.injectionMode
      : undefined;

  // Validate required fields
  if (!id || !name) {
    Logger.warn(LogModule.LLM, `Skipping invalid prompt template in ${path}: missing id or name`);
    return null;
  }

  return {
    id,
    name,
    category,
    enabled,
    isBuiltIn: true,
    boundPresetId: null,
    systemPrompt,
    userPromptTemplate,
    injectionMode,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 初始化加载
 */
export function initPromptLoader(): void {
  if (initialized) return;

  const loadedTemplates: PromptTemplate[] = [];
  const now = Date.now();

  for (const path in promptFiles) {
    try {
      const rawContent = promptFiles[path]?.default;
      if (!rawContent) {
        Logger.warn(LogModule.LLM, `Skipping invalid prompt template in ${path}: empty content`);
        continue;
      }

      const template = parsePromptTemplate(rawContent, path, now);
      if (!template) {
        continue;
      }

      loadedTemplates.push(template);
    } catch (error) {
      Logger.error(LogModule.LLM, `Failed to load prompt template from ${path}`, error);
    }
  }

  templates = loadedTemplates;
  initialized = true;

  Logger.info(LogModule.LLM, `Loaded ${templates.length} built-in prompt templates from YAML`);
}

/**
 * 获取所有内置模板 (V0.9.1)
 */
export function getBuiltInTemplates(): PromptTemplate[] {
  // 确保已从 YAML 加载
  initPromptLoader();
  return [...templates];
}

/**
 * 获取所有模板的 Alias (V1.0.0 Refactor)
 */
export function getAllTemplates(): PromptTemplate[] {
  return getBuiltInTemplates();
}
