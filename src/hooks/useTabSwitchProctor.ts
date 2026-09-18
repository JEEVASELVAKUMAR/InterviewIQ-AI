import { useEffect, useRef } from 'react';

type Options = {
  enabled: boolean;
  onViolation: () => void;
};

export function useTabSwitchProctor({ enabled, onViolation }: Options) {
  const onViolationRef = useRef(onViolation);
  onViolationRef.current = onViolation;

  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        onViolationRef.current();
      }
    };

    const handleBlur = () => {
      onViolationRef.current();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
    };
  }, [enabled]);
}
