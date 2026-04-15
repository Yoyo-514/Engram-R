import type { WorldbookConfig } from '@/types/worldbook';

export const DEFAULT_WORLDBOOK_CONFIG: WorldbookConfig = {
  enabled: true,
  includeGlobal: true,
  disabledWorldbooks: ['engram'],
  enableEJS: true,
};
