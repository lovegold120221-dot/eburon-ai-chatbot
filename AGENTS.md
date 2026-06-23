# AGENTS.md — Eburon AI Chatbot

## Environment & Setup

- **Package manager**: `pnpm` only. Never use npm/yarn. Install with `pnpm install`.
- **Dev server**: `pnpm dev` (Next.js App Router, Turbopack enabled via `--turbo`).
- **Build**: `pnpm build` — runs drift migration first (`lib/db/migrate.ts`) then Next.js. The migration step is baked into the script; do not run it separately unless you need migration-only behavior.
- **Production start**: `pnpm start`.

### Required `.env.local` variables

All five are mandatory for local development:

| Variable | Purpose | How to get |
|---|---|---|
| `AUTH_SECRET` | Auth.js encryption key (32+ bytes random) | `openssl rand -base64 32` or https://generate-secret.vercel.app/32 |
| `AI_GATEWAY_API_KEY` | Vercel AI Gateway key for non-Vercel deployments | Vercel dashboard → Settings → API Keys |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob access token | Vercel Dashboard → Storage → Blob |
| `POSTGRES_URL` | Neon serverless Postgres connection string | Vercel Marketplace → Neon or direct Neon dashboard |
| `REDIS_URL` | Upstash/Vercel Redis URL for rate limiting & caching | Vercel Marketplace → Redis |

> In Vercel deployments, `AUTH_SECRET` and `AI_GATEWAY_API_KEY` are supplied automatically via OIDC — no manual setup needed.

## Commands You Would Otherwise Guess Wrong

| Goal | Command |
|---|---|
| Lint & type-check | `pnpm check` (runs Ultracite/Biome) |
| Auto-fix formatting/linting | `pnpm fix` |
| Run Playwright E2E tests | `pnpm test` (sets `PLAYWRIGHT=True`, starts dev server automatically via webServer config, hits `/ping`) |
| Generate Drizzle migration | `pnpm db:generate` |
| Apply migrations manually | `pnpm db:migrate` or `npx tsx lib/db/migrate.ts` |
| Database CLI (interactive) | `pnpm db:studio` (Drizzle Kit Studio on http://localhost:5432) |
| Push schema → DB without migration files | `pnpm db:push` |
| Pull live DB schema into code | `pnpm db:pull` |

### Test details

- Tests live in `tests/`. The Playwright config (`playwright.config.ts`) auto-starts the dev server and points at port 3000 (or `$PORT`). Expect timeout is **240 seconds** per test.
- Running tests requires a running local backend with all five env vars populated — there is no mock/test mode for the API layer.

## Architecture

```
app/
├── (chat)/              # Chat UI route group. Entry points: page.tsx, layout.tsx
│   ├── api/chat/route.ts          # POST chat completion (non-streaming)
│   ├── api/chat/[id]/stream/route.ts  # Streaming endpoint per conversation
│   ├── api/chat/[id]/route.ts     # PATCH chat metadata
│   ├── api/document/route.ts      # Document CRUD (collaborative docs feature)
│   ├── api/files/upload/route.ts  # Vercel Blob uploads
│   ├── api/history/               # Chat history API
│   └── api/suggestions/vote       # Upvote/downvote system prompts
lib/
├── ai/
│   ├── models.ts            # Provider routing (Mistral, Moonshot, DeepSeek, OpenAI, xAI via AI Gateway)
│   ├── providers.ts         # Per-model provider configuration
│   ├── tools/               # LLM tool definitions: create-document, edit-document, update-document, request-suggestions, get-weather
│   └── prompts.ts           # System/default prompt templates
├── db/
│   ├── schema.ts            # Drizzle ORM tables: User, Chat, Message_v2, Vote_v2, Document, Suggestion, Stream
│   ├── migrations/#         # SQL migration files
│   ├── migrate.ts           # One-shot migration runner (imported by `pnpm build`)
│   └── queries.ts           # CRUD function wrappers for DB tables
├── editor/config.ts          # ProseMirror editor configuration
├── ratelimit.ts              # Rate limiting logic (Redis-backed)
└── artifacts/server.ts       # Artifact generation server code
```

**Data model**: Each user has `User` rows. Conversations are `Chat` records with many `Message_v2` entries (`parts` and `attachments` stored as JSON). Messages can be upvoted via the `Vote_v2` composite key table. Documents support collaborative editing with a `Suggestion` row-per-change (with `isResolved`).

**File uploads**: Use Vercel Blob API through `app/(chat)/api/files/upload/route.ts`. The BLOB_READ_WRITE_TOKEN env var is required — no local upload simulation.

## Toolchain & Conventions

- **Formatting/linting**: Ultracite (`ultracite/biome/core`, `ultracite/biome/next`, `ultracite/biome/react`) via Biome. Config in `biome.jsonc`. Several rules are relaxed from defaults (noConsole, noExplicitAny, useImageSize, etc.) — **do not re-add them** without explicit approval.
- `lib/utils.ts` and several UI component files are explicitly excluded from formatting/linting by the Ultracite config (`files.includes`). They auto-formatted to a different style during the template scaffolding; leave those files alone unless touching their active content.
- **TypeScript**: Strict mode + `strictNullChecks`. Path alias: `@/*` maps to project root (e.g., `@/lib/db/schema.ts`). Use `npm exec tsx` or global tsx for running TS scripts — never compile TypeScript as a pre-build step in dev.
- **Styling**: Tailwind CSS 4 + shadcn/ui primitives from Radix UI. Component registry config via `components.json`.

## AI/Gateway Routing

Models are defined in `lib/ai/models.ts` and routed per-model to different providers through the Vercel AI Gateway. The gateway handles auth automatically on Vercel. On non-Vercel environments, you MUST set `AI_GATEWAY_API_KEY` — without it, all model calls will fail with 401 even if the underlying provider key is correct.

To add a new model: configure in `lib/ai/models.ts`, ensure the relevant environment variable exists (e.g., `OPENAI_API_KEY`), and verify via `/api/models` route. Do not bypass the gateway for production traffic.

## Pitfalls & Gotchas

1. **Drizzle migrations**: Schema changes go through `pnpm db:generate` → auto-generated SQL in `migrations/`. Never edit migration SQL by hand; use Drizzle Kit to regenerate if you forgot a schema field.
2. **"Build" runs migrations automatically** via the build script — skipping it during deploy will leave the DB schema out of date with the codebase.
3. **`lib/ai/models.mock.ts`** exists for test stubbing and is NOT used in production. Do not edit this file to "fix" model issues; it's a snapshot copy. Use `models.ts`.
4. **Chat API uses AI SDK v6 streaming**. The main chat endpoint (`app/(chat)/api/chat/route.ts`) expects messages with `parts` arrays (not the legacy single-text format). New message creation must conform to this schema.
5. **Next.js App Router segments**: `(chat)` is a route group — it does not affect URL paths but provides layout sharing and segment-level error boundaries. The root `/` page serves both login and chat views depending on auth state.
