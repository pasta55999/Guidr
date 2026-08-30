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
| Speech, tone, language mirroring, hints | OpenAI Realtime (browser WebRTC) |
| "Was that click correct? What step are we on?" | `convex/sessions.ts:recordClick` — deterministic |
| Pixel position of an element | `src/overlay/*`, via `[data-tutor-id]` + `getBoundingClientRect` |
| Durable progress / lessons / knowledge | Convex tables |
| Current external documentation | Context.dev, ingested once, cached in Convex |

Consequences that must not be undone:

- There is **no `advance_step` tool**. The tutor can point and explain, not declare success.
- No tool schema accepts a number that could be an x/y coordinate.
- Progress is read from a Convex query, never mirrored into React state.
- `lookup_docs` reads Convex only. Context.dev is **never** called on a voice turn.

## Frozen files

`convex/schema.ts` and `src/contracts/*` are frozen after Phase 1 so parallel
workstreams don't collide. Changing them requires re-syncing every stream.

`src/contracts/elements.data.ts` is DOM-free on purpose: it is imported by both the
browser and Convex functions (`convex/prompts.ts` builds the tool enum from it), so it
must run in Convex's V8 isolate. Anything touching `document` goes in `elements.ts`.

## Secrets

`OPENAI_API_KEY`, `OPENAI_REALTIME_MODEL` and `CONTEXT_DEV_API_KEY` live **only** in
Convex env vars (`npx convex env set`). Never in `.env*`, never `VITE_`-prefixed —
that prefix inlines a value into the browser bundle. `.env*` is gitignored except
`.env.example`. The ephemeral-token HTTP action returns only `{ value, expiresAt }`.

## File ownership (parallel sessions)

| Area | Files |
|---|---|
| Convex data | `convex/{lessons,sessions,events,seed}.ts` |
| Voice/Realtime | `convex/{realtime,http,prompts}.ts`, `src/voice/*` |
| Context.dev knowledge | `convex/knowledge.ts`, `convex/fixtures/*` |
| Simulated app + overlay | `src/app/*`, `src/overlay/*`, `src/ui/*` |
| Integration | `src/App.tsx`, `src/lesson/*` |

Shared/no-touch: `package.json`, `convex/schema.ts`, `src/contracts/*`.

## Dependencies

Runtime deps are exactly `convex`, `react`, `react-dom`. Do not add others without
asking. No LangChain, no Docker, no agent frameworks, no auth.
