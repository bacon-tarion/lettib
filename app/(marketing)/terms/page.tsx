export const metadata = {
  title: "Terms and Conditions — LettiB",
};

export default function TermsPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <div className="[&_*]:!text-foreground [&_a]:!text-primary [&_table]:border-collapse [&_td]:!border [&_td]:!border-border [&_th]:!border [&_th]:!border-border">
        <h1 className="text-3xl font-bold mb-4">Terms and Conditions</h1>
        <p className="text-muted-foreground mb-6">Last updated: June 6, 2026</p>

        <p className="mb-4">
          Let It Be IT Solutions LLC (&quot;Company&quot;) operates LettiB (lettib.com).
          <br />
          Contact:{" "}
          <a href="mailto:rlbrazz@gmail.com">rlbrazz@gmail.com</a> | 24715 East Alamo
          Avenue, Aurora, CO 80016
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">1. Agreement to Terms</h2>
        <p className="mb-4">
          By accessing lettib.com you agree to these Terms. If you disagree, stop using
          the service immediately.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">2. Our Services</h2>
        <p className="mb-4">
          LettiB is a subscription-based multi-AI workspace. Users bring their own API
          keys (BYOK) to compare AI model responses, generate synthesized answers, and
          organize AI work into projects.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">3. User Accounts</h2>
        <p className="mb-4">
          Must be 18+. One account per user. Keep credentials secure. Provide accurate
          information.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">4. Subscriptions and Billing</h2>
        <ul className="list-disc pl-6 mb-4 space-y-1">
          <li>Pro: $15/month or $144/year</li>
          <li>Power: $35/month or $336/year</li>
          <li>Lifetime BYOK: $79 one-time</li>
        </ul>
        <p className="mb-4">
          Pro and Power include a 7-day free trial. Subscriptions auto-renew. Cancel
          anytime via Settings → Subscription. No refunds — all payments are final.
        </p>
        <p className="mb-4">
          <strong>Lifetime Access:</strong> The &quot;Lifetime&quot; plan provides access
          to LettiB for the operational lifetime of the product. Let It Be IT Solutions
          LLC reserves the right to discontinue the service with 90 days notice. Lifetime
          access is non-transferable and tied to a single user account.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">5. Your API Keys</h2>
        <p className="mb-4">
          We store your API keys encrypted. We never sell or share them. They are used
          solely to make API calls on your behalf within LettiB.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">6. Prohibited Activities</h2>
        <p className="mb-4">
          No illegal use, reverse engineering, scraping, unauthorized access, reselling
          the service, or transmitting malware.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">7. Intellectual Property</h2>
        <p className="mb-4">
          LettiB platform owned by Let It Be IT Solutions LLC. You own your content. You
          grant us a limited license to process it to provide the service.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">8. Disclaimer of Warranties</h2>
        <p className="mb-4 uppercase">
          Service provided as-is. No warranty that service will be uninterrupted or
          error-free. AI output accuracy not guaranteed.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">9. Limitation of Liability</h2>
        <p className="mb-4 uppercase">
          Liability limited to amounts paid in the prior 6 months. No liability for
          indirect and consequential damages.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">10. Governing Law</h2>
        <p className="mb-4">State of Colorado, United States.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">11. Dispute Resolution</h2>
        <p className="mb-4">
          30 days informal negotiation, then binding arbitration in Colorado, English, 1
          arbitrator.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">12. Changes to Terms</h2>
        <p className="mb-4">
          We may update Terms. Material changes notified by email.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">13. Contact</h2>
        <p className="mb-4">
          Let It Be IT Solutions LLC
          <br />
          24715 East Alamo Avenue, Aurora, CO 80016
          <br />
          <a href="mailto:rlbrazz@gmail.com">rlbrazz@gmail.com</a>
        </p>
      </div>
    </div>
  );
}
