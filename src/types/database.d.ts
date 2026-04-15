export interface DatabaseSummary {
  name: string;
  chatId: string;
  characterName: string | null;
  isOpen: boolean;
  isCurrent: boolean;
  lastModified: number | null;
}

export interface DatabaseStats {
  name: string;
  chatId: string;
  eventCount: number;
  entityCount: number;
  archivedEventCount: number;
  archivedEntityCount: number;
  embeddedEventCount: number;
  embeddedEntityCount: number;
  lastModified: number | null;
}