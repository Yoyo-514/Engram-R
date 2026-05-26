import { Logger } from '../logger';

export type TavernHelperApi = typeof TavernHelper;
export type EjsTemplateApi = typeof EjsTemplate;
export type MvuApi = typeof Mvu;

export function getTavernHelper(): TavernHelperApi | null {
  try {
    return window.TavernHelper;
  } catch {
    Logger.error('TavernHelperAPI', '加载失败');
    return null;
  }
}

export function getEjsTemplate(): EjsTemplateApi | null {
  try {
    return window.EjsTemplate ?? null;
  } catch {
    Logger.error('EjsTemplateApi', '加载失败');
    return null;
  }
}

export function getMvu(): MvuApi | null {
  try {
    return window.Mvu ?? null;
  } catch {
    Logger.error('MvuApi', '加载失败');
    return null;
  }
}
