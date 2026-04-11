import { describe, expect, it } from 'vitest';
import { RobustJsonParser } from '@/core/utils/JsonParser';

type RecallParseResult = {
  recalls: Array<{ id: string; score: number; reason?: string }>;
};

type ItemsParseResult = {
  items: string[];
};

type EventsParseResult = {
  events: Array<{ id: string }>;
};

describe('RobustJsonParser', () => {
  describe('standard JSON', () => {
    it('parses a clean object', () => {
      const result = RobustJsonParser.parse('{"key":"value","num":42}');
      expect(result).toEqual({ key: 'value', num: 42 });
    });

    it('parses nested recall objects', () => {
      const result = RobustJsonParser.parse<RecallParseResult>(
        '{"recalls":[{"id":"evt_001","score":0.9,"reason":"test"}]}'
      );
      expect(result?.recalls).toHaveLength(1);
      expect(result?.recalls[0]?.id).toBe('evt_001');
    });
  });

  describe('LLM-style output', () => {
    it('extracts JSON from surrounding text', () => {
      const result = RobustJsonParser.parse<RecallParseResult>(
        'analysis...\n{"recalls":[{"id":"evt_abc","score":0.85,"reason":"related"}]}\nend'
      );
      expect(result?.recalls).toHaveLength(1);
      expect(result?.recalls[0]?.id).toBe('evt_abc');
    });

    it('extracts JSON from a markdown code block', () => {
      const result = RobustJsonParser.parse<RecallParseResult>(
        '```json\n{"recalls":[{"id":"evt_xyz","score":0.9,"reason":"hit"}]}\n```'
      );
      expect(result?.recalls).toHaveLength(1);
      expect(result?.recalls[0]?.id).toBe('evt_xyz');
    });

    it('handles code blocks without a language tag', () => {
      const result = RobustJsonParser.parse('```\n{"key":"value"}\n```');
      expect(result).toEqual({ key: 'value' });
    });
  });

  describe('repair mode', () => {
    it('repairs a trailing comma in an object', () => {
      const result = RobustJsonParser.parse('{"key":"value","num":42, }');
      expect(result).toEqual({ key: 'value', num: 42 });
    });

    it('repairs a trailing comma in an array', () => {
      const result = RobustJsonParser.parse<ItemsParseResult>('{"items":["a","b","c",]}');
      expect(result?.items).toEqual(['a', 'b', 'c']);
    });
  });

  describe('array wrapping', () => {
    it('wraps a bare array as events', () => {
      const result = RobustJsonParser.parse<EventsParseResult>('[{"id":"evt_1"},{"id":"evt_2"}]');
      expect(result?.events).toHaveLength(2);
      expect(result?.events[0]?.id).toBe('evt_1');
    });

    it('wraps an array embedded in text', () => {
      const result = RobustJsonParser.parse<EventsParseResult>(
        'result: [{"id":"evt_1"},{"id":"evt_2"}]'
      );
      expect(result?.events).toHaveLength(2);
    });
  });

  describe('agentic recall parsing', () => {
    it('parses a typical recall_decision payload', () => {
      const result = RobustJsonParser.parse<RecallParseResult>(
        '{"recalls":[{"id":"evt_a1b2c3d4","score":0.95,"reason":"directly related"},{"id":"evt_x1y2z3w4","score":0.8,"reason":"same character"}]}'
      );
      expect(result?.recalls).toHaveLength(2);
      expect(result?.recalls[0]?.id).toBe('evt_a1b2c3d4');
      expect(result?.recalls[0]?.score).toBe(0.95);
      expect(result?.recalls[1]?.reason).toContain('same character');
    });

    it('handles messy recall payloads', () => {
      const result = RobustJsonParser.parse<RecallParseResult>(
        '{ "recalls": [ {"id":"evt_001","score":0.9,"reason":"test",}, {"id":"evt_002","score":0.7,"reason":"test2",}, ] }'
      );
      expect(result?.recalls).toHaveLength(2);
    });
  });

  describe('edge cases', () => {
    it('returns null for an empty string', () => {
      expect(RobustJsonParser.parse('')).toBeNull();
    });

    it('returns null for non-JSON text', () => {
      expect(RobustJsonParser.parse('plain text only')).toBeNull();
    });

    it('returns null for incomplete JSON', () => {
      expect(RobustJsonParser.parse('{"key": ')).toBeNull();
    });
  });
});
