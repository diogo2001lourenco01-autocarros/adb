import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const gtfsDir = path.join(__dirname, '../src/data/gtfs');
const outDir = path.join(__dirname, '../public/api/gtfs');
const outRoutesDir = path.join(outDir, 'routes');

if (!fs.existsSync(outRoutesDir)) {
  fs.mkdirSync(outRoutesDir, { recursive: true });
}

// Simple CSV parser supporting quotes
function parseCSV(content) {
  const lines = content.trim().split(/\r?\n/);
  if (lines.length === 0) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^\uFEFF/, '')); // Remove BOM if present
  
  const result = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    
    let inQuotes = false;
    let currentField = '';
    const fields = [];
    
    for (let c = 0; c < line.length; c++) {
      const char = line[c];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        fields.push(currentField);
        currentField = '';
      } else {
        currentField += char;
      }
    }
    fields.push(currentField);

    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = fields[idx] !== undefined ? fields[idx].trim() : '';
    });
    result.push(obj);
  }
  return result;
}

console.log('Reading GTFS files...');
const routesData = parseCSV(fs.readFileSync(path.join(gtfsDir, 'routes.txt'), 'utf-8'));
const tripsData = parseCSV(fs.readFileSync(path.join(gtfsDir, 'trips.txt'), 'utf-8'));
const stopsData = parseCSV(fs.readFileSync(path.join(gtfsDir, 'stops.txt'), 'utf-8'));
const stopTimesData = parseCSV(fs.readFileSync(path.join(gtfsDir, 'stop_times.txt'), 'utf-8'));
const shapesData = parseCSV(fs.readFileSync(path.join(gtfsDir, 'shapes.txt'), 'utf-8'));

console.log('Processing stops & shapes...');
const stopsMap = {};
stopsData.forEach(s => {
  stopsMap[s.stop_id] = {
    id: s.stop_id,
    name: s.stop_name,
    lat: parseFloat(s.stop_lat),
    lon: parseFloat(s.stop_lon)
  };
});

// Group shapes by shape_id
const shapesMap = {};
shapesData.forEach(s => {
  if (!shapesMap[s.shape_id]) shapesMap[s.shape_id] = [];
  shapesMap[s.shape_id].push({
    seq: parseInt(s.shape_pt_sequence, 10),
    lat: parseFloat(s.shape_pt_lat),
    lon: parseFloat(s.shape_pt_lon)
  });
});
// Sort shape points by sequence
Object.values(shapesMap).forEach(arr => arr.sort((a, b) => a.seq - b.seq));

console.log('Finding representative trips...');
// Find longest trip for each route/direction
const tripStopCounts = {};
stopTimesData.forEach(st => {
  tripStopCounts[st.trip_id] = (tripStopCounts[st.trip_id] || 0) + 1;
});

const repTrips = {}; // "routeId_dirId" -> trip_id
tripsData.forEach(t => {
  const key = `${t.route_id}_${t.direction_id}`;
  const currentRep = repTrips[key];
  if (!currentRep || (tripStopCounts[t.trip_id] > tripStopCounts[currentRep.trip_id])) {
    repTrips[key] = t;
  }
});

// Build global routes list
const outRoutesList = routesData.map(r => ({
  id: r.route_id,
  short_name: r.route_short_name,
  long_name: r.route_long_name,
  color: r.route_color || '', // Some GTFS have this, if not empty
  text_color: r.route_text_color || ''
}));

fs.writeFileSync(path.join(outDir, 'routes.json'), JSON.stringify(outRoutesList, null, 2));

console.log('Generating JSON for each route...');

// Group stop_times by trip_id for fast lookup
const stopTimesByTrip = {};
stopTimesData.forEach(st => {
  if (!stopTimesByTrip[st.trip_id]) stopTimesByTrip[st.trip_id] = [];
  stopTimesByTrip[st.trip_id].push(st);
});
Object.values(stopTimesByTrip).forEach(arr => arr.sort((a, b) => parseInt(a.stop_sequence, 10) - parseInt(b.stop_sequence, 10)));

const processedRoutes = new Set();

routesData.forEach(route => {
  const routeId = route.route_id;
  const dirs = [];

  [0, 1].forEach(dirId => {
    const key = `${routeId}_${dirId}`;
    const trip = repTrips[key];
    if (trip) {
      const stData = stopTimesByTrip[trip.trip_id] || [];
      const routeStops = stData.map(st => stopsMap[st.stop_id]).filter(Boolean);
      
      let shapeCoords = [];
      if (trip.shape_id && shapesMap[trip.shape_id]) {
        shapeCoords = shapesMap[trip.shape_id].map(pt => [pt.lon, pt.lat]);
      }

      dirs.push({
        direction_id: dirId,
        headsign: trip.trip_headsign,
        stops: routeStops,
        shape: shapeCoords
      });
    }
  });

  if (dirs.length > 0) {
    const outData = {
      route_id: routeId,
      short_name: route.route_short_name,
      long_name: route.route_long_name,
      directions: dirs
    };
    fs.writeFileSync(path.join(outRoutesDir, `${routeId}.json`), JSON.stringify(outData));
    processedRoutes.add(routeId);
  }
});

console.log(`Processed ${processedRoutes.size} routes successfully. Files saved to public/api/gtfs/`);
