-- Nullable reception time keeps old gateways and buffered records compatible.
-- server_time retains its write-time default and partition/replay semantics.
ALTER TABLE public.positions ADD COLUMN received_at TIMESTAMPTZ;
ALTER TABLE public.latest_positions ADD COLUMN received_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.update_latest_position()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Keep future measurements in history without promoting them to live state.
  IF NEW.device_time > COALESCE(NEW.received_at, NEW.server_time) + INTERVAL '2 minutes' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.latest_positions AS current_position (
    device_id, tenant_id, vehicle_id, location, speed, heading, ignition,
    altitude, satellites, device_time, server_time, received_at
  ) VALUES (
    NEW.device_id, NEW.tenant_id, NEW.vehicle_id, NEW.location, NEW.speed,
    NEW.heading, NEW.ignition, NEW.altitude, NEW.satellites,
    NEW.device_time, NEW.server_time, NEW.received_at
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
    server_time = EXCLUDED.server_time,
    received_at = EXCLUDED.received_at
  -- Conflict-row locking makes ordering atomic even across concurrent batches.
  WHERE EXCLUDED.device_time > current_position.device_time
     OR current_position.device_time >
        COALESCE(current_position.received_at, current_position.server_time) + INTERVAL '2 minutes';
  -- The second condition recovers previously contaminated live state on valid intake.
  RETURN NEW;
END;
$$;
