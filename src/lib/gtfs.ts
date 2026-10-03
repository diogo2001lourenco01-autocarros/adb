// Utility functions to parse GTFS CSV files for routes and stops.
import fs from "fs";
import path from "path";
import readline from "readline";
import { parse } from "csv-parse/sync";

// Path to GTFS data folder (relative to project root)
const GTFS_DATA_DIR = path.resolve(__dirname, "../data");

/**
 * Load a CSV file and return records as objects.
 */
function loadCsv(fileName: string) {
  const filePath = path.join(GTFS_DATA_DIR, fileName);
  const content = fs.readFileSync(filePath, "utf-8");
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
}

/**
 * Get all routes from routes.txt.
 */
export function getRoutes() {
  const records = loadCsv("routes.txt");
  return records.map((r: any) => ({
    route_id: r.route_id,
    short_name: r.route_short_name ?? "",
    long_name: r.route_long_name ?? "",
  }));
}

/**
 * Get stops information from stops.txt.
 */
export function getStopsMap() {
  const records = loadCsv("stops.txt");
  const map: Record<string, { name: string; code?: string }> = {};
  for (const s of records) {
    map[s.stop_id] = {
      name: s.stop_name,
      code: s.stop_code || undefined,
    };
  }
  return map;
}

/**
 * Get mapping route_id -> Set of stop_ids using stream reading for stop_times.txt.
 */
export async function getRouteStopsMap() {
  const trips = loadCsv("trips.txt");

  // Build trip_id -> route_id map
  const tripToRoute: Record<string, string> = {};
  for (const t of trips) {
    if (t.trip_id && t.route_id) {
      tripToRoute[t.trip_id] = t.route_id;
    }
  }

  const filePath = path.join(GTFS_DATA_DIR, "stop_times.txt");
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  const routeStops: Record<string, Set<string>> = {};
  let tripIdx = -1;
  let stopIdx = -1;

  for await (const line of rl) {
    if (!line.trim()) continue;
    const parts = line.split(",").map((p) => p.trim().replace(/^"|"$/g, ""));

    if (tripIdx === -1) {
      tripIdx = parts.indexOf("trip_id");
      stopIdx = parts.indexOf("stop_id");
      continue;
    }

    const tripId = parts[tripIdx];
    const stopId = parts[stopIdx];
    const routeId = tripToRoute[tripId];

    if (routeId && stopId) {
      if (!routeStops[routeId]) routeStops[routeId] = new Set();
      routeStops[routeId].add(stopId);
    }
  }

  return routeStops;
}

/**
 * Get routes enriched with their stop details.
 */
export async function getRoutesWithStops() {
  const routes = getRoutes();
  const stopsMap = getStopsMap();
  const routeStopsMap = await getRouteStopsMap();

  return routes.map((r) => {
    const stopIds = routeStopsMap[r.route_id] ?? new Set();
    const stops = Array.from(stopIds).map((sid) => {
      const info = stopsMap[sid] || { name: sid, code: undefined };
      return {
        stop_id: sid,
        name: info.name,
        code: info.code,
      };
    });

    stops.sort((a, b) => a.name.localeCompare(b.name));
    return {
      ...r,
      stops,
    };
  });
}