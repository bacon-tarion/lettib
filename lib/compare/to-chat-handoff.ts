/** sessionStorage key prefix; full key is `${COMPARE_TO_CHAT_KEY_PREFIX}${nonce}`. */
export const COMPARE_TO_CHAT_KEY_PREFIX = "lettib_compare_handoff_";

export type CompareToChatHandoff = {
  provider: string;
  model: string;
  comparePrompt: string;
  compareResponse: string;
  projectId?: string | null;
  tone?: string;
};

export function compareToChatStorageKey(nonce: string): string {
  return `${COMPARE_TO_CHAT_KEY_PREFIX}${nonce}`;
}
