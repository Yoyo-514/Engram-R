import { FileText } from 'lucide-react';
import type { FC } from 'react';

import { SimpleModal } from '@/ui/components/feedback/SimpleModal';

interface PreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  content: string;
}

export const PreviewModal: FC<PreviewModalProps> = ({ isOpen, onClose, content }) => {
  return (
    <SimpleModal
      isOpen={isOpen}
      onClose={onClose}
      title="宏注入预览 (Active Injection)"
      icon={<FileText size={16} />}
      maxWidth="max-w-2xl"
      footer={
        <div className="text-[10px] text-muted-foreground">
          *此内容为 {'{{engramSummaries}}'} 和 {'{{engramEntityStates}}'}{' '}
          宏在当前上下文中的实际输出值
        </div>
      }
    >
      <div className="p-4">
        <pre className="bg-muted/30 border-border/50 whitespace-pre-wrap rounded border p-4 font-mono text-xs leading-relaxed text-muted-foreground">
          {content}
        </pre>
      </div>
    </SimpleModal>
  );
};
