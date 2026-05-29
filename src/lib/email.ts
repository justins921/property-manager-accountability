import { Resend } from "resend";

/**
 * Sends a plain reminder email via Resend. Returns true on success.
 * If RESEND_API_KEY is not configured the call is skipped (and logged) so the
 * cron job can still record reminders in dev without an email provider.
 */
export async function sendReminderEmail(params: {
  to: string;
  subject: string;
  body: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.REMINDER_FROM_EMAIL;

  if (!apiKey || !from) {
    console.warn(
      `[email] RESEND not configured — skipping send to ${params.to}: ${params.subject}`,
    );
    return false;
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to: params.to,
    subject: params.subject,
    text: params.body,
    html: `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#111">
      <p>${params.body}</p>
      <hr style="border:none;border-top:1px solid #eee;margin:20px 0"/>
      <p style="color:#888;font-size:13px">Sent by your Property Manager Accountability Platform.</p>
    </div>`,
  });

  if (error) {
    console.error("[email] send failed", error);
    return false;
  }
  return true;
}
