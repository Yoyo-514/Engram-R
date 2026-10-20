import { useImperativeHandle, useState, type ForwardedRef } from 'react';

import { useBlurCommit } from './useBlurCommit';

export type DraftFormHandle = {
  save: () => void;
  isDirty: () => boolean;
};

export interface DraftFormOptions {
  /** 当前编辑对象 id，变化时重置表单 */
  id: string | null | undefined;
  /** 重置表单字段 */
  reset: () => void;
  /** 提交当前草稿 */
  commit: () => void;
  /** 失焦是否允许提交，默认要求有未保存改动 */
  canCommit?: (isDirty: boolean) => boolean;
  /** 失焦后延迟提交的毫秒数 */
  blurDelay: number;
}

export interface DraftFormState {
  isDirty: boolean;
  setDirty: (dirty: boolean) => void;
  handleBlur: () => void;
}

/**
 * 编辑器草稿表单的公共骨架：
 * id 切换重置、脏标记、对外的 save/isDirty 句柄、失焦提交。
 */
export function useDraftForm(
  ref: ForwardedRef<DraftFormHandle>,
  options: DraftFormOptions
): DraftFormState {
  const { id, reset, commit, canCommit, blurDelay } = options;
  const [isDirty, setDirty] = useState(false);
  const [lastId, setLastId] = useState<string | null | undefined>(undefined);

  // 编辑对象切换时重置表单（渲染期间调整 state，替代 effect 同步）
  if (id !== undefined && id !== lastId) {
    setLastId(id);
    reset();
    setDirty(false);
  }

  useImperativeHandle(
    ref,
    () => ({
      save: commit,
      isDirty: () => isDirty,
    }),
    [commit, isDirty]
  );

  const handleBlur = useBlurCommit(() => {
    const allowed = canCommit ? canCommit(isDirty) : isDirty;
    if (allowed) {
      commit();
    }
  }, blurDelay);

  return { isDirty, setDirty, handleBlur };
}
