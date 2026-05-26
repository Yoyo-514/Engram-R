import type { CoreState } from './slices/coreSlice';
import type { EntityState } from './slices/entitySlice';
import type { EventState } from './slices/eventSlice';

export type MemoryState = CoreState & EntityState & EventState;
