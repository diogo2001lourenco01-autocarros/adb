import type { APIContext } from 'astro';

export async function GET({ locals, url }: APIContext) {
  const env = (locals.runtime as any).env;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Lisbon' });
  const date = url.searchParams.get('date') || today;

  // All distinct (bus, line) pairs seen during the day.
  // A bus appears once per line it operated on, so a vehicle that switched lines
  // shows up under every line it served.
  // "Unallocated" only contains buses that never received a line assignment today.
  const rows = await env.DB.prepare(`
    SELECT bus_id, line_id, MIN(seen_at) AS first_seen, MAX(seen_at) AS last_seen
    FROM vehicle_sightings
    WHERE date = ? AND line_id IS NOT NULL
    GROUP BY bus_id, line_id

    UNION ALL

    SELECT bus_id, NULL AS line_id, MIN(seen_at) AS first_seen, MAX(seen_at) AS last_seen
    FROM vehicle_sightings
    WHERE date = ?
      AND bus_id NOT IN (
        SELECT DISTINCT bus_id FROM vehicle_sightings WHERE date = ? AND line_id IS NOT NULL
      )
    GROUP BY bus_id

    ORDER BY line_id NULLS LAST, bus_id
  `).bind(date, date, date).all();

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
