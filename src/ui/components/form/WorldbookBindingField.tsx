/**
 * 世界书绑定组件 - V1.2.8
 * 用于在提示词模板中直接绑定额外世界书
 */

import { Book, Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FC } from 'react';

import { getWorldbookScopes } from '@/integrations/tavern/worldbook';

interface WorldbookBindingFieldProps {
  selectedBooks: string[];
  onChange: (books: string[]) => void;
  label?: string;
  description?: string;
}

export const WorldbookBindingField: FC<WorldbookBindingFieldProps> = ({
  selectedBooks,
  onChange,
  label = '额外世界书',
  description = '选择要额外扫描的世界书。角色绑定的世界书会自动包含（无需手动添加）。',
}) => {
  const [showPicker, setShowPicker] = useState(false);
  const [availableBooks, setAvailableBooks] = useState<string[]>([]);
  const [_localSelection, setLocalSelection] = useState<string[]>(selectedBooks);

  // 加载可用世界书列表
  useEffect(() => {
    const scopes = getWorldbookScopes();
    // 合并全局 + 已安装，排除 [Engram] 开头和角色绑定的
    const allBooks = [...new Set([...scopes.global, ...scopes.installed])].filter(
      (name) => !name.startsWith('[Engram]')
    );

    setAvailableBooks(allBooks);
  }, [showPicker]);

  // 同步外部选择到本地
  useEffect(() => {
    setLocalSelection(selectedBooks);
  }, [selectedBooks]);

  const handleRemove = (book: string) => {
    onChange(selectedBooks.filter((b) => b !== book));
  };

  return (
    <div className="flex flex-col gap-2">
      {/* 标签 */}
      <div className="flex items-center gap-2">
        <Book size={14} className="text-muted-foreground" />
        <span className="text-sm font-medium">{label}</span>
      </div>

      {/* 描述 */}
      {description && <p className="text-xs text-muted-foreground">{description}</p>}

      {/* 已选标签 */}
      <div className="flex flex-wrap gap-1.5">
        {selectedBooks.length === 0 ? (
          <span className="text-xs italic text-muted-foreground">未绑定额外世界书</span>
        ) : (
          selectedBooks.map((book) => (
            <div
              key={book}
              className="bg-primary/10 border-primary/20 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-primary"
            >
              <span className="max-w-32 truncate">{book}</span>
              <button
                onClick={() => handleRemove(book)}
                className="hover:bg-primary/20 rounded-full p-0.5 transition-colors"
                title="移除"
              >
                <X size={10} />
              </button>
            </div>
          ))
        )}

        {/* 添加按钮 */}
        <button
          onClick={() => setShowPicker(true)}
          className="hover:border-foreground/50 inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <Plus size={12} />
          添加
        </button>
      </div>

      {/* 选择 Popover */}
      {showPicker && (
        <>
          {/* 透明遮罩用于点击外部关闭 */}
          <div className="fixed inset-0 z-40" onClick={() => setShowPicker(false)} />

          <div className="animate-in fade-in zoom-in-95 absolute z-50 mt-1 w-64 rounded-md border border-border bg-popover shadow-md duration-100">
            {/* 搜索/标题栏 */}
            <div className="flex items-center justify-between border-b border-border px-3 py-2 text-xs font-semibold text-muted-foreground">
              <span>选择世界书</span>
              <span className="text-[10px]">{availableBooks.length} 个可用</span>
            </div>

            {/* 列表 */}
            <div className="max-h-60 overflow-y-auto p-1">
              {availableBooks.length === 0 ? (
                <div className="py-4 text-center text-xs text-muted-foreground">
                  没有可用的世界书
                </div>
              ) : (
                <div className="flex flex-col gap-0.5">
                  {availableBooks.map((book) => {
                    const isSelected = selectedBooks.includes(book);
                    return (
                      <label
                        key={book}
                        className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors ${
                          isSelected ? 'bg-primary/10 text-primary' : 'hover:bg-muted'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {
                            const newSelection = isSelected
                              ? selectedBooks.filter((b) => b !== book)
                              : [...selectedBooks, book];
                            onChange(newSelection);
                          }}
                          className="h-3.5 w-3.5 rounded border-border"
                        />
                        <span className="flex-1 truncate" title={book}>
                          {book}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
