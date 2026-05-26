export interface WorldbookStructureEntry {
  uid: number;
  name?: string;
  keys: string[];
  constant: boolean;
  disabled?: boolean;
  comment: string;
  content: string;
}

export type WorldbookStructure = Record<string, WorldbookStructureEntry[]>;
