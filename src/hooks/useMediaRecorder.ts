import { useState, useRef, useCallback, useEffect } from 'react';

export type RecordingState = 'idle' | 'recording' | 'stopped' | 'error';

export function useMediaRecorder() {
  const [state, setState] = useState<RecordingState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = useCallback(
    async (opts: { video: boolean; audio: boolean }): Promise<MediaStream | null> => {
      try {
        const constraints: MediaStreamConstraints = {
          audio: opts.audio,
          video: opts.video ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
        };

        const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = mediaStream;
        setStream(mediaStream);

        const mimeType = opts.video
          ? (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
            ? 'video/webm;codecs=vp9'
            : MediaRecorder.isTypeSupported('video/webm')
              ? 'video/webm'
              : '')
          : (MediaRecorder.isTypeSupported('audio/webm')
            ? 'audio/webm'
            : '');

        const recorder = new MediaRecorder(
          mediaStream,
          mimeType ? { mimeType } : undefined,
        );
        chunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        recorder.start(1000);
        recorderRef.current = recorder;
        setState('recording');
        setError(null);
        return mediaStream;
      } catch (err: any) {
        setState('error');
        setError(err.message ?? 'Failed to access media devices');
        return null;
      }
    },
    [],
  );

  const stopRecording = useCallback((): { blob: Blob; type: string } | null => {
    if (!recorderRef.current || recorderRef.current.state === 'inactive') {
      return null;
    }
    return new Promise((resolve) => {
      const recorder = recorderRef.current!;
      recorder.onstop = () => {
        const type = recorder.mimeType || (chunksRef.current[0]?.type || 'video/webm');
        const blob = new Blob(chunksRef.current, { type });
        setState('stopped');
        resolve({ blob, type });
      };
      recorder.stop();
    }) as any;
  }, []);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setStream(null);
    }
    recorderRef.current = null;
    setState('idle');
  }, []);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  return {
    state,
    error,
    stream,
    startRecording,
    stopRecording,
    stopStream,
  };
}
