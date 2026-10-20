import { Logger, LogModule } from '@/core/logger';
import type { CompletionSignal } from '@/modules/llm/Completion';

/** 终止 SillyTavern 当前生成。 */
export async function stopGeneration(signal?: CompletionSignal): Promise<void> {
  try {
    const browserWindow = typeof window !== 'undefined' ? window : undefined;
    const generationId = signal?.generationId;

    if (browserWindow && generationId && typeof browserWindow.stopGenerationById === 'function') {
      const stopped = await browserWindow.stopGenerationById(generationId);
      if (stopped) {
        Logger.info(LogModule.SYSTEM, '通过 stopGenerationById 成功终止生成', { generationId });
        return;
      }
    }

    if (browserWindow && typeof browserWindow.stopAllGeneration === 'function') {
      const stoppedAll = await browserWindow.stopAllGeneration();
      if (stoppedAll) {
        Logger.info(LogModule.SYSTEM, '通过 stopAllGeneration 成功终止生成');
        return;
      }
    }

    // 路径 1: 使用官方 Context 接口 (Engram 集成层)
    const stCtx = browserWindow?.SillyTavern?.getContext?.();
    if (stCtx?.stopGeneration) {
      stCtx.stopGeneration();
      Logger.info(LogModule.SYSTEM, '通过 ST Context 成功调用 stopGeneration');
      return;
    }

    // 路径 2: 尝试全局作用域下的 stopGeneration (酒馆主脚本可能导出到全局)
    if (browserWindow && typeof browserWindow.stopGeneration === 'function') {
      browserWindow.stopGeneration();
      Logger.info(LogModule.SYSTEM, '通过 window.stopGeneration 成功调用');
      return;
    }

    // 路径 3: 暴力模拟 UI 点击 (最后的兜底，只要按钮在 DOM 中就有效)
    if (typeof document !== 'undefined') {
      const stopButton = document.getElementById('mes_stop');
      if (stopButton && stopButton.offsetParent !== null) {
        stopButton.click();
        Logger.info(LogModule.SYSTEM, '通过模拟点击 #mes_stop 按钮触发中断');
        return;
      }
    }

    Logger.warn(LogModule.SYSTEM, '未找到有效的 StopGeneration 触发路径');
  } catch (e) {
    Logger.warn(LogModule.SYSTEM, '调用 stopGeneration 过程中发生致命错误', e);
  }
}
