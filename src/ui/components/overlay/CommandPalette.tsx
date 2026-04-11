import { useEffect, useRef, useState } from 'react';
import type { FC, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Command, CornerDownLeft, Search } from 'lucide-react';
import { searchService, type SearchResult } from '@/modules/search/SearchService';
import { CommandAdapter } from '@/modules/search/adapters/CommandAdapter';
import { LogAdapter } from '@/modules/search/adapters/LogAdapter';
import { MemoryAdapter } from '@/modules/search/adapters/MemoryAdapter';
import { PresetAdapter } from '@/modules/search/adapters/PresetAdapter';
import { SettingAdapter } from '@/modules/search/adapters/SettingAdapter';

if (!window.__ENGRAM_SEARCH_INIT__) {
  searchService.registerAdapter(new CommandAdapter());
  searchService.registerAdapter(new SettingAdapter());
  searchService.registerAdapter(new LogAdapter());
  searchService.registerAdapter(new MemoryAdapter());
  searchService.registerAdapter(new PresetAdapter());
  window.__ENGRAM_SEARCH_INIT__ = true;
}

interface CommandPaletteProps {
  onNavigate: (path: string) => void;
}

export const CommandPalette: FC<CommandPaletteProps> = ({ onNavigate }) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [results, setResults] = useState<SearchResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const doSearch = async () => {
      if (!query.trim()) {
        const defaultResults = await new CommandAdapter().search('');
        setResults(defaultResults);
        setSelectedIndex(0);
        return;
      }

      const nextResults = await searchService.search(query);
      setResults(nextResults);
      setSelectedIndex(0);
    };

    void doSearch();
  }, [isOpen, query]);

  useEffect(() => {
    const handleGlobalKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        setIsOpen(true);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const timer = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    void import('@/index')
      .then(({ setCommandPaletteCallback }) => {
        setCommandPaletteCallback(() => setIsOpen(true));
      })
      .catch(() => {
        // Ignore circular import fallback.
      });
  }, []);

  const executeSelected = () => {
    if (results.length > 0 && selectedIndex < results.length) {
      results[selectedIndex]?.action(onNavigate);
    } else if (query) {
      console.info('Searching memory for:', query);
      onNavigate('/memory');
    }

    setIsOpen(false);
    setQuery('');
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    const totalItems = results.length + (query ? 1 : 0);
    if (totalItems === 0) {
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % totalItems);
        break;
      case 'ArrowUp':
        event.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + totalItems) % totalItems);
        break;
      case 'Enter':
        event.preventDefault();
        executeSelected();
        break;
      case 'Escape':
        setIsOpen(false);
        break;
      default:
        break;
    }
  };

  const modalContent = (
    <div className="engram-app-root" style={{ display: 'contents' }}>
      <div
        className="fixed inset-0 flex items-start justify-center pt-[15vh] px-4 animate-in fade-in duration-200"
        style={{
          height: '100dvh',
          width: '100vw',
          backgroundColor: 'rgba(0,0,0,0.4)',
          backdropFilter: 'var(--glass-backdrop-filter, blur(4px))',
          zIndex: 2147483647,
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            setIsOpen(false);
          }
        }}
      >
        <div
          className="w-full max-w-xl border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 slide-in-from-top-4 duration-200"
          style={{
            backgroundColor: 'var(--popover)',
            color: 'var(--popover-foreground)',
            backdropFilter: 'var(--glass-backdrop-filter)',
            maxHeight: '70vh',
          }}
        >
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50">
            <Search size={20} className="text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              className="flex-1 bg-transparent border-none outline-none text-lg text-foreground placeholder:text-muted-foreground/50"
              placeholder="搜索命令、设置或页面..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleKeyDown}
            />
            <div className="text-[10px] text-muted-foreground border border-border px-1.5 py-0.5 rounded bg-muted/50 hidden sm:block">
              ESC
            </div>
          </div>

          <div className="overflow-y-auto p-2 scroll-smooth">
            {results.length > 0 && (
              <div className="space-y-1">
                {results.map((item, index) => (
                  <div
                    key={item.id}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-[var(--duration-fast)] ${
                      index === selectedIndex
                        ? 'bg-primary/10 text-primary'
                        : 'text-foreground hover:bg-muted/50'
                    }`}
                    onClick={() => {
                      item.action(onNavigate);
                      setIsOpen(false);
                      setQuery('');
                    }}
                    onMouseEnter={() => setSelectedIndex(index)}
                  >
                    <div
                      className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${
                        index === selectedIndex
                          ? 'bg-primary/20'
                          : 'bg-muted/50 text-muted-foreground'
                      }`}
                    >
                      {item.icon ? <item.icon size={16} /> : <Command size={16} />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{item.title}</span>
                        {item.type !== 'command' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground uppercase">
                            {item.type}
                          </span>
                        )}
                      </div>
                      {item.description && (
                        <div className="text-xs text-muted-foreground/80 truncate">
                          {item.description}
                        </div>
                      )}
                    </div>

                    {index === selectedIndex && (
                      <CornerDownLeft size={16} className="text-muted-foreground/50" />
                    )}
                  </div>
                ))}
              </div>
            )}

            {query && (
              <div
                className={`mt-2 pt-2 border-t border-border/50 flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                  selectedIndex === results.length
                    ? 'bg-primary/10 text-primary'
                    : 'text-foreground hover:bg-muted/50'
                }`}
                onClick={executeSelected}
                onMouseEnter={() => setSelectedIndex(results.length)}
              >
                <div
                  className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${
                    selectedIndex === results.length
                      ? 'bg-primary/20'
                      : 'bg-muted/50 text-muted-foreground'
                  }`}
                >
                  <Search size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">
                    全站搜索: "<span className="text-primary">{query}</span>"
                  </div>
                  <div className="text-xs text-muted-foreground/80">在记忆和知识图谱中查找</div>
                </div>
                {selectedIndex === results.length && (
                  <CornerDownLeft size={16} className="text-muted-foreground/50" />
                )}
              </div>
            )}

            {results.length === 0 && !query && (
              <div className="px-4 py-8 text-center text-muted-foreground text-sm">
                <Command size={32} className="mx-auto mb-2 opacity-20" />
                <p>随时搜索，快捷键 Ctrl/Cmd + K</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="p-2 rounded-md hover:bg-accent hover:text-accent-foreground transition-all duration-[var(--duration-fast)] text-muted-foreground hover:scale-110 active:scale-95"
        title="搜索 (Cmd+K)"
      >
        <Search size={20} />
      </button>
      {isOpen && createPortal(modalContent, document.body)}
    </>
  );
};
