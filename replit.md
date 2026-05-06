# LettiB — Project Reference

## What Is This?

LettiB is a multi-AI workspace SaaS for AI power users. Users bring their own API keys, run prompts across multiple models simultaneously, compare responses side-by-side, and generate a merged "LettiB Synthesis" answer saved into project folders.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14.2.29 (App Router) |
| Language | TypeScript (strict mode) |
| Styling | Tailwind CSS 3 + shadcn/ui (neutral base) |
| Auth & DB | Supabase (`@supabase/ssr`) |
| Key Storage | Supabase Vault (encrypted at rest) |
| AI SDK | Vercel AI SDK (`ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/xai`) |
| Streaming | `streamText` → `toDataStreamResponse()` + `useChat` (chat) · custom SSE multiplex (compare) |
| Deployment Target | Vercel |

## Repository Structure

```
artifacts/
  lettib/                         # @workspace/lettib — main Next.js app
    app/
      (auth)/login/               # Login page
      (auth)/signup/              # Sign-up page
      (app)/dashboard/            # Protected dashboard
      (app)/projects/             # Project list + [id] detail
        actions.ts                # createProject, updateProject, deleteProject, togglePin, toggleMemory
        [id]/page.tsx             # Client component — tabs: Chats, Syntheses, Memory, Notes, Settings
      (app)/chat/                 # Single-model chat
      (app)/compare/              # Side-by-side model comparison (server wrapper + CompareUI)
      (app)/synthesis/[id]/       # Synthesis viewer
      api/compare/route.ts        # SSE-multiplexed parallel streaming across team members
      api/compare/save/route.ts   # Persist responses + LLM scoring pass
      api/synthesis/route.ts      # Generate LettiB Synthesis from saved compare session
      api/conversations/route.ts                # GET list (project_id, limit query params)
      api/conversations/[id]/route.ts           # GET full thread · PATCH (project_id|title) · DELETE (soft)
      api/memory/[projectId]/route.ts           # GET project memory · PATCH per-field upsert
      (app)/chat/[id]/page.tsx                  # Read-only conversation viewer (chat thread + compare side-by-side)
      (app)/projects/[id]/chats/page.tsx        # All conversations for a project (search + mode filter)
      (app)/projects/[id]/memory/page.tsx       # Dedicated memory editor (auto-save on blur)
      (app)/projects/[id]/actions.ts            # updateMemoryField + toggleProjectMemory server actions
      (app)/teams/                # AI Teams CRUD (server component, force-dynamic)
        actions.ts                # createTeam, updateTeam, deleteTeam, listTeams, generateStarterTeams
        page.tsx                  # Auto-generates starter teams when 2+ providers + 0 teams
      (app)/settings/             # User settings (server component)
        actions.ts                # addApiKey, testApiKey, deleteApiKey, listApiKeys
        page.tsx                  # Async server component — fetches connections + user
        settings-content.tsx      # Client tabs component
      (app)/usage/                # Token usage & cost
      (app)/admin/                # Admin panel
      (marketing)/                # Landing page + pricing/privacy/terms/roadmap
    components/
      ui/                         # shadcn/ui primitives
      layout/                     # Sidebar, Header, BottomNav
      settings/                   # api-key-tile.tsx, add-key-dialog.tsx
      teams/                      # team-card.tsx, team-dialog.tsx, teams-grid.tsx
      chat/                       # MessageBubble + chat-ui.tsx (useChat hook)
      compare/                    # response-card.tsx (streaming + scores) + compare-ui.tsx
      projects/                   # ProjectCard
      usage/                      # UsageWidget
    lib/
      supabase/client.ts          # Browser Supabase client
      supabase/server.ts          # Server Supabase client (async cookies)
      supabase/service.ts         # Service-role client (vault ops only — server-side)
      supabase/middleware.ts      # Session refresh + auth guard
      providers/models.ts         # MODELS_CATALOG + getProviderLabel + getModelById + getModelDisplayName + getProviderForModel
      providers/openai|anthropic|google|xai.ts  # Provider factory functions
      prompts/synthesis.ts        # SYNTHESIS_PROMPT + MEMORY_INJECTION_PROMPT
      prompts/scoring.ts          # SCORING_PROMPT + buildScoringMessage
      conversations/queries.ts    # listConversationsForUser — counts + cost aggregation
      memory/fields.ts            # MEMORY_FIELDS catalog + MemoryRow type + isMemoryFieldKey
      memory/queries.ts           # loadProjectMemory + upsertMemoryFields (ownership-checked)
      prompts/memory.ts           # MEMORY_INJECTION_PROMPT (re-export) + MEMORY_EXTRACTION_PROMPT
    supabase/migrations/
      001_projects.sql            # Core schema
      002_handle_new_user.sql     # New-user trigger
      003_autoconfirm_email.sql   # Auto-confirm for dev
      004_enable_vault.sql        # Enable supabase_vault extension ← run manually
      005_add_custom_provider.sql # Add 'custom' provider + columns ← run manually
      006_grant_service_role.sql  # GRANT service_role on api_connections ← run manually
      007_api_connections_rls.sql # RLS policies for api_connections ← run manually
      008_compare_tables.sql      # model_responses + syntheses tables, conversations.mode ← run manually
      009_conversations_soft_delete.sql  # conversations.deleted_at + partial indexes ← run manually
      010_project_memory.sql      # project_memory table + RLS + auto-bump updated_at trigger ← run manually
```

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=      ← required for Vault + Teams operations
VAULT_ENCRYPTION_KEY=
ALLOWED_ADMIN_EMAILS=
ANTHROPIC_API_KEY=
RESEND_API_KEY=
STANDUP_EMAIL_TO=
```

## Models Catalog

Defined in `lib/providers/models.ts`. Providers: `openai`, `anthropic`, `google`, `xai`, `custom`.
Helpers: `getModelById(provider, modelId)`, `getModelDisplayName(provider, modelId)`, `getProviderForModel(modelId)`.

## Key Architecture Decisions

- **App Router with route groups**: `(auth)`, `(app)`, `(marketing)` — no layout nesting conflicts
- **Supabase SSR cookies pattern**: `@supabase/ssr` `createServerClient` in server components + middleware
- **Vault key storage**: API keys written to `vault.secrets` via service-role client; only `key_last_four` ever reaches the browser
- **Service-role client pattern**: ALL `api_connections` and `ai_teams` queries use `serviceClient` (bypasses RLS) with explicit `user_id` filter — avoids RLS SELECT policy issues
- **Teams soft delete**: `ai_teams.deleted_at` — never hard-delete; `listTeams` filters `IS NULL`
- **Teams auto-generation**: `/teams` server component calls `generateStarterTeams()` on first load when 2+ providers connected and 0 teams exist
- **Middleware auth guard**: protects `/dashboard /projects /chat /compare /synthesis /teams /settings /usage /admin`
- **5 providers**: openai, anthropic, google, xai, custom (any OpenAI-compatible endpoint)
- **Compare SSE multiplex**: `/api/compare` runs all team members in parallel via `Promise.all`, emits a single `text/event-stream` with `{type, key, ...}` envelopes (`start` / `chunk` / `done` / `error` / `all_done`); client parses by `\n\n` and routes by `key` to per-card state
- **Compare scoring**: `/api/compare/save` reuses the first successful response's provider+model as the scorer (uses keys already paid for); scoring is best-effort — if it fails, conversation + responses still persist
- **Synthesis**: `/api/synthesis` reads saved `model_responses`, generates via SYNTHESIS_PROMPT using first successful response's provider, writes to `syntheses` table, redirects to `/synthesis/[id]`
- **Conversation history**: `lib/conversations/queries.ts#listConversationsForUser` aggregates message_count + cost_usd from both `messages` (chat mode) and `model_responses` (compare mode); shared by dashboard recent-activity, `/projects/[id]/chats`, and `/api/conversations`. Soft delete via `conversations.deleted_at IS NULL` filter on every read path
- **Conversation mutations**: `/api/conversations/[id]` PATCH validates destination project ownership before reassigning project_id; DELETE is soft (sets deleted_at). All routes use service-role client + explicit user_id ownership check
- **Project Memory**: 6-field column schema (project_goal, important_decisions, user_preferences, key_facts, open_questions, next_steps) on `project_memory`, primary key = project_id. `lib/memory/fields.ts` is the single source of truth for field labels/keys; `isMemoryFieldKey()` allowlist gates every PATCH to prevent column-name injection. UI auto-saves per-field on blur via `/api/memory/[projectId]` PATCH. Memory toggle uses new `toggleProjectMemory` server action in `app/(app)/projects/[id]/actions.ts` (separate from project CRUD actions in `app/(app)/projects/actions.ts`)
- **Memory auto-extraction**: After `/api/synthesis` saves a synthesis, if the project has `memory_enabled=true`, runs MEMORY_EXTRACTION_PROMPT through the same model/key used for synthesis. Returns strict JSON of changed fields only — best-effort, never fails the synthesis. JSON parsing strips markdown fences and falls back to the outermost `{...}` substring if the model wraps the object in prose. Append semantics for `important_decisions`/`key_facts` are enforced by prompt instruction, NOT server-side merge — if the model omits prior content, history is lost (acceptable v1 risk; future: server-side append). Memory form auto-save uses a per-field monotonic write counter to prevent out-of-order PATCH responses from overwriting newer content. Logged to `usage_logs` with `action='memory_extraction'`
- **Vercel deployment**: Node.js server mode, no static export

