import { beforeEach, describe, expect, it } from 'vitest';

const waitForNotifications = () => new Promise((resolve) => setTimeout(resolve, 0));

import { ModelLogger } from '@/core/logger/ModelLogger';

describe('ModelLogger', () => {
  beforeEach(() => {
    ModelLogger.clear();
  });

  it('pairs sent and received entries by id', () => {
    const id = ModelLogger.logSend({
      type: 'trim',
      systemPrompt: 'system',
      userPrompt: 'user',
      model: 'model-a',
    });

    const [sentBefore] = ModelLogger.getPaired();
    const sentRef = sentBefore.sent;

    ModelLogger.logReceive(id, {
      response: 'response',
      status: 'success',
      duration: 123,
    });

    const [paired] = ModelLogger.getPaired();
    expect(paired.sent.id).toBe(id);
    expect(paired.sent.status).toBe('success');
    expect(paired.received?.id).toBe(`${id}_recv`);
    expect(paired.received?.response).toBe('response');
    expect(ModelLogger.getCount()).toBe(1);

    // 不可变更新：原发送条目引用不变，状态由新对象承载
    expect(sentRef.status).toBe('pending');
    expect(paired.sent).not.toBe(sentRef);
  });

  it('notifies subscribers when logs change', async () => {
    let notificationCount = 0;
    const unsubscribe = ModelLogger.subscribe(() => {
      notificationCount += 1;
    });

    ModelLogger.logSend({ type: 'query' });
    await waitForNotifications();

    unsubscribe();
    ModelLogger.logSend({ type: 'query' });
    await waitForNotifications();

    expect(notificationCount).toBe(1);
  });
});
