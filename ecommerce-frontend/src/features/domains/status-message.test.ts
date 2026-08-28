import { describe, expect, it } from 'vitest';
import { domainStatusMessage } from './status-message';

/**
 * The regression these exist for.
 *
 * A store connected a custom domain. The TXT record matched, DNS resolved to
 * the address the console had told them to use, and the console reported
 * "Verified. HTTPS will be ready within a minute." The site never loaded: the
 * platform's configured ingress address was pointing at an unrelated web
 * server, and nothing in the check could notice, because it compared DNS
 * against the same setting that had produced the instruction.
 *
 * Ownership and routing are separate questions, and only a real reply from the
 * platform is allowed to promise HTTPS.
 */
describe('what the console says after verifying a domain', () => {
  it('promises HTTPS only when the platform actually answered', () => {
    expect(
      domainStatusMessage({ verified: true, pointsHere: true, reachable: true }),
    ).toBe('Verified and reachable. HTTPS will be ready within a minute.');
  });

  it('does not promise HTTPS when DNS matches but nothing answers', () => {
    const message = domainStatusMessage({
      verified: true,
      pointsHere: true,
      reachable: false,
      message: 'DNS points at this platform’s configured address, but nothing there is answering.',
    });

    expect(message).not.toMatch(/HTTPS will be ready/);
    expect(message).toMatch(/nothing there is answering/);
  });

  /**
   * The case that produced the silent failure. Even with the server's
   * explanation missing, the fallback must not claim the site is coming up.
   */
  it('stays honest when the server sends no explanation', () => {
    const message = domainStatusMessage({
      verified: true,
      pointsHere: true,
      reachable: false,
    });

    expect(message).not.toMatch(/HTTPS will be ready/);
    expect(message).toMatch(/not being served/);
  });

  it('reports the DNS problem when the domain does not resolve here', () => {
    expect(
      domainStatusMessage({
        verified: true,
        pointsHere: false,
        reachable: false,
        message: 'shop.example.com does not resolve to this platform yet.',
      }),
    ).toBe('shop.example.com does not resolve to this platform yet.');
  });

  it('reports the ownership problem when the TXT record is missing', () => {
    expect(
      domainStatusMessage({
        verified: false,
        pointsHere: false,
        reachable: false,
        message: 'No matching TXT record found at _store-verify.shop.example.com.',
      }),
    ).toMatch(/No matching TXT record/);
  });

  it('never claims success for an unverified domain, even if it is reachable', () => {
    // A domain can be served by the platform before its TXT record lands — a
    // re-added domain, say. Ownership is still the gate.
    const message = domainStatusMessage({
      verified: false,
      pointsHere: true,
      reachable: true,
    });

    expect(message).toBe('Not verified yet.');
  });
});
