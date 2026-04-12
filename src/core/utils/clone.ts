import { klona } from 'klona';

export function deepClone<T>(value: T): T {
  return klona(value);
}
