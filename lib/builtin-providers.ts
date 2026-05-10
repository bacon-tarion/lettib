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
