"use client";

/**
 * Root-level error UI — the only App Router file that may render <html>/<body>.
 * Replaces the Pages Router _error fallback that triggers the Html import error.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            gap: "16px",
            fontFamily: "system-ui, sans-serif",
            padding: "24px",
            textAlign: "center",
          }}
        >
          <h2 style={{ fontSize: "20px", fontWeight: 600 }}>
            Something went wrong
          </h2>
          <p style={{ color: "#666", maxWidth: "420px" }}>
            We hit an unexpected error. Please try again.
          </p>
          {error.digest && (
            <p style={{ fontSize: "12px", color: "#999" }}>
              Error ID: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              padding: "8px 16px",
              borderRadius: "6px",
              background: "#111",
              color: "white",
              border: "none",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
