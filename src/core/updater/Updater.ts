import { get, set } from '@/config/settings';
import { getRequestHeaders } from '@/integrations/tavern';
import { notificationService } from '@/ui/services/NotificationService';

import manifest from '../../../manifest.json';

declare const __COMMIT_HASH__: string;

type TavernGitStatus = {
  isUpToDate: boolean;
  currentCommitHash: string;
};

type DiscoveredExtension = {
  name: string;
  type: string;
};

export type ExtensionRuntimeInfo = {
  name: string;
  type: 'global' | 'local' | 'system';
};

/** GitHub 仓库配置 */
const REPO_CONFIG = {
  owner: 'Yoyo-514',
  repo: 'Engram-R',
  branch: 'main',
};

/** 当前开发版本 */
const EXTENSION_DISPLAY_NAME = manifest.display_name;
const BUNDLED_VERSION = manifest.version;

function getRuntimeExtensionDirectoryName(): string | null {
  try {
    const runtimeDirUrl = new URL(/* @vite-ignore */ '..', import.meta.url);
    const path = decodeURIComponent(runtimeDirUrl.pathname);
    const parts = path.split('/').filter(Boolean);
    const leaf = parts[parts.length - 1]?.trim();
    return leaf || null;
  } catch {
    return null;
  }
}

const RUNTIME_EXTENSION_DIRECTORY = getRuntimeExtensionDirectoryName();

const EXTENSION_NAME_CANDIDATES = Array.from(
  new Set(
    [
      RUNTIME_EXTENSION_DIRECTORY,
      EXTENSION_DISPLAY_NAME,
      REPO_CONFIG.repo,
      manifest.homePage
        ?.split('/')
        .filter(Boolean)
        .pop()
        ?.replace(/\.git$/i, ''),
      'Engram_project',
      'Engram',
    ].filter((name): name is string => Boolean(name?.trim()))
  )
);

const CURRENT_HASH_FALLBACK = 'unknown';

/** 缓存 */
let cachedLatestVersion: string | null = null;
let cachedLatestHash: string | null = null;
let cachedRealLocalHash: string | null = null;
let cachedRealExtensionName: string | null = null;
let cachedExtensionRuntimeInfo: ExtensionRuntimeInfo | null = null;
let cachedChangelog: string | null = null;

function normalizeExtensionName(name: string): string {
  return name.trim().toLowerCase();
}

function extractExtensionLeaf(name: string): string {
  const parts = name.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] || name;
}

function matchesExtensionName(name: string, candidates: readonly string[]): boolean {
  const normalizedName = normalizeExtensionName(name);

  return candidates.some((candidate) => {
    const normalizedCandidate = normalizeExtensionName(candidate);
    return normalizedName === normalizedCandidate;
  });
}

/**
 * 比较版本号
 * @returns 1 if a > b, -1 if a < b, 0 if equal
 */
export function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }

  return 0;
}

function getDefaultExtensionName(): string {
  return RUNTIME_EXTENSION_DIRECTORY || EXTENSION_DISPLAY_NAME || REPO_CONFIG.repo || 'Engram';
}

export function getBundledVersion(): string {
  return BUNDLED_VERSION;
}

/**
 * 获取当前版本
 */
export function getCurrentVersion(): string {
  return BUNDLED_VERSION;
}

/**
 * 获取当前哈希 (优先使用后端获取的真实哈希)
 */
export function getCurrentHash(): string {
  return cachedRealLocalHash || __COMMIT_HASH__ || CURRENT_HASH_FALLBACK;
}

/**
 * 获取真实的本地哈希 (从酒馆后端获取)
 */
export async function getRealLocalHash(): Promise<string> {
  if (cachedRealLocalHash) return cachedRealLocalHash;

  const tavernStatus = await getTavernGitStatus();
  if (tavernStatus?.currentCommitHash) {
    cachedRealLocalHash = tavernStatus.currentCommitHash.substring(0, 7);
    return cachedRealLocalHash;
  }

  return CURRENT_HASH_FALLBACK;
}

/**
 * 从 GitHub 获取最新提交哈希
 */
export async function getLatestHash(): Promise<string | null> {
  if (cachedLatestHash) {
    return cachedLatestHash;
  }

  try {
    const url = `https://api.github.com/repos/${REPO_CONFIG.owner}/${REPO_CONFIG.repo}/commits/${REPO_CONFIG.branch}`;
    const response = await fetch(url);

    if (response.ok) {
      const responseData: unknown = await response.json();
      const sha =
        typeof responseData === 'object' &&
        responseData !== null &&
        'sha' in responseData &&
        typeof responseData.sha === 'string'
          ? responseData.sha
          : null;

      cachedLatestHash = sha ? sha.substring(0, 7) : null;
      return cachedLatestHash;
    }
  } catch {
    // 静默失败
  }

  return null;
}

/**
 * 尝试从酒馆后端获取自身 Git 状态
 */
export async function getTavernGitStatus(): Promise<TavernGitStatus | null> {
  try {
    const extensionInfo = await getExtensionRuntimeInfo();
    if (!extensionInfo) return null;

    const response = await fetch('/api/extensions/version', {
      method: 'POST',
      headers: getRequestHeaders(),
      body: JSON.stringify({
        extensionName: extensionInfo.name,
        global: extensionInfo.type === 'global',
      }),
    });

    if (response.ok) {
      return (await response.json()) as TavernGitStatus;
    }
  } catch {
    // 静默失败
  }

  return null;
}

/**
 * 通过酒馆 discover API 找到匹配的真实目录名
 * 解决开发环境与生产环境目录名不一致的问题
 */
