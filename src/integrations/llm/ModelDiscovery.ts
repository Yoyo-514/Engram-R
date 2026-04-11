/**
 * ModelService - 统一的模型列表获取服务
 * 支持从各类 API 端点获取可用模型列表
 */

import { Logger } from '@/core/logger';

const MODULE = 'ModelService';

export interface ModelInfo {
  id: string;
  name?: string;
  contextLength?: number;
  owned_by?: string;
}

export type ModelAPIType = 'openai' | 'ollama' | 'vllm' | 'cohere' | 'jina' | 'voyage';

export interface FetchModelsConfig {
  apiUrl: string;
  apiKey?: string;
  timeout?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function parseOpenAIModel(item: unknown): ModelInfo | null {
  if (!isRecord(item)) {
    return null;
  }

  const id = readString(item.id) ?? readString(item.model);
  if (!id) {
    return null;
  }

  return {
    id,
    name: readString(item.name) ?? id,
    owned_by: readString(item.owned_by),
  };
}

function parseOllamaModel(item: unknown): ModelInfo | null {
  if (!isRecord(item)) {
    return null;
  }

  const id = readString(item.name) ?? readString(item.model);
  if (!id) {
    return null;
  }

  return {
    id,
    name: readString(item.name) ?? id,
  };
}

function parseCohereModel(item: unknown): ModelInfo | null {
  if (!isRecord(item)) {
    return null;
  }

  const endpoints = readStringArray(item.endpoints);
  if (!endpoints.includes('embed')) {
    return null;
  }

  const name = readString(item.name);
  if (!name) {
    return null;
  }

  return {
    id: name,
    name,
    contextLength: readNumber(item.context_length),
  };
}

function parseOpenAIResponse(payload: unknown): ModelInfo[] {
  const items = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.data)
      ? payload.data
      : [];

  return items
    .map((item) => parseOpenAIModel(item))
    .filter((item): item is ModelInfo => item !== null);
}

function parseOllamaResponse(payload: unknown): ModelInfo[] {
  const items = isRecord(payload) && Array.isArray(payload.models) ? payload.models : [];

  return items
    .map((item) => parseOllamaModel(item))
    .filter((item): item is ModelInfo => item !== null);
}

function parseCohereResponse(payload: unknown): ModelInfo[] {
  const items = isRecord(payload) && Array.isArray(payload.models) ? payload.models : [];

  return items
    .map((item) => parseCohereModel(item))
    .filter((item): item is ModelInfo => item !== null);
}

export class ModelService {
  private static readonly DEFAULT_TIMEOUT = 10000;

  static async fetchModels(type: ModelAPIType, config: FetchModelsConfig): Promise<ModelInfo[]> {
    switch (type) {
      case 'openai':
        return this.fetchOpenAIModels(config);
      case 'ollama':
        return this.fetchOllamaModels(config);
      case 'vllm':
        return this.fetchVLLMModels(config);
      case 'cohere':
        return this.fetchCohereModels(config);
      case 'jina':
      case 'voyage':
        return this.getPresetModels(type);
      default:
        Logger.warn(MODULE, 'Unknown API type');
        return [];
    }
  }

  static async fetchOpenAIModels(config: FetchModelsConfig): Promise<ModelInfo[]> {
    const { apiUrl, apiKey, timeout = this.DEFAULT_TIMEOUT } = config;
    const baseUrl = apiUrl.replace(/\/+$/, '');
    const modelsUrl = `${baseUrl}/models`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
      }

