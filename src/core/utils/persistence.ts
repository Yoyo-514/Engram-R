import debounce from 'lodash-es/debounce';
import isEqual from 'lodash-es/isEqual';

import { deepClone } from './clone';

export interface DebouncedPersistence<T> {
  schedule: (nextValue: T) => void;
  flush: () => void;
  cancel: () => void;
  hasChanges: (nextValue: T) => boolean;
  syncSnapshot: (nextValue: T) => void;
  getSnapshot: () => T;
}

interface CreateDebouncedPersistenceOptions<T> {
  delay?: number;
  initialValue: T;
  persist: (nextValue: T) => void | Promise<void>;
}

export function createDebouncedPersistence<T>({
  delay = 250,
  initialValue,
  persist,
}: CreateDebouncedPersistenceOptions<T>): DebouncedPersistence<T> {
  let snapshot = deepClone(initialValue);

  const commit = (nextValue: T): void => {
    const clonedValue = deepClone(nextValue);
    if (isEqual(snapshot, clonedValue)) {
      return;
    }

    snapshot = clonedValue;
    void persist(clonedValue);
  };

  const debouncedCommit = debounce(commit, delay);

  return {
    schedule: (nextValue) => {
      debouncedCommit(nextValue);
    },
    flush: () => {
      debouncedCommit.flush();
    },
    cancel: () => {
      debouncedCommit.cancel();
    },
    hasChanges: (nextValue) => !isEqual(snapshot, nextValue),
    syncSnapshot: (nextValue) => {
      snapshot = deepClone(nextValue);
    },
    getSnapshot: () => deepClone(snapshot),
  };
}
