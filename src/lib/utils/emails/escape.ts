/**
 * HTML escape helper for email templates.
 *
 * Email templates interpolate user-controlled strings (church name, role
 * title, person name, etc.) into HTML bodies. Without escaping, a malicious
 * or accidentally-formatted value could:
 *   - Break the rendered template (unbalanced tags)
 *   - Inject content into web-mail clients (Gmail, Outlook on the web)
 *   - Smuggle phishing-style content into receipt emails
 *
 * Convention: every `${value}` inside a template literal that produces HTML
 * MUST pass through `escapeHtml()`. The exceptions are:
 *   - Literal HTML strings produced by helpers like `headerBlock()`, `mainButton()`
 *   - Style strings (e.g. `${P}` `${BOLD}`)
 *   - Numbers and ISO timestamps from trusted server sources
 */

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "`": "&#96;",
  "=": "&#61;",
  "/": "&#47;",
};

/** Escape a string for safe interpolation into HTML email content. */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"'`=/]/g, (ch) => HTML_ESCAPES[ch] ?? ch);
}

/**
 * Escape and apply a soft length cap suitable for inline strings (names,
 * titles, room labels). Prevents a 100KB "name" from blowing up an email.
 */
export function escapeShort(value: unknown, max: number = 200): string {
  const escaped = escapeHtml(value);
  return escaped.length <= max ? escaped : escaped.slice(0, max) + "…";
}
