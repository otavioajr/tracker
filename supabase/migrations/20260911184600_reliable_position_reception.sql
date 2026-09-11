-- Distinguish tracker measurement (device_time) from TCP reception (received_at).
-- server_time remains the write clock used by replay partitions.

ALTER TABLE public.positions
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;

ALTER TABLE public.latest_positions
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;

UPDATE public.positions
SET received_at = server_time
WHERE received_at IS NULL;

UPDATE public.latest_positions
SET received_at = server_time
WHERE received_at IS NULL;

-- History always keeps older packets. latest_positions only advances on a
-- strictly newer device_time, or recovers if the stored latest is in the future.
CREATE OR REPLACE FUNCTION public.update_latest_position()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.latest_positions (
    device_id, tenant_id, vehicle_id, location, speed, heading, ignition,
    altitude, satellites, device_time, received_at, server_time
  )
  VALUES (
    NEW.device_id, NEW.tenant_id, NEW.vehicle_id, NEW.location, NEW.speed, NEW.heading, NEW.ignition,
    NEW.altitude, NEW.satellites, NEW.device_time, COALESCE(NEW.received_at, NEW.server_time), NEW.server_time
  )
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
    received_at = EXCLUDED.received_at,
    server_time = EXCLUDED.server_time
  WHERE public.latest_positions.device_time < EXCLUDED.device_time
     OR public.latest_positions.device_time > (now() + interval '15 minutes');
  RETURN NEW;
END;
$$;
