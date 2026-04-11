/**
 * TavernHelper Adapter
 * Wraps access to `window.TavernHelper`.
 */

export interface TavernHelperApi {
  createWorldbook?: (name: string) => Promise<void>;
  getWorldbook?: (name: string) => Promise<unknown[]>;
  createWorldbookEntries?: (name: string, entries: unknown[]) => Promise<void>;
  updateWorldbookWith?: (name: string, updater: (entries: unknown[]) => unknown[]) => Promise<void>;
  deleteWorldbookEntries?: (name: string, filter: (entry: unknown) => boolean) => Promise<void>;
  getWorldbookNames?: () => string[];
  getGlobalWorldbookNames?: () => string[];
  rebindGlobalWorldbooks?: (worldbookNames: string[]) => Promise<void>;
  deleteWorldbook?: (name: string) => Promise<boolean>;
  getCharWorldbookNames?: (
    mode: 'current' | 'all'
  ) => { primary?: string; additional: string[] } | null;
  rebindCharWorldbooks?: (
    mode: 'current',
    books: { primary?: string; additional: string[] }
  ) => Promise<void>;
}

export function getTavernHelper(): TavernHelperApi | null {
  try {
    const host = window as unknown as Window & { TavernHelper?: TavernHelperApi };
    return host.TavernHelper || null;
  } catch {
    return null;
  }
}

export function isWorldInfoAvailable(): boolean {
  return getTavernHelper() !== null;
}
