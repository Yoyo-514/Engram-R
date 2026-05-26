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
