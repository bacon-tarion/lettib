import { Resend } from "resend";

const FEEDBACK_NOTIFY_TO = "rlbrazz@gmail.com";

let resendClient: Resend | null = null;

function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return null;
  if (!resendClient) resendClient = new Resend(apiKey);
  return resendClient;
}

export async function sendFeedbackNotification(input: {
  userEmail: string;
  category: string;
  message: string;
  page: string | null;
  timestamp: string;
}): Promise<{ sent: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn("[feedback] RESEND_API_KEY not set — skipping email notification");
    return { sent: false, error: "RESEND_API_KEY not configured" };
  }

  const from =
    process.env.RESEND_FROM?.trim() || "LettiB Feedback <onboarding@resend.dev>";

  const body = [
    `User email: ${input.userEmail}`,
    `Feedback type: ${input.category}`,
    `Page: ${input.page ?? "(not provided)"}`,
    `Timestamp: ${input.timestamp}`,
    "",
    "Message:",
    input.message,
  ].join("\n");

  try {
    const { error } = await resend.emails.send({
      from,
      to: FEEDBACK_NOTIFY_TO,
      subject: "New LettiB Feedback",
      text: body,
    });
    if (error) {
      console.error("[feedback] Resend send failed:", error);
      return { sent: false, error: error.message };
    }
    return { sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Email send failed";
    console.error("[feedback] Resend exception:", err);
    return { sent: false, error: message };
  }
}
