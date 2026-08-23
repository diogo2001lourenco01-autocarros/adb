import astroEntry, { pageMap } from "./_worker.js/index.js";
import { CustomerWorkflow } from "../src/workflows/customer_workflow.js";

async function handleScheduled(event, env, ctx) {
  try {
    // ── 1. Fetch current vehicles from the SSE stream ─────────────────────
    const response = await fetch("https://tub.up.railway.app/vehicleStream");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let vehicles = null;

    const readFirst = async () => {
      while (!vehicles) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // Normalise CRLF → LF; only process fully-received lines.
        const newline = buffer.lastIndexOf("\n");
        if (newline === -1) continue;
        const complete = buffer.slice(0, newline + 1).replace(/\r\n/g, "\n");
        buffer = buffer.slice(newline + 1);
        for (const line of complete.split("\n")) {
          if (line.startsWith("data:")) {
            try { vehicles = JSON.parse(line.slice(5).trim()); } catch {}
            if (vehicles) return;
          }
        }
      }
    };

    const timeout = new Promise((_, r) => setTimeout(() => r(new Error("timeout")), 8000));
    await Promise.race([readFirst(), timeout]);
    reader.cancel().catch(() => {});

    if (!vehicles?.length) {
      console.warn("[scheduled] No vehicles received");
      return;
    }

    const date = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Lisbon" });
    const now = Math.floor(Date.now() / 1000);

    // ── 2. Write only NEW (date, bus, line) combinations ─────────────────
    // INSERT OR IGNORE deduplicates via idx_alloc_uniq (expression index on
    // COALESCE(line_id, -1)).  After the first cron fire of the day all rows
    // already exist, so subsequent fires write 0 rows — near-zero write cost.
    const stmt = env.DB.prepare(
      `INSERT OR IGNORE INTO vehicle_daily_alloc (date, bus_id, line_id, first_seen, last_seen)
       VALUES (?, ?, ?, ?, ?)`
    );
    const batchResult = await env.DB.batch(
      vehicles.map(v =>
        stmt.bind(date, String(v.busId), v.lineId ?? null, now, now)
      )
    );
    const inserted = batchResult.reduce((n, r) => n + (r.meta?.changes ?? 0), 0);
    console.log(`[scheduled] ${inserted} new alloc rows for ${date} (${vehicles.length} vehicles seen)`);

    // ── 3. Purge vehicle_daily_alloc rows older than 30 days ─────────────
    // This table stays tiny (~75-225 rows/day) so the DELETE is always fast.
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffDate = cutoff.toLocaleDateString("en-CA", { timeZone: "Europe/Lisbon" });
    const purgeAlloc = await env.DB.prepare(
      `DELETE FROM vehicle_daily_alloc WHERE date < ?`
    ).bind(cutoffDate).run();
    if (purgeAlloc.meta?.changes) {
      console.log(`[scheduled] Purged ${purgeAlloc.meta.changes} alloc rows older than ${cutoffDate}`);
    }

    // ── 4. Gradual purge of legacy vehicle_sightings (10 000 rows/fire) ──
    // The existing ~6 M rows are purged in batches to avoid hitting the
    // scheduled-worker CPU timeout.  Once the backlog is gone this is a no-op.
    const purgeSightings = await env.DB.prepare(
      `DELETE FROM vehicle_sightings
       WHERE id IN (SELECT id FROM vehicle_sightings WHERE date < ? LIMIT 10000)`
    ).bind(cutoffDate).run();
    if (purgeSightings.meta?.changes) {
      console.log(`[scheduled] Purged ${purgeSightings.meta.changes} legacy sighting rows`);
    }

  } catch (err) {
    console.error("[scheduled] Error:", err.message);
  }
}


const fetchHandler = typeof astroEntry === "function" ? astroEntry : astroEntry.fetch;

export default {
  fetch: fetchHandler,
  scheduled: handleScheduled,
};

export { CustomerWorkflow, pageMap };
