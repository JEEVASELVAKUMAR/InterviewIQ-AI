import { useRef, useEffect, useCallback, useState } from 'react';
import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';

export type EngagementSignals = {
  eyeContactPct: number;
  speakingPaceWPM: number;
  fillerWordCount: number;
  fillerWords: string[];
  answerCompleteness: 'complete' | 'partial' | 'minimal';
  sampleCount: number;
};

const FILLER_WORDS = [
  'um', 'uh', 'umm', 'uhh', 'like', 'you know', 'i mean',
  'basically', 'actually', 'literally', 'sort of', 'kind of',
  'right', 'so yeah', 'anyway',
];

type GazeSample = { timestamp: number; lookingAtCamera: boolean };

export function useEngagementSignals(videoRef: React.RefObject<HTMLVideoElement>) {
  const [active, setActive] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [trackingAvailable, setTrackingAvailable] = useState(true);
  const [currentSignals, setCurrentSignals] = useState<EngagementSignals | null>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const gazeSamplesRef = useRef<GazeSample[]>([]);
  const answerStartRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const runningRef = useRef(false);

  const initLandmarker = useCallback(async (): Promise<FaceLandmarker | null> => {
    if (faceLandmarkerRef.current) return faceLandmarkerRef.current;
    try {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm',
      );
      const landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://cdn.jsdelivr.net/npm/@mediapipe/face_landmarker@0.0.1/face_landmarker.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numFaces: 1,
      });
      faceLandmarkerRef.current = landmarker;
      return landmarker;
    } catch (err) {
      console.warn('FaceLandmarker init failed, eye-contact tracking disabled:', err);
      return null;
    }
  }, []);

  const estimateGaze = useCallback((landmarks: any[]): boolean => {
    if (!landmarks || landmarks.length === 0) return true;

    const leftIris = landmarks[468];
    const rightIris = landmarks[473];
    const leftInner = landmarks[133];
    const leftOuter = landmarks[33];
    const rightInner = landmarks[362];
    const rightOuter = landmarks[263];

    if (!leftIris || !rightIris || !leftInner || !leftOuter || !rightInner || !rightOuter) {
      return true;
    }

    const leftEyeWidth = Math.abs(leftOuter.x - leftInner.x);
    const rightEyeWidth = Math.abs(rightOuter.x - rightInner.x);
    if (leftEyeWidth < 0.001 || rightEyeWidth < 0.001) return true;

    const leftIrisOffset = Math.abs(leftIris.x - (leftInner.x + leftOuter.x) / 2) / leftEyeWidth;
    const rightIrisOffset = Math.abs(rightIris.x - (rightInner.x + rightOuter.x) / 2) / rightEyeWidth;

    const avgOffset = (leftIrisOffset + rightIrisOffset) / 2;

    const leftEyeTop = landmarks[159];
    const leftEyeBottom = landmarks[145];
    if (leftEyeTop && leftEyeBottom) {
      const eyeHeight = Math.abs(leftEyeBottom.y - leftEyeTop.y);
      if (eyeHeight > 0.001) {
        const verticalOffset = Math.abs(leftIris.y - (leftEyeTop.y + leftEyeBottom.y) / 2) / eyeHeight;
        if (verticalOffset > 0.6) return false;
      }
    }

    return avgOffset < 0.35;
  }, []);

  const waitForVideoReady = useCallback((video: HTMLVideoElement): Promise<boolean> => {
    return new Promise((resolve) => {
      if (video.readyState >= 2 && video.videoWidth > 0) {
        resolve(true);
        return;
      }
      let attempts = 0;
      const maxAttempts = 20;
      const check = setInterval(() => {
        attempts++;
        if (video.readyState >= 2 && video.videoWidth > 0) {
          clearInterval(check);
          resolve(true);
        } else if (attempts >= maxAttempts) {
          clearInterval(check);
          resolve(false);
        }
      }, 250);
    });
  }, []);

  const sampleGaze = useCallback(() => {
    const video = videoRef.current;
    const landmarker = faceLandmarkerRef.current;
    if (!video || !landmarker || video.readyState < 2 || video.videoWidth === 0) return;

    try {
      const results = landmarker.detectForVideo(video, performance.now());
      const looking = results.faceLandmarks && results.faceLandmarks.length > 0
        ? estimateGaze(results.faceLandmarks[0])
        : true;
      gazeSamplesRef.current.push({
        timestamp: performance.now(),
        lookingAtCamera: looking,
      });
    } catch {
      // detection failed for this frame, skip
    }
  }, [videoRef, estimateGaze]);

  const startCollection = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    gazeSamplesRef.current = [];
    answerStartRef.current = performance.now();
    setActive(true);
    setCurrentSignals(null);
    setCalibrating(true);

    const landmarker = await initLandmarker();

    if (!landmarker) {
      setTrackingAvailable(false);
      setCalibrating(false);
      return;
    }

    const video = videoRef.current;
    if (video) {
      const ready = await waitForVideoReady(video);
      if (!ready) {
        setTrackingAvailable(false);
        setCalibrating(false);
        return;
      }
    }

    setTrackingAvailable(true);
    setCalibrating(false);

    intervalRef.current = setInterval(sampleGaze, 2000);
    setTimeout(sampleGaze, 300);
  }, [initLandmarker, sampleGaze, waitForVideoReady, videoRef]);

  const stopCollection = useCallback((transcript: string): EngagementSignals => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    runningRef.current = false;
    setActive(false);
    setCalibrating(false);

    const answerEnd = performance.now();
    const durationMs = answerStartRef.current ? answerEnd - answerStartRef.current : 0;
    const durationMin = durationMs / 60000;

    const samples = gazeSamplesRef.current;
    const lookingCount = samples.filter((s) => s.lookingAtCamera).length;
    const eyeContactPct = samples.length > 0 ? (lookingCount / samples.length) * 100 : 0;

    const wordCount = transcript.trim().split(/\s+/).filter((w) => w.length > 0).length;
    const speakingPaceWPM = durationMin > 0 ? Math.round(wordCount / durationMin) : 0;

    const lowerTranscript = ' ' + transcript.toLowerCase() + ' ';
    const foundFillers: string[] = [];
    let fillerWordCount = 0;
    for (const filler of FILLER_WORDS) {
      const regex = new RegExp(`\\b${filler.replace(/ /g, '\\s+')}\\b`, 'g');
      const matches = lowerTranscript.match(regex);
      if (matches) {
        fillerWordCount += matches.length;
        foundFillers.push(filler);
      }
    }

    let answerCompleteness: EngagementSignals['answerCompleteness'] = 'minimal';
    const sentences = transcript.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    const longSentences = sentences.filter((s) => s.trim().split(/\s+/).length >= 5);
    if (wordCount >= 40 && longSentences.length >= 2) {
      answerCompleteness = 'complete';
    } else if (wordCount >= 15 && longSentences.length >= 1) {
      answerCompleteness = 'partial';
    }

    const signals: EngagementSignals = {
      eyeContactPct: samples.length > 0 ? Math.round(eyeContactPct) : 0,
      speakingPaceWPM,
      fillerWordCount,
      fillerWords: foundFillers,
      answerCompleteness,
      sampleCount: samples.length,
    };

    setCurrentSignals(signals);
    return signals;
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (faceLandmarkerRef.current) {
        try {
          faceLandmarkerRef.current.close();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  return {
    startCollection,
    stopCollection,
    active,
    calibrating,
    trackingAvailable,
    currentSignals,
  };
}
