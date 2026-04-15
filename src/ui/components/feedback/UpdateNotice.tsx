/**
 * UpdateNotice - 更新通知弹窗组件
 *
 * 显示最新版本信息和更新日志
 * V0.8.5: 添加一键更新功能
 * V0.9.12: 修复更新API路径问题，参考 JS-Slash-Runner 实现
 */

import { CheckCircle, Download, Loader2, RefreshCw, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FC } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import {
  hasUpdate as updated,
  clearCache,
  getChangelog,
  getCurrentHash,
  getCurrentVersion,
  getExtensionRuntimeInfo,
  getLatestHash,
  getLatestVersion,
  markAsRead,
} from '@/core/updater/Updater';
import { getTavernContext } from '@/core/utils';
import { notificationService } from '@/ui/services/NotificationService';

interface UpdateNoticeProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * 获取酒馆请求头（用于认证）
 * 从 SillyTavern 上下文或全局变量获取
 */
function getTavernRequestHeaders(): Record<string, string> {
  try {
    // 从 SillyTavern context 获取
    const context = getTavernContext();
    if (context?.getRequestHeaders) {
      return context.getRequestHeaders();
    }
  } catch (e) {
    console.warn('[Engram] 无法获取酒馆请求头', e);
  }
  // 返回最小必要头
  return {
    'Content-Type': 'application/json',
  };
}

/**
 * 调用酒馆扩展更新 API
 * V0.9.12: 动态判断扩展类型，正确设置 global 参数
 */
