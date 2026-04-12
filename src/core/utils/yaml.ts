import { parse, stringify } from 'yaml';

export function parseYaml<T = unknown>(source: string): T {
  return parse(source) as T;
}

export function stringifyYaml(source: unknown): string {
  return stringify(source, {
    indent: 2,
    lineWidth: 0,
  });
}
