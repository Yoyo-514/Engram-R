import { SettingsManager } from '@/config/settings';
import { Logger } from '@/core/logger';
import { getEjsTemplate, getMvu } from '@/core/utils';

export async function processEJSMacros(entries: string[]): Promise<string[]> {
  if (entries.length === 0) {
    return entries;
  }

  const ejs = getEjsTemplate();
  const mvu = getMvu();

  const enableEJS = SettingsManager.get('apiSettings')?.worldbookConfig?.enableEJS ?? true;
  if (!enableEJS) {
    Logger.debug('EjsProcessor', 'EJS processing disabled by worldbook settings');
    return entries;
  }

  if (ejs && typeof ejs.evaltemplate !== 'function') {
    Logger.debug('EjsProcessor', 'ST-Prompt-Template unavailable, skipping EJS processing');
    return entries;
  }

  try {
    const context = ejs ? await ejs.prepareContext() : null;

    if (mvu && typeof mvu.getMvuData == 'function') {
      try {
        const mvuObj = mvu.getMvuData({ type: 'message', message_id: 'latest' });
        if (context && mvuObj.stat_data !== undefined) {
          context.mvu = mvuObj.stat_data;
        }
      } catch (error) {
        Logger.warn('EjsProcessor', 'Failed to read MVU context for EJS', error);
      }
    }

    return await Promise.all(
      entries.map(async (content) => {
        try {
          return await ejs!.evaltemplate(content, context as Record<string, unknown>);
        } catch (error) {
          Logger.warn(
            'EjsProcessor',
            'EJS render failed for a worldbook entry, keeping raw content',
            error
          );
          return content;
        }
      })
    );
  } catch (error) {
    Logger.warn('EjsProcessor', 'EJS preprocessing failed', error);
    return entries;
  }
}
