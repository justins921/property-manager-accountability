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
      <p>${toHtml(params.body)}</p>
      <hr style="border:none;border-top:1px solid #eee;margin:20px 0"/>
      <p style="color:#888;font-size:13px">Sent by your property management platform.</p>
    </div>`,
  });

  if (error) {
    console.error("[email] send failed", error);
    return false;
  }
  return true;
}

/**
 * Plain text → safe HTML. Bodies can include text tenants typed (repair
 * requests), so everything is escaped first; then bare https links (pay and
 * request links) are made clickable.
 */
export function toHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
  return escaped.replace(
    /https?:\/\/[^\s<&]+[^\s<&.,;:!?)]/g,
    (url) => `<a href="${url}" style="color:#1d4ed8">${url}</a>`,
  );
}
