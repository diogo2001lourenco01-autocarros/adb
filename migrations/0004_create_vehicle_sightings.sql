-- Migration number: 0004    2026-04-25
CREATE TABLE IF NOT EXISTS vehicle_sightings (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    date        TEXT    NOT NULL,  -- YYYY-MM-DD (Europe/Lisbon)
    bus_id      TEXT    NOT NULL,
    line_id     INTEGER,           -- NULL when vehicle has no assigned line
    direction   INTEGER,           -- 0 or 1
    trip_id     TEXT,
    lat         REAL,
    lon         REAL,
    seen_at     INTEGER NOT NULL   -- unix timestamp
);

CREATE INDEX IF NOT EXISTS idx_sightings_date         ON vehicle_sightings(date);
CREATE INDEX IF NOT EXISTS idx_sightings_date_line    ON vehicle_sightings(date, line_id);
CREATE INDEX IF NOT EXISTS idx_sightings_date_bus     ON vehicle_sightings(date, bus_id);
