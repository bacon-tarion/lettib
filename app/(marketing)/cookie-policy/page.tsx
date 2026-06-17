export const metadata = {
  title: "Cookie Policy",
  description:
    "LettiB uses only essential authentication cookies — no advertising or analytics trackers.",
};

export default function CookiePolicyPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <div className="[&_*]:!text-foreground [&_a]:!text-primary [&_table]:border-collapse [&_td]:!border [&_td]:!border-border [&_th]:!border [&_th]:!border-border">
        <h1 className="text-3xl font-bold mb-4">Cookie Policy</h1>
        <p className="text-muted-foreground mb-6">Last updated: June 6, 2026</p>

        <p className="mb-4">
          LettiB uses only essential authentication cookies (Supabase session management)
          to keep you logged in.
        </p>

        <p className="mb-4">
          We do NOT use advertising cookies, analytics cookies (e.g. Google Analytics),
          social media cookies, or marketing trackers.
        </p>

        <p className="mb-4">
          Disabling cookies in your browser will prevent login functionality.
        </p>

        <p className="mb-4">
          Contact:{" "}
          <a href="mailto:rlbrazz@gmail.com">rlbrazz@gmail.com</a>
        </p>
      </div>
    </div>
  );
}
