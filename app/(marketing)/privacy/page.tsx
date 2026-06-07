export const metadata = {
  title: "Privacy Policy — LettiB",
};

const PRIVACY_HTML = `
<h1>Privacy Policy</h1>
<p><strong>Last updated:</strong> June 6, 2026</p>

<p>
  Let It Be IT Solutions LLC ("LettiB", "we", "us", or "our") operates lettib.com
  and related services. This Privacy Policy explains how we collect, use, disclose,
  and safeguard your information when you use our service.
</p>

<h2>Contact Information</h2>
<p>
  Let It Be IT Solutions LLC<br />
  24715 East Alamo Avenue<br />
  Aurora, CO 80016<br />
  Email: <a href="mailto:rlbrazz@gmail.com">rlbrazz@gmail.com</a>
</p>

<h2>Information We Collect</h2>
<p>We may collect the following types of information:</p>
<ul>
  <li><strong>Account information:</strong> names, email addresses, and usernames</li>
  <li><strong>Authentication data:</strong> passwords (stored securely; never in plain text)</li>
  <li><strong>Billing information:</strong> payment details processed through our payment provider</li>
  <li><strong>Usage logs:</strong> activity related to your use of LettiB, including token counts and API usage</li>
  <li><strong>Workspace content:</strong> projects, chats, comparisons, and other data you create within the service</li>
  <li><strong>API keys:</strong> provider API keys you connect, stored encrypted at rest</li>
</ul>

<h2>How We Use Your Information</h2>
<p>We use collected information to:</p>
<ul>
  <li>Provide, operate, and maintain the LettiB service</li>
  <li>Process subscriptions and billing</li>
  <li>Authenticate your account and manage sessions</li>
  <li>Make API calls to AI providers on your behalf using your connected keys</li>
  <li>Communicate with you about your account, updates, and support requests</li>
  <li>Improve and secure our platform</li>
</ul>

<h2>Third-Party Service Providers</h2>
<p>We share data with the following third parties solely to operate the service:</p>
<ul>
  <li><strong>Stripe</strong> — payment processing</li>
  <li><strong>Supabase</strong> — authentication, database, and encrypted key storage</li>
  <li><strong>Vercel</strong> — hosting and infrastructure</li>
  <li><strong>Resend</strong> — transactional email delivery</li>
  <li><strong>AI providers</strong> — OpenAI, Anthropic, Google, xAI, and Groq (prompts and responses are sent to whichever provider you select)</li>
</ul>
<p>We do not sell your personal information or API keys to third parties.</p>

<h2>Data Retention</h2>
<p>
  We retain your information for as long as you maintain an active account. When you
  delete your account, we will delete or anonymize your personal data within a
  reasonable period, except where retention is required by law.
</p>

<h2>Your Rights</h2>
<p>You have the right to:</p>
<ul>
  <li><strong>Access</strong> the personal data we hold about you</li>
  <li><strong>Correct</strong> inaccurate or incomplete information</li>
  <li><strong>Delete</strong> your account and associated data</li>
</ul>
<p>
  To exercise these rights, submit a request via
  <a href="/feedback">/feedback</a> or email
  <a href="mailto:rlbrazz@gmail.com">rlbrazz@gmail.com</a>.
</p>

<h2>Security</h2>
<p>
  We implement industry-standard security measures including encryption of API keys
  at rest. However, no method of transmission over the Internet is 100% secure, and
  we cannot guarantee absolute security.
</p>

<h2>Changes to This Policy</h2>
<p>
  We may update this Privacy Policy from time to time. We will notify you of material
  changes by email or through the service. Continued use after changes constitutes
  acceptance of the updated policy.
</p>
`;

export default function PrivacyPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <div
        className="[&_*]:!text-foreground [&_a]:!text-primary [&_table]:border-collapse [&_td]:!border [&_td]:!border-border [&_th]:!border [&_th]:!border-border [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:mb-4 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-8 [&_h2]:mb-3 [&_p]:mb-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4 [&_li]:mb-1"
        dangerouslySetInnerHTML={{ __html: PRIVACY_HTML }}
      />
    </div>
  );
}
