# Clicky-UAE — AI voice workplace tutor (hackathon MVP)

Browser-based voice tutor that teaches UAE white-collar workers a workplace-software
task, speaking English, Arabic, or mixed code-switched Arabic-English. Voice only —
there is no text-chat interface.

## Commands

This machine's PowerShell execution policy blocks `npm.ps1`. **Use `npm.cmd` / `npx.cmd`,
not `npm` / `npx`.** Do not change the execution policy.

```
& "C:\Program Files\nodejs\npm.cmd" run dev        # Vite dev server
& "C:\Program Files\nodejs\npx.cmd" convex dev     # Convex codegen + watch (keep running)
& "C:\Program Files\nodejs\npm.cmd" run typecheck  # frontend + convex
& "C:\Program Files\nodejs\npm.cmd" run lint       # oxlint
& "C:\Program Files\nodejs\npx.cmd" convex run seed:seedInvoiceLesson
```

## Convex deployment

This project uses an **anonymous local Convex deployment** — no account, no login.
`npx convex dev` provisions and serves it. Written to `.env.local`:

- `VITE_CONVEX_URL=http://127.0.0.1:3210` — client/queries
- `VITE_CONVEX_SITE_URL=http://127.0.0.1:3211` — **HTTP actions**, i.e. the ephemeral
  token endpoint. Use this one, not 3210, for `POST /realtime/token`.

`npx convex dev` must be running for anything to work. Env vars set with
`npx convex env set` apply to this local deployment.

Node was installed via winget after the fact, so a shell may need:

```
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
```

`esbuild`'s postinstall is allow-listed in `package.json` (`allowScripts`) because npm 11
blocks install scripts by default and the Convex CLI bundler needs it.

## Core architectural rule

**The LLM never decides whether the learner succeeded.**

| Concern | Owner |
|---|---|
| Arabic / code-switched speech recognition | Munsit `munsit-en-ar` via `convex/speech.ts:transcribe` |
| Reasoning, tone, language mirroring, tool calls | Claude Messages API via `convex/tutor.ts:respond` |
| Speech output | Munsit Faseeh (Arabic) / browser `SpeechSynthesis` (English) |
| "Was that click correct? What step are we on?" | `convex/sessions.ts:recordClick` — deterministic |
| Pixel position of an element | `src/overlay/*`, via `[data-tutor-id]` + `getBoundingClientRect` |
| Durable progress / lessons / knowledge | Convex tables |
| Current external documentation | Context.dev, ingested once, cached in Convex |

Consequences that must not be undone:

- There is **no `advance_step` tool**. The tutor can point and explain, not declare success.
- No tool schema accepts a number that could be an x/y coordinate.
- Progress is read from a Convex query, never mirrored into React state.
- `lookup_docs` reads Convex only. Context.dev is **never** called on a voice turn.
- Every `tool_use` must be answered by a `tool_result` in the immediately following
  user message — Anthropic errors otherwise, so `runToolUse` never throws.

## Voice pipeline

Three stages, orchestrated by `src/voice/useVoiceLoop.ts`:

1. **Capture** (`src/voice/mic.ts`) — raw PCM via `ScriptProcessorNode`, WAV encoded
   in-browser. WAV avoids any container/codec negotiation with Munsit, and the same
   sample buffer provides the RMS used for silence-based turn detection. The mic is
   paused while the tutor speaks so we never transcribe our own audio.
2. **Understand + reason** — WAV → `speech.transcribe` (Munsit) → text → appended to
   the message list → `tutor.respond` (Claude, with tools) → tool loop in the browser.
3. **Speak** (`src/voice/speak.ts`) — routed by script: any Arabic → Munsit Faseeh
   (`dialect: emirati`), which keeps mixed Arabic-English in a single voice and so
   preserves intra-sentence code-switching; pure English → browser `SpeechSynthesis`.

Faseeh is **Arabic-only** — do not route English text to it.

Fallbacks so the demo cannot hard-fail: after 2 consecutive Munsit STT failures the
loop switches to the browser's `SpeechRecognition` (`usingFallbackStt` shows in the
UI); if Munsit TTS fails, speech falls back to `SpeechSynthesis`.

Why the API keys are proxied through Convex: Munsit has no ephemeral-token mechanism,
and its browser WebSocket auth requires the raw key in the URL. Server-side hops are
the only way to keep the keys private.

## Frozen files

`convex/schema.ts` and `src/contracts/*` are frozen after Phase 1 so parallel
workstreams don't collide. Changing them requires re-syncing every stream.

`src/contracts/elements.data.ts` is DOM-free on purpose: it is imported by both the
browser and Convex functions (`convex/prompts.ts` builds the tool enum from it), so it
must run in Convex's V8 isolate. Anything touching `document` goes in `elements.ts`.

## Secrets

`ANTHROPIC_API_KEY`, `MUNSIT_API_KEY` and `CONTEXT_DEV_API_KEY` live **only** in
Convex env vars (`npx convex env set`). Never in `.env*`, never `VITE_`-prefixed —
that prefix inlines a value into the browser bundle. `.env*` is gitignored except
`.env.example`. No secret is ever returned to the browser by any action.

Optional overrides: `ANTHROPIC_MODEL` (default `claude-sonnet-5`; `claude-haiku-4-5-20251001`
is the latency fallback), `MUNSIT_STT_MODEL` (default `munsit-en-ar`),
`MUNSIT_VOICE_ID`, `MUNSIT_DIALECT` (default `emirati`).

Run `npx convex run speech:listVoices` to discover valid `voice_id` values.

## File ownership (parallel sessions)

| Area | Files |
|---|---|
| Convex data | `convex/{lessons,sessions,events,seed}.ts` |
| Voice | `convex/{tutor,speech,prompts}.ts`, `src/voice/*` |
| Context.dev knowledge | `convex/knowledge.ts`, `convex/fixtures/*` |
| Simulated app + overlay | `src/app/*`, `src/overlay/*`, `src/ui/*` |
| Integration | `src/App.tsx`, `src/Root.tsx`, `src/lesson/*` |

Shared/no-touch: `package.json`, `convex/schema.ts`, `src/contracts/*`.

## Dependencies

Runtime deps are exactly `convex`, `react`, `react-dom`. Do not add others without
asking. No LangChain, no Docker, no agent frameworks, no auth.
