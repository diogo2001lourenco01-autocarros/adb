import type { APIContext } from 'astro';

/**
 * API endpoint that returns the latest vehicle positions for a given line.
 * Query parameters:
 *   - line_id (required): the line identifier to filter vehicles.
 *   - date (optional): date in YYYY-MM-DD (Europe/Lisbon timezone). Defaults to today.
 */
export async function GET({ locals, url }: APIContext) {
  const env = (locals.runtime as any).env;
  const lineId = url.searchParams.get('line_id');
  if (!lineId) {
    return new Response(JSON.stringify({ error: 'Missing line_id' }), { status: 400 });
  }

  // Determine date (Lisbon timezone) – same logic as alocacao API.
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Lisbon' }));
  if (d.getHours() < 3) d.setDate(d.getDate() - 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const today = `${year}-${month}-${day}`;
  const date = url.searchParams.get('date') || today;

  // Retrieve the most recent sighting per bus for the given line and date.
  const rows = await env.DB.prepare(`
    SELECT s.bus_id, s.lat, s.lon, s.seen_at
    FROM vehicle_sightings s
    JOIN (
      SELECT bus_id, MAX(seen_at) as max_seen
      FROM vehicle_sightings
      WHERE date = ? AND line_id = ?
      GROUP BY bus_id
    ) latest ON s.bus_id = latest.bus_id AND s.seen_at = latest.max_seen
    WHERE s.date = ? AND s.line_id = ?
  `)
    .bind(date, lineId, date, lineId)
    .all();

  const vehicles = (rows.results as any[]).map(row => ({
    busId: row.bus_id,
    lat: row.lat,
    lon: row.lon,
    lastSeen: row.seen_at,
  }));

  return new Response(JSON.stringify({ lineId, date, vehicles }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=10, stale-while-revalidate=5',
    },
  });
}
