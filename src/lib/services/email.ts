import { Resend } from "resend";

/**
 * Centralized email service.
 *
 * All transactional emails should go through this module rather than
 * instantiating Resend directly in API routes. This gives us a single
 * place to swap providers, add logging, enforce rate limits, and
 * handle error retries.
 */

// Singleton — lazy-initialized on first use
let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      throw new Error("RESEND_API_KEY environment variable is not set");
    }
    _resend = new Resend(key);
  }
  return _resend;
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface SendEmailOptions {
  /** Recipient email address (or array for batch) */
  to: string | string[];
  /** Email subject line */
  subject: string;
  /** HTML body */
  html: string;
  /** Plain-text fallback (recommended for deliverability) */
  text?: string;
  /** From address — defaults to noreply@harpelle.com */
  from?: string;
  /** Reply-to address */
  replyTo?: string;
  /** Optional tags for analytics/filtering */
  tags?: { name: string; value: string }[];
}

export interface SendEmailResult {
  success: boolean;
  id?: string;
  error?: string;
}

/* ------------------------------------------------------------------ */
/*  Defaults                                                           */
/* ------------------------------------------------------------------ */

const DEFAULT_FROM = "VolunteerCal <noreply@harpelle.com>";

/**
 * Build a branded "from" address for org-specific emails.
 * e.g. "Anchor Falls via VolunteerCal <noreply@harpelle.com>"
 */
export function orgFrom(churchName: string): string {
  return `${churchName} via VolunteerCal <noreply@harpelle.com>`;
}

/* ------------------------------------------------------------------ */
/*  Core send function                                                 */
/* ------------------------------------------------------------------ */

/**
 * Send a transactional email via Resend.
 *
 * Usage:
 *   await sendEmail({
 *     to: "user@example.com",
 *     subject: "Your schedule is published",
 *     html: "<h1>Hello</h1><p>Your schedule is ready.</p>",
 *     text: "Hello — your schedule is ready.",
 *   });
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const { to, subject, html, text, from = DEFAULT_FROM, replyTo, tags } = options;

  try {
    const resend = getResend();
    const result = await resend.emails.send({
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      ...(text ? { text } : {}),
      ...(replyTo ? { reply_to: replyTo } : {}),
      ...(tags ? { tags } : {}),
    });

    if (result.error) {
      console.error("[email] Send failed:", result.error);
      return { success: false, error: result.error.message };
    }

    return { success: true, id: result.data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown email error";
    console.error("[email] Exception:", message);
    return { success: false, error: message };
  }
}

/**
 * Send multiple emails in batch (up to 100 per call).
 * Returns an array of results matching the input order.
 */
export async function sendEmailBatch(
  emails: SendEmailOptions[],
): Promise<SendEmailResult[]> {
  // Resend supports batch sending but we'll use sequential for now
  // to keep error handling per-email. Can optimize later.
  return Promise.all(emails.map(sendEmail));
}
