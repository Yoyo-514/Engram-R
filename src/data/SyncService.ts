import type { DebouncedFunc } from 'lodash-es';
import debounce from 'lodash-es/debounce';

import { getSettings, subscribe } from '@/config/settings';
import { Logger, LogModule } from '@/core/logger';
import { type ChatDataDump, getDbForChat, exportChatData, importChatData } from '@/data/db';
import { eventBus, events, getRequestHeaders, getSTContext } from '@/integrations/tavern';
import { notificationService } from '@/ui/services/NotificationService';

import { DATA_SYNC_OPTIONS } from '../../engram.config';

const MODULE = LogModule.DATA_SYNC;
const SYNC_FILE_PREFIX = 'Engram_sync_';
const SYNC_FILE_EXT = '.json';

class SyncService {
  private static instance: SyncService;
  private debouncedUploads: Map<string, DebouncedFunc<() => void>> = new Map();
  private importingCount = 0;
  private started = false;
  private removeListeners?: () => void;
  private automaticDownloads = new Map<string, Promise<void>>();

  public get isImportingState(): boolean {
    return this.importingCount > 0;
  }

  private get automaticSyncEnabled(): boolean {
    const config = getSettings().syncConfig;
    return config.enabled && config.autoSync;
  }

  private constructor() {
    Logger.info(MODULE, 'Initialized SyncService');
  }

  /** 设置初始化后启动；自动同步关闭时仅订阅配置变更。 */
  public start(): void {
    if (this.started) return;
    this.started = true;
    subscribe(() => this.refreshListeners());
    this.refreshListeners();
  }

  private checkCurrentChat = (): void => {
    const chatId = getSTContext()?.chatId;
    if (chatId) {
      void this.autoSyncDownload(chatId).catch((error) => {
        Logger.error(MODULE, `Auto-download failed for ${chatId}`, error);
      });
    }
  };

  private refreshListeners(): void {
    if (!this.automaticSyncEnabled) {
      this.removeListeners?.();
      this.removeListeners = undefined;
      for (const chatId of this.debouncedUploads.keys()) this.clearPendingUpload(chatId);
      return;
    }
    if (this.removeListeners) return;
    const offChat = eventBus.on(events.CHAT_CHANGED, this.checkCurrentChat);
    const onVisible = () => {
      if (document.visibilityState === 'visible') this.checkCurrentChat();
    };
    document.addEventListener('visibilitychange', onVisible);
    this.removeListeners = () => {
      offChat();
      document.removeEventListener('visibilitychange', onVisible);
    };
    this.checkCurrentChat();
  }

  public static getInstance(): SyncService {
    if (!SyncService.instance) {
      SyncService.instance = new SyncService();
    }
    return SyncService.instance;
  }

  /**
   * 生成同步文件名
   * 格式: Engram_sync_{chatId}.json
   */
  private getSyncFileName(chatId: string): string {
    // 简单清理 chatId，虽然通常已经是安全的
    const safeChatId = chatId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return `${SYNC_FILE_PREFIX}${safeChatId}${SYNC_FILE_EXT}`;
  }

  /**
   * 获取同步文件的完整 URL (用于 fetch)
   */
  private getSyncFileUrl(fileName: string): string {
    // 酒馆上传的文件在 /user/files/ 目录下
    // 添加时间戳防止缓存
    return `/user/files/${fileName}?t=${Date.now()}`;
  }

  /**
   * 清理某个 chat 的待执行上传任务，避免防抖闭包长期滞留
   */
  private clearPendingUpload(chatId: string): void {
    const pending = this.debouncedUploads.get(chatId);
    if (!pending) return;

    pending.cancel();
    this.debouncedUploads.delete(chatId);
  }

  /**
   * 调度自动上传（防抖）
   */
  public scheduleUpload(chatId: string) {
    // 检查导入锁
    if (this.isImportingState) {
      Logger.debug(MODULE, `Skipping upload schedule for ${chatId} (Importing)`);
      return;
    }

    // 检查配置
    if (!this.automaticSyncEnabled) {
      this.clearPendingUpload(chatId);
      return;
    }

    if (!this.debouncedUploads.has(chatId)) {
      const uploadFn = debounce(() => {
        // 任务开始执行后立即释放缓存，避免随聊天数无限增长
        this.debouncedUploads.delete(chatId);

        // 再次检查配置，防止在 debounce 期间被关闭
        if (!this.automaticSyncEnabled || this.isImportingState) {
          return;
        }

        this.upload(chatId).catch((err) => {
          Logger.error(MODULE, `Auto-upload failed for ${chatId}`, err);
        });
      }, DATA_SYNC_OPTIONS.uploadDelayMs);
      this.debouncedUploads.set(chatId, uploadFn);
    }

    const fn = this.debouncedUploads.get(chatId);
    if (fn) fn();
  }

