/**
 * @fileoverview Voice input, from the two browser APIs that already exist.
 *
 * There is NO server-side transcription in this template — core-guardian
 * exposes `run()` and `useCases()`, not audio — so inventing a `/api/transcribe`
 * would be a dead endpoint. The platform already ships both halves:
 *
 *   `MediaRecorder`      → the take the reader can play back
 *   `SpeechRecognition`  → the transcription, on-device, free, no backend
 *
 * `SpeechRecognition` is absent in Firefox and in insecure contexts, so this
 * feature-detects and reports it. The surface hides the mic when it is
 * missing rather than rendering a control that silently does nothing.
 */
import { useCallback, useEffect, useRef, useState } from "react";

/** The slice of the Web Speech API this file uses. */
interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

interface SpeechResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function speechCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

/** One recorded take: audio you can play, plus the text it transcribed to. */
export interface VoiceTake {
  id: string;
  /** Object URL for the recorded blob. Revoked when the take is dropped. */
  url: string;
  seconds: number;
  transcript: string;
}

export interface Voice {
  /** True when this browser can both record and transcribe. */
  supported: boolean;
  recording: boolean;
  /** Words recognised so far in the live take. */
  interim: string;
  /** Plain-language failure (permission denied, recogniser error). */
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
  clearError: () => void;
}

/**
 * Record a take and transcribe it in the browser.
 *
 * @param onTake Called once the recorder has flushed and the recogniser has
 *   settled, with the playable take and its final transcript.
 * @returns The voice transport's state and controls.
 */
export function useVoice(onTake: (take: VoiceTake) => void): Voice {
  const [supported, setSupported] = useState(false);
  const [recording, setRecording] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const finalRef = useRef("");
  const startedAtRef = useRef(0);
  const takeRef = useRef(onTake);
  takeRef.current = onTake;

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "MediaRecorder" in window && speechCtor() !== null);
  }, []);

  // A live recorder must not outlive the surface, or the microphone stays on
  // after a navigation.
  useEffect(
    () => () => {
      recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
      recognitionRef.current?.stop();
    },
    [],
  );

  const start = useCallback(async () => {
    const Recognition = speechCtor();
    if (!Recognition) return;
    setError(null);
    setInterim("");
    finalRef.current = "";
    chunksRef.current = [];

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("The microphone is not available. Check the browser's permission for this site.");
      return;
    }

    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;
    startedAtRef.current = Date.now();

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
      const transcript = finalRef.current.trim();
      takeRef.current({
        id: crypto.randomUUID(),
        url: URL.createObjectURL(blob),
        seconds: Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000)),
        transcript,
      });
      recorderRef.current = null;
      setRecording(false);
      setInterim("");
    };

    const recognition = new Recognition();
    recognitionRef.current = recognition;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";
    recognition.onresult = (event) => {
      let live = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]!;
        if (result.isFinal) finalRef.current += `${result[0].transcript} `;
        else live += result[0].transcript;
      }
      setInterim(live);
    };
    recognition.onerror = (event) => {
      // `no-speech` and `aborted` are ordinary ends to a take, not failures.
      if (event.error === "no-speech" || event.error === "aborted") return;
      setError(
        event.error === "not-allowed"
          ? "Speech recognition was blocked. Allow microphone access for this site."
          : "Speech recognition stopped unexpectedly. Typing still works.",
      );
    };

    recorder.start();
    recognition.start();
    setRecording(true);
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    // The recorder's `onstop` is what emits the take, so stopping it is the
    // only place a take is created — one path, one take.
    recorderRef.current?.stop();
  }, []);

  return { supported, recording, interim, error, start, stop, clearError: () => setError(null) };
}
