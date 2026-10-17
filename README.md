# Guidr

Guidr is a voice tutor that sits on top of a piece of workplace software and talks you through a task, one step at a time. You click the mic, say what you need in English, Arabic, or a mix of both, and Guidr explains what to do, points at the exact button or field on screen, and waits for you to actually do it before moving on.

It was built as a hackathon project with Devin, so it is a working prototype rather than a finished product. One lesson exists today: creating a supplier invoice inside a simulated accounts-payable dashboard called Nexus Finance. The internal codename is Clicky-UAE, which is why that name still shows up in the package name and a few config files.

## Why we built it

Learning a new internal tool at work usually means a PDF of screenshots, a recorded video, or asking the person next to you. None of those adapt to you, none can answer a question halfway through, and none of them speak the way people in the UAE actually speak, which is often Arabic and English woven into the same sentence.

Chatbots do not really fix this either. They cannot see your screen, they cannot point at anything, and they will happily say "great, you've done it" when you have not done anything at all.

Guidr was designed around that last problem. The tutor can explain and point, but it is never the one who decides whether you completed a step. That decision is made by plain, deterministic code.

The people we had in mind are white-collar workers in the UAE who would rather be talked through a task than read about it. The demo persona is Layla, a finance assistant in Dubai working in accounts payable.

## What it actually does

Everything here is implemented in this repository.

**Voice only.** There is no text box. You click the mic, speak, and Guidr speaks back. Holding Ctrl and Space while the tutor is talking cuts it off and records you until you let go.

**Understands mixed Arabic and English.** Speech recognition uses Munsit's munsit-en-ar model, which is built for code-switched Arabic-English audio.

**Replies in your language.** Each thing you say is checked for Arabic script and Latin words, classified as English, Arabic, or mixed, and the tutor is told explicitly which one to use on every turn. Arabic replies are spoken by Munsit's Faseeh voice in an Emirati dialect; English replies use the browser's built-in speech.

**Points at things by name, not by pixel.** The tutor can ask to highlight a control such as the supplier dropdown. The browser finds that element on the page and animates a cursor and ring to it. The tutor never produces coordinates, and no tool accepts a number that could be one.

**Only you can advance the lesson.** Every click or keystroke on a tagged control is sent to a Convex function that checks it against what the current step expects. If it matches, the step advances and the tutor is told. If it does not, the wrong click is logged and the tutor is told that too. The tutor has no tool that could advance the lesson itself.

**Teaches rather than just instructs.** The system prompt requires every instruction to include what to do, what that control means, and one concrete reason it matters for the invoice. "Click New Invoice" on its own is not allowed.

**Grounds answers in official guidance.** When you ask about VAT, TRNs, or what belongs on a tax invoice, the tutor can search a cached copy of the UAE Federal Tax Authority's guide on tax invoices. That document was pulled in once through Context.dev and stored in Convex. Nothing external is called during a conversation.

**Asks before anything consequential.** Before the final submit step, the tutor reads back the supplier and amount, asks you to confirm the description you typed, and waits for a clear yes.

**Picks up where you left off.** Progress is stored in Convex, so refreshing the page resumes from the current step rather than starting over.

**Degrades gracefully.** If Munsit transcription fails twice in a row, the app switches to the browser's own speech recognition and shows a small badge saying so. If Munsit's voice fails, the browser voice takes over.

**Keeps a record.** Every step start, correct action, wrong action, hint, documentation lookup, and completion is written to an events table.

## How it is put together

There are two halves: a React app running in the browser and a Convex backend running locally.

**The browser** owns the microphone, the conversation history, the tool execution, and the visual overlay. The microphone code captures raw audio, watches the volume level to work out when you have started and stopped talking, and encodes the result as a WAV file in the browser. WAV was chosen because Munsit accepts it without any codec negotiation, and the same audio samples give us a level meter for free.

**Convex** owns everything durable: the lesson and its steps, your session and current step, the event log, and the cached documentation. It also hosts the functions that talk to Munsit, OpenRouter, and Context.dev. All API keys live as Convex environment variables and never reach the browser. This matters because Munsit has no short-lived token system, so proxying through a server is the only way to keep the key private.

**A single turn** goes like this. You speak, the browser detects the end of your utterance and sends the WAV to Convex, which forwards it to Munsit and returns text. The text is added to the conversation and sent to another Convex function, which calls Claude through OpenRouter with the system prompt and the tool definitions. If Claude asks to use a tool, the browser runs it, adds the result to the conversation, and asks Claude again, up to six rounds. Whatever Claude finally says is sent to speech: Faseeh if it contains any Arabic, the browser voice if it is pure English.

**When you click something** in the simulated app, the element's semantic id is sent to Convex. Convex compares it against the current step's expected element and completion rule, updates progress if it was right, and the result is written into the conversation as a system note beginning with LESSON_STATE. The tutor then responds to that note. The tutor can read these notes but has no way to write one, and that asymmetry is what stops it from ever declaring success on its own.

**Interruptions** are handled carefully because the OpenRouter API rejects a conversation that has an unanswered tool call. When you barge in mid-turn, any in-flight response is marked stale and ignored, but pending tool results are still written before your new message is added. The tool runner is written so it can never fail to return a result: unknown tools, broken arguments, thrown errors, and timeouts all produce an error result rather than a missing one.

## The AI side in more detail

**Model.** Claude Haiku 4.5, reached through OpenRouter's OpenAI-compatible chat API. It was picked for latency and cost on short spoken turns. A different OpenRouter model id can be set through an environment variable.

