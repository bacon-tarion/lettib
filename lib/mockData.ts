export const mockUser = {
  id: 'user-1',
  email: 'rich@lettib.app',
  display_name: 'Rich',
};

export const mockProjects = [
  {
    id: 'proj-1',
    name: 'Inbox',
    description: 'Default project for standalone chats',
    is_inbox: true,
    memory_enabled: true,
    pinned: true,
    default_ai_team: 'Research Team',
    chat_count: 8,
    synthesis_count: 3,
    updated_at: '2026-05-05T10:00:00Z',
  },
  {
    id: 'proj-2',
    name: 'LettiB Build',
    description: 'Building the LettiB app itself',
    is_inbox: false,
    memory_enabled: true,
    pinned: true,
    default_ai_team: 'Coding Team',
    chat_count: 12,
    synthesis_count: 4,
    updated_at: '2026-05-04T18:00:00Z',
  },
  {
    id: 'proj-3',
    name: 'Market Research',
    description: 'Competitor analysis and pricing research',
    is_inbox: false,
    memory_enabled: false,
    pinned: false,
    default_ai_team: 'Research Team',
    chat_count: 6,
    synthesis_count: 2,
    updated_at: '2026-05-03T12:00:00Z',
  },
  {
    id: 'proj-4',
    name: 'Content Strategy',
    description: 'Blog posts, landing copy, social media',
    is_inbox: false,
    memory_enabled: true,
    pinned: false,
    default_ai_team: 'Brainstorm Team',
    chat_count: 5,
    synthesis_count: 1,
    updated_at: '2026-05-02T09:00:00Z',
  },
];

export const mockTeams = [
  {
    id: 'team-1',
    name: 'Research Team',
    providers: ['openai', 'anthropic', 'google'],
    models: ['gpt-5.4', 'claude-opus-4-7', 'gemini-3.1-pro'],
    primary_model: 'claude-opus-4-7',
    default_tone: 'professional',
  },
  {
    id: 'team-2',
    name: 'Coding Team',
    providers: ['anthropic', 'openai'],
    models: ['claude-sonnet-4-6', 'gpt-5.4'],
    primary_model: 'claude-sonnet-4-6',
    default_tone: 'technical',
  },
  {
    id: 'team-3',
    name: 'Brainstorm Team',
    providers: ['anthropic', 'openai', 'xai'],
    models: ['claude-opus-4-7', 'gpt-5.4', 'grok-4.1'],
    primary_model: 'gpt-5.4',
    default_tone: 'friendly',
  },
];

export const mockMessages = [
  { id: 'msg-1', role: 'user', content: 'What is the best stack for a solo SaaS founder in 2026?', provider: null, model: null, cost_usd: 0, created_at: '2026-05-05T09:00:00Z' },
  { id: 'msg-2', role: 'assistant', content: 'For a solo SaaS founder in 2026, TypeScript with Next.js is the strongest default choice. The ecosystem is mature, AI coding tools work best with it, and the Next.js + Supabase + Vercel stack lets you ship fast without DevOps overhead.', provider: 'anthropic', model: 'claude-opus-4-7', cost_usd: 0.0034, created_at: '2026-05-05T09:00:05Z' },
  { id: 'msg-3', role: 'user', content: 'What about Python with FastAPI?', provider: null, model: null, cost_usd: 0, created_at: '2026-05-05T09:01:00Z' },
  { id: 'msg-4', role: 'assistant', content: 'Python with FastAPI is a solid alternative, especially if your product has significant AI/ML components. The tradeoff is that you lose full-stack unification — you will need a separate frontend. For pure SaaS without ML, TypeScript wins on productivity.', provider: 'anthropic', model: 'claude-opus-4-7', cost_usd: 0.0028, created_at: '2026-05-05T09:01:06Z' },
];

export const mockSyntheses = [
  {
    id: 'synth-1',
    question: 'What is the best stack for a solo SaaS founder in 2026?',
    content: 'TypeScript with Next.js is the strongest default choice for solo SaaS founders in 2026. All three models converge on this recommendation. The Next.js + Supabase + Vercel stack provides full-stack unification, the largest ecosystem, and the best AI coding tool support. Python with FastAPI is the right alternative only if AI/ML is core to the product.',
    models_used: ['gpt-5.4', 'claude-opus-4-7', 'gemini-3.1-pro'],
    tone: 'professional',
    user_rating: 5,
    project_id: 'proj-2',
    created_at: '2026-05-05T09:05:00Z',
  },
  {
    id: 'synth-2',
    question: 'How should I price a B2B SaaS product targeting small teams?',
    content: 'For B2B SaaS targeting small teams, per-seat pricing between $15-25 per user per month is the market standard. The models agree that a free tier with a hard feature limit converts better than a time-limited trial. Annual pricing with a 20% discount reduces churn significantly.',
    models_used: ['gpt-5.4', 'claude-opus-4-7'],
    tone: 'professional',
    user_rating: 4,
    project_id: 'proj-1',
    created_at: '2026-05-04T14:00:00Z',
  },
];

export const mockActivity = [
  { id: 'act-1', type: 'synthesis', title: 'Best stack for solo SaaS', project: 'LettiB Build', models: ['gpt-5.4', 'claude-opus-4-7', 'gemini-3.1-pro'], updated_at: '2026-05-05T09:05:00Z' },
  { id: 'act-2', type: 'chat', title: 'TypeScript vs Python for SaaS', project: 'LettiB Build', models: ['claude-opus-4-7'], updated_at: '2026-05-05T09:00:00Z' },
  { id: 'act-3', type: 'compare', title: 'Pricing strategies for B2B SaaS', project: 'Inbox', models: ['gpt-5.4', 'claude-opus-4-7'], updated_at: '2026-05-04T14:00:00Z' },
  { id: 'act-4', type: 'chat', title: 'Next.js server vs client components', project: 'LettiB Build', models: ['claude-sonnet-4-6'], updated_at: '2026-05-04T11:00:00Z' },
  { id: 'act-5', type: 'synthesis', title: 'B2B SaaS pricing strategies', project: 'Inbox', models: ['gpt-5.4', 'claude-opus-4-7'], updated_at: '2026-05-04T14:05:00Z' },
];

export const mockUsage = {
  today_usd: 0.34,
  month_usd: 8.21,
  month_last_usd: 6.44,
  by_provider: [
    { provider: 'anthropic', label: 'Claude', month_usd: 4.10, color: '#D97706' },
    { provider: 'openai', label: 'OpenAI', month_usd: 2.80, color: '#2563EB' },
    { provider: 'google', label: 'Gemini', month_usd: 0.95, color: '#16A34A' },
    { provider: 'xai', label: 'Grok', month_usd: 0.36, color: '#7C3AED' },
  ],
  top_sessions: [
    { title: 'Market research deep dive', cost_usd: 0.42, project: 'Market Research', date: '2026-05-03' },
    { title: 'Pricing strategy compare', cost_usd: 0.38, project: 'Inbox', date: '2026-05-04' },
    { title: 'Tech stack synthesis', cost_usd: 0.31, project: 'LettiB Build', date: '2026-05-05' },
  ],
};
