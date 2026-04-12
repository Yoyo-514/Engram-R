declare module '*.scss';
declare module '*.sass';

interface Window {
  __ENGRAM_SEARCH_INIT__?: boolean;
}

type LiteralUnion<
  LiteralType,
  BaseType extends string | number | bigint | boolean | null | undefined,
> = import('type-fest').LiteralUnion<LiteralType, BaseType>;

// Vite ?raw 导入声明
declare module '*.md?raw' {
  const content: string;
  export default content;
}

declare module '*.txt?raw' {
  const content: string;
  export default content;
}
