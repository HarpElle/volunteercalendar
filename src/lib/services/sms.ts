/**
 * Twilio SMS Service
 *
 * Sends SMS messages via the Twilio REST API.
 * Requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER env vars.
 */

interface SendSmsParams {
  to: string;
  body: string;
}

interface SmsResult {
  success: boolean;
  sid: string | null;
  error: string | null;
}

/**
 * Send an SMS via Twilio.
 * Returns the message SID on success, or an error message on failure.
 */
export async function sendSms(params: SendSmsParams): Promise<SmsResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    // Callers fire-and-forget, so this log line is the only trace a
    // misconfigured environment leaves. Keep it loud.
    console.error(
      "[sms] send skipped: Twilio not configured (missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_FROM_NUMBER)",
    );
    return {
      success: false,
      sid: null,
      error: "Twilio not configured (missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_FROM_NUMBER)",
    };
  }

  // Normalize phone number — strip non-digits, add +1 if no country code
  let to = params.to.replace(/[^\d+]/g, "");
  if (!to.startsWith("+")) {
    to = to.startsWith("1") ? `+${to}` : `+1${to}`;
  }

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

    const body = new URLSearchParams({
      To: to,
      From: fromNumber,
      Body: params.body,
    });

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    const data = await res.json();
    const maskedTo = `${to.slice(0, 5)}***${to.slice(-2)}`;

    if (!res.ok) {
      console.error(
        `[sms] Twilio send failed (HTTP ${res.status}) to ${maskedTo}: ${data.message || "no error message"}`,
      );
      return {
        success: false,
        sid: null,
        error: data.message || `Twilio error: ${res.status}`,
      };
    }

    console.log(`[sms] sent sid=${data.sid || "?"} to ${maskedTo}`);
    return {
      success: true,
      sid: data.sid || null,
      error: null,
    };
  } catch (err) {
    console.error(
      `[sms] Twilio request threw: ${err instanceof Error ? err.message : "unknown error"}`,
    );
    return {
      success: false,
      sid: null,
      error: err instanceof Error ? err.message : "Unknown SMS error",
    };
  }
}
