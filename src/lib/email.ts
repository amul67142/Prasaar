import "server-only";
import { appUrl, optionalEnv } from "./env";

interface Email {
  to: string;
  subject: string;
  /** Plain paragraphs; a link button is added when `action` is set. */
  lines: string[];
  action?: { label: string; url: string };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function render(email: Email): { html: string; text: string } {
  const paras = email.lines.map((l) => `<p style="margin:0 0 14px">${escapeHtml(l)}</p>`).join("");
  const button = email.action
    ? `<p style="margin:20px 0"><a href="${escapeHtml(email.action.url)}" style="background:#111;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;display:inline-block">${escapeHtml(email.action.label)}</a></p>`
    : "";
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.5;color:#111;max-width:520px">${paras}${button}<p style="color:#777;font-size:13px;margin-top:28px">Prasaar · <a href="${appUrl()}" style="color:#777">${appUrl().replace(/^https?:\/\//, "")}</a></p></div>`;
  const text = [...email.lines, email.action ? `${email.action.label}: ${email.action.url}` : ""].join("\n\n");
  return { html, text };
}

/**
 * Sends through Resend when RESEND_API_KEY is set. Without it (local dev) the
 * email is printed to the server console so links can still be followed.
 */
export async function sendEmail(email: Email): Promise<void> {
  const apiKey = optionalEnv("RESEND_API_KEY");
  const { html, text } = render(email);
  if (!apiKey) {
    console.info(`\n[email] to=${email.to} subject="${email.subject}"\n${text}\n`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: optionalEnv("EMAIL_FROM") ?? "Prasaar <noreply@prasaar.app>",
      to: [email.to],
      subject: email.subject,
      html,
      text,
    }),
  });
  if (!res.ok) console.error(`[email] Resend failed ${res.status}: ${await res.text()}`);
}
