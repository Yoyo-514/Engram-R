import type { CustomMacro } from '@/types/macro';

export const DEFAULT_CUSTOM_MACROS: CustomMacro[] = [
  {
    id: 'custom_user_profile',
    name: '用户画像',
    content: '',
    enabled: true,
    createdAt: Date.now(),
  },
];
