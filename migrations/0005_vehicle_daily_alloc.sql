-- Migration number: 0005    2026-08-24
-- Replaces vehicle_sightings as the source of truth for the "Lista do Dia" feature.
--
-- Problem with vehicle_sightings:
--   · 720 cron fires/day x ~75 vehicles = ~54 000 INSERT rows/day
--   · Each /api/alocacao call did 3 full-table scans  = ~162 000 rows read/call
--   · After 118 days the table reached ~6 M rows, exhausting D1 free-tier quotas
--
-- This table stores ONE row per (date, bus_id, line_id) combination.
-- INSERT OR IGNORE + the expression unique index make every cron fire after the
-- first a near-zero-write operation: ~75 rows written on the first fire of the day,
-- 0 on the remaining 719 fires.  Reads drop to ~75-225 rows per /api/alocacao call.

CREATE TABLE IF NOT EXISTS vehicle_daily_alloc (
    date       TEXT    NOT NULL,  -- YYYY-MM-DD (Europe/Lisbon)
    bus_id     TEXT    NOT NULL,
    line_id    INTEGER,           -- NULL = no line assigned for this entry
    first_seen INTEGER NOT NULL,  -- unix timestamp of first sighting today
    last_seen  INTEGER NOT NULL   -- unix timestamp of most recent sighting (informational)
);

-- COALESCE(line_id, -1) collapses all NULLs to the same key so INSERT OR IGNORE
-- deduplicates correctly even when line_id is NULL (SQLite NULLs are otherwise distinct).
CREATE UNIQUE INDEX IF NOT EXISTS idx_alloc_uniq
    ON vehicle_daily_alloc(date, bus_id, COALESCE(line_id, -1));

CREATE INDEX IF NOT EXISTS idx_alloc_date
    ON vehicle_daily_alloc(date);
