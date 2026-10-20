import { RECALL_CACHE_OPTIONS } from '../../../../engram.config';

/** 近期召回条目，仅供宏与界面读取，不参与本轮排序。 */
export interface RecentRecall {
  id: string;
  label: string;
  category: 'event' | 'entity';
  score: number;
}

/** 按聊天隔离的有界近期召回记录。 */
class RecallCache {
  private recent = new Map<string, RecentRecall[]>();

  record(chatId: string, items: RecentRecall[]): void {
    this.recent.set(chatId, items.slice(0, RECALL_CACHE_OPTIONS.recentLimit));
  }

  getSnapshot(chatId?: string | null): RecentRecall[] {
    return chatId ? (this.recent.get(chatId) ?? []) : [];
  }

  forget(chatId: string | null | undefined, id: string): void {
    if (!chatId) return;
    const items = this.recent.get(chatId);
    if (items)
      this.recent.set(
        chatId,
        items.filter((item) => item.id !== id)
      );
  }

  clear(chatId?: string): void {
    if (chatId) this.recent.delete(chatId);
    else this.recent.clear();
  }
}

export const recallCache = new RecallCache();
