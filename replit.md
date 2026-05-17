# LettiB

LettiB is a multi-AI workspace SaaS for AI power users to run prompts across multiple models, compare responses, and generate synthesized answers.

## Run & Operate

```bash
pnpm --filter @workspace/lettib run dev        # Start dev server
pnpm --filter @workspace/lettib run build      # Production build
pnpm --filter @workspace/lettib run typecheck  # TypeScript check
pnpm --filter @workspace/lettib run lint       # ESLint
```

**Required Environment Variables:**
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VAULT_ENCRYPTION_KEY`, `ALLOWED_ADMIN_EMAILS`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `STANDUP_EMAIL_TO`

## Stack

**Framework:** Next.js 14.2.29 (App Router)
**Language:** TypeScript (strict mode)
**Styling:** Tailwind CSS 3 + shadcn/ui
**Auth & DB:** Supabase (`@supabase/ssr`)
**ORM:** _Populate as you build_
**Validation:** _Populate as you build_
**Build Tool:** Next.js

## Where things live

- **Main Application:** `artifacts/lettib/`
  - **Marketing:** `app/(marketing)/` (public landing, layout w/ nav+footer, `_components/pricing-grid.tsx` shared between `/` and `/pricing`, `/privacy`, `/terms`)
  - **Authentication:** `app/(auth)/login/`, `app/(auth)/signup/`
  - **Dashboard:** `app/(app)/dashboard/`
  - **Projects:** `app/(app)/projects/[id]/` (detail page), `actions.ts` (project CRUD)
  - **Chat:** `app/(app)/chat/` (single-model chat), `app/(app)/chat/[id]/` (read-only viewer)
  - **Compare:** `app/(app)/compare/` (UI), `api/compare/route.ts` (SSE multiplex), `api/compare/save/route.ts` (persistence only — no scoring), `api/compare/score/route.ts` (on-demand grading)
  - **Synthesis:** `app/(app)/synthesis/[id]/` (viewer w/ thumbs rating + feedback), `api/synthesis/route.ts` (generation), `api/syntheses?project_id=` (per-project list, ownership-checked), `api/syntheses/[id]/rate` (POST rating 1-5 + optional feedback), `app/(app)/projects/[id]/syntheses/` (full list page w/ search)
  - **Teams:** `app/(app)/teams/` (CRUD), `actions.ts` (team CRUD)
  - **Settings:** `app/(app)/settings/` (user settings), `actions.ts` (API key management)
  - **Usage (user):** `app/(app)/usage/` (per-user dashboard — totals, by-provider, 30d daily, by-action, top-5 models), `api/usage/summary/route.ts` (JSON summary, RLS-scoped), `lib/usage/queries.ts` (`getUserUsageSummary`, `getUserUsageSnapshot`)
  - **Admin:** `app/admin/` (dashboard, users, usage)
  - **Search:** `app/(app)/search/` (UI), `api/search/route.ts` (backend)
  - **Shareable Syntheses:** `share/[token]/page.tsx` (public viewer), `api/syntheses/[id]/share/route.ts` (share API)
- **Supabase Clients:** `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/service.ts`
- **AI Providers/Models:** `lib/providers/models.ts` (catalog), `lib/providers/*.ts` (factory functions)
- **Prompts:** `lib/prompts/synthesis.ts`, `lib/prompts/scoring.ts`, `lib/prompts/memory.ts`
- **DB Schema:** `supabase/migrations/001_projects.sql` (core schema), `013_syntheses_rating.sql` (synthesis score + user_feedback)
- **API Contracts:** _Populate as you build_
- **Theme Files:** `components/ui/` (shadcn/ui primitives)

## Architecture decisions

- **Compare Workspace v2 (Session 11):** Each model's follow-ups are isolated — peers' answers are NEVER injected into another model's prompt. `model_responses.round_kind` distinguishes `main` rounds (multi-model, fired from the workspace's main follow-up box, filtered to models with "Continue in next round" on) from `branch` rounds (single-model, fired from a card's "Ask this model"). Synthesis is opt-in per response via "Use in Synthesis" and is sent as `source_response_ids` to `/api/synthesis`. Grading is opt-in per response via "Grade answer" or batch via "Grade selected responses", routed through `/api/compare/score`. No more auto-scoring on save.
- **Compare Workspace v2 — Independent lanes (Session 12):** Failed/timed-out models no longer block successful lanes. `/api/compare` now (1) pre-inserts a placeholder `model_responses` row per lane BEFORE opening the SSE stream so positions are reserved at the DB level (no follow-up/round-2 position collisions even if a stragger writes its content after the user has moved on), and (2) emits a per-lane `saved` event carrying `response_id` the moment each row is updated. The client uses those ids to unlock Synthesis / Grade / Ask-this-model per lane (no longer gated on `phase === "done"`). On lane error the client auto-sets `continueByModelKey[mk] = false` and `useInSynthesisByKey[key] = false`. A "Stop waiting on slow models" button aborts the in-flight fetch and marks pending/streaming lanes as cancelled so the user can immediately proceed without waiting for the 300s per-member timeout. "Continue in Chat" is hidden until the handoff is fixed; users stay inside Compare and use "Ask this model" for per-lane follow-ups.
- **App Router with route groups:** Uses `(auth)`, `(app)`, `(marketing)` for logical separation and layout management.
- **Supabase Vault for API keys:** Stores sensitive API keys encrypted using Supabase Vault via a service-role client, with only the last four characters exposed to the browser.
- **Service-role client for RLS bypass:** `api_connections` and `ai_teams` queries use `serviceClient` with explicit `user_id` filtering to manage RLS.
- **Shareable synthesis links:** Public links use a unique `share_token` and `is_public` flag, with column-level RLS on a whitelist for unauthenticated access; `share_token` is excluded from anon role SELECT.
- **Global Search:** `/api/search` uses Supabase RPC `search_user_content` under user auth context (RLS-scoped), with results normalized and displayed in a dedicated page and command palette.
- **Project Memory:** Structured memory (6 fields) stored in `project_memory` table, with `lib/memory/fields.ts` as the source of truth for field definitions. Auto-saves on blur and can auto-extract from synthesis.
- **Usage dashboards:** Two separate surfaces. The user-facing `/usage` page and dashboard right-rail snapshot use the **user-context** Supabase client with explicit `user_id` filter (defence in depth — RLS would also enforce). The admin `/admin/usage` uses the **service-role** client. Both aggregate in JS over capped row pulls (100k rows for per-user; acceptable v1 trade-off).

## Product

- Multi-AI workspace for running prompts across various models simultaneously.
- Side-by-side comparison of AI responses.
- Generation of "LettiB Synthesis" answers into project folders.
- User-provided API key management for multiple AI providers (OpenAI, Anthropic, Google, XAI, custom).
- Conversation history tracking with cost aggregation.
- Project-specific memory for goals, decisions, preferences, and facts.
- Admin dashboard for user and usage overview.
- Shareable synthesis results via public links.

## User preferences

- GitHub repo: `bacon-tarion/lettib` — push via Replit Connectors Contents API (requires `Accept: application/vnd.github+json` header, one file per PUT call, sequential not parallel to avoid SHA conflicts)
- Migrations run manually in Supabase SQL Editor — do not auto-run

## Gotchas

- Push GitHub files sequentially (not parallel) — concurrent PUTs to same repo cause 409 SHA conflicts.
- `ai_teams` and `ai_team_members` tables must exist in Supabase with RLS before Teams feature works.
- `generateStarterTeams` only creates teams where 2+ members have connected providers.
- Compare via workspace proxy (`localhost:80`) may return 502 on first cold compile due to proxy timeout. Use `localhost:$PORT` directly for testing.
- Migration 008 must run before Compare works — needs `model_responses`, `syntheses`, and `conversations.mode` column.
- Migration 028 must run before Compare Workspace v2 works — adds `model_responses.round_kind`. Without it, "Ask this model" inserts will fail with an unknown-column error.

## Pointers

- **Next.js Documentation:** [https://nextjs.org/docs](https://nextjs.org/docs)
- **Supabase Documentation:** [https://supabase.com/docs](https://supabase.com/docs)
- **Vercel AI SDK:** [https://sdk.vercel.ai/](https://sdk.vercel.ai/)
- **Tailwind CSS:** [https://tailwindcss.com/docs](https://tailwindcss.com/docs)
- **shadcn/ui:** [https://ui.shadcn.com/docs](https://ui.shadcn.com/docs)