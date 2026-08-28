export interface DomainVerifyResult {
  verified: boolean;
  pointsHere: boolean;
  reachable: boolean;
  message?: string;
}

/**
 * What to tell someone after a verification attempt.
 *
 * Its own function because getting this wrong is the whole failure this exists
 * to prevent. The console previously said "Verified. HTTPS will be ready within
 * a minute." whenever the TXT record matched and DNS agreed with the platform's
 * *configured* ingress address — two checks that between them never establish
 * that the site is served. A wrong ingress address satisfied both, reported
 * success, and then the domain never loaded, with nothing on screen pointing at
 * the cause.
 *
 * So the optimistic line is now earned only by `reachable`, which means the
 * platform answered a request on that hostname itself.
 */
export function domainStatusMessage(result: DomainVerifyResult): string {
  if (!result.verified) {
    return result.message ?? 'Not verified yet.';
  }

  if (result.reachable) {
    return 'Verified and reachable. HTTPS will be ready within a minute.';
  }

  // The server explains which half is missing — DNS not pointing here at all,
  // or pointing at an address that is not this platform.
  return result.message ?? 'Verified, but the site is not being served at that address yet.';
}
