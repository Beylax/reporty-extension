const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Signature verification happens before this additional audience/session check. */
export function validMcpClaims(claims: Record<string, unknown> | undefined, issuer: string, resource: string, now = Date.now() / 1000) {
  return !!claims && !claims.is_anonymous && claims.iss === issuer && claims.aud === resource
    && claims.role === 'authenticated' && typeof claims.exp === 'number' && Number.isFinite(claims.exp) && claims.exp > now
    && ['sub', 'client_id', 'session_id', 'reporty_mcp_connection', 'reporty_mcp_project'].every(key => typeof claims[key] === 'string' && uuid.test(claims[key] as string));
}
