/** Client sessionStorage keys + TTL for LettiB UI restore (2 hours). */
export const SESSION_STATE_TTL_MS = 2 * 60 * 60 * 1000;

export const LETTIB_STATE_CHAT = "lettib_state_chat";
export const LETTIB_STATE_COMPARE = "lettib_state_compare";
export const LETTIB_STATE_MANUAL_COMPARE = "lettib_state_manual_compare";

/** Legacy compare snapshot key — read once and migrate to LETTIB_STATE_COMPARE. */
export const LEGACY_COMPARE_VIEW_SNAPSHOT_KEY = "lettib_compare_view_v1";
