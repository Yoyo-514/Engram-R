import { FileText } from 'lucide-react';
import { useState } from 'react';
import type { FC, ChangeEvent } from 'react';

interface MessageReviewProps {
  content: string;
  onChange: (newContent: string) => void;
}

export const MessageReview: FC<MessageReviewProps> = ({ content, onChange }) => {
  const [text, setText] = useState(content);

  // 外部内容变化时同步本地编辑态（渲染期间调整 state，替代 effect 同步）
  const [prevContent, setPrevContent] = useState(content);
  if (prevContent !== content) {
    setPrevContent(content);
    setText(content);
  }

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);
    onChange(val);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="shrink-0 rounded-md border border-border/50 bg-muted/20 p-3 text-sm text-muted-foreground">
        请检查生成的内容。您可以直接编辑文本，或者使用下方按钮进行重生成。
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <FileText size={16} className="text-primary" />
          <span>输出内容 (Output)</span>
        </div>
        <div className="relative flex-1">
          <textarea
            value={text}
            onChange={handleChange}
            className="custom-scrollbar h-full min-h-[100px] w-full resize-none rounded-md border border-border bg-muted/50 p-4 font-mono text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            spellCheck={false}
            placeholder="在此编辑输出内容..."
          />
          <div className="pointer-events-none absolute bottom-2 right-2 rounded bg-background/80 px-2 py-1 text-xs text-muted-foreground">
            {text.length} 字符
          </div>
        </div>
      </div>
    </div>
  );
};
