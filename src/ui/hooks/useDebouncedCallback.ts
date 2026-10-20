import { useCallback, useEffect, useMemo, useRef } from 'react';

/**
 * 防抖回调，组件卸载时自动取消挂起的调用。
 * 返回的 call/cancel 引用稳定，可直接放进依赖数组。
 */
export function useDebouncedCallback<Args extends unknown[]>(
  callback: (...args: Args) => void,
  delay: number
): { call: (...args: Args) => void; cancel: () => void } {
  const callbackRef = useRef(callback);
  const timerRef = useRef<number | null>(null);

  // 渲染后再同步最新回调，调用方无需手动 memo
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const call = useCallback(
    (...args: Args) => {
      cancel();
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        callbackRef.current(...args);
      }, delay);
    },
    [cancel, delay]
  );

  useEffect(() => cancel, [cancel]);

  return useMemo(() => ({ call, cancel }), [call, cancel]);
}
