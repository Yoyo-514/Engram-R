import type { PromptCategory } from '@/types/prompt';

export function isPromptCategory(value: unknown): value is PromptCategory {
  return typeof value === 'string';
}
