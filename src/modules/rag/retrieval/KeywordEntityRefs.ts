import { isRecord, readString } from '@/core/utils';

/** 关键词扫描产出的实体引用，score 为直中或多跳衰减后的分数。 */
export interface KeywordEntityRef {
  id: string;
  score: number;
}

/** 读取步骤之间传递的实体引用，格式不符的条目直接丢弃。 */
export function readKeywordEntityRefs(value: unknown): KeywordEntityRef[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    const id = readString(item.id);
    if (!id) {
      return [];
    }

    const score = typeof item.score === 'number' && Number.isFinite(item.score) ? item.score : 0;
    return [{ id, score }];
  });
}
