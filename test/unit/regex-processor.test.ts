import { beforeEach, describe, expect, it, vi } from 'vitest';

const { settingsGetMock } = vi.hoisted(() => ({
  settingsGetMock: vi.fn(),
}));

vi.mock('@/config/settings', () => ({
  SettingsManager: {
    get: settingsGetMock,
  },
}));

vi.mock('@/core/logger', () => ({
  Logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}));

import { RegexProcessor, type RegexRule } from '@/modules/workflow/steps/processing/RegexProcessor';

const SAMPLE_RULE: RegexRule = {
  id: 'trim-think',
  name: 'Trim Think',
  pattern: '<think>[\\s\\S]*?<\\/think>',
  replacement: '',
  enabled: true,
  flags: 'gi',
  scope: 'both',
};

describe('RegexProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settingsGetMock.mockImplementation((key: string) => {
      if (key === 'apiSettings') {
        return { regexConfig: { enableEngramRegex: true } };
      }
      return undefined;
    });
  });

  it('should skip process when Engram regex is disabled', () => {
    settingsGetMock.mockImplementation((key: string) => {
      if (key === 'apiSettings') {
        return { regexConfig: { enableEngramRegex: false } };
      }
      return undefined;
    });

    const processor = new RegexProcessor([SAMPLE_RULE]);
    expect(processor.process('hello<think>secret</think>', 'output')).toBe(
      'hello<think>secret</think>'
    );
  });

  it('should still process preview rule when Engram regex is disabled', () => {
    settingsGetMock.mockImplementation((key: string) => {
      if (key === 'apiSettings') {
        return { regexConfig: { enableEngramRegex: false } };
      }
      return undefined;
    });

    const processor = new RegexProcessor([SAMPLE_RULE]);
    expect(processor.processWithRule('hello<think>secret</think>', SAMPLE_RULE)).toBe('hello');
  });

  it('should apply enabled rules when Engram regex is enabled', () => {
    const processor = new RegexProcessor([SAMPLE_RULE]);
    expect(processor.process('hello<think>secret</think>', 'output')).toBe('hello');
  });
});
