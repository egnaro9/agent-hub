import { useEffect, useRef, useState } from "react";

// Dictation for any composer. Uses the browser's own SpeechRecognition — no
// audio ever leaves the page except through the browser's own service, and
// nothing is sent to our agents until the operator presses Enter, exactly as
// with typing. Interim results stream into the field so you can watch it land.
//
// Availability is real, not assumed: Chrome and Edge implement webkitSpeech-
// Recognition; Firefox does not. The button hides itself rather than offering
// a control that can't work.

type SR = {
  new (): SpeechRecognitionLike;
};
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

const getRecognizer = (): SR | null => {
  const w = window as unknown as { SpeechRecognition?: SR; webkitSpeechRecognition?: SR };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export default function MicButton({
  onTranscript,
  onStart,
  disabled,
}: {
  /** Called with the text so far; replaces what dictation previously added. */
  onTranscript: (text: string, final: boolean) => void;
  /** Fires before listening starts, so the composer can snapshot typed text. */
  onStart?: () => void;
  disabled?: boolean;
}) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const supported = typeof window !== "undefined" && getRecognizer() !== null;

  // Stop the microphone if this composer goes away mid-dictation.
  useEffect(() => () => recRef.current?.abort(), []);

  if (!supported) return null;

  const stop = () => {
    recRef.current?.stop();
    setListening(false);
  };

  const start = () => {
    const Recognizer = getRecognizer();
    if (!Recognizer) return;
    const rec = new Recognizer();
    recRef.current = rec;
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || "en-US";

    let settled = "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const chunk = e.results[i][0].transcript;
        if (e.results[i].isFinal) settled += chunk;
        else interim += chunk;
      }
      onTranscript((settled + interim).trimStart(), false);
    };
    rec.onerror = (e) => {
      setError(e.error === "not-allowed" ? "mic blocked — allow access in the address bar" : e.error);
      setListening(false);
    };
    rec.onend = () => {
      setListening(false);
      if (settled.trim()) onTranscript(settled.trim(), true);
    };

    onStart?.();
    setError(null);
    try {
      rec.start();
      setListening(true);
    } catch {
      setError("could not start the microphone");
    }
  };

  return (
    <button
      type="button"
      onClick={listening ? stop : start}
      disabled={disabled}
      aria-pressed={listening}
      aria-label={listening ? "Stop dictating" : "Dictate a message"}
      title={error ?? (listening ? "Listening — click to stop" : "Dictate with your microphone")}
      className={`mono grid h-7 w-7 flex-none cursor-pointer place-items-center rounded-lg border text-[12px] transition disabled:cursor-default disabled:opacity-40 ${
        listening
          ? "border-rose-300/60 bg-rose-400/20 text-rose-200"
          : error
            ? "border-amber-300/40 text-amber-300/80"
            : "border-white/10 bg-white/5 text-slate-400 hover:border-white/30 hover:text-slate-200"
      }`}
    >
      <span className={listening ? "breathe" : undefined}>●</span>
    </button>
  );
}
