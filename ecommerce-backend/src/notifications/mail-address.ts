/**
 * Reading and writing the `From` header.
 *
 * Shared because two callers need the same parsing and had been about to grow
 * two copies of it: `tenants.service.ts` wants the bare address so a setup
 * email can say "write to support@…" in a sentence, and `mailer.service.ts`
 * wants it so a store's name can be put in front of the configured address
 * without changing the address itself.
 */

/**
 * The address out of a `From` value, or null.
 *
 * `SMTP_FROM` may be either `addr@example.com` or the RFC 5322 form
 * `Display Name <addr@example.com>`, and "write to Display Name
 * <addr@example.com>" is not something you can put in a sentence.
 */
export function bareAddress(value: string | undefined): string | null {
  if (!value) return null;
  const angled = value.match(/<([^>]+)>/);
  const candidate = (angled ? angled[1] : value).trim();
  return candidate.includes('@') ? candidate : null;
}

/**
 * A display name safe to put in a mail header.
 *
 * A store name is typed by its owner and reaches a header unfiltered, so the
 * characters that would end the quoted string or start a new header are
 * removed: a name containing CRLF is header injection, and one containing a
 * quote or an angle bracket produces a `From` that fails to parse — which most
 * receiving servers treat as a spam signal rather than as an error worth
 * reporting.
 *
 * Truncated at 78 characters, the practical line limit for a header field.
 */
export function displayName(value: string): string {
  return value
    .replace(/[\r\n"<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 78);
}

/**
 * `"Northwind" <no-reply@platform.example>`.
 *
 * The *address* is deliberately left exactly as configured. Rewriting it to
 * something derived from the store would break SPF and DKIM alignment for every
 * tenant, and Gmail in particular silently rewrites a `From` its account is not
 * authorised to use — the failure mode `MailerService.onModuleInit` already
 * warns about. Only the name in front of it changes.
 */
export function fromHeader(configured: string, name?: string): string {
  const cleaned = name ? displayName(name) : '';
  const address = bareAddress(configured);

  if (!cleaned || !address) return configured;
  return `"${cleaned}" <${address}>`;
}
