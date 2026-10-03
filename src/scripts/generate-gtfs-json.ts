// Script to generate a static JSON file with GTFS routes and stops
import { getRoutesWithStops } from "../lib/gtfs";
import { writeFile } from "fs/promises";
import path from "path";

async function main() {
  const routes = await getRoutesWithStops();
  const outputPath = path.resolve(__dirname, "../../public/gtfs_routes.json");
  await writeFile(outputPath, JSON.stringify(routes, null, 2), "utf-8");
  console.log(`GTFS static JSON written to ${outputPath}`);
}

main().catch((e) => {
  console.error("Error generating GTFS JSON:", e);
  process.exit(1);
});
