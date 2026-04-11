import { useEffect, useState } from 'react';
import { QuickPanel } from '@/ui/views/quick-panel';
import { ReviewContainer } from '@/ui/views/review/ReviewContainer';

interface GlobalOverlayContentProps {
  initialQuickPanelOpen: boolean;
  onQuickPanelStateChange: (setter: ((open: boolean) => void) | null) => void;
}

export function GlobalOverlayContent({
  initialQuickPanelOpen,
  onQuickPanelStateChange,
}: GlobalOverlayContentProps) {
  const [quickPanelVisible, setQuickPanelVisible] = useState(initialQuickPanelOpen);

  useEffect(() => {
    onQuickPanelStateChange(setQuickPanelVisible);
    return () => {
      onQuickPanelStateChange(null);
    };
  }, [onQuickPanelStateChange]);

  return (
    <div className="pointer-events-auto">
      <ReviewContainer />
      <QuickPanel isOpen={quickPanelVisible} onClose={() => setQuickPanelVisible(false)} />
    </div>
  );
}
