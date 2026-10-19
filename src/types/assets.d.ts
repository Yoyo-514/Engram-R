/** Vite 原始文本导入，用于内置提示词等资源。 */
declare module '*?raw' {
  const content: string;
  export default content;
}

declare module '*.css' {
  const content: string;
  export default content;
}
