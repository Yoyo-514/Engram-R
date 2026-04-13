import { Logger } from "../logger";

export type TavernHelperApi = typeof TavernHelper;

export function getTavernHelper(): TavernHelperApi | null {
  try {
    // @ts-expect-error - TavernHelper 全局对象
    return window.TavernHelper;
  } catch {
    Logger.error('TavernHelperAPI', '加载失败')
    return null;
  }
}