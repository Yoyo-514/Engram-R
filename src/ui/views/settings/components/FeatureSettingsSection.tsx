import { Eye } from 'lucide-react';
import { useState } from 'react';
import type { FC } from 'react';

import { DEFAULT_PREPROCESS_CONFIG } from '@/config/preprocess/defaults';
import { getSettings } from '@/config/settings';
import { summarizerService } from '@/modules/memory';
import { preprocessor } from '@/modules/preprocess';
import { Switch } from '@/ui/components/core/Switch';

import { SettingsSection } from './SettingsSection';

export const FeatureSettingsSection: FC = () => {
  const [previewEnabled, setPreviewEnabled] = useState(
    getSettings().summarizerConfig?.previewEnabled ?? true
  );
  const [preprocessingPreviewEnabled, setPreprocessingPreviewEnabled] = useState(
    getSettings().preprocessConfig?.preview ?? DEFAULT_PREPROCESS_CONFIG.preview
  );

  return (
    <SettingsSection title="功能" description="控制总结、预处理等功能的交互行为。">
      <div className="space-y-4">
        <div className="bg-muted/30 rounded-lg border border-border p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex w-full min-w-0 flex-1 items-center gap-3">
              <div className="bg-primary/10 flex-shrink-0 rounded-lg p-2 text-primary">
                <Eye size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-medium leading-5 text-foreground sm:truncate">
                  启用修订模式
                </h4>
                <p className="mt-1 text-sm leading-5 text-muted-foreground sm:line-clamp-2">
                  在写入长期记忆前，弹出预览窗口。
                </p>
              </div>
            </div>
            <Switch
              checked={previewEnabled}
              onChange={(checked) => {
                setPreviewEnabled(checked);
                summarizerService.updateConfig({ previewEnabled: checked });
              }}
            />
          </div>
        </div>

        <div className="bg-muted/30 rounded-lg border border-border p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex w-full min-w-0 flex-1 items-center gap-3">
              <div className="bg-primary/10 flex-shrink-0 rounded-lg p-2 text-primary">
                <Eye size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-medium leading-5 text-foreground sm:truncate">
                  预处理修订模式
                </h4>
                <p className="mt-1 text-sm leading-5 text-muted-foreground sm:line-clamp-2">
                  在注入用户输入前，弹出预览窗口。
                </p>
              </div>
            </div>
            <Switch
              checked={preprocessingPreviewEnabled}
              onChange={(checked) => {
                setPreprocessingPreviewEnabled(checked);
                const currentConfig = preprocessor.getConfig();
                preprocessor.saveConfig({
                  ...currentConfig,
                  preview: checked,
                });
              }}
            />
          </div>
        </div>
      </div>
    </SettingsSection>
  );
};
