# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Eburon AI is a Next.js 16 chatbot application powered by the Vercel AI SDK. It supports streaming text responses, document artifacts (code sheets, text), live collaborative editing via Tiptap/Yjs, and multiple model providers through Vercel's AI Gateway.

## Key Commands

```bash
pnpm dev          # Start dev server with turbo
pnpm build        # Run DB migration + production build
pnpm start        # Start production server
pnpm check        # Lint & type-check (ultracite = biome + tailwind config)
pnpm fix          # Auto-fix lint issues
pnpm test         # Run Playwright E2E tests (sets PLAYWRIGHT=True env)
pnpm db:generate  # Generate Drizzle migration files
pnpm db:migrate   # Apply pending migrations
pnpm db:studio    # Open Drizzle Kit Studio
```

## Environment Variables (.env.example)

- `AUTH_SECRET` — NextAuth secret key
- `AI_GATEWAY_API_KEY` — Vercel AI Gateway API key (required for model access)
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob storage token (for file uploads)
- `POSTGRES_URL` — PostgreSQL database connection string
- `REDIS_URL` — Redis URL (enables resumable streaming; optional but recommended)

## Architecture Overview

### Entry Points & Routing

- `app/(chat)/api/chat/route.ts` — **Primary chat API**. Single POST endpoint that orchestrates the full chat flow: auth → rate limit → model inference with tools → stream response. Also exports `getStreamContext()` for resumable streams.
- `app/(auth)/auth.ts` — NextAuth v5 configuration with BotID bot detection middleware.

### AI Pipeline (core data flow)

```
chat/route.ts:streamText()
  ├── getLanguageModel(chatModel)    → resolves model via Vercel AI Gateway
  ├── systemPrompt({requestHints, supportsTools})  → identity + instructions
  ├── experimental_activeTools       → ["getWeather", "createDocument", ...]
  └── tools: { ... }                 → tool implementations by name
```

#### Models (`lib/ai/models.ts`)

- `allowedModelIds` — set of permitted model IDs
- `chatModels` — array of `{id, label, supportsReasoning}` config objects
- `DEFAULT_CHAT_MODEL` — fallback model
- `getCapabilities()` — fetches per-model endpoint info from Vercel AI Gateway (cached 24h); determines `tools` support and `reasoning` flag

#### Providers (`lib/ai/providers.ts`)

- `getLanguageModel(chatModel)` → returns the SDK model instance configured for the selected provider/model combo

### Tool System (`lib/ai/tools/`)

All tools use Vercel AI SDK's `tool()` function with Zod schemas. Pattern:

```ts
import { tool } from "ai";
import { z } from "zod";

export const myTool = tool({
  description: "...",           // guides the LLM on when to call this
  inputSchema: z.object({ query: z.string() }),
  execute: async (input) => ({ result: "..." }),
});
```

**Available tools:**

| Tool | File | Type | Description |
|------|------|------|-------------|
| `webSearch` | web-search.ts | Direct import | DuckDuckGo HTML scraping for real-time data |
| `getWeather` | get-weather.ts | Direct import | Open-Meteo geocoding + weather API |
| `createDocument` | create-document.ts | Factory `{session, dataStream, modelId}` | Create new document artifact |
| `editDocument` | edit-document.ts | Factory `{dataStream, session}` | Edit existing document content |
| `updateDocument` | update-document.ts | Factory `{session, dataStream, modelId}` | Replace entire document content |
| `requestSuggestions` | request-suggestions.ts | Factory `{session, dataStream, modelId}` | Enable live collaborative editing via Tiptap/Yjs |

**Adding a new tool:**
1. Create `lib/ai/tools/<name>.ts` with the `tool()` pattern above
2. Import in `app/(chat)/api/chat/route.ts` line ~23-28
3. Add to `experimental_activeTools` array (line ~204)
4. Add to `tools:` object (line ~219)

### System Prompt (`lib/ai/prompts.ts`)

- `systemPrompt({requestHints, supportsTools})` — builds the system message
- Conditionally appends `artifactsPrompt` when model supports tools (documents artifact creation/editing conventions)
- The prompt includes identity instructions and tool usage guidance

### Database (`lib/db/`)

- Drizzle ORM with PostgreSQL
- Schema in `lib/db/schema.ts`
- Queries in `lib/db/queries.ts` — functions like `saveChat`, `getMessagesByChatId`, `saveMessages`
- Migration: `lib/db/migrate.ts` (runs during build)

### Error Handling (`lib/errors.ts`)

Centralized `ChatbotError` class with typed error codes mapped to HTTP responses. Use this for all API errors rather than raw `Response.json()`.

## Key Patterns & Conventions

- **Tool gating**: Tools are only active when the model's capabilities (fetched from AI Gateway) indicate `tools: true`. Reasoning-only models get an empty tool list.
- **Stream context**: Resumable streams require Redis; fall back gracefully when `REDIS_URL` is unset.
- **Rate limiting**: IP-based rate limit applied before auth in the chat route. User-type entitlements (`lib/ai/entitlements.ts`) gate per-user limits.
- **Artifact types**: Code, image, sheet, and text artifacts rendered as separate UI components under `components/ui/artifact/`.

## Testing

E2E tests use Playwright with pages split across `tests/pages/` (chat, sidebar, settings) and prompts in `tests/prompts/`. Run with `pnpm test`.
