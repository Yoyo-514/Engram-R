import { Database } from 'lucide-react';
import type { FC } from 'react';

import { SimpleModal } from '@/ui/components/feedback/SimpleModal';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExecute: () => void;
  availableDbs: string[];
  selectedDb: string;
  onSelectDb: (dbName: string) => void;
}

export const ImportModal: FC<ImportModalProps> = ({
  isOpen,
  onClose,
  onExecute,
  availableDbs,
  selectedDb,
  onSelectDb,
}) => {
  return (
    <SimpleModal
      isOpen={isOpen}
      onClose={onClose}
      title="合并历史数据库"
      icon={<Database size={16} />}
      footer={
        <div className="flex w-full justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            取消
          </button>
          <button
            onClick={onExecute}
            disabled={availableDbs.length === 0}
            className="rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-50"
          >
            执行穿梭合并
          </button>
        </div>
      }
    >
      <div className="space-y-4 p-4">
        <p className="text-xs leading-relaxed text-muted-foreground">
          基于全新的绝对时间单库对齐架构，您可以无缝、极速地将旧存档（或其他聊天）的底层知识与历史事迹全盘并入当前聊天中！
        </p>

        {availableDbs.length === 0 ? (
          <div className="border-border/50 bg-muted/20 rounded border border-dashed p-4 text-center text-sm text-muted-foreground">
            未找到其他 Engram 历史数据库
          </div>
        ) : (
          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground">
              选择要合并提取的底层库源：
            </label>
            <select
              value={selectedDb}
              onChange={(e) => onSelectDb(e.target.value)}
              className="w-full rounded border border-border bg-background p-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary"
            >
              {availableDbs.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </SimpleModal>
  );
};
