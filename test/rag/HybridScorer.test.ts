import { describe, expect, it } from 'vitest';

import {
  calculateHybridScore,
  mergeResults,
  scoreAndSort,
  type ScoredEvent,
} from '@/modules/rag/retrieval/HybridScorer';

describe('HybridScorer', () => {
  it('calculates hybrid scores from base and rerank signals', () => {
    expect(calculateHybridScore(undefined, undefined, undefined)).toBe(0);
    expect(calculateHybridScore(0.4, undefined, 0.7)).toBe(0.7);
    expect(calculateHybridScore(undefined, 0.3, undefined)).toBe(0.3);
    expect(calculateHybridScore(0.4, 0.3, 0.7)).toBe(1);
  });

  it('returns a sorted copy without mutating input candidates', () => {
    const candidates: ScoredEvent[] = [
      { id: 'low', summary: 'low', embeddingScore: 0.1 },
      { id: 'high', summary: 'high', keywordScore: 0.8 },
    ];

    const result = scoreAndSort(candidates);

    expect(result.map((event) => event.id)).toEqual(['high', 'low']);
    expect(result[0].hybridScore).toBe(0.8);
    expect(candidates[0].hybridScore).toBeUndefined();
    expect(result[0]).not.toBe(candidates[1]);
  });

  it('merges rerank scores without mutating source maps or candidates', () => {
    const candidates: ScoredEvent[] = [
      { id: 'a', summary: 'A', embeddingScore: 0.2 },
      { id: 'b', summary: 'B', embeddingScore: 0.4 },
    ];
    const source = new Map(candidates.map((candidate) => [candidate.id, candidate]));

    const result = mergeResults(source, [{ index: 0, relevance_score: 0.9 }], candidates);

    expect(result.map((event) => event.id)).toEqual(['a', 'b']);
    expect(result[0].hybridScore).toBe(1.1);
    expect(source.get('a')?.rerankScore).toBeUndefined();
    expect(candidates[0].rerankScore).toBeUndefined();
  });
});
