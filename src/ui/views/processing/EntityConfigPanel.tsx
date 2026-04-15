import { Archive, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FC } from 'react';

import { engramEventBus } from '@/core/events';
import { entityBuilder } from '@/modules/memory/EntityExtractor';
/**
 * EntityConfigPanel - 实体提取配置面板
 *
 * V0.9.2: 遵循「无框流体」设计，与 SummaryPanel 风格统一
 * - 默认关闭
 * - 顶层开关 + 详细配置
 * - 去卡片化，使用细线分割
 * V1.4.2: 增加自动归档与手动清理功能
 */
import type { EntityExtractConfig } from '@/types/memory';
import { SliderField } from '@/ui/components/core/SliderField';
import { SwitchField } from '@/ui/components/form/FormComponents';
import { Divider } from '@/ui/components/layout/Divider';

interface EntityStatus {
  enabled: boolean;
  trigger: string;
  floorInterval: number;
  lastExtractedFloor: number;
  entityCount: number;
  archivedCount: number;
  isExtracting: boolean;
}

interface EntityConfigPanelProps {
  config: EntityExtractConfig;
  onChange: (config: EntityExtractConfig) => void;
}

export const EntityConfigPanel: FC<EntityConfigPanelProps> = ({ config, onChange }) => {
  const [status, setStatus] = useState<EntityStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // 加载状态 (Operational Status)
  const loadStatus = async () => {
    try {
      const s = (await entityBuilder.getStatus()) as EntityStatus;
      setStatus(s);
    } catch (e) {
      console.error('[EntityConfigPanel] Failed to load status:', e);
    }
  };

  useEffect(() => {
    void loadStatus();
  }, []);

  // Decoupled State Sync via engramEventBus
  useEffect(() => {
    const { unsubscribe } = engramEventBus.on('ENTITY_ARCHIVED', () => {
      void loadStatus();
    });
    return unsubscribe;
  }, []);

  // 切换启用状态
  const handleToggleEnabled = () => {
    const newConfig = { ...config, enabled: !config.enabled };
    onChange(newConfig);
    entityBuilder.updateConfig(newConfig);
  };

  // 更新楼层间隔
  const handleIntervalChange = (value: number) => {
    const newConfig = { ...config, floorInterval: Math.max(2, value) };
    onChange(newConfig);
    entityBuilder.updateConfig(newConfig);
  };

  // 切换自动归档
  const handleToggleAutoArchive = () => {
    const newConfig = { ...config, autoArchive: !config.autoArchive };
    onChange(newConfig);
    entityBuilder.updateConfig(newConfig);
  };

  // 更新归档上限
  const handleArchiveLimitChange = (value: number) => {
    const newConfig = { ...config, archiveLimit: Math.max(10, value) };
    onChange(newConfig);
    entityBuilder.updateConfig(newConfig);
  };

  // 手动提取
  const handleManualExtract = async () => {
    setIsLoading(true);
    try {
      const result = await entityBuilder.extractManual(false);
      if (result && result.success) {
        await loadStatus();
      }
    } catch (e) {
      console.error('[EntityConfigPanel] Manual extraction failed:', e);
    } finally {
      setIsLoading(false);
    }
  };

  // 立即执行归档清理
  const handleArchiveNow = async () => {
    setIsLoading(true);
    try {
      await entityBuilder.checkAndArchiveEntities();
      // loadStatus() 已经由 EventBus 监听器处理，不再需要手动调用
    } catch (e) {
      console.error('[EntityConfigPanel] Manual archiving failed:', e);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12">
      {/* ========== 左栏：状态监控 ========== */}
      <section className="space-y-8">
        <div>
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              状态监控
            </h2>
            <button
              className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
              onClick={loadStatus}
              title="刷新"
            >
              <RefreshCw size={14} />
            </button>
          </div>

          {status ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <span className="mb-1 block text-xs text-muted-foreground">活跃实体</span>
                  <div className="font-mono text-3xl font-light text-value">
                    {status.entityCount - status.archivedCount}
                  </div>
                </div>
                <div>
                  <span className="mb-1 block text-xs text-muted-foreground">已归档</span>
                  <div className="text-muted-foreground/60 font-mono text-3xl font-light">
                    {status.archivedCount}
                  </div>
                </div>
              </div>

              <Divider length={100} spacing="md" />

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <span className="text-muted-foreground/70 mb-1 block text-[10px] uppercase tracking-wider">
                    楼层间隔
                  </span>
                  <div className="text-foreground/80 font-mono text-xl">{status.floorInterval}</div>
                </div>
                <div>
                  <span className="text-muted-foreground/70 mb-1 block text-[10px] uppercase tracking-wider">
                    上次提取楼层
                  </span>
                  <div className="text-foreground/80 font-mono text-xl">
                    {status.lastExtractedFloor}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">加载中...</p>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleManualExtract}
            disabled={isLoading || status?.isExtracting || !config.enabled}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            {isLoading ? '提取中...' : '手动提取'}
          </button>

          <button
            onClick={handleArchiveNow}
            disabled={isLoading || !config.enabled}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-emphasis disabled:cursor-not-allowed disabled:opacity-50"
            title="立即根据上限归档旧记忆"
          >
            <Archive size={14} />
            立即清理
          </button>
        </div>
      </section>

      {/* ========== 右栏：配置 ========== */}
      <section className="relative space-y-6 lg:pl-8">
        <Divider responsive length={30} />

        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium text-foreground">实体提取</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              从对话中提取角色、地点、物品等实体
            </p>
          </div>
          <SwitchField label="" checked={config.enabled} onChange={handleToggleEnabled} />
        </div>

        <div
          className={`space-y-6 transition-opacity ${config.enabled ? 'opacity-100' : 'pointer-events-none opacity-40'}`}
        >
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              每隔{' '}
              <span className="mx-0.5 text-base font-medium text-foreground">
                {config.floorInterval}
              </span>{' '}
              楼触发一次提取
            </div>
            <SliderField
              min={2}
              max={100}
              step={1}
              value={config.floorInterval}
              onChange={(val) => handleIntervalChange(val)}
            />
          </div>

          <p className="text-muted-foreground/70 text-xs leading-relaxed">
            实体提取会从对话中识别并提取角色、地点、物品等关键信息，用于构建知识图谱。
          </p>

          <Divider spacing="md" />

          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-medium text-foreground">自动归档</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">当活跃实体数量过多时自动清理</p>
              </div>
              <SwitchField
                label=""
                checked={config.autoArchive ?? true}
                onChange={handleToggleAutoArchive}
              />
            </div>

            <div
              className={`space-y-3 transition-opacity ${(config.autoArchive ?? true) ? 'opacity-100' : 'pointer-events-none opacity-40'}`}
            >
              <div className="text-xs text-muted-foreground">
                活跃实体上限:{' '}
                <span className="mx-0.5 text-base font-medium text-foreground">
                  {config.archiveLimit ?? 50}
                </span>
              </div>
              <SliderField
                min={10}
                max={200}
                step={5}
                value={config.archiveLimit ?? 50}
                onChange={(val) => handleArchiveLimitChange(val)}
              />
              <p className="text-muted-foreground/60 text-[10px] italic">
                * 只有未被锁定的实体会被自动归档。归档后的实体将不再参与实时召回。
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
