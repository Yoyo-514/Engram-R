/** 数据库写入的资源参数。 */
export const DATABASE_OPTIONS = {
  changeDelayMs: 500,
} as const;

/** 近期召回记录上限。 */
export const RECALL_CACHE_OPTIONS = {
  recentLimit: 35,
} as const;
