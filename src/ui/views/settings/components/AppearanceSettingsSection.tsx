import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import type { FC } from 'react';

import { getSettings, set } from '@/config/settings';
import { useConfigStore } from '@/state/configStore';
import { Switch } from '@/ui/components/core/Switch';
import { NumberField } from '@/ui/components/form/FormComponents';
import { getTheme, setTheme } from '@/ui/services';

import { SettingsSection } from './SettingsSection';
import { ThemeSelector } from './ThemeSelector';

export const AppearanceSettingsSection: FC = () => {
  const { enableAnimations, updateEnableAnimations, saveConfig } = useConfigStore();
  const [, forceUpdate] = useState({});

  const refreshTheme = () => setTheme(getTheme());
  const glassEnabled = getSettings().glassSettings?.enabled ?? true;

  return (
    <SettingsSection title="外观" description="调整主题、动画与玻璃效果等界面表现。">
      <div className="space-y-6">
        <div className="space-y-4">
          <ThemeSelector />

          <div className="bg-muted/30 rounded-lg border border-border p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex w-full min-w-0 flex-1 items-center gap-3">
                <div className="bg-primary/10 flex-shrink-0 rounded-lg p-2 text-primary">
                  <Sparkles size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-medium leading-5 text-foreground sm:truncate">
                    启用 UI 动画
                  </h4>
                  <p className="mt-1 whitespace-normal break-words text-sm leading-5 text-muted-foreground sm:line-clamp-2">
                    控制页面切换、卡片悬停与状态反馈等界面动画。
                  </p>
                </div>
              </div>
              <div className="flex-shrink-0 pt-0.5">
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
        </div>

        <div className="bg-muted/30 space-y-6 rounded-lg border border-border p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex w-full min-w-0 flex-1 items-center gap-3">
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-medium leading-5 text-foreground sm:truncate">
                  启用毛玻璃
                </h4>
                <p className="mt-1 whitespace-normal break-words text-sm leading-5 text-muted-foreground sm:line-clamp-2">
                  控制整体背景的透明度与模糊效果。
                </p>
              </div>
            </div>
            <div className="flex-shrink-0 pt-0.5">
              <Switch
                checked={glassEnabled}
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
          </div>

          {glassEnabled && (
            <>
              <NumberField
                label="透明度 (Opacity)"
                description="控制背景玻璃层的透明程度。"
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
                label="模糊强度 (Blur)"
                description="控制玻璃层的背景模糊半径，单位为像素。"
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
