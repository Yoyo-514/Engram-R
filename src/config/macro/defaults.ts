import type { CustomMacro } from '@/types/macro';

export const DEFAULT_CUSTOM_MACROS: CustomMacro[] = [
  {
    id: 'custom_user_profile',
    name: 'user_profile',
    content: '',
    enabled: true,
    createdAt: Date.now(),
  },
];
