import { useCallback, useEffect, useRef } from 'react';

/** 失焦后延迟提交，组件卸载时清理挂起的定时器。 */
export function useBlurCommit(commit: () => void, delay: number): () => void {
  const commitRef = useRef(commit);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    commitRef.current = commit;
  }, [commit]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      commitRef.current();
    }, delay);
  }, [delay]);
}
