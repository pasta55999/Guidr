// Fallback speech recognition using the browser's built-in engine.
//
// Used only if Munsit transcription fails repeatedly (network, bad key, or
// exhausted credit). We SWITCH to it rather than running both, because two
// simultaneous microphone consumers conflict on some systems. Accuracy on
// Arabic and on code-switched speech is markedly worse — this exists so the
// lesson can still be completed, not as an equal alternative.

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
}

type RecognitionCtor = new () => SpeechRecognitionLike;

function getCtor(): RecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isBrowserSttAvailable(): boolean {
  return getCtor() !== null;
}

export interface BrowserSttController {
  start: () => void;
  stop: () => void;
  setPaused: (paused: boolean) => void;
  setLang: (lang: string) => void;
}

export function createBrowserStt(options: {
  onText: (text: string) => void;
  onError?: (message: string) => void;
  lang?: string;
}): BrowserSttController | null {
  const Ctor = getCtor();
  if (!Ctor) return null;

  let recognition: SpeechRecognitionLike | null = null;
  let running = false;
  let paused = false;
  let lang = options.lang ?? "ar-AE";

  const build = () => {
    const r = new Ctor();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = false;

    r.onresult = (event) => {
      if (paused) return;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const text = result[0].transcript.trim();
          if (text) options.onText(text);
        }
      }
    };
    r.onerror = (event) => {
      if (event.error && event.error !== "no-speech") {
        options.onError?.(event.error);
      }
    };
    // The engine stops itself periodically; restart while we still want audio.
    r.onend = () => {
      if (running) {
        try {
          r.start();
        } catch {
          /* already starting */
        }
      }
    };
    return r;
  };

  const start = () => {
    if (running || paused) return;
    running = true;
    recognition = build();
    try {
      recognition.start();
    } catch {
      /* already started */
    }
  };

  return {
    start,
    stop() {
      running = false;
      recognition?.stop();
      recognition = null;
    },
    setPaused(next) {
      if (paused === next) return;
      paused = next;
      if (paused) {
        running = false;
        recognition?.stop();
        recognition = null;
      } else {
        start();
      }
    },
    setLang(next) {
      lang = next;
      if (recognition) recognition.lang = next;
    },
  };
}
