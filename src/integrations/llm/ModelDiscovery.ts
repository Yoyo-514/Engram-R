/**
 * ModelService - 统一的模型列表获取服务
 * 支持从各类 API 端点获取可用模型列表
 */

import { Logger } from '@/core/logger';
import { getTavernHelper } from '@/core/utils';

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

/**
 * 获取 OpenAI 兼容接口模型列表
 */
export async function fetchOpenAIModels(config: FetchModelsConfig): Promise<ModelInfo[]> {
  const viaTavernHelper = await tryFetchModelsViaTavernHelper(config);
  if (viaTavernHelper) {
    return viaTavernHelper;
  }

  throw new Error('无法通过 TavernHelper 获取 OpenAI 模型列表');
}

/**
 * 获取 Ollama 模型列表
 */
export async function fetchOllamaModels(config: FetchModelsConfig): Promise<ModelInfo[]> {
  const viaTavernHelper = await tryFetchModelsViaTavernHelper(config);
  if (viaTavernHelper) {
    return viaTavernHelper;
  }

  throw new Error('无法通过 TavernHelper 获取 Ollama 模型列表');
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

  throw new Error('无法通过 TavernHelper 获取 vLLM 模型列表');
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