      const response = await fetch(modelsUrl, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: unknown = await response.json();
      const models = parseOpenAIResponse(data).sort((a, b) => a.id.localeCompare(b.id));

      Logger.info(MODULE, `Fetched ${models.length} models from OpenAI API`);
      return models;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        Logger.error(MODULE, 'OpenAI API request timeout');
      } else {
        Logger.error(MODULE, `OpenAI API error: ${normalizeErrorMessage(error)}`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  static async fetchOllamaModels(config: FetchModelsConfig): Promise<ModelInfo[]> {
    const { apiUrl, timeout = this.DEFAULT_TIMEOUT } = config;
    let baseUrl = apiUrl.replace(/\/+$/, '');
    baseUrl = baseUrl.replace(/\/api\/(embeddings?|tags)$/, '');
    const tagsUrl = `${baseUrl}/api/tags`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(tagsUrl, {
        method: 'GET',
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: unknown = await response.json();
      const models = parseOllamaResponse(data);

      Logger.info(MODULE, `Fetched ${models.length} models from Ollama`);
      return models;
    } catch (error) {
      Logger.error(MODULE, `Ollama API error: ${normalizeErrorMessage(error)}`);
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  static async fetchVLLMModels(config: FetchModelsConfig): Promise<ModelInfo[]> {
    return this.fetchOpenAIModels(config);
  }

  static async fetchCohereModels(config: FetchModelsConfig): Promise<ModelInfo[]> {
    const { apiKey, timeout = this.DEFAULT_TIMEOUT } = config;

    if (!apiKey) {
      Logger.warn(MODULE, 'Cohere API key required');
      return this.getPresetModels('cohere');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch('https://api.cohere.ai/v1/models', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: unknown = await response.json();
      const models = parseCohereResponse(data);

      Logger.info(MODULE, `Fetched ${models.length} embed models from Cohere`);
      return models;
    } catch (error) {
      Logger.error(MODULE, `Cohere API error: ${normalizeErrorMessage(error)}`);
      return this.getPresetModels('cohere');
    } finally {
      clearTimeout(timeoutId);
    }
  }

  static getPresetModels(type: ModelAPIType): ModelInfo[] {
    const presets: Partial<Record<ModelAPIType, ModelInfo[]>> = {
      cohere: [
        { id: 'embed-multilingual-v3.0', name: 'Embed Multilingual v3.0' },
        { id: 'embed-english-v3.0', name: 'Embed English v3.0' },
        { id: 'embed-multilingual-light-v3.0', name: 'Embed Multilingual Light v3.0' },
        { id: 'embed-english-light-v3.0', name: 'Embed English Light v3.0' },
      ],
      jina: [
        { id: 'jina-embeddings-v3', name: 'Jina Embeddings v3' },
        { id: 'jina-embeddings-v2-base-en', name: 'Jina Embeddings v2 Base EN' },
        { id: 'jina-embeddings-v2-base-zh', name: 'Jina Embeddings v2 Base ZH' },
        { id: 'jina-colbert-v2', name: 'Jina ColBERT v2' },
      ],
      voyage: [
        { id: 'voyage-3', name: 'Voyage 3' },
        { id: 'voyage-3-lite', name: 'Voyage 3 Lite' },
        { id: 'voyage-large-2', name: 'Voyage Large 2' },
        { id: 'voyage-code-2', name: 'Voyage Code 2' },
        { id: 'voyage-multilingual-2', name: 'Voyage Multilingual 2' },
      ],
      openai: [
        { id: 'text-embedding-3-large', name: 'Text Embedding 3 Large' },
        { id: 'text-embedding-3-small', name: 'Text Embedding 3 Small' },
        { id: 'text-embedding-ada-002', name: 'Text Embedding Ada 002' },
      ],
    };

    return presets[type] ?? [];
  }

  static getCommonRerankModels(): ModelInfo[] {
    return [
      { id: 'BAAI/bge-reranker-v2-m3', name: 'BGE Reranker v2 m3' },
      { id: 'BAAI/bge-reranker-large', name: 'BGE Reranker Large' },
      { id: 'BAAI/bge-reranker-base', name: 'BGE Reranker Base' },
      { id: 'cross-encoder/ms-marco-MiniLM-L-12-v2', name: 'MS MARCO MiniLM L12' },
      { id: 'Xenova/ms-marco-MiniLM-L-6-v2', name: 'MS MARCO MiniLM L6 (ONNX)' },
      { id: 'jinaai/jina-reranker-v2-base-multilingual', name: 'Jina Reranker v2 Multilingual' },
    ];
  }
}
