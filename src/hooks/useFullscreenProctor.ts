import { useEffect, useRef, useCallback } from 'react';

type Options = {
  enabled: boolean;
  onViolation: () => void;
};

export function useFullscreenProctor({ enabled, onViolation }: Options) {
  const onViolationRef = useRef(onViolation);
  onViolationRef.current = onViolation;

  const requestFullscreen = useCallback(async (element: HTMLElement): Promise<boolean> => {
    try {
      if (element.requestFullscreen) {
        await element.requestFullscreen();
      } else if ((element as any).webkitRequestFullscreen) {
        await (element as any).webkitRequestFullscreen();
      } else if ((element as any).msRequestFullscreen) {
        await (element as any).msRequestFullscreen();
      } else {
        return false;
      }
      return true;
    } catch (err) {
      console.warn('Fullscreen request failed:', err);
      return false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const handleChange = () => {
      if (!document.fullscreenElement && !(document as any).webkitFullscreenElement) {
        onViolationRef.current();
      }
    };

    document.addEventListener('fullscreenchange', handleChange);
    document.addEventListener('webkitfullscreenchange', handleChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleChange);
      document.removeEventListener('webkitfullscreenchange', handleChange);
    };
  }, [enabled]);

  return { requestFullscreen };
}