  /**
   * 上传当前聊天数据到服务端 (作为文件)
   */
  public async upload(chatId: string): Promise<boolean> {
    try {
      Logger.info(MODULE, `Starting upload for ${chatId}...`);
      const db = getDbForChat(chatId);
      const dump = await exportChatData(db);

      // 使用数据库中的 lastModified 作为同步时间戳
      // 如果是首次上传或旧库，可能没有 lastModified，则使用当前时间并写入
      let lastModified = (await db.meta.get('lastModified'))?.value as number;

      if (!lastModified) {
        lastModified = Date.now();
        await db.meta.put({ key: 'lastModified', value: lastModified });
        // 更新 dump 中的 meta 以包含新的时间戳
        dump.meta['lastModified'] = lastModified;
      }

      Logger.debug(MODULE, `导出中: ${dump.events.length} 事件, ${dump.entities.length} 实体`);

      const jsonString = JSON.stringify(dump);

      // 增加超大文件预警，防止静默同步失败喵
      const sizeInMB = jsonString.length / (1024 * 1024);
      if (sizeInMB > DATA_SYNC_OPTIONS.largeFileWarningMb) {
        Logger.warn(
          MODULE,
          `同步内容过大 (${sizeInMB.toFixed(2)} MB), 可能会导致同步缓慢或失败喵！`
        );
        notificationService.warning(
          `记忆库较大 (${sizeInMB.toFixed(2)} MB), 同步可能需要更长时间喵~`,
          'Sync'
        );
      }

      const fileName = this.getSyncFileName(chatId);

      // 异步转码方案，防止大文件阻塞主线程
      // 使用 Blob + FileReader 转码为数据 URL，它能流式处理并释放 CPU 压力
      const base64Data = await new Promise<string>((resolve, reject) => {
        const blob = new Blob([jsonString], { type: 'application/json' });
        const reader = new FileReader();
        reader.addEventListener('load', () => {
          const result = reader.result as string;
          // FileReader 的 result 包含 "data:application/json;base64," 前缀，需要剔除
          const base64 = result.split(',')[1];
          resolve(base64);
        });
        reader.addEventListener('error', () => reject(new Error('Base64 encoding failed')));
        reader.readAsDataURL(blob);
      });

      // 使用 /api/files/upload 上传 (带重试逻辑)
      let response: Response | null = null;
      for (let i = 0; i < DATA_SYNC_OPTIONS.uploadAttempts; i++) {
        try {
          response = await fetch('/api/files/upload', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({
              name: fileName,
              data: base64Data,
            }),
          });
          if (response.ok) break;
          Logger.warn(MODULE, `Upload attempt ${i + 1} failed, retrying...`);
        } catch (e) {
          if (i === DATA_SYNC_OPTIONS.uploadAttempts - 1) throw e;
          await new Promise((r) => setTimeout(r, DATA_SYNC_OPTIONS.uploadRetryDelayMs * (i + 1)));
        }
      }

      if (!response || !response.ok) {
        const errText = await response?.text();
        throw new Error(
          `Upload failed after ${DATA_SYNC_OPTIONS.uploadAttempts} attempts: ${response?.statusText} - ${errText}`
        );
      }

      Logger.success(MODULE, `上传完成: ${fileName}`);
      return true;
    } catch (error) {
      Logger.error(MODULE, `Upload error for ${chatId}`, error);
      return false;
    }
  }

  /**
   * 删除远程同步文件 (及本地 user/files/ 下的对应文件)
   */
  public async purge(chatId: string): Promise<void> {
    try {
      this.clearPendingUpload(chatId);
      const fileName = this.getSyncFileName(chatId);
      await fetch('/api/files/delete', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({
          path: fileName, // files API 直接接收文件名作为 path (当不需要子目录时)
        }),
      });
    } catch {
      // Ignore purge errors
    }
  }

  /**
   * 检查远程状态
   * 尝试下载文件头或整个文件来检查是否存在和更新时间
   */
  public async getRemoteStatus(chatId: string): Promise<{ exists: boolean; timestamp: number }> {
    try {
      const fileName = this.getSyncFileName(chatId);
      const url = this.getSyncFileUrl(fileName);

      // 使用 fetch HEAD 请求先检查文件是否存在 (酒馆可能不支持 HEAD，直接 GET)
      // 由于我们需要 meta 信息，且通常文件不会极大，直接 GET
      const response = await fetch(url);

      if (!response.ok) return { exists: false, timestamp: 0 };

      // 放弃直接 response.json() 把整个几 MB 甚至几十 MB 吃进内存
      // 改为流式读取 Buffer 首部，提取 meta.lastModified 后即刻 abort
      const reader = response.body?.getReader();
      if (!reader) {
        // 如果环境不支持流式读取（极少），回退为常规读取
        const dump = (await response.json()) as ChatDataDump;
        return {
          exists: true,
          timestamp: (dump.meta?.lastModified as number) || 0,
        };
      }

      const decoder = new TextDecoder('utf-8');
      let chunkStr = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunkStr += decoder.decode(value, { stream: true });

        // 尝试用正则匹配 `"lastModified": 123456789`
        const match = chunkStr.match(/"lastModified"\s*:\s*(\d+)/);
        if (match) {
          // 取到值后，强制立刻切断后方冗长的数据流下载，拯救内存与带宽喵！
          void reader.cancel();
          return {
            exists: true,
            timestamp: parseInt(match[1], 10),
          };
        }

        // 为了防止极端情况下 meta 不在最前面，但也不会找太久
        // 仅扫描前 100KB (粗略判断)，如果在 100KB 内没找到也 abort 以保安全
        if (chunkStr.length > DATA_SYNC_OPTIONS.statusScanChars) {
          void reader.cancel();
          break;
        }
      }

      return { exists: false, timestamp: 0 };
    } catch {
      // 404 等错误也会进这里
      return { exists: false, timestamp: 0 };
    }
  }

  /**
   * 下载并导入数据
   */
  public async download(chatId: string): Promise<string> {
    this.importingCount++;
    try {
      Logger.info(MODULE, `Downloading for ${chatId}...`);

      const fileName = this.getSyncFileName(chatId);
      const url = this.getSyncFileUrl(fileName);
      const response = await fetch(url);

      if (!response.ok) {
        Logger.warn(MODULE, `No remote data found for ${chatId} (HTTP ${response.status})`);
        return 'no_data';
      }

      const dump = (await response.json()) as ChatDataDump;

      if (!dump.events || !dump.entities) {
        throw new Error('Invalid file format: missing events or entities');
      }

      Logger.debug(MODULE, `接收数据: ${dump.events?.length} 事件, ${dump.entities?.length} 实体`);

      const db = getDbForChat(chatId);
      await importChatData(db, dump);

      // importChatData 应该包含了从服务端来的 meta（其中包含 lastModified）
      // 因此不需要手动 patch 时间戳，数据库状态应当完全与远程一致
      // 如果远程文件是旧版本的（没有 lastModified），则再次上传时会补上

      // 验证写入
      const eventCount = await db.events.count();
      const entityCount = await db.entities.count();
      Logger.debug(MODULE, `导入验证: ${eventCount} 事件, ${entityCount} 实体`);

      return 'success';
    } catch (error) {
      Logger.error(MODULE, `Download failed for ${chatId}`, error);
      return 'error';
    } finally {
      this.importingCount--;
    }
  }

  /**
   * 自动下载同步 (单向：远程 -> 本地)
   * 用于切换聊天时检查
   */
  public async autoSyncDownload(chatId: string): Promise<void> {
    if (!this.automaticSyncEnabled) return;
    const active = this.automaticDownloads.get(chatId);
    if (active) return active;
    const pending = this.downloadIfNewer(chatId);
    this.automaticDownloads.set(chatId, pending);
    try {
      await pending;
    } finally {
      this.automaticDownloads.delete(chatId);
    }
  }

  private async downloadIfNewer(chatId: string): Promise<void> {
    const remoteStatus = await this.getRemoteStatus(chatId);
    if (!remoteStatus.exists || !this.automaticSyncEnabled) return;

    // 比较同一聊天的远端与本地修改时间。
    const db = getDbForChat(chatId);
    const localMeta = await db.meta.get('lastModified');
    const localTs = (localMeta?.value as number) || 0;

    // 如果远程更新
    if (this.automaticSyncEnabled && remoteStatus.timestamp > localTs) {
      Logger.info(
        MODULE,
        `Found newer remote data (${remoteStatus.timestamp} > ${localTs}), downloading...`
      );
      const result = await this.download(chatId);
      if (result === 'success') {
        notificationService.success('已自动同步云端数据', 'Engram', {
          timeOut: DATA_SYNC_OPTIONS.notificationDurationMs,
        });
      }
    } else {
      Logger.debug(
        MODULE,
        `Local data is up to date (Remote: ${remoteStatus.timestamp} <= Local: ${localTs})`
      );
    }
  }

  /**
   * 自动检查并同步
   * @returns 'downloaded' | 'uploaded' | 'synced' | 'error' | 'ignored'
   */
  public async autoSync(chatId: string): Promise<string> {
    const remoteStatus = await this.getRemoteStatus(chatId);

    // 1. 远程无数据 -> 忽略
    if (!remoteStatus.exists) {
      return 'ignored';
    }

    // 2. 检查本地时间
    const db = getDbForChat(chatId);
    const localMeta = await db.meta.get('lastModified');
    const localTs = (localMeta?.value as number) || 0;

    // 如果是本机刚上传的，忽略 (防回环)
    // 通过严格时间戳检查 (remote > local)
    // 如果 remote == local，说明是已同步状态，返回 synced

    // 3. 比较
    if (remoteStatus.timestamp > localTs) {
      Logger.info(
        MODULE,
        `Remote is newer (${remoteStatus.timestamp} > ${localTs}), downloading...`
      );
      const result = await this.download(chatId);
      return result === 'success' ? 'downloaded' : 'error';
    } else {
      // 本地更新，等待 debounce 上传
      return 'synced';
    }
  }
}

export const syncService = SyncService.getInstance();
