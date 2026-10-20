/** 数据变更与文件同步的资源参数。 */
export const DATA_SYNC_OPTIONS = {
  changeDelayMs: 500,
  uploadDelayMs: 3000,
  uploadAttempts: 3,
  uploadRetryDelayMs: 1000,
  statusScanChars: 102400,
  largeFileWarningMb: 15,
  notificationDurationMs: 3000,
} as const;

/** 近期召回记录上限。 */
export const RECALL_CACHE_OPTIONS = {
  recentLimit: 35,
} as const;
