/**
 * MOCK_MODE must never run in production — it bypasses auth in middleware and layout.
 */
export function assertMockModeNotInProduction(): void {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.MOCK_MODE === "true"
  ) {
    throw new Error(
      "MOCK_MODE=true is not allowed when NODE_ENV=production. Remove MOCK_MODE from production environment variables."
    );
  }
}

assertMockModeNotInProduction();
