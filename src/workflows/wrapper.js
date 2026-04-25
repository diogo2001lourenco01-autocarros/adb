import astroEntry, { pageMap } from "./_worker.js/index.js";
import { CustomerWorkflow } from "../src/workflows/customer_workflow.js";

async function handleScheduled(event, env, ctx) {
  try {
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
        for (const line of buffer.split("\n")) {
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
    const stmt = env.DB.prepare(
      "INSERT INTO vehicle_sightings (date, bus_id, line_id, direction, trip_id, lat, lon, seen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    );

    await env.DB.batch(
      vehicles.map(v =>
        stmt.bind(date, String(v.busId), v.lineId ?? null, v.direction ?? null, v.tripId ?? null, v.lat, v.lon, now)
      )
    );

    console.log(`[scheduled] Saved ${vehicles.length} sightings for ${date}`);
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
