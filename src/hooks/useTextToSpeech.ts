import { useState, useEffect, useRef, useCallback } from 'react';

type SpeakOptions = {
  rate?: number;
  pitch?: number;
  volume?: number;
};

export function useTextToSpeech() {
  const [speaking, setSpeaking] = useState(false);
  const [supported, setSupported] = useState(true);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const selectedVoiceRef = useRef<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      setSupported(false);
      return;
    }

    const loadVoices = () => {
      const available = window.speechSynthesis.getVoices();
      if (available.length === 0) return;
      setVoices(available);

      // Prefer natural-sounding en-US or en-GB voices
      const preferred =
        available.find((v) => v.lang === 'en-US' && /natural|google|samantha|aria|jenny/i.test(v.name)) ||
        available.find((v) => v.lang === 'en-GB' && /natural|google|daniel|sonia/i.test(v.name)) ||
        available.find((v) => v.lang === 'en-US') ||
        available.find((v) => v.lang === 'en-GB') ||
        available.find((v) => v.lang.startsWith('en')) ||
        available[0];

      selectedVoiceRef.current = preferred ?? null;
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
      window.speechSynthesis.cancel();
    };
  }, []);

  const speak = useCallback(
    (text: string, opts?: SpeakOptions): Promise<void> => {
      return new Promise((resolve, reject) => {
        if (!supported || !window.speechSynthesis) {
          reject(new Error('Speech synthesis not supported'));
          return;
        }

        // Cancel any ongoing speech
        window.speechSynthesis.cancel();

        // Strip markdown/emoji for cleaner speech
        const cleanText = text
          .replace(/[*_#`]/g, '')
          .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}]/gu, '')
          .trim();

        if (!cleanText) {
          resolve();
          return;
        }

        const utterance = new SpeechSynthesisUtterance(cleanText);
        if (selectedVoiceRef.current) {
          utterance.voice = selectedVoiceRef.current;
        }
        utterance.rate = opts?.rate ?? 1;
        utterance.pitch = opts?.pitch ?? 1;
        utterance.volume = opts?.volume ?? 1;

        utterance.onstart = () => setSpeaking(true);
        utterance.onend = () => {
          setSpeaking(false);
          resolve();
        };
        utterance.onerror = (e) => {
          setSpeaking(false);
          // 'interrupted' and 'canceled' are not real errors — resolve gracefully
          if (e.error === 'interrupted' || e.error === 'canceled') {
            resolve();
          } else {
            reject(new Error(`Speech error: ${e.error}`));
          }
        };

        window.speechSynthesis.speak(utterance);
      });
    },
    [supported],
  );

  const cancel = useCallback(() => {
    if (supported && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
  }, [supported]);

  return { speak, cancel, speaking, supported, voices };
}
