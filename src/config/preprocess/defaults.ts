import type { PreprocessConfig } from '@/types/preprocess';

/** 默认预处理配置 */
export const DEFAULT_PREPROCESS_CONFIG: PreprocessConfig = {
  enabled: false,
  templateId: 'query_enhance',
  autoTrigger: true,
  preview: true, // 默认开启预览
};
