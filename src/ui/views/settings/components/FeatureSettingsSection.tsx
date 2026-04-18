import { Eye } from 'lucide-react';
import type { FC } from 'react';

import { summarizerService } from '@/modules/memory';
import { useConfigStore } from '@/state/configStore';
import { Switch } from '@/ui/components/core/Switch';

import { SettingsSection } from './SettingsSection';

export const FeatureSettingsSection: FC = () => {
  const { summarizerConfig, preprocessConfig, updateConfig } = useConfigStore();

  return (
    <SettingsSection title="功能" description="控制总结、预处理等功能的交互行为。">
      <div className="space-y-4">
        <div className="bg-muted/30 rounded-lg border border-border p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex w-full min-w-0 flex-1 items-center gap-3">
              <div className="bg-primary/10 flex-shrink-0 rounded-lg p-2 text-primary">
                <Eye size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-medium leading-5 text-foreground sm:truncate">
                  启用修订模式
                </h4>
                <p className="mt-1 whitespace-normal break-words text-sm leading-5 text-muted-foreground sm:line-clamp-2">
                  在写入长期记忆前，弹出预览窗口。
                </p>
              </div>
            </div>
            <div className="flex-shrink-0 pt-0.5">
              <Switch
                checked={summarizerConfig.previewEnabled}
                onChange={(checked) => {
                  summarizerService.setRuntimeConfig({ previewEnabled: checked });
                  updateConfig('summarizerConfig', (prev) => ({
                    ...prev,
                    previewEnabled: checked,
                  }));
                }}
              />
            </div>
          </div>
        </div>

        <div className="bg-muted/30 rounded-lg border border-border p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex w-full min-w-0 flex-1 items-center gap-3">
              <div className="bg-primary/10 flex-shrink-0 rounded-lg p-2 text-primary">
                <Eye size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-medium leading-5 text-foreground sm:truncate">
                  预处理修订模式
                </h4>
                <p className="mt-1 whitespace-normal break-words text-sm leading-5 text-muted-foreground sm:line-clamp-2">
                  在注入用户输入前，弹出预览窗口。
                </p>
              </div>
            </div>
            <div className="flex-shrink-0 pt-0.5">
              <Switch
                checked={preprocessConfig.preview}
                onChange={(checked) => {
                  updateConfig('preprocessConfig', (prev) => ({
                    ...prev,
                    preview: checked,
                  }));
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </SettingsSection>
  );
};
