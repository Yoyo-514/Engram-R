import { beforeEach, describe, expect, it } from 'vitest';

import { recallCache } from '@/modules/rag/retrieval/RecallCache';

import { RECALL_CACHE_OPTIONS } from '../../engram.config';

const item = (
  id: string,
  score = 0.5
): { id: string; label: string; category: 'event' | 'entity'; score: number } => ({
  id,
  label: id,
  category: 'event',
  score,
});

beforeEach(() => recallCache.clear());

describe('近期召回记录', () => {
  it('按聊天隔离，只保留最近一次记录', () => {
    recallCache.record('chat-a', [item('a1'), item('a2')]);
    recallCache.record('chat-b', [item('b1')]);
    expect(recallCache.getSnapshot('chat-a').map((entry) => entry.id)).toEqual(['a1', 'a2']);
    expect(recallCache.getSnapshot('chat-b').map((entry) => entry.id)).toEqual(['b1']);
    expect(recallCache.getSnapshot('missing')).toEqual([]);
    expect(recallCache.getSnapshot(undefined)).toEqual([]);
  });

  it('超出容量时截断到上限', () => {
    const items = Array.from({ length: RECALL_CACHE_OPTIONS.recentLimit + 5 }, (_, index) =>
      item(`e${index}`)
    );
    recallCache.record('chat', items);
    expect(recallCache.getSnapshot('chat')).toHaveLength(RECALL_CACHE_OPTIONS.recentLimit);
  });

  it('忘却单条只影响所属聊天，清空可按聊天或全部', () => {
    recallCache.record('chat-a', [item('a1'), item('a2')]);
    recallCache.record('chat-b', [item('b1')]);
    recallCache.forget('chat-a', 'a1');
    expect(recallCache.getSnapshot('chat-a').map((entry) => entry.id)).toEqual(['a2']);
    expect(recallCache.getSnapshot('chat-b')).toHaveLength(1);

    recallCache.clear('chat-a');
    expect(recallCache.getSnapshot('chat-a')).toEqual([]);
    expect(recallCache.getSnapshot('chat-b')).toHaveLength(1);

    recallCache.clear();
    expect(recallCache.getSnapshot('chat-b')).toEqual([]);
  });
});
