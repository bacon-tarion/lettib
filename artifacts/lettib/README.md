# LettiB

Multi-AI workspace for AI power users.

## About

LettiB lets you bring your own API keys, compare responses from multiple AI models side-by-side, and generate a merged "LettiB Synthesis" answer saved into project folders.

## Tech Stack

- **Framework**: Next.js 14 App Router
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS + shadcn/ui
- **Auth & Database**: Supabase
- **AI Providers**: Vercel AI SDK (OpenAI, Anthropic, Google, xAI)
- **Deployment**: Vercel

## Local Setup

```bash
# 1. Clone the repository
git clone <repo-url>
cd lettib

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env.local
# Fill in your values in .env.local

# 4. Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## Documentation

See [docs](#) for full documentation.
