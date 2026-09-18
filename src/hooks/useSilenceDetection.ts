import { useRef, useEffect, useCallback, useState } from 'react';

type SilenceOptions = {
  silenceThreshold?: number; // dB threshold (lower = more sensitive), default -45
  silenceDuration?: number; // ms of silence before triggering (normal answers), default 2800
  shortAnswerSilenceDuration?: number; // ms of silence for very short answers (<3 words), default 4000
  minSpeechDuration?: number; // minimum ms of speech before silence detection activates, default 1000
  getWordCount?: () => number; // callback to get current transcript word count
};

export function useSilenceDetection(stream: MediaStream | null, opts?: SilenceOptions) {
  const [speaking, setSpeaking] = useState(false);
  const [silenceTriggered, setSilenceTriggered] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const speechStartRef = useRef<number | null>(null);
  const lastSpeechRef = useRef<number | null>(null);
  const finishingRef = useRef(false);

  const silenceThreshold = opts?.silenceThreshold ?? -45;
  const silenceDuration = opts?.silenceDuration ?? 2800;
  const shortAnswerSilenceDuration = opts?.shortAnswerSilenceDuration ?? 4000;
  const minSpeechDuration = opts?.minSpeechDuration ?? 1000;
  const getWordCountRef = useRef(opts?.getWordCount);
  getWordCountRef.current = opts?.getWordCount;

  const cleanup = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (sourceRef.current) {
      try {
        sourceRef.current.disconnect();
      } catch {
        // ignore
      }
      sourceRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch {
        // ignore
      }
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    speechStartRef.current = null;
    lastSpeechRef.current = null;
    finishingRef.current = false;
    setSpeaking(false);
    setFinishing(false);
  }, []);

  useEffect(() => {
    if (!stream) {
      cleanup();
      return;
    }

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      cleanup();
      return;
    }

    try {
      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContextCtor();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.5;
      analyserRef.current = analyser;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const check = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const db = avg > 0 ? 20 * Math.log10(avg / 255) : -100;

        const now = performance.now();
        const isLoud = db > silenceThreshold;

        if (isLoud) {
          if (speechStartRef.current === null) {
            speechStartRef.current = now;
          }
          lastSpeechRef.current = now;
          setSpeaking(true);
          // Cancel any pending "finishing" state — candidate resumed speaking
          if (finishingRef.current) {
            finishingRef.current = false;
            setFinishing(false);
          }
          setSilenceTriggered(false);
        } else {
          if (speechStartRef.current !== null && lastSpeechRef.current !== null) {
            const speechElapsed = lastSpeechRef.current - speechStartRef.current;
            const silenceElapsed = now - lastSpeechRef.current;

            if (speechElapsed >= minSpeechDuration) {
              // Dynamic silence window: longer for very short answers
              const wordCount = getWordCountRef.current ? getWordCountRef.current() : 0;
              const effectiveSilenceDuration =
                wordCount > 0 && wordCount < 3
                  ? shortAnswerSilenceDuration
                  : silenceDuration;

              // Show "finishing" cue after 40% of the silence window has elapsed
              const finishingThreshold = effectiveSilenceDuration * 0.4;

              if (silenceElapsed >= finishingThreshold && !finishingRef.current) {
                finishingRef.current = true;
                setFinishing(true);
              }

              if (silenceElapsed >= effectiveSilenceDuration) {
                setSpeaking(false);
                setFinishing(false);
                finishingRef.current = false;
                setSilenceTriggered(true);
              }
            }
          }
        }

        animationRef.current = requestAnimationFrame(check);
      };

      animationRef.current = requestAnimationFrame(check);
    } catch {
      cleanup();
    }

    return cleanup;
  }, [stream, silenceThreshold, silenceDuration, shortAnswerSilenceDuration, minSpeechDuration, cleanup]);

  const reset = useCallback(() => {
    speechStartRef.current = null;
    lastSpeechRef.current = null;
    finishingRef.current = false;
    setSpeaking(false);
    setSilenceTriggered(false);
    setFinishing(false);
  }, []);

  return { speaking, silenceTriggered, finishing, reset };
}
