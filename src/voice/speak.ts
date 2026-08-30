// Tutor speech output with graceful degradation.
//
// Munsit's Faseeh is an Arabic engine, so routing is by script: any Arabic
// present -> Faseeh (which keeps mixed Arabic-English sentences in one voice,
// preserving intra-sentence code-switching); pure English -> the browser's
// built-in SpeechSynthesis. If Munsit fails or runs out of credit we fall back
// to the browser so the lesson can always finish.

const ARABIC = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

export function hasArabic(text: string): boolean {
  return ARABIC.test(text);
}

export type SynthesizeFn = (text: string) => Promise<{
  ok: boolean;
  audioBase64?: string;
  mimeType?: string;
  error?: string;
}>;

export interface SpeakOptions {
  synthesize: SynthesizeFn;
  onLog?: (message: string, detail?: unknown) => void;
  signal?: { cancelled: boolean };
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

let activeAudio: HTMLAudioElement | null = null;

function playBlob(blob: Blob): Promise<void> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    activeAudio = audio;
    const done = () => {
      URL.revokeObjectURL(url);
      if (activeAudio === audio) activeAudio = null;
      resolve();
    };
    audio.onended = done;
    audio.onerror = done;
    void audio.play().catch(done);
  });
}

function browserSpeak(text: string, lang: string): Promise<void> {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) {
      resolve();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    const voice = window.speechSynthesis
      .getVoices()
      .find((v) => v.lang.toLowerCase().startsWith(lang.slice(0, 2)));
    if (voice) utterance.voice = voice;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
}

/** Stop any in-flight speech immediately. */
export function stopSpeaking(): void {
  if (activeAudio) {
    activeAudio.pause();
    activeAudio = null;
  }
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

export async function speak(
  text: string,
  { synthesize, onLog, signal }: SpeakOptions,
): Promise<void> {
  const clean = text.trim();
  if (!clean) return;

  if (!hasArabic(clean)) {
    await browserSpeak(clean, "en-US");
    return;
  }

  const result = await synthesize(clean);
  if (signal?.cancelled) return;

  if (result.ok && result.audioBase64) {
    await playBlob(base64ToBlob(result.audioBase64, result.mimeType ?? "audio/wav"));
    return;
  }

  onLog?.("Munsit TTS unavailable, using browser voice", result.error);
  await browserSpeak(clean, "ar-AE");
}
