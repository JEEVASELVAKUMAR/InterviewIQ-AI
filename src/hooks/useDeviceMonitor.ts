import { useEffect, useRef } from 'react';

type Options = {
  stream: MediaStream | null;
  enabled: boolean;
  onViolation: () => void;
};

export function useDeviceMonitor({ stream, enabled, onViolation }: Options) {
  const onViolationRef = useRef(onViolation);
  onViolationRef.current = onViolation;

  useEffect(() => {
    if (!enabled || !stream) return;

    const tracks = [...stream.getAudioTracks(), ...stream.getVideoTracks()];

    const handleEnded = () => {
      onViolationRef.current();
    };

    const handleMute = () => {
      onViolationRef.current();
    };

    tracks.forEach((track) => {
      track.addEventListener('ended', handleEnded);
      track.addEventListener('mute', handleMute);
    });

    return () => {
      tracks.forEach((track) => {
        track.removeEventListener('ended', handleEnded);
        track.removeEventListener('mute', handleMute);
      });
    };
  }, [enabled, stream]);
}
