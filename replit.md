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
| AI SDK | Vercel AI SDK (`ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`) |
| xAI | OpenAI-compat via `@ai-sdk/openai` with custom base URL |
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
      (app)/chat/                 # Single-model chat
      (app)/compare/              # Side-by-side model comparison
      (app)/synthesis/[id]/       # Synthesis viewer
      (app)/teams/                # Teams management
      (app)/settings/             # User settings
      (app)/usage/                # Token usage & cost
      (app)/admin/                # Admin panel
      (marketing)/                # Landing page
      (marketing)/pricing/        # Pricing
      (marketing)/privacy/        # Privacy policy
      (marketing)/terms/          # Terms of service
      (marketing)/roadmap/        # Roadmap
      api/chat/                   # POST /api/chat
      api/compare/                # POST /api/compare
      api/synthesis/              # POST /api/synthesis
      api/keys/                   # GET /api/keys
    components/
      ui/                         # shadcn/ui primitives (button, card, badge, input, …)
      layout/                     # Sidebar, Header, BottomNav
      chat/                       # MessageBubble
      compare/                    # ResponseCard
      projects/                   # ProjectCard
      usage/                      # UsageWidget
    lib/
      supabase/client.ts          # Browser Supabase client
      supabase/server.ts          # Server Supabase client (async cookies)
      supabase/middleware.ts      # Session refresh + auth guard
      providers/models.ts         # MODELS_CATALOG + DEFAULT_TEAM_MODELS
      providers/openai.ts         # createOpenAIClient helper
      providers/anthropic.ts      # createAnthropicClient helper
      providers/google.ts         # createGoogleClient helper
      providers/xai.ts            # createXAIClient helper (xAI via OpenAI compat)
      prompts/synthesis.ts        # SYNTHESIS_PROMPT + MEMORY_INJECTION_PROMPT
      utils.ts                    # cn() utility
    middleware.ts                 # Next.js middleware (auth guards)
    next.config.mjs               # Next.js config
    tailwind.config.ts            # Tailwind config (shadcn CSS vars)
    postcss.config.mjs            # PostCSS config
    .env.example                  # Environment variable template
    supabase/migrations/          # SQL migration files (empty, ready for schema)
    tests/                        # Playwright tests (placeholder)
    .github/workflows/ci.yml      # GitHub Actions CI
```

## Environment Variables

All 8 required vars are defined in `.env.example`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
VAULT_ENCRYPTION_KEY=
ALLOWED_ADMIN_EMAILS=
ANTHROPIC_API_KEY=
RESEND_API_KEY=
STANDUP_EMAIL_TO=
```

Copy to `.env.local` and fill in values before developing.

## Models Catalog

Defined in `lib/providers/models.ts` as `MODELS_CATALOG`. Providers:
- **openai**: gpt-5.5, gpt-5.4, gpt-5.4-mini, gpt-5.4-nano, gpt-5.1
- **anthropic**: claude-opus-4-7, claude-sonnet-4-6, claude-haiku-4-5
- **google**: gemini-3.1-pro, gemini-3-flash, gemini-2.5-pro, gemini-2.5-flash
- **xai**: grok-4.1, grok-4

## Key Architecture Decisions

- **App Router with route groups**: `(auth)`, `(app)`, `(marketing)` — no layout nesting conflicts
- **Supabase SSR cookies pattern**: uses `@supabase/ssr` `createServerClient` in both server components and middleware
- **Middleware auth guard**: protects `/dashboard /projects /chat /compare /synthesis /teams /settings /usage /admin`; redirects logged-in users away from `/login` and `/signup`
- **AI providers**: each provider has a factory function in `lib/providers/`; user API keys will be retrieved from Supabase Vault at runtime
- **Prompts**: `SYNTHESIS_PROMPT` and `MEMORY_INJECTION_PROMPT` use `{{placeholder}}` template syntax
- **Vercel deployment**: `next.config.mjs` is standard; no `next export` — Node.js server mode

## Development Commands

```bash
# From workspace root
pnpm --filter @workspace/lettib run dev        # Start dev server
pnpm --filter @workspace/lettib run build      # Production build
pnpm --filter @workspace/lettib run typecheck  # TypeScript check
pnpm --filter @workspace/lettib run lint       # ESLint
```

## Build Status

✅ `pnpm build` passes — 22 routes, zero errors, zero warnings.
