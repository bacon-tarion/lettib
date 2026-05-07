export const MODELS_CATALOG = {
  openai: [
    { id: 'gpt-5.5',       name: 'GPT-5.5 (Frontier)', context: 1000000, cost_in: 5.00,  cost_out: 30.00 },
    { id: 'gpt-5.4',       name: 'GPT-5.4',            context: 400000,  cost_in: 2.50,  cost_out: 15.00 },
    { id: 'gpt-5.4-mini',  name: 'GPT-5.4 Mini',       context: 400000,  cost_in: 0.75,  cost_out: 4.50  },
    { id: 'gpt-5.4-nano',  name: 'GPT-5.4 Nano',       context: 400000,  cost_in: 0.20,  cost_out: 1.25  },
    { id: 'gpt-5.1',       name: 'GPT-5.1',            context: 400000,  cost_in: 1.25,  cost_out: 10.00 },
  ],
  anthropic: [
    { id: 'claude-opus-4-7',           name: 'Claude Opus 4.7',  context: 1000000, cost_in: 5.00, cost_out: 25.00 },
    { id: 'claude-sonnet-4-6',         name: 'Claude Sonnet 4.6',context: 1000000, cost_in: 3.00, cost_out: 15.00 },
    { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', context: 200000,  cost_in: 1.00, cost_out: 5.00  },
  ],
  google: [
    { id: 'gemini-3.1-pro',   name: 'Gemini 3.1 Pro',   context: 1000000, cost_in: 2.00, cost_out: 12.00 },
    { id: 'gemini-3-flash',   name: 'Gemini 3 Flash',   context: 1000000, cost_in: 0.50, cost_out: 3.00  },
    { id: 'gemini-2.5-pro',   name: 'Gemini 2.5 Pro',   context: 1000000, cost_in: 1.25, cost_out: 10.00 },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', context: 1000000, cost_in: 0.30, cost_out: 2.50  },
  ],
  xai: [
    { id: 'grok-4.1', name: 'Grok 4.1', context: 256000, cost_in: 0.20, cost_out: 0.50  },
    { id: 'grok-4',   name: 'Grok 4',   context: 256000, cost_in: 3.00, cost_out: 15.00 },
  ],
  custom: [
    { id: 'custom', name: 'Custom Model', context: 128000, cost_in: 0, cost_out: 0 },
  ],
} as const;

export type Provider = keyof typeof MODELS_CATALOG;
export type ModelEntry = {
  readonly id: string;
  readonly name: string;
  readonly context: number;
  readonly cost_in: number;
  readonly cost_out: number;
};

export const DEFAULT_TEAM_MODELS = {
  research:   ['gpt-5.4', 'claude-opus-4-7', 'gemini-3.1-pro'],
  coding:     ['claude-sonnet-4-6', 'gpt-5.4'],
  brainstorm: ['claude-opus-4-7', 'gpt-5.4', 'grok-4.1'],
} as const;

export function getProviderLabel(provider: string): string {
  const labels: Record<string, string> = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    google: 'Google',
    xai: 'xAI',
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
