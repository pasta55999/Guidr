// Microphone capture with silence-based turn detection.
//
// We capture raw PCM and encode WAV ourselves rather than using MediaRecorder:
// WAV is unambiguously accepted by Munsit's transcribe endpoint (no container or
// codec negotiation), and the same sample buffer gives us the RMS level needed
// for voice activity detection for free.

export interface MicOptions {
  /** Fired once per detected utterance. */
  onUtterance: (wav: Blob, durationMs: number) => void;
  /** Fired when speech starts, for UI feedback. */
  onSpeechStart?: () => void;
  /** Smoothed 0..1 input level, for a level meter. */
  onLevel?: (level: number) => void;
  onError?: (error: Error) => void;
}

/** Above this RMS counts as speech. Tuned for a normal laptop mic. */
const SPEECH_RMS = 0.018;
/** Silence needed to end a turn. */
const SILENCE_MS = 900;
/** Utterances shorter than this are coughs, clicks and door slams. */
const MIN_SPEECH_MS = 350;
/** Hard cap so a stuck-open mic cannot upload forever. */
const MAX_SPEECH_MS = 15000;

function encodeWav(chunks: Float32Array[], sampleRate: number): Blob {
  let length = 0;
  for (const c of chunks) length += c.length;

  const buffer = new ArrayBuffer(44 + length * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++)
      view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, length * 2, true);

  let offset = 44;
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i++) {
      const s = Math.max(-1, Math.min(1, chunk[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: "audio/wav" });
}

export interface MicController {
  start: () => Promise<void>;
  stop: () => void;
  /** Paused while the tutor speaks, so we never transcribe our own audio. */
  setPaused: (paused: boolean) => void;
  isPaused: () => boolean;
  /**
   * Start push-to-interrupt capture immediately, without waiting for the RMS
   * threshold. Returns false if the microphone is not ready.
   */
  beginHeldTurn: () => boolean;
  /** Finalize the held audio immediately. Returns false when none was active. */
  endHeldTurn: () => boolean;
}

export function createMic({
  onUtterance,
  onSpeechStart,
  onLevel,
  onError,
}: MicOptions): MicController {
  let stream: MediaStream | null = null;
  let context: AudioContext | null = null;
  let processor: ScriptProcessorNode | null = null;
  let source: MediaStreamAudioSourceNode | null = null;

  let paused = false;
  let speaking = false;
  let heldTurn = false;
  let chunks: Float32Array[] = [];
  let speechStartedAt = 0;
  let lastVoiceAt = 0;
  let smoothed = 0;
  let currentSampleRate = 48000;

  const finish = (sampleRate: number): boolean => {
    const durationMs = Date.now() - speechStartedAt;
    const collected = chunks;
    speaking = false;
    chunks = [];
    if (durationMs < MIN_SPEECH_MS || collected.length === 0) return false;
    onUtterance(encodeWav(collected, sampleRate), durationMs);
    return true;
  };

  const handleAudio = (event: AudioProcessingEvent) => {
    const input = event.inputBuffer.getChannelData(0);
    const sampleRate = event.inputBuffer.sampleRate;
    currentSampleRate = sampleRate;

    let sum = 0;
    for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
    const rms = Math.sqrt(sum / input.length);
    smoothed = smoothed * 0.8 + rms * 0.2;
    onLevel?.(Math.min(1, smoothed * 12));

    if (paused && !heldTurn) {
      // Drop everything while the tutor talks, and forget any partial automatic
      // turn. A held turn overrides this pause: that is the barge-in mechanism.
      if (speaking) {
        speaking = false;
        chunks = [];
      }
      return;
    }

    const now = Date.now();
    const isVoice = rms > SPEECH_RMS;

    if (heldTurn) {
      // Push-to-interrupt captures the whole key-held window, including quiet
      // phonemes and natural pauses. Only key release finalizes it.
      chunks.push(new Float32Array(input));
      if (now - speechStartedAt >= MAX_SPEECH_MS) {
        heldTurn = false;
        finish(sampleRate);
      }
      return;
    }

    if (isVoice && !speaking) {
      speaking = true;
      speechStartedAt = now;
      lastVoiceAt = now;
      chunks = [];
      onSpeechStart?.();
    }

    if (speaking) {
      chunks.push(new Float32Array(input));
      if (isVoice) lastVoiceAt = now;

      const silentFor = now - lastVoiceAt;
      const speechFor = now - speechStartedAt;
      if (silentFor >= SILENCE_MS || speechFor >= MAX_SPEECH_MS) {
        finish(sampleRate);
      }
    }
  };

  return {
    async start() {
      if (stream) return;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        context = new AudioContext();
        if (context.state === "suspended") await context.resume();
        source = context.createMediaStreamSource(stream);
        // ScriptProcessorNode is deprecated but needs no separate worklet
        // module; acceptable for an MVP and works in current Chrome/Edge.
        processor = context.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = handleAudio;
        source.connect(processor);
        // Must reach a destination to be pulled, but we don't want to hear it.
        const mute = context.createGain();
        mute.gain.value = 0;
        processor.connect(mute);
        mute.connect(context.destination);
      } catch (error) {
        onError?.(
          error instanceof Error ? error : new Error("Microphone unavailable"),
        );
      }
    },

    stop() {
      processor?.disconnect();
      source?.disconnect();
      void context?.close();
      stream?.getTracks().forEach((t) => t.stop());
      processor = null;
      source = null;
      context = null;
      stream = null;
      speaking = false;
      heldTurn = false;
      chunks = [];
    },

    setPaused(next: boolean) {
      paused = next;
    },

    isPaused() {
      return paused;
    },

    beginHeldTurn() {
      if (!stream || !context) return false;
      // The keydown is a real user gesture, so this also resumes an AudioContext
      // that Chrome may have suspended when the page auto-started.
      if (context.state === "suspended") void context.resume();
      heldTurn = true;
      speaking = true;
      paused = false;
      speechStartedAt = Date.now();
      lastVoiceAt = speechStartedAt;
      chunks = [];
      onSpeechStart?.();
      return true;
    },

    endHeldTurn() {
      if (!heldTurn) return false;
      heldTurn = false;
      return speaking ? finish(currentSampleRate) : false;
    },
  };
}
