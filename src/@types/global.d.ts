/**
 * 项目自有全局类型补充
 *
 * function/ 与 iframe/ 目录下的 .d.ts 已由 tsconfig include 自动加载，
 * 这里仅补充项目本身缺失的 Window 字段与资源模块声明，避免重复声明外部类型。
 */

declare global {
  interface PowerUserSettingsLike {
    persona_description?: string;
  }

  interface Window {
    /**
     * SillyTavern 宿主对象，真正的上下文结构复用 exported.sillytavern.d.ts 中的 `typeof SillyTavern`
     */
    SillyTavern?: {
      getContext?: () => typeof SillyTavern | null;
    };

    /**
     * 当前选择的模型名称
     */
    selected_model?: string;
    power_user?: PowerUserSettingsLike;
    chat_metadata?: Record<string, unknown>;
    saveChatDebounced?: () => void;
    __ENGRAM_SEARCH_INIT__?: boolean;
  }
}

// 确保这是一个模块
export {};

// Vite ?raw 导入声明
declare module '*.md?raw' {
  const content: string;
  export default content;
}

declare module '*.txt?raw' {
  const content: string;
  export default content;
}
