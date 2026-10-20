/** 深拷贝纯数据对象（配置、实体、事件等）。 */
export function deepClone<T>(value: T): T {
  return structuredClone(value);
}
