export const metadata = {
  title: "Privacy Policy — LettiB",
};

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-16 prose prose-sm dark:prose-invert">
      <h1>Privacy Policy</h1>
      <p className="text-muted-foreground text-sm">
        Last updated: May 7, 2026
      </p>

      <p>
        This page is a placeholder. The final privacy policy will be published
        before LettiB exits beta. The summary below describes our intended
        practices.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account info:</strong> email and authentication metadata
          (managed by Supabase).
        </li>
        <li>
          <strong>API keys:</strong> the provider API keys you connect, stored
          encrypted at rest in Supabase Vault. Decrypted server-side only when
          needed to fulfill a request.
        </li>
        <li>
          <strong>Workspace content:</strong> projects, chats, comparisons,
          syntheses, and project memory you create.
        </li>
        <li>
          <strong>Usage logs:</strong> per-request token counts and provider
          costs for your own dashboards and cost tracking.
        </li>
      </ul>

      <h2>What we don't do</h2>
      <ul>
        <li>We don't sell your data.</li>
        <li>We don't train models on your prompts or responses.</li>
        <li>We don't expose your API keys to the browser.</li>
      </ul>

      <h2>Third parties</h2>
      <p>
        Your prompts are sent to whichever model provider you select (OpenAI,
        Anthropic, Google, xAI, or a custom endpoint). Their privacy and data
        retention policies apply to that traffic.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy? Email <code>privacy@lettib.app</code>.
      </p>
    </article>
  );
}
