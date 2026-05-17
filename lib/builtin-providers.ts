/**
 * Built-in provider access (server env). Used when users have no Vault key
 * for Groq; compare/chat fall back to these. Server-only.
 */
export function isGroqBuiltinEnabled(): boolean {
  return (
    typeof process.env.GROQ_API_KEY === "string" &&
    process.env.GROQ_API_KEY.trim().length > 0
  );
}

/** Synthetic api_connections row for built-in Groq (no Vault key). */
export function syntheticGroqConnection() {
  return {
    id: "builtin-groq",
    provider: "groq" as const,
    status: "connected" as const,
    key_last_four: null,
    last_tested_at: null,
    custom_base_url: null,
    custom_model_name: null,
  };
}

/**
 * Ensures built-in Groq is available for Compare / Teams pickers when the host
 * has GROQ_API_KEY, without requiring a user api_connections row.
 */
export function withBuiltinGroqConnections<T extends { provider: string }>(
  connections: readonly T[]
): T[] {
  if (!isGroqBuiltinEnabled()) return [...connections];
  if (connections.some((c) => c.provider === "groq")) return [...connections];
  return [...connections, syntheticGroqConnection() as unknown as T];
}
