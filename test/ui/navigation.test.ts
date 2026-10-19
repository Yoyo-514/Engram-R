import { describe, expect, it } from 'vitest';

import { NAV_ITEMS, resolveTab } from '@/ui/shell/navigation';

describe('shell navigation', () => {
  it('resolves every visible page', () => {
    for (const item of NAV_ITEMS) {
      expect(resolveTab(item.id)).toBe(item.id);
    }
  });

  it.each(['dashboard', '/docs', '', 'removed-page'])(
    'opens memory for obsolete or empty page %s',
    (path) => {
      expect(resolveTab(path)).toBe('memory');
    }
  );

  it.each(['presets:prompt:summary', 'memory:entities', 'processing:batch', 'devlog:recall'])(
    'preserves the nested destination %s',
    (path) => {
      expect(resolveTab(`/${path}`)).toBe(path);
    }
  );
});
