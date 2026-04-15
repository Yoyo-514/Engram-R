import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import type { FC } from 'react';

import { getSettings, set } from '@/config/settings';
import { useConfigStore } from '@/state/configStore';
import { Switch } from '@/ui/components/core/Switch';
import { NumberField } from '@/ui/components/form/FormComponents';
import { getTheme, setTheme } from '@/ui/services';

import { ThemeSelector } from './ThemeSelector';
import { SettingsSection } from './SettingsSection';

export const AppearanceSettingsSection: FC = () => {
  const { enableAnimations, updateEnableAnimations, saveConfig } = useConfigStore();
  const [, forceUpdate] = useState({});

  const refreshTheme = () => setTheme(getTheme());

  return (
    <SettingsSection title="外观" description="主题、动画和玻璃特效等视觉表现设置。">
      <div className="space-y-6">
        <div className="space-y-4">
          <ThemeSelector />

          <div className="bg-muted/30 rounded-lg border border-border p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="bg-primary/10 flex-shrink-0 rounded-lg p-2 text-primary">
                  <Sparkles size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="truncate font-medium text-foreground">启用 UI 动画</h4>
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    开启或关闭开场、切页及交互动画，关闭可提升低配设备的响应速度
                  </p>
                </div>
              </div>
              <Switch
                checked={enableAnimations}
                onChange={(checked) => {
                  updateEnableAnimations(checked);
                  saveConfig();
                }}
              />
            </div>
          </div>
        </div>

        <div className="bg-muted/30 space-y-6 rounded-lg border border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="min-w-0 flex-1">
                <h4 className="truncate font-medium text-foreground">启用毛玻璃</h4>
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  开启后，面板背景将具有磨砂质感
                </p>
              </div>
            </div>
            <Switch
              checked={getSettings().glassSettings?.enabled ?? true}
              onChange={(checked) => {
                const current = getSettings();
                set('glassSettings', {
                  ...current.glassSettings,
                  enabled: checked,
                });
                refreshTheme();
                forceUpdate({});
              }}
            />
          </div>

          {(getSettings().glassSettings?.enabled ?? true) && (
            <>
              <NumberField
                label="不透明度 (Opacity)"
                description="调整面板背景的遮罩强度，数值越低越透明"
                value={getSettings().glassSettings?.opacity ?? 0.8}
                onChange={(val) => {
                  const current = getSettings();
                  set('glassSettings', {
                    ...current.glassSettings,
                    opacity: val,
                  });
                  refreshTheme();
                  forceUpdate({});
                }}
                min={0}
                max={1}
                step={0.05}
              />
              <NumberField
                label="背景磨砂 (Blur)"
                description="调整背景模糊程度 (px)"
                value={getSettings().glassSettings?.blur ?? 10}
                onChange={(val) => {
                  const current = getSettings();
                  set('glassSettings', {
                    ...current.glassSettings,
                    blur: val,
                  });
                  refreshTheme();
                  forceUpdate({});
                }}
                min={0}
                max={50}
                step={1}
              />
            </>
          )}
        </div>
      </div>
    </SettingsSection>
  );
};
