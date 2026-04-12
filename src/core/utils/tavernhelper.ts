export type TavernHelperApi = typeof TavernHelper;

export function getTavernHelper(): TavernHelperApi | null {
  try {
    // @ts-expect-error - TavernHelper 全局对象
    return window.TavernHelper || null;
  } catch {
    return null;
  }
}