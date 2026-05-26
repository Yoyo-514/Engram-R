declare module '*.scss';
declare module '*.sass';

interface Window {
  EjsTemplate?: typeof EjsTemplate;
  Mvu?: typeof Mvu;
  parseRegexFromString?: (input: string) => RegExp | null;
  stopGenerationById?: (generationId: string) => boolean | Promise<boolean>;
  stopAllGeneration?: () => boolean | Promise<boolean>;
  stopGeneration?: () => void;
  SillyTavern?: {
    getContext?: () => any;
  };
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
