import type { ElementType } from 'react';

import { CommandAdapter } from './adapters/CommandAdapter';
import { DocAdapter } from './adapters/DocAdapter';
import { LogAdapter } from './adapters/LogAdapter';
import { MemoryAdapter } from './adapters/MemoryAdapter';
import { PresetAdapter } from './adapters/PresetAdapter';
import { SettingAdapter } from './adapters/SettingAdapter';

export interface SearchResult {
  id: string;
  type: 'command' | 'setting' | 'log' | 'memory' | 'navigation' | 'doc';
  title: string;
  description?: string;
  icon?: ElementType;
  action: (navigate: (path: string) => void) => void;
  score?: number;
  keywords?: string[];
}

export interface SearchAdapter {
  search(query: string): Promise<SearchResult[]>;
}

class SearchServiceImpl {
  private adapters = new Map<string, SearchAdapter>();

  registerAdapter(id: string, adapter: SearchAdapter): void {
    this.adapters.set(id, adapter);
  }

  async search(query: string): Promise<SearchResult[]> {
    if (!query.trim()) return [];

    const results = await Promise.all(
      [...this.adapters.values()].map((adapter) => adapter.search(query))
    );
    return results.flat().sort((a, b) => (b.score || 0) - (a.score || 0));
  }
}

export const searchService = new SearchServiceImpl();

searchService.registerAdapter('command', new CommandAdapter());
searchService.registerAdapter('setting', new SettingAdapter());
searchService.registerAdapter('log', new LogAdapter());
searchService.registerAdapter('memory', new MemoryAdapter());
searchService.registerAdapter('preset', new PresetAdapter());
searchService.registerAdapter('doc', new DocAdapter());
