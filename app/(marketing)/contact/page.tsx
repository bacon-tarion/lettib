export const metadata = {
  title: "Contact",
  description: "Get in touch with the LettiB team.",
};

export default function ContactPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <div className="[&_*]:!text-foreground [&_a]:!text-primary [&_table]:border-collapse [&_td]:!border [&_td]:!border-border [&_th]:!border [&_th]:!border-border">
        <h1 className="text-3xl font-bold mb-4">Contact</h1>

        <p className="mb-4">
          Have a question or need help? We&apos;d love to hear from you.
        </p>

        <p className="mb-4">
          Email:{" "}
          <a href="mailto:rlbrazz@gmail.com">rlbrazz@gmail.com</a>
        </p>

        <p className="mb-4">
          Let It Be IT Solutions LLC
          <br />
          Aurora, CO 80016
        </p>
      </div>
    </div>
  );
}
