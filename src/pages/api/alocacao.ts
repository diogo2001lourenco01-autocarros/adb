import type { APIContext } from 'astro';

export async function GET({ locals }: APIContext) {
  const env = (locals.runtime as any).env;
  const date = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Lisbon' });

  const rows = await env.DB.prepare(`
    SELECT line_id, bus_id, MIN(seen_at) as first_seen, MAX(seen_at) as last_seen
    FROM vehicle_sightings
    WHERE date = ?
    GROUP BY line_id, bus_id
    ORDER BY line_id, bus_id
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
