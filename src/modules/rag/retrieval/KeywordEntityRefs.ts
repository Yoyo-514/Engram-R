/** 关键词扫描产出的实体引用，score 为直中或多跳衰减后的分数。 */
export interface KeywordEntityRef {
  id: string;
  score: number;
}
