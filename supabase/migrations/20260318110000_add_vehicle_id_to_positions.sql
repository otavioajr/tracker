-- Add vehicle_id to positions table
ALTER TABLE positions ADD COLUMN vehicle_id UUID;

-- Composite index for history queries by vehicle
CREATE INDEX idx_positions_vehicle_time ON positions(vehicle_id, server_time DESC);

-- Backfill existing data per partition (avoids long locks)
UPDATE positions_2026_03 p
SET vehicle_id = v.id
FROM vehicles v
WHERE v.device_id = p.device_id
  AND p.vehicle_id IS NULL;

UPDATE positions_2026_04 p
SET vehicle_id = v.id
FROM vehicles v
WHERE v.device_id = p.device_id
  AND p.vehicle_id IS NULL;
