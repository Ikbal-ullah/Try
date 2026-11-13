# Study Assistant

Paste your notes or type a topic. An AI model turns it into **flashcards** and a **multiple-choice quiz**, and the app lets you flip through the cards, take the quiz, and **re-test only the questions you got wrong**.

It is not a chatbot: the model returns JSON, the app validates it, and only validated data is rendered as interactive components.

Built for a frontend internship assignment. The focus is on what happens when the model's output is wrong, late, or missing.

## Run it locally

You need Node.js 20.3 or newer.

```bash
git clone https://github.com/Ikbal-ullah/Try.git
cd Try
cp .env.example .env
```

Open `.env` and paste an API key after `LLM_API_KEY=` (a free Gemini key from <https://aistudio.google.com/apikey> works). Then:

```bash
npm install && npm start
```

Open <http://localhost:5173>. `npm start` runs two processes: the React app (Vite, port 5173) and the API server (Express, port 3001). Vite forwards `/api/*` to the API server.

No key yet? The app still runs. Pick **Good response** in the *Failure simulator* dropdown to use built-in sample data.

Other commands:

| Command | What it does |
|---|---|
| `npm test` | Runs the tests (parser, server use case, HTTP API, both reducers) |
| `npm run build` | Builds the React app into `dist/` |
| `npm run serve` | Runs the server the way production does: API plus the built app from `dist/` |

### Using a different AI provider

The server calls an OpenAI-compatible `/chat/completions` endpoint, so Gemini, Groq, OpenRouter, OpenAI and a local Ollama all work by changing three lines in `.env`. Examples are in `.env.example`.

## How to use it

1. Type a topic or paste notes (up to 6,000 characters), then press **Generate study set** or Ctrl+Enter.
2. **Flashcards**: tap a card to flip it. Use Previous, Next and Shuffle, or the ← → keys.
3. **Quiz**: pick an answer (or press 1–4) to see whether it was right and why. At the end you get a score and a **Re-test wrong answers** button, which starts a new round with only the questions you missed.
4. Every set you generate is saved under **Recent study sets** and survives a page refresh.
5. Generating again with the same text gives you a new set.

## How it works

```
Browser (React)                    Server (Express)                   AI provider
───────────────                    ────────────────                   ───────────
TopicForm
   │ text
   ▼
useGeneration ── POST /api/generate ──▶ validate input
(request id +                           build prompt ───────────────▶ chat/completions
 AbortController)                       parse + validate  ◀─ raw text ─┘
   │                                    (retry once if unusable)
   ▼                              ◀──── { studySet, warnings }
validate again                          or { error: { code, message } }
   │
   ▼
StudySet ▶ Flashcards / Quiz
```

| Path | Responsibility |
|---|---|
| `shared/studySet.js` | The validator. Turns raw model text into a trusted study set, or throws an error with a code. Used by the server, the browser and the tests. |
| `server/llm.js` | The only file that touches the API key. Calls the provider with a timeout. |
| `server/generate.js` | Input checks, model call, validation, one automatic retry. |
| `server/mocks.js` | Dev-only failure simulator. |
| `server/app.js` | Express app: security headers, rate limits, cache, concurrency cap, routes, static files. Always answers with JSON. |
| `server/cache.js`, `server/log.js` | The response cache and the structured logger. |
| `server/index.js` | Starts the server and shuts it down cleanly. |
| `src/hooks/useGeneration.js` | Loading, error and success state; cancel; timeout; stale-response guard. |
| `src/hooks/generationReducer.js` | The state machine behind that hook, as a pure function. |
| `src/components/` | The UI: form, status views, flashcards, quiz, saved sessions, error boundary. |
| `src/components/quizReducer.js` | Quiz rounds and re-testing, as a pure function. |

### The API key

The key is read from `.env` by the server and sent only from the server to the provider. The browser calls `/api/generate` and never sees it. `.env` is in `.gitignore`; `.env.example` has the variable names without values. The variables deliberately have no `VITE_` prefix, because Vite copies `VITE_*` variables into the browser bundle.

## Handling bad AI output

This was the main focus. The rule is: **nothing the model says reaches a component without passing through `normalizeStudySet()`**.

| What goes wrong | What the app does |
|---|---|
| JSON wrapped in ```` ``` ```` fences or surrounded by prose | Extracted and parsed normally. |
| Malformed JSON (for example cut off mid-way) | Retried once automatically. If it fails again: an error with a **Try again** button. |
| Valid JSON, wrong shape | Same as above. |
| Some items broken (missing answer, `answerIndex` out of range, duplicate options) | Broken items are dropped, valid ones are kept, and a notice says how many were skipped. |
| Empty result | A message asking for more detail. No retry button, because retrying the same input will not help. |
| Slow response | After 6 seconds the loading state says it is still working. There is a **Cancel** button. |
| No response | The server gives up after 30 seconds per attempt; the browser has its own 75-second limit. |
| Provider overloaded (503) | Retried once on a fallback model, then a "busy right now" message. |
| Rate limit, provider error, network down | A specific message for each, with **Try again**. |
| AI account out of credit | Providers report this with the same status as a rate limit (429). The server tells the two apart and shows "unavailable" with no retry button, because retrying cannot work. |
| Stale response (an older request finishes after a newer one) | The older request is aborted, and its response is ignored because its request id is no longer the latest. |
| A rendering bug despite all this | An error boundary shows a fallback instead of a blank page. |
| Corrupted saved data in localStorage | Saved sets go through the same validator when loaded; bad entries are skipped. |

In every error case the text you typed stays in the box, and if you already had a study set open you can go back to it.

### Seeing the failures yourself

In development the form has a **Failure simulator** dropdown. Each option replaces the model call with one specific bad behaviour; everything after the model call is the real code path.

To see the stale-response guard: choose **Slow (8s)** and generate, then within 8 seconds choose **Good response** and generate again. The second result appears, and the slow one never overwrites it.

The simulator is opt-in: `npm start` switches it on with a `--dev` flag. It is hidden in production builds, and a server started any other way ignores it.

## Decisions and trade-offs

- **Plain `fetch` instead of an AI SDK.** The request is about 20 lines, and every step is visible in `server/llm.js`.
- **JSON mode plus my own validation.** `response_format: json_object` makes valid JSON more likely, but it does not guarantee the shape I asked for, so the Zod validator still checks everything.
- **Salvage instead of reject.** One broken card should not throw away seven good ones.
- **Strict about the answer key.** `answerIndex` is accepted as `2` or `"2"` only. A question with a missing or out-of-range index is dropped, because a silently wrong answer key is worse than a missing question.
- **The app assigns ids.** Model-provided ids can be missing or duplicated, and React keys and quiz bookkeeping need them to be unique.
- **Validation on both sides.** The server validates the model output; the browser validates the server response with the same function.
- **Reducers for state with rules.** Generation state and quiz state are pure reducers, which makes the transitions easy to test.
- **One retry only.** It fixes most one-off failures; more retries would mostly make real failures slower.
- **One class component.** `ErrorBoundary` is a class because React has no hook for error boundaries. Everything else is a functional component.

## AI usage

> TODO before submitting: rewrite this section in your own words and keep it accurate.

I used Claude Code (Anthropic's AI coding assistant) heavily on this project. It helped me break down the assignment, and it generated the first version of most of the code: the validator, the Express server, the hooks, the components, the styles and the tests. It also ran the automated browser checks.

What I did myself: _[fill in honestly, for example: chose the Study assistant option, got the API key, read through and ran every file, changed X, fixed Y, recorded the demo]_.

## Known limitations

- **No streaming.** The whole study set arrives at once, so the wait is 5–15 seconds on a free model.
- **Quiz progress is not saved.** Saved sets reload, but your place in a quiz resets on refresh.
- **The AI can be factually wrong.** The app checks structure, not truth. It cannot tell whether the "correct" answer really is correct.
- **Free-tier limits.** Free models are sometimes overloaded or rate limited. The app reports this clearly but cannot fix it.
- **Prompt injection is only mitigated.** Notes are wrapped in markers and the model is told to treat them as data, which reduces but does not eliminate the risk. The worst case is odd study content, since the output is still validated and rendered as plain text.
- **The real capacity limit is the AI quota.** The server itself handles thousands of requests per second, but a free AI key allows only a handful of generations per minute. Under real traffic the fix is a paid key, not more servers.
- **Limits and cache are per server instance.** They live in memory, which is exact for one instance. With several instances each keeps its own counts, so the effective limit is multiplied; a shared store such as Redis would fix that.
- **Free hosting sleeps.** On Render's free plan the service stops after 15 minutes without visitors, and the next visit waits about a minute while it wakes up.
- **Saved sets are per browser.** There are no accounts and no sync.
- **Tests cover logic and the HTTP API, not components.** Component behaviour was checked with a scripted browser run, which is not part of the repository.

## What I would do next

1. Stream the response and show cards as they arrive.
2. A refinement prompt ("make the quiz harder", "add 5 more cards") that edits the current set.
3. Save quiz progress and scores per set.
4. Move the rate limits and cache to a shared store (Redis) so they stay exact across several instances.
5. Component tests with React Testing Library.
6. Error tracking (for example Sentry) and an uptime monitor on `/api/health`.

## Design

The look is a dark "aurora" theme: soft coloured light on charcoal, with a gradient orb and contour lines in the header.

Colour follows the 60 / 30 / 10 rule:

| Share | Colour | Used for |
|---|---|---|
| 60% | Charcoal `#0f0e13` | Background and card surfaces |
| 30% | Violet `#a59cff` | Focus rings, hover and selected states, step numbers, the cool end of the gradient |
| 10% | Pink `#ff8fcf` | The "pop": the main button, progress bars, the question side of a flashcard |

Violet and pink are neighbours on the colour wheel (an analogous pair), so they blend into one smooth gradient, and pink, the warmer and lighter of the two, is where the eye lands. That is why it marks the one primary action in each view. A faint peach glow in the background is ambient light only; no control or text uses it. Green and red appear only as status colours, always with an icon or a label, so colour is never the only signal.

- **Contrast**: every text pair meets WCAG AA. Body text on a card is 15.6:1, secondary text 8.4:1, and the dark text on the gradient button is at least 6.4:1 at its darkest point.
- **Type**: Inter for the interface and Instrument Serif for headlines and card text. Both are bundled with the app, so there are no requests to a font service.
- **One theme**: the look depends on a dark background, so there is no light mode.
- **Motion**: the card flip and entrance animations switch off for users who ask their system to reduce motion.

## Security

| Risk | Protection |
|---|---|
| Leaked API key | Read from the environment on the server only. Not in the repository, its history, the browser bundle or the Docker image. |
| Injected script (XSS) | React escapes all model output and the app never renders HTML from it. The Content-Security-Policy allows scripts, styles, fonts and requests from the app's own origin only, with no inline code. |
| Clickjacking | The app refuses to load inside a frame (`frame-ancestors 'none'`). |
| Another site using the API through its visitors | Requests the browser marks as cross-site are refused, and no CORS headers are sent. |
| Quota abuse | Per-visitor limits (10 a minute, 100 a day), a cap on simultaneous model calls, and a 32 KB limit on request bodies. |
| Prompt injection | Notes are wrapped in tags, the tags are stripped from the notes themselves, and the model is told to treat them as data. Whatever comes back is still validated and shown as plain text. |
| Leaking internals | Unexpected errors return a generic message and a request id. Details stay in the server log. The visitor's text is never logged. |
| Dev tools in production | The failure simulator is off unless the server is started with `--dev`. |
| Vulnerable dependencies | CI fails on a high-severity `npm audit` finding, and Dependabot proposes updates weekly. |
| Container breakout | The Docker image runs as a non-root user and contains production dependencies only. |

There are no accounts, cookies or database, so there is no session, password or personal data to protect, and cross-site request forgery does not apply.

## Production setup

One Node process serves both the API and the built React app, so the frontend and backend share an origin: no CORS configuration, one deployment, one URL.

| Concern | What is in place |
|---|---|
| Repeated requests | A recent identical request is answered from an in-memory cache (200 entries, one hour) in about a millisecond, with no AI call. Asking again for the set on screen skips the cache. |
| Traffic spikes | At most 8 model calls run at once across all visitors. Beyond that the server answers "busy" immediately instead of queueing requests until they time out. |
| Wasted quota | If a visitor cancels or leaves, the model call is aborted. |
| Speed | Responses are gzip compressed. Hashed assets are cached for a year; `index.html` is always revalidated so a new deploy shows up immediately. |
| Load balancers | Keep-alive is longer than a load balancer's idle timeout, which avoids random 502 errors. `TRUST_PROXY` tells the server how many proxies are in front so limits apply to the real visitor. |
| Deploys | The server handles `SIGTERM`: it stops accepting requests, lets running ones finish, then exits. `/api/health` is the health check. |
| Logs | One JSON line per generation with a request id, outcome and duration. The same id is in the `X-Request-Id` header and in error messages, so a user's report can be matched to a log line. |
| CI | GitHub Actions runs the tests, a dependency audit and the build on every push and pull request. |

The limits are settings, not code: `RATE_LIMIT_PER_MINUTE`, `RATE_LIMIT_PER_DAY`, `MAX_CONCURRENT_GENERATIONS` and `TRUST_PROXY` (see `.env.example`).

## Deploying

### Render (free, one click)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Ikbal-ullah/Try)

1. Click the button and sign in to Render with GitHub.
2. Render reads `render.yaml` and asks for one value: `LLM_API_KEY`. Paste your key.
3. Click **Apply**. The first build takes a few minutes; after that every push to `main` deploys automatically.

### AWS

Step-by-step instructions for running the Docker image on Amazon ECS Express Mode (Fargate behind a load balancer, with an HTTPS address) are in [docs/aws.md](docs/aws.md).

### Docker (any other host)

```bash
docker build -t study-assistant .
```

```bash
docker run -p 3001:3001 --env-file .env -e TRUST_PROXY=1 study-assistant
```

The image is a two-stage build: the first stage builds the React app, the second contains only production dependencies and runs as a non-root user.

## Time spent

> TODO before submitting: fill in your real hours, for example "about 7 hours: 1h setup and API, 2h validation, 2h UI, 1h failure handling, 1h README and recording".