async function updateEngramExtension(): Promise<{
  success: boolean;
  message: string;
  isUpToDate?: boolean;
}> {
  try {
    const headers = getTavernRequestHeaders();

    const extensionInfo = await getExtensionRuntimeInfo();
    if (!extensionInfo?.name) {
      return { success: false, message: '无法识别当前扩展目录' };
    }

    const isGlobal = extensionInfo.type === 'global';

    console.debug('[Engram] 准备更新扩展:', extensionInfo.name, '| global:', isGlobal);

    const response = await fetch('/api/extensions/update', {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        extensionName: extensionInfo.name,
        global: isGlobal,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('[Engram] 更新失败:', response.status, text);
      return { success: false, message: text || response.statusText };
    }

    const data = await response.json();

    if (data.isUpToDate) {
      return { success: true, message: '扩展已是最新版本', isUpToDate: true };
    }

    return {
      success: true,
      message: `更新成功！新版本: ${data.shortCommitHash || 'latest'}`,
      isUpToDate: false,
    };
  } catch (error) {
    console.error('[Engram] 更新失败:', error);
    return { success: false, message: String(error) };
  }
}

export const UpdateNotice: FC<UpdateNoticeProps> = ({ isOpen, onClose }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [latestHash, setLatestHash] = useState<string | null>(null);
  const [changelog, setChangelog] = useState<string | null>(null);
  const [hasUpdate, setHasUpdate] = useState(false);
  const [isMarking, setIsMarking] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);

  const currentVersion = getCurrentVersion();
  const currentHash = getCurrentHash();

  useEffect(() => {
    if (isOpen) {
      loadUpdateInfo();
      setUpdateMessage(null);
    }
  }, [isOpen]);

  const loadUpdateInfo = async () => {
    setIsLoading(true);
    try {
      const [latest, hash, log, update] = await Promise.all([
        getLatestVersion(),
        getLatestHash(),
        getChangelog(),
        updated(),
      ]);
      setLatestVersion(latest);
      setLatestHash(hash);
      setChangelog(log);
      setHasUpdate(update);
    } catch (e) {
      console.error('[Engram] 加载更新信息失败', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMarkAsRead = async () => {
    setIsMarking(true);
    try {
      // 不传参数，由 UpdateService 内部构建最新的 mark (latestVersion@latestHash)
      await markAsRead();
      onClose();
    } finally {
      setIsMarking(false);
    }
  };

  const handleUpdate = async () => {
    setIsUpdating(true);
    setUpdateMessage(null);

    try {
      const result = await updateEngramExtension();

      if (result.success && !result.isUpToDate) {
        setUpdateMessage('更新成功！页面将在 2 秒后刷新...');
        // V0.9.10: 弹 toastr 通知
        notificationService.success('更新成功！页面即将刷新', 'Engram 更新');
        // 标记为已读
        if (latestVersion) {
          await markAsRead(latestVersion);
        }
        // 延迟刷新页面
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else if (result.isUpToDate) {
        setUpdateMessage('当前已是最新版本');
        setHasUpdate(false);
      } else {
        setUpdateMessage(`更新失败: ${result.message}`);
        // V0.9.10: 弹 toastr 通知
        notificationService.error(`更新失败: ${result.message}`, 'Engram 更新');
      }
    } catch (error) {
      setUpdateMessage(`更新出错: ${String(error)}`);
      notificationService.error(`更新出错: ${String(error)}`, 'Engram 更新');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRefresh = () => {
    clearCache();
    loadUpdateInfo();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="animate-in zoom-in-95 relative flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl duration-200">
        {/* Header */}
        <div className="border-border/50 flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 flex h-8 w-8 items-center justify-center rounded-lg">
              <Download size={16} className="text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">更新通知</h2>
              <p className="text-xs text-muted-foreground">
                当前版本: v{currentVersion} {currentHash !== 'unknown' && `(${currentHash})`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              className="hover:bg-muted/50 rounded-lg p-2 text-muted-foreground transition-colors hover:text-foreground"
              title="刷新"
            >
              <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={onClose}
              className="hover:bg-muted/50 rounded-lg p-2 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <RefreshCw size={24} className="mb-3 animate-spin" />
              <p className="text-sm">正在检查更新...</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Version Status */}
              <div
                className={`rounded-lg border p-4 ${
                  hasUpdate
                    ? 'bg-primary/5 border-primary/20'
                    : 'border-green-500/20 bg-green-500/5'
                } `}
              >
                <div className="flex items-center gap-3">
                  {hasUpdate ? (
                    <Download size={20} className="text-primary" />
                  ) : (
                    <CheckCircle size={20} className="text-green-500" />
                  )}
                  <div className="flex-1">
                    <p className="font-medium text-foreground">
                      {hasUpdate
                        ? `发现新版本: v${latestVersion}${latestHash ? ` (${latestHash})` : ''}`
                        : '已是最新版本'}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {hasUpdate ? '点击下方按钮一键更新' : '无需更新'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Update Message */}
              {updateMessage && (
                <div
                  className={`rounded-lg p-3 text-sm ${
                    updateMessage.includes('成功')
                      ? 'border border-green-500/20 bg-green-500/10 text-green-600'
                      : updateMessage.includes('失败') || updateMessage.includes('出错')
                        ? 'border border-red-500/20 bg-red-500/10 text-red-600'
                        : 'bg-muted/30 text-muted-foreground'
                  } `}
                >
                  {updateMessage}
                </div>
              )}

              {/* Changelog */}
              {changelog && (
                <div className="space-y-2">
                  <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    更新日志
                  </h3>
                  <div className="bg-muted/20 engram-changelog-content max-h-64 overflow-y-auto rounded-lg p-4 text-sm">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{changelog}</ReactMarkdown>
                  </div>
                </div>
              )}

              {!changelog && !isLoading && (
                <div className="py-8 text-center text-muted-foreground">
                  <p className="text-sm">无法获取更新日志</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer - 更新按钮始终可见 */}
        <div className="border-border/50 flex justify-end gap-3 border-t px-5 py-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            关闭
          </button>
          {/* 仅在有更新时显示"稍后再说" */}
          {hasUpdate && (
            <button
              onClick={handleMarkAsRead}
              disabled={isMarking || isUpdating}
              className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              稍后再说
            </button>
          )}
          {/* 更新按钮始终可见 */}
          <button
            onClick={handleUpdate}
            disabled={isUpdating || isMarking}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition-colors disabled:opacity-50 ${
              hasUpdate
                ? 'hover:bg-primary/90 bg-primary text-primary-foreground'
                : 'border border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground'
            }`}
          >
            {isUpdating ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                更新中...
              </>
            ) : hasUpdate ? (
              <>
                <Download size={14} />
                立即更新
              </>
            ) : (
              <>
                <RefreshCw size={14} />
                重新拉取
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
