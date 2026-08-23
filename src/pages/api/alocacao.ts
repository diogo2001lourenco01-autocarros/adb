import type { APIContext } from 'astro';

export async function GET({ locals, url }: APIContext) {
  const env = (locals.runtime as any).env;
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Lisbon" }));
  if (d.getHours() < 3) d.setDate(d.getDate() - 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const today = `${year}-${month}-${day}`;
  
  const date = url.searchParams.get('date') || today;

  // Single scan on the compact vehicle_daily_alloc table.
  // With ~75–225 rows per day (vs. ~54 000 in vehicle_sightings + 3 full scans)
  // this call now reads orders of magnitude fewer rows per request.
  const rows = await env.DB.prepare(`
    SELECT bus_id, line_id, first_seen, last_seen
    FROM vehicle_daily_alloc
    WHERE date = ?
    ORDER BY line_id NULLS LAST, bus_id
  `).bind(date).all();

  const byLine: Record<string, { busId: string; firstSeen: number; lastSeen: number }[]> = {};

  // First pass: identify buses that operated at least one named line today.
  const busHasLine = new Set<string>();
  for (const row of (rows.results as any[])) {
    if (row.line_id !== null) busHasLine.add(row.bus_id);
  }

  // Second pass: build the allocation map.
  // Null-line rows are skipped for buses that also have a real line assignment,
  // matching the original "unallocated = never had a line" semantics.
  for (const row of (rows.results as any[])) {
    if (row.line_id === null && busHasLine.has(row.bus_id)) continue;
    const key = row.line_id !== null ? String(row.line_id) : 'unallocated';
    if (!byLine[key]) byLine[key] = [];
    byLine[key].push({ busId: row.bus_id, firstSeen: row.first_seen, lastSeen: row.last_seen });
  }

  return new Response(JSON.stringify({ date, allocations: byLine }), {
    headers: {
      'Content-Type': 'application/json',
      // Cache for 90 s — data only changes when the cron fires (every 2 min).
      // Cloudflare CDN will serve cached responses, saving D1 reads on repeated calls.
      'Cache-Control': 'public, max-age=90, stale-while-revalidate=30',
    },
  });
}

