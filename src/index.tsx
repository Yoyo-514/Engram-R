/** Engram 酒馆扩展入口。 */
import { createRoot } from 'react-dom/client';

import { initializeEngram, setGlobalRenderer, setReactRenderer } from '@/integrations/tavern';
import App from '@/ui/shell/App';
import { ReviewContainer } from '@/ui/views/review/ReviewContainer';

// oxlint-disable-next-line import/no-unassigned-import -- 样式副作用导入
import './ui/styles/main.css';

setReactRenderer((container, onClose) => {
  const root = createRoot(container);
  root.render(<App onClose={onClose} />);
  return root;
});

// 审阅独立于主面板挂载，自动处理和关闭主面板后仍可确认结果。
setGlobalRenderer((container) => {
  const root = createRoot(container);
  root.render(
    <div className="pointer-events-auto">
      <ReviewContainer />
    </div>
  );
  return root;
});

const initEngramOnLoad = () => {
  void initializeEngram();
  document.removeEventListener('DOMContentLoaded', initEngramOnLoad);
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initEngramOnLoad);
} else {
  void initializeEngram();
}