export async function getExtensionRuntimeInfo(): Promise<ExtensionRuntimeInfo | null> {
  if (cachedExtensionRuntimeInfo) return cachedExtensionRuntimeInfo;

  try {
    const response = await fetch('/api/extensions/discover', {
      headers: getRequestHeaders(),
    });

    if (!response.ok) {
      console.debug('[Engram] discover API 不可用，使用默认扩展标识', response.status);
    } else {
      const extensions = (await response.json()) as DiscoveredExtension[];
      const found = extensions.find((ext) =>
        matchesExtensionName(extractExtensionLeaf(ext.name), EXTENSION_NAME_CANDIDATES)
      );

      if (found) {
        cachedExtensionRuntimeInfo = {
          name: extractExtensionLeaf(found.name),
          type:
            found.type === 'global' || found.type === 'system' || found.type === 'local'
              ? found.type
              : 'local',
        };
        cachedRealExtensionName = cachedExtensionRuntimeInfo.name;
        console.debug('[Engram] 自动识别扩展标识:', cachedExtensionRuntimeInfo);
        return cachedExtensionRuntimeInfo;
      }

      console.debug(
        '[Engram] discover 未匹配到扩展目录，使用默认扩展标识',
        EXTENSION_NAME_CANDIDATES
      );
    }
  } catch (e) {
    console.warn('[Engram] 自动识别目录名失败', e);
  }

  cachedExtensionRuntimeInfo = {
    name: getDefaultExtensionName(),
    type: 'local',
  };
  cachedRealExtensionName = cachedExtensionRuntimeInfo.name;
  console.debug('[Engram] 使用默认扩展标识:', cachedExtensionRuntimeInfo);

  return cachedExtensionRuntimeInfo;
}

export async function getRealExtensionName(): Promise<string | null> {
  if (cachedRealExtensionName) return cachedRealExtensionName;
  const extensionInfo = await getExtensionRuntimeInfo();
  return extensionInfo?.name || null;
}

/**
 * 从 GitHub 获取最新版本号
 */
export async function getLatestVersion(): Promise<string | null> {
  if (cachedLatestVersion) {
    return cachedLatestVersion;
  }

  try {
    const url = `https://raw.githubusercontent.com/${REPO_CONFIG.owner}/${REPO_CONFIG.repo}/${REPO_CONFIG.branch}/manifest.json`;
    const response = await fetch(url);

    if (!response.ok) {
      return null;
    }

    const responseData: unknown = await response.json();
    const version =
      typeof responseData === 'object' &&
      responseData !== null &&
      'version' in responseData &&
      typeof responseData.version === 'string'
        ? responseData.version
        : null;

    cachedLatestVersion = version;
    return cachedLatestVersion;
  } catch {
    return null;
  }
}

/**
 * 检查是否有更新 (版本优先)
 */
export async function hasUpdate(): Promise<boolean> {
  const [latestVersion, localRealHash, latestHash] = await Promise.all([
    getLatestVersion(),
    getRealLocalHash(),
    getLatestHash(),
  ]);

  if (latestVersion && compareVersions(latestVersion, BUNDLED_VERSION) > 0) {
    return true;
  }

  if (latestHash && localRealHash !== 'unknown' && latestHash !== localRealHash) {
    return true;
  }

  const tavernStatus = await getTavernGitStatus();
  if (tavernStatus && !tavernStatus.isUpToDate) {
    return true;
  }

  return false;
}

/**
 * 获取更新日志
 */
export async function getChangelog(): Promise<string | null> {
  if (cachedChangelog) {
    return cachedChangelog;
  }

  try {
    const url = `https://raw.githubusercontent.com/${REPO_CONFIG.owner}/${REPO_CONFIG.repo}/${REPO_CONFIG.branch}/CHANGELOG.md`;
    const response = await fetch(url);

    if (!response.ok) {
      console.warn('[Engram] UpdateService: 获取更新日志失败', response.status);
      notificationService.warning(`获取更新日志失败: ${response.status}`, '更新检测');
      return null;
    }

    cachedChangelog = await response.text();
    return cachedChangelog;
  } catch (e) {
    console.error('[Engram] UpdateService: 获取更新日志异常', e);
    notificationService.error('获取更新日志异常', '更新检测');
    return null;
  }
}

/**
 * 获取已读标识 (优先哈希，次之版本)
 */
export function getReadMark(): string {
  try {
    return get('lastReadVersion') || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * 标记标识已读
 * @param mark 可选，手动指定标记内容 (version@hash)
 */
export async function markAsRead(mark?: string): Promise<void> {
  const targetMark =
    mark ||
    `${(await getLatestVersion()) || BUNDLED_VERSION}@${(await getLatestHash()) || (await getRealLocalHash())}`;

  try {
    set('lastReadVersion', targetMark);
    console.debug('[Engram] UpdateService: 已标记已读', targetMark);
  } catch (e) {
    console.error('[Engram] UpdateService: 标记失败', e);
  }
}

/**
 * 检查是否有未读更新
 */
export async function hasUnreadUpdate(): Promise<boolean> {
  const updateAvailable = await hasUpdate();
  if (!updateAvailable) return false;

  const latestVersion = (await getLatestVersion()) || BUNDLED_VERSION;
  const latestHash = (await getLatestHash()) || (await getRealLocalHash());
  const currentMark = `${latestVersion}@${latestHash}`;

  const readMark = getReadMark();
  return readMark !== currentMark;
}

/**
 * 清除缓存（强制刷新）
 */
export function clearCache(): void {
  cachedLatestVersion = null;
  cachedLatestHash = null;
  cachedRealLocalHash = null;
  cachedRealExtensionName = null;
  cachedExtensionRuntimeInfo = null;
  cachedChangelog = null;
}