**Prompt.** The system prompt lives server-side in Convex and is never sent to the browser. It covers how to speak for a voice interface (short sentences, no lists or formatting, numbers as words), the language mirroring rule, the teaching contract of action plus meaning plus reason, the instruction that the model cannot see the screen and must not claim to have observed a click, the pre-submit confirmation flow, and a list of the controls it is allowed to point at, with their English and Arabic labels. That list is generated from the same registry the browser uses, so the prompt and the tool schema cannot drift apart.

**Tools.** There are four. Highlight an element by id, clear the highlight, read the current lesson state, and look up documentation. The documentation tool runs a simple keyword search over the cached chunks: it scores each chunk by how many query words appear in its keyword list and heading, plus a small bonus for an exact substring match, and returns the top three. There are no embeddings and no vector index. It is deliberately simple and only reads the database.

**Documentation ingest.** This is a one-time, operator-run step, never triggered by a conversation. It fetches the FTA tax invoice PDF through Context.dev, which converts it to markdown, splits the markdown into chunks of roughly twelve hundred characters on heading boundaries, tags each chunk with keywords, and stores it. A committed snapshot of the same content can be loaded instead when there is no Context.dev key, and it goes through the identical chunking path so behaviour is the same either way.

## Tech stack

React 19 with TypeScript for the interface, the voice loop, the simulated app, and the overlay. Vite for the dev server and build. Convex for the database, the deterministic progress logic, and the server-side functions that call external APIs; it runs as an anonymous local deployment with no account needed. Claude via OpenRouter for reasoning. Munsit for Arabic-aware speech recognition and Arabic speech synthesis. Context.dev for the one-off PDF to markdown conversion. The Web Audio API for microphone capture and the Web Speech API for the English voice and the fallback recogniser. Oxlint for linting.

The only runtime dependencies are convex, react, and react-dom. There is no agent framework, no Docker, and no authentication.

## Where things live

The convex folder holds the schema, the session and progress logic, the Claude call, the system prompt and tool definitions, the Munsit proxies, the knowledge ingest and search, and the lesson seed. The src/contracts folder holds the frozen shared types: the element registry, the tool interfaces, and the session shapes. src/voice holds the microphone, speech output, fallback recogniser, tool runner, state-note builder, and the main voice loop. src/lesson wires progress, the simulated app, and the voice session together. src/overlay turns an element id into an on-screen highlight. src/app is the simulated Nexus Finance dashboard. src/ui holds the mic button, status pill, and step tracker. There is also a playground page, reachable by adding a playground query parameter to the URL, that shows the simulated app and overlay without any voice or backend.

AGENTS.md documents the architectural rules for anyone (or any coding agent) working on the repo, and scripts/ingest-docs.md is the runbook for loading the documentation.

## Running it locally

You will need Node.js (we used version 24), a Munsit API key, and an OpenRouter API key. A Context.dev key is optional because a committed snapshot covers the documentation.

Install dependencies with npm install, then start Convex with npx convex dev and leave it running. On first run it creates a local deployment and writes the two public Convex URLs into a .env.local file for you.

In a second terminal, set the secrets on the Convex deployment using npx convex env set. The three names are ANTHROPIC_API_KEY, MUNSIT_API_KEY, and optionally CONTEXT_DEV_API_KEY. Despite its name, ANTHROPIC_API_KEY must hold an OpenRouter key, because the code calls OpenRouter rather than Anthropic directly. Never put these in a .env file.

Seed the lesson with npx convex run seed:seedInvoiceLesson, then load the documentation with npx convex run knowledge:ingestFixture (or knowledge:ingest if you have a Context.dev key). Finally start the app with npm run dev, open localhost on port 5173, click the mic button, allow microphone access, and start talking.

Optional tuning variables, also set through Convex, are ANTHROPIC_MODEL for a different OpenRouter model id, MUNSIT_STT_MODEL, MUNSIT_VOICE_ID, and MUNSIT_DIALECT. Running npx convex run speech:listVoices prints the available voice ids. The .env.example file lists all of this with defaults.

On Windows, if PowerShell refuses to run npm, use npm.cmd and npx.cmd instead rather than changing the execution policy. The project was developed and tested in current Chrome and Edge.

## Where it falls short

There is exactly one lesson, and its details, including the persona, the supplier, and the amount, are baked into the prompt and the state notes. The target application is a simulation we built, not real third-party software. Each turn is click-to-talk rather than continuous listening, and the mic goes idle after twenty seconds of silence. Every turn is a serial round trip through transcription, the model, and speech synthesis with no streaming, so there is noticeable latency. Documentation search is keyword matching over a handful of chunks. The microphone code uses a deprecated Web Audio API because it avoided shipping a separate worklet file in a prototype. There are no automated tests and no CI beyond type checking and linting. The whole thing is set up for a local Convex deployment only, with no production config, no auth, and no notion of multiple users. And the environment variable for the model key is confusingly named.

## What we would do next

Turn lessons into data so a new task is a set of database rows and a list of tagged elements rather than new code. Move to a modern audio worklet and stream transcription and speech to cut latency. Swap the keyword search for embeddings once there is more than one document. Add tests for the progress logic, the chunker, the language detector, and the tool runner, which are already written as plain functions. Use the recorded wrong clicks and hint counts to adjust how much the tutor explains. Rename the model key variable to say what it is.
