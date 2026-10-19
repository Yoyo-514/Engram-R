import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FetchContext } from '@/modules/workflow/steps/context/FetchContext';
import type { JobContext } from '@/types/job_context';

const { chatContext, getChatMessages, regexProcessor } = vi.hoisted(() => {
  const chatContext = {
    chat: [] as { mes: string; name: string; is_user: boolean }[],
    name1: 'User',
  };

  return {
    chatContext,
    getChatMessages: vi.fn<
      (range: string) => { message: string; name: string; role: string; is_hidden: boolean }[]
    >((range) => {
      const [start, end] = range.split('-').map(Number);
      return chatContext.chat.slice(start, end + 1).map((message) => ({
        message: message.mes,
        name: message.name,
        role: message.is_user ? 'user' : 'assistant',
        is_hidden: false,
      }));
    }),
    regexProcessor: {
      getRevision: () => 0,
      process: (text: string) => text,
      processAsync: vi.fn<(text: string) => Promise<string>>(async (text) => text),
    },
  };
});

vi.mock('@/config/settings', () => ({
  get: () => ({
    worldbookConfig: { enabled: false },
    regexConfig: { enableNativeRegex: false },
  }),
}));

vi.mock('@/core/logger', () => ({
  Logger: {
    debug: vi.fn<(...args: unknown[]) => void>(),
    warn: vi.fn<(...args: unknown[]) => void>(),
  },
}));

vi.mock('@/core/utils', () => ({
  getCurrentTavernCharacter: () => null,
  getTavernHelper: () => ({ getChatMessages }),
}));

vi.mock('@/integrations/llm', () => ({ getAllTemplates: () => [] }));
vi.mock('@/integrations/tavern/core/context', () => ({
  getSTContext: () => chatContext,
}));
// 保留真实的历史读取与范围选择逻辑，只替换酒馆宿主接口和无关服务。
vi.mock('@/integrations/tavern', async () => {
  const { getChatHistory } = await import('@/integrations/tavern/chat/chatHistory');
  return {
    getChatHistory,
    getSTContext: () => chatContext,
    getCurrentCharacter: () => null,
    getSummaries: () => '',
    getEntityStates: () => '',
  };
});

vi.mock('@/modules/memory', () => ({
  summarizerService: { getConfig: () => ({ floorInterval: 20 }) },
}));
vi.mock('@/modules/workflow/steps', () => ({ regexProcessor }));
vi.mock('@/modules/workflow/steps/preprocess/RegexProcessor', () => ({ regexProcessor }));
vi.mock('@/state/memoryStore', () => ({
  useMemoryStore: { getState: () => ({ lastSummarizedFloor: 0 }) },
}));

function createContext(input: JobContext['input'] = { range: [1, 2] }): JobContext {
  return {
    id: 'summary-test',
    trigger: 'manual',
    config: {},
    input,
    metadata: { startTime: 0, stepsExecuted: [] },
  };
}

describe('FetchContext chat history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    regexProcessor.processAsync.mockImplementation(async (text: string) => text);
    chatContext.chat = [
      { mes: '用户消息', name: 'User', is_user: true },
      { mes: '原回复', name: 'Character', is_user: false },
    ];
  });

  it('reads the selected floor range from the current chat', async () => {
    const context = createContext({ range: [2, 2] });

    await new FetchContext().execute(context);

    expect(context.input.chatHistory).toBe('原回复');
    expect(getChatMessages).toHaveBeenCalledExactlyOnceWith('1-1', {
      hide_state: 'all',
      include_swipes: false,
    });
  });

  it('uses the new reply after a reroll at the same floor', async () => {
    const step = new FetchContext();
    const original = createContext();
    await step.execute(original);
    expect(original.input.chatHistory).toBe('用户消息\n\n原回复');

    chatContext.chat[1].mes = '重 roll 后的回复';
    const rerolled = createContext();
    await step.execute(rerolled);

    expect(rerolled.input.chatHistory).toBe('用户消息\n\n重 roll 后的回复');
  });

  it('uses the remaining messages after a message is deleted', async () => {
    const step = new FetchContext();
    chatContext.chat.push({ mes: '保留的后续消息', name: 'User', is_user: true });
    const original = createContext({ range: [1, 3] });
    await step.execute(original);
    expect(original.input.chatHistory).toBe('用户消息\n\n原回复\n\n保留的后续消息');

    chatContext.chat.splice(1, 1);
    const afterDeletion = createContext({ range: [1, 3] });
    await step.execute(afterDeletion);

    expect(afterDeletion.input.chatHistory).toBe('用户消息\n\n保留的后续消息');
  });

  it('reads a larger range in one snapshot', async () => {
    chatContext.chat = Array.from({ length: 9 }, (_, index) => ({
      mes: `消息 ${index + 1}`,
      name: 'Character',
      is_user: false,
    }));
    const context = createContext({ range: [1, 9] });

    await new FetchContext().execute(context);

    expect(context.input.chatHistory).toBe(
      chatContext.chat.map((message) => message.mes).join('\n\n')
    );
    expect(getChatMessages).toHaveBeenCalledExactlyOnceWith('0-8', {
      hide_state: 'all',
      include_swipes: false,
    });
  });

  it('preserves recent-history selection when no range is provided', async () => {
    const context = createContext({});

    await new FetchContext().execute(context);

    expect(context.input.chatHistory).toBe('用户消息\n\n原回复');
    expect(getChatMessages).not.toHaveBeenCalled();
  });

  it.each(['text', 'chatHistory'])(
    'cleans imported %s without reading chat messages',
    async (field) => {
      regexProcessor.processAsync.mockResolvedValueOnce('清洗后的导入文本');
      const context = createContext({ isImport: true, [field]: '导入文本' });

      await new FetchContext().execute(context);

      expect(context.input.chatHistory).toBe('清洗后的导入文本');
      expect(regexProcessor.processAsync).toHaveBeenCalledExactlyOnceWith('导入文本', 'input');
      expect(getChatMessages).not.toHaveBeenCalled();
    }
  );

  it('preserves pre-cleaned imported history when input cleaning is skipped', async () => {
    const context = createContext({ isImport: true, text: '已清洗的导入文本' });
    context.config.skipInputRegexForHistory = true;

    await new FetchContext().execute(context);

    expect(context.input.chatHistory).toBe('已清洗的导入文本');
    expect(regexProcessor.processAsync).not.toHaveBeenCalled();
    expect(getChatMessages).not.toHaveBeenCalled();
  });
});