## Development Commands

```bash
pnpm --filter @workspace/lettib run dev        # Start dev server
pnpm --filter @workspace/lettib run build      # Production build
pnpm --filter @workspace/lettib run typecheck  # TypeScript check
pnpm --filter @workspace/lettib run lint       # ESLint
```

## Build Status

✅ `pnpm build` passes — 25 routes, zero errors, zero warnings.

## User Preferences

- GitHub repo: `bacon-tarion/lettib` — push via Replit Connectors Contents API (requires `Accept: application/vnd.github+json` header, one file per PUT call, sequential not parallel to avoid SHA conflicts)
- Migrations run manually in Supabase SQL Editor — do not auto-run

## Gotchas

- Push GitHub files sequentially (not parallel) — concurrent PUTs to same repo cause 409 SHA conflicts
- `ai_teams` and `ai_team_members` tables must exist in Supabase with RLS before Teams feature works
- `generateStarterTeams` only creates teams where 2+ members have connected providers (skips teams with < 2 eligible models)
- Compare via workspace proxy (`localhost:80`) may return 502 on first cold compile — proxy timeout is shorter than Next dev compile time. Hit `localhost:$PORT` directly when smoke-testing
- Migration 008 must run before Compare works — needs `model_responses`, `syntheses`, and `conversations.mode` column
