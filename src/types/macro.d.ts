export interface CustomMacro {
  /** 唯一标识 */
  id: string;
  /** 宏名称（不含花括号，如 "用户画像"） */
  name: string;
  /** 宏内容 */
  content: string;
  /** 是否启用 */
  enabled: boolean;
  /** 创建时间 */
  createdAt: number;
}
