export const metadata = {
  title: "Terms of Service — LettiB",
};

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-16 prose prose-sm dark:prose-invert">
      <h1>Terms of Service</h1>
      <p className="text-muted-foreground text-sm">
        Last updated: May 7, 2026
      </p>

      <p>
        This page is a placeholder. The final terms of service will be published
        before LettiB exits beta. By using the LettiB beta you agree to the
        outline below.
      </p>

      <h2>The service</h2>
      <p>
        LettiB (&quot;we&quot;, &quot;us&quot;) provides a multi-AI workspace for comparing,
        synthesizing, and organizing content from third-party AI model
        providers. You (&quot;you&quot;, &quot;user&quot;) use the service at your own discretion
        and risk.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>You are responsible for keeping your account credentials secure.</li>
        <li>
          You are responsible for the API keys you connect and the costs the
          underlying providers charge you for usage.
        </li>
        <li>
          You may not use the service for illegal activity or to violate any
          provider&apos;s terms.
        </li>
      </ul>

      <h2>Beta status</h2>
      <p>
        The service is in active beta. Features may change, break, or be
        removed. We aim to give reasonable notice before destructive changes
        but make no guarantees during the beta period.
      </p>

      <h2>No warranty</h2>
      <p>
        The service is provided &quot;as is&quot; without warranty of any kind. We are
        not responsible for the accuracy of any AI-generated content or for any
        decisions made based on it.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms? Email <code>legal@lettib.app</code>.
      </p>
    </article>
  );
}
