-- latest_positions: non-partitioned table for Supabase Realtime
-- Supabase Realtime (postgres_changes) does not support partitioned tables.
-- This table holds one row per device (UPSERT on each new position),
-- allowing the frontend to subscribe to real-time updates.

CREATE TABLE latest_positions (
  device_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  vehicle_id UUID,
  location GEOMETRY(POINT, 4326) NOT NULL,
  speed DOUBLE PRECISION,
  heading DOUBLE PRECISION,
  ignition BOOLEAN,
  altitude DOUBLE PRECISION,
  satellites INT,
  device_time TIMESTAMPTZ NOT NULL,
  server_time TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_latest_positions_tenant ON latest_positions(tenant_id);

-- Trigger: on every INSERT into positions (fires on partitions too),
-- upsert into latest_positions so Realtime can pick it up.
CREATE OR REPLACE FUNCTION update_latest_position()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO latest_positions (device_id, tenant_id, vehicle_id, location, speed, heading, ignition, altitude, satellites, device_time, server_time)
  VALUES (NEW.device_id, NEW.tenant_id, NEW.vehicle_id, NEW.location, NEW.speed, NEW.heading, NEW.ignition, NEW.altitude, NEW.satellites, NEW.device_time, NEW.server_time)
  ON CONFLICT (device_id) DO UPDATE SET
    tenant_id = EXCLUDED.tenant_id,
    vehicle_id = EXCLUDED.vehicle_id,
    location = EXCLUDED.location,
    speed = EXCLUDED.speed,
    heading = EXCLUDED.heading,
    ignition = EXCLUDED.ignition,
    altitude = EXCLUDED.altitude,
    satellites = EXCLUDED.satellites,
    device_time = EXCLUDED.device_time,
    server_time = EXCLUDED.server_time;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_latest_position
  AFTER INSERT ON positions
  FOR EACH ROW
  EXECUTE FUNCTION update_latest_position();

-- RLS (same pattern as positions)
ALTER TABLE latest_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_all_latest_positions" ON latest_positions
  FOR SELECT USING (public.is_platform_admin());

CREATE POLICY "client_read_own_latest_positions" ON latest_positions
  FOR SELECT USING (tenant_id = public.get_user_tenant_id());

-- Enable Supabase Realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE latest_positions;
