export const FREE_DATABASE_BYTES = 500 * 1024 * 1024;
export const FREE_STORAGE_BYTES = 1024 * 1024 * 1024;

export function nonnegative(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (value === '') return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}
export function quotaStatus(used: number | null, limit: number) {
  if (used === null) return { percent: null, level: 'unknown' as const };
  const percent = used / limit * 100;
  return { percent, level: percent >= 100 ? 'exceeded' as const : percent >= 80 ? 'warning' as const : 'ok' as const };
}
export function parseCounts(input: unknown) {
  const response = input as { result?: unknown; error?: unknown } | null;
  if (!response || response.error || !Array.isArray(response.result) || !response.result.length) throw new Error('Conteggi API non disponibili per il periodo richiesto.');
  const totals = { rest: 0, auth: 0, storage: 0, realtime: 0 };
  const dates: string[] = [];
  for (const value of response.result) {
    if (!value || typeof value !== 'object') throw new Error('Conteggi API non validi.');
    const row = value as Record<string, unknown>;
    for (const key of Object.keys(totals) as (keyof typeof totals)[]) {
      const count = nonnegative(row[`total_${key}_requests`]);
      if (count === null) throw new Error('Conteggi API incompleti.');
      totals[key] += count;
      if (!Number.isSafeInteger(totals[key])) throw new Error('Conteggi API non validi.');
    }
    if (typeof row.timestamp === 'string' && Number.isFinite(Date.parse(row.timestamp))) dates.push(new Date(row.timestamp).toISOString());
  }
  dates.sort();
  return { ...totals, total: totals.rest + totals.auth + totals.storage + totals.realtime, from: dates[0] ?? null, to: dates.at(-1) ?? null };
}
export function parseSizes(input: unknown, keys: string[]) {
  if (!Array.isArray(input) || !input[0] || typeof input[0] !== 'object') throw new Error('Misurazione dello spazio non disponibile.');
  const row = input[0] as Record<string, unknown>;
  return Object.fromEntries(keys.map(key => [key, nonnegative(row[key])])) as Record<string, number | null>;
}
