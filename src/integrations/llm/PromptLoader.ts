import { Logger, LogModule } from '@/core/logger';
import type { PromptCategory, PromptTemplate } from '@/config/types/prompt';
import yaml from 'js-yaml';

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
export class PromptLoader {
  private static templates: PromptTemplate[] = [];
  private static initialized = false;

  /**
   * 初始化加载
   */
  public static init() {
    if (this.initialized) return;

    const loadedTemplates: PromptTemplate[] = [];

    for (const path in promptFiles) {
      try {
        const rawContent = promptFiles[path]?.default;
        if (!rawContent) {
          Logger.warn(LogModule.LLM, `Skipping invalid prompt template in ${path}: empty content`);
          continue;
        }

        const parsed = yaml.load(rawContent);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          Logger.warn(LogModule.LLM, `Skipping invalid prompt template in ${path}: invalid YAML`);
          continue;
        }

        const record = parsed as Record<string, unknown>;
        const id = typeof record.id === 'string' ? record.id : '';
        const name = typeof record.name === 'string' ? record.name : '';
        const category =
          typeof record.category === 'string' ? (record.category as PromptCategory) : 'summary';
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
          Logger.warn(
            LogModule.LLM,
            `Skipping invalid prompt template in ${path}: missing id or name`
          );
          continue;
        }

        loadedTemplates.push({
          id,
          name,
          category,
          enabled,
          isBuiltIn: true,
          boundPresetId: null,
          systemPrompt,
          userPromptTemplate,
          injectionMode,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      } catch (error) {
        Logger.error(LogModule.LLM, `Failed to load prompt template from ${path}`, error);
      }
    }

    this.templates = loadedTemplates;
    Logger.info(
      LogModule.LLM,
      `Loaded ${this.templates.length} built-in prompt templates from YAML`
    );
    this.initialized = true;
  }

  /**
   * 获取所有内置模板 (V0.9.1)
   */
  public static getBuiltInTemplates(): PromptTemplate[] {
    // 确保已从 YAML 加载
    this.init();
    return this.templates;
  }

  /**
   * 获取所有模板的 Alias (V1.0.0 Refactor)
   */
  public static getAllTemplates(): PromptTemplate[] {
    return this.getBuiltInTemplates();
  }
}
