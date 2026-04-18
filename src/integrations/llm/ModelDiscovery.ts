/**
 * ModelService - 统一的模型列表获取服务
 * 支持从各类 API 端点获取可用模型列表
 */

import { Logger } from '@/core/logger';
import { getTavernHelper, isRecord, readNumber, readString, readStringArray } from '@/core/utils';
import { getRequestHeaders } from '@/integrations/tavern';

const MODULE = 'ModelService';
const DEFAULT_TIMEOUT = 10000;

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

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function normalizeModelIds(modelIds: string[]): ModelInfo[] {
  return modelIds
    .map((id) => id.trim())
    .filter((id) => id.length > 0)
    .map((id) => ({ id, name: id }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function createAbortController(timeout: number): {
  controller: AbortController;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  return {
    controller,
    cleanup: () => clearTimeout(timeoutId),
  };
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

function parseBackendStatusResponse(payload: unknown): ModelInfo[] {
  const directModels = parseOpenAIResponse(payload);
  if (directModels.length > 0) {
    return directModels;
  }

  if (!isRecord(payload)) {
    return [];
  }

  const candidates: unknown[] = [];

  if (Array.isArray(payload.models)) {
    candidates.push(payload.models);
  }

  if (isRecord(payload.data)) {
    if (Array.isArray(payload.data.models)) {
      candidates.push(payload.data.models);
    }
    if (Array.isArray(payload.data.data)) {
      candidates.push(payload.data.data);
    }
  }

  for (const candidate of candidates) {
    const parsed = parseOpenAIResponse(candidate);
    if (parsed.length > 0) {
      return parsed;
    }

    if (Array.isArray(candidate)) {
      const normalized = normalizeModelIds(
        candidate.map((item) => readString(item) ?? '').filter((item) => item.length > 0)
      );
      if (normalized.length > 0) {
        return normalized;
      }
    }
  }

  return [];
}

async function tryFetchModelsViaTavernHelper(
  config: FetchModelsConfig
): Promise<ModelInfo[] | null> {
  const helper = getTavernHelper();
  if (!helper?.getModelList) {
    return null;
  }

  try {
    const modelIds = await helper.getModelList({
      apiurl: config.apiUrl,
      key: config.apiKey,
    });
    return normalizeModelIds(modelIds);
  } catch (error) {
    Logger.warn(MODULE, `TavernHelper model discovery failed: ${normalizeErrorMessage(error)}`);
    return null;
  }
}

async function tryFetchModelsViaBackendProxy(
  source: Extract<ModelAPIType, 'openai' | 'ollama' | 'vllm'>,
  config: FetchModelsConfig
): Promise<ModelInfo[] | null> {
  const { apiUrl, apiKey, timeout = DEFAULT_TIMEOUT } = config;
  const { controller, cleanup } = createAbortController(timeout);

  try {
    const response = await fetch('/api/backends/chat-completions/status', {
      method: 'POST',
      headers: {
        ...getRequestHeaders(),
      },
      body: JSON.stringify({
        chat_completion_source: source,
        reverse_proxy: apiUrl,
        proxy_password: apiKey,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data: unknown = await response.json();
    const models = parseBackendStatusResponse(data);
    if (models.length === 0) {
      return null;
    }

    Logger.info(MODULE, `Fetched ${models.length} models via backend proxy`);
    return models.sort((a, b) => a.id.localeCompare(b.id));
  } catch (error) {
    Logger.warn(MODULE, `Backend proxy model discovery failed: ${normalizeErrorMessage(error)}`);
    return null;
  } finally {
    cleanup();
  }
}

function parseCohereResponse(payload: unknown): ModelInfo[] {
  const items = isRecord(payload) && Array.isArray(payload.models) ? payload.models : [];

  return items
    .map((item) => parseCohereModel(item))
    .filter((item): item is ModelInfo => item !== null);
}

/**
 * 获取模型列表
 */
export async function fetchModels(
  type: ModelAPIType,
  config: FetchModelsConfig
): Promise<ModelInfo[]> {
  switch (type) {
    case 'openai':
      return fetchOpenAIModels(config);
    case 'ollama':
      return fetchOllamaModels(config);
    case 'vllm':
      return fetchVLLMModels(config);
    case 'cohere':
      return fetchCohereModels(config);
    case 'jina':
    case 'voyage':
      return getPresetModels(type);
    default:
      Logger.warn(MODULE, 'Unknown API type');
      return [];
  }
}

/**
 * 获取 OpenAI 兼容接口模型列表
 */
export async function fetchOpenAIModels(config: FetchModelsConfig): Promise<ModelInfo[]> {
  const viaTavernHelper = await tryFetchModelsViaTavernHelper(config);
  if (viaTavernHelper) {
    return viaTavernHelper;
  }

  const viaBackendProxy = await tryFetchModelsViaBackendProxy('openai', config);
  if (viaBackendProxy) {
    return viaBackendProxy;
  }

  throw new Error('无法通过后端代理获取 OpenAI 模型列表');
}

/**
 * 获取 Ollama 模型列表
 */
export async function fetchOllamaModels(config: FetchModelsConfig): Promise<ModelInfo[]> {
  const viaTavernHelper = await tryFetchModelsViaTavernHelper(config);
  if (viaTavernHelper) {
    return viaTavernHelper;
  }

  const viaBackendProxy = await tryFetchModelsViaBackendProxy('ollama', config);
  if (viaBackendProxy) {
    return viaBackendProxy;
  }

  throw new Error('无法通过后端代理获取 Ollama 模型列表');
}

/**
 * 获取 vLLM 模型列表
 * vLLM 兼容 OpenAI models 接口
 */
export async function fetchVLLMModels(config: FetchModelsConfig): Promise<ModelInfo[]> {
  const viaTavernHelper = await tryFetchModelsViaTavernHelper(config);
  if (viaTavernHelper) {
    return viaTavernHelper;
  }

  const viaBackendProxy = await tryFetchModelsViaBackendProxy('vllm', config);
  if (viaBackendProxy) {
    return viaBackendProxy;
  }

  throw new Error('无法通过后端代理获取 vLLM 模型列表');
}

/**
 * 获取 Cohere 模型列表
 */
export async function fetchCohereModels(config: FetchModelsConfig): Promise<ModelInfo[]> {
  const { apiKey, timeout = DEFAULT_TIMEOUT } = config;

  if (!apiKey) {
    Logger.warn(MODULE, 'Cohere API key required');
    return getPresetModels('cohere');
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
    return getPresetModels('cohere');
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 获取预设模型列表
 */
export function getPresetModels(type: ModelAPIType): ModelInfo[] {
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

/**
 * 获取常见重排模型列表
 */
export function getCommonRerankModels(): ModelInfo[] {
  return [
    { id: 'BAAI/bge-reranker-v2-m3', name: 'BGE Reranker v2 m3' },
    { id: 'BAAI/bge-reranker-large', name: 'BGE Reranker Large' },
    { id: 'BAAI/bge-reranker-base', name: 'BGE Reranker Base' },
    { id: 'cross-encoder/ms-marco-MiniLM-L-12-v2', name: 'MS MARCO MiniLM L12' },
    { id: 'Xenova/ms-marco-MiniLM-L-6-v2', name: 'MS MARCO MiniLM L6 (ONNX)' },
    { id: 'jinaai/jina-reranker-v2-base-multilingual', name: 'Jina Reranker v2 Multilingual' },
  ];
}
