import type { APIContext } from 'astro';

export async function GET({ locals, url }: APIContext) {
  const env = (locals.runtime as any).env;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Lisbon' });
  const date = url.searchParams.get('date') || today;

  // Use the latest known line_id per vehicle (a vehicle that gains a line during
  // the day is moved out of "unallocated" into its real line)
  const rows = await env.DB.prepare(`
    SELECT bus_id, line_id, first_seen, last_seen FROM (
      SELECT
        bus_id,
        line_id,
        MIN(seen_at) OVER (PARTITION BY bus_id) AS first_seen,
        MAX(seen_at) OVER (PARTITION BY bus_id) AS last_seen,
        ROW_NUMBER()  OVER (PARTITION BY bus_id ORDER BY seen_at DESC) AS rn
      FROM vehicle_sightings WHERE date = ?
    ) WHERE rn = 1
    ORDER BY line_id NULLS LAST, bus_id
  `).bind(date).all();

  const byLine: Record<string, { busId: string; firstSeen: number; lastSeen: number }[]> = {};

  for (const row of (rows.results as any[])) {
    const key = row.line_id !== null ? String(row.line_id) : 'unallocated';
    if (!byLine[key]) byLine[key] = [];
    byLine[key].push({ busId: row.bus_id, firstSeen: row.first_seen, lastSeen: row.last_seen });
  }

  return new Response(JSON.stringify({ date, allocations: byLine }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
