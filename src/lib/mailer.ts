import "server-only";
import nodemailer from "nodemailer";
import { env, isTestMode, gmailEnabled } from "./env";
import { sql, type Sql } from "./db";

type Mail = { to: string; subject: string; text: string };

let gmail: nodemailer.Transporter | null = null;
function gmailTransport() {
  const e = env();
  gmail ??= nodemailer.createTransport({
    host: "smtp.gmail.com", port: 465, secure: true,
    auth: { user: e.GMAIL_USER, pass: (e.GMAIL_APP_PASSWORD ?? "").replace(/\s/g, "") },
    connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 10000,
  });
  return gmail;
}

/** Sends immediately. Used for one-time codes, which must never be persisted in production. */
export async function sendMailNow(m: Mail): Promise<{ ok: boolean; error?: string }> {
  const e = env();
  if (isTestMode()) {
    await sql()`insert into dev_mailbox (to_email, subject, body_text) values (${m.to}, ${m.subject}, ${m.text})`;
    return { ok: true };
  }
  if (gmailEnabled()) {
    try {
      const from = e.EMAIL_FROM && e.EMAIL_FROM.includes(e.GMAIL_USER!) ? e.EMAIL_FROM : `"V.app Elections" <${e.GMAIL_USER}>`;
      await gmailTransport().sendMail({ from, to: m.to, subject: m.subject, text: m.text });
      return { ok: true };
    } catch (err) {
      // Never log the message body (it may contain a one-time code), only the error class/code.
      const code = (err as { code?: string; responseCode?: number }).responseCode ?? (err as { code?: string }).code ?? (err as Error).name;
      return { ok: false, error: `Gmail SMTP error ${code}` };
    }
  }
  if (!e.RESEND_API_KEY || !e.EMAIL_FROM) return { ok: false, error: "Email provider not configured" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${e.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: e.EMAIL_FROM, to: [m.to], subject: m.subject, text: m.text }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { ok: false, error: `Provider responded ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).name };
  }
}

/** Queues a non-secret notification (reminders, alerts). Delivered by the cron worker. */
export async function queueNotification(n: {
  to: string; subject: string; text: string; kind: string; collegeId?: string | null; electionId?: string | null; dedupeKey?: string;
}, tx?: Sql) {
  const { getConfig } = await import("./config");
  const { emailEnabled } = await import("./env");
  if (!emailEnabled() || !(await getConfig()).email_notifications_enabled) return;
  // Pass the caller's transaction when it holds locks on referenced rows (avoids cross-connection waits).
  const q = tx ?? sql();
  await q`insert into notifications (to_email, subject, body_text, kind, college_id, election_id, dedupe_key)
              values (${n.to}, ${n.subject}, ${n.text}, ${n.kind}, ${n.collegeId ?? null}, ${n.electionId ?? null}, ${n.dedupeKey ?? null})
              on conflict (dedupe_key) do nothing`;
}

export async function deliverQueued(limit = 50) {
  const rows = await sql()`
    update notifications set attempts = attempts + 1
     where id in (select id from notifications where status = 'pending' and attempts < 5 order by created_at limit ${limit} for update skip locked)
    returning id, to_email, subject, body_text`;
  let sent = 0, failed = 0;
  for (const r of rows) {
    const res = await sendMailNow({ to: r.to_email, subject: r.subject, text: r.body_text });
    if (res.ok) { sent++; await sql()`update notifications set status = 'sent', sent_at = now(), last_error = null where id = ${r.id}`; }
    else { failed++; await sql()`update notifications set status = case when attempts >= 5 then 'failed' else 'pending' end, last_error = ${res.error ?? "error"} where id = ${r.id}`; }
  }
  return { sent, failed };
}
