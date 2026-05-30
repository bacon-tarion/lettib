export const MODELS_CATALOG = {
  openai: [
    { id: 'gpt-5.5',       name: 'GPT-5.5',      context: 1000000, cost_in: 5.00, cost_out: 30.00, free: false },
    { id: 'gpt-5.4',       name: 'GPT-5.4',      context: 400000,  cost_in: 2.50, cost_out: 15.00, free: false },
    { id: 'gpt-5.4-mini',  name: 'GPT-5.4 Mini', context: 400000,  cost_in: 0.75, cost_out: 4.50,  free: false },
    { id: 'gpt-5.4-nano',  name: 'GPT-5.4 Nano', context: 400000,  cost_in: 0.20, cost_out: 1.25,  free: false },
    { id: 'gpt-5',         name: 'GPT-5',        context: 400000,  cost_in: 1.25, cost_out: 10.00, free: false },
    { id: 'gpt-4.1',       name: 'GPT-4.1',      context: 400000,  cost_in: 1.25, cost_out: 10.00, free: false },
    { id: 'gpt-4.1-mini',  name: 'GPT-4.1 Mini', context: 400000,  cost_in: 0.75, cost_out: 4.50,  free: false },
    { id: 'gpt-4o',        name: 'GPT-4o',       context: 128000,  cost_in: 2.50, cost_out: 10.00, free: false },
    { id: 'gpt-4o-mini',   name: 'GPT-4o Mini',  context: 128000,  cost_in: 0.15, cost_out: 0.60,  free: false },
    { id: 'o3',            name: 'o3',           context: 200000,  cost_in: 2.00, cost_out: 8.00,  free: false },
  ],
  anthropic: [
    { id: 'claude-opus-4-7',           name: 'Claude Opus 4.7',  context: 1000000, cost_in: 5.00, cost_out: 25.00, free: false },
    { id: 'claude-sonnet-4-6',         name: 'Claude Sonnet 4.6',context: 1000000, cost_in: 3.00, cost_out: 15.00, free: false },
    { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', context: 200000,  cost_in: 1.00, cost_out: 5.00 , free: false },
  ],
  google: [
    { id: 'gemini-2.5-pro',        name: 'Gemini 2.5 Pro',        context: 1000000, cost_in: 1.25, cost_out: 10.00, free: false },
    { id: 'gemini-2.5-flash',      name: 'Gemini 2.5 Flash',      context: 1000000, cost_in: 0.30, cost_out: 2.50,  free: true  },
    { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite', context: 1000000, cost_in: 0.10, cost_out: 0.40,  free: true  },
  ],
  xai: [
    { id: 'grok-4.3',                       name: 'Grok 4.3',            context: 256000, cost_in: 3.00, cost_out: 15.00, free: false },
    { id: 'grok-4.20-0309-reasoning',       name: 'Grok 4.20 Reasoning', context: 256000, cost_in: 3.00, cost_out: 15.00, free: false },
    { id: 'grok-4.20-0309-non-reasoning',   name: 'Grok 4.20',           context: 256000, cost_in: 3.00, cost_out: 15.00, free: false },
  ],
  groq: [
    { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', context: 131072, cost_in: 0, cost_out: 0, free: true },
    { id: 'llama-3.1-8b-instant',    name: 'Llama 3.1 8B',  context: 131072, cost_in: 0, cost_out: 0, free: true },
  ],
  custom: [
    { id: 'custom', name: 'Custom Model', context: 128000, cost_in: 0, cost_out: 0, free: false },
  ],
} as const;

export type Provider = keyof typeof MODELS_CATALOG;
export type ModelEntry = {
  readonly id: string;
  readonly name: string;
  readonly context: number;
  readonly cost_in: number;
  readonly cost_out: number;
  readonly free: boolean;
};

/**
 * Providers that have a server-side fallback API key. Users without their own
 * connection can still call models marked `free: true` from these providers.
 */
export const FREE_PROVIDERS = ['groq', 'google'] as const;

export const DEFAULT_TEAM_MODELS = {
  research:   ['gpt-5.4', 'claude-opus-4-7', 'gemini-2.5-pro-preview-05-06'],
  coding:     ['claude-sonnet-4-6', 'gpt-5.4'],
  brainstorm: ['claude-opus-4-7', 'gpt-5.4', 'grok-4.1'],
} as const;

export function getProviderLabel(provider: string): string {
  const labels: Record<string, string> = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    google: 'Google',
    xai: 'xAI (Grok)',
    groq: 'Groq',
    custom: 'Custom',
  };
  return labels[provider] ?? provider;
}

export function getModelById(provider: string, modelId: string): ModelEntry | undefined {
  const catalog = MODELS_CATALOG as Record<string, readonly ModelEntry[]>;
  return catalog[provider]?.find((m) => m.id === modelId);
}

export function getModelDisplayName(provider: string, modelId: string): string {
  return getModelById(provider, modelId)?.name ?? modelId;
}

export function getProviderForModel(modelId: string): string | undefined {
  const catalog = MODELS_CATALOG as Record<string, readonly ModelEntry[]>;
  for (const [provider, models] of Object.entries(catalog)) {
    if (models.some((m) => m.id === modelId)) return provider;
  }
  return undefined;
}

export function isFreeModel(provider: string, modelId: string): boolean {
  return getModelById(provider, modelId)?.free ?? false;
}
