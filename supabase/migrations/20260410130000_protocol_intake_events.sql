-- Extend pending_devices with protocol taxonomy metadata
ALTER TABLE pending_devices
  ADD COLUMN protocol_family TEXT NOT NULL DEFAULT 'suntech',
  ADD COLUMN protocol_variant TEXT;

UPDATE pending_devices
SET protocol_family = protocol::text;

CREATE OR REPLACE FUNCTION sync_pending_devices_protocol_family()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.protocol_family IS DISTINCT FROM NEW.protocol::text THEN
    NEW.protocol_family := NEW.protocol::text;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_pending_devices_protocol_family
BEFORE INSERT OR UPDATE ON pending_devices
FOR EACH ROW
EXECUTE FUNCTION sync_pending_devices_protocol_family();

-- Operational queue for unsupported protocol frames
CREATE TABLE unknown_frames (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transport TEXT NOT NULL DEFAULT 'tcp',
  remote_ip TEXT,
  raw_preview TEXT,
  raw_payload TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  candidate_family TEXT,
  confidence DOUBLE PRECISION,
  occurrences INT NOT NULL DEFAULT 1,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'new',
  notes TEXT,
  CONSTRAINT unknown_frames_status_check
    CHECK (status IN ('new', 'reviewing', 'mapped', 'ignored'))
);

CREATE UNIQUE INDEX idx_unknown_frames_fingerprint
  ON unknown_frames(fingerprint);

ALTER TABLE unknown_frames ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_unknown_frames" ON unknown_frames
  FOR ALL USING (public.is_platform_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON unknown_frames TO authenticated;

-- Operational queue for parser failures in known protocol families
CREATE TABLE protocol_failures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family TEXT NOT NULL,
  variant TEXT,
  error_code TEXT NOT NULL,
  error_message TEXT NOT NULL,
  raw_payload TEXT NOT NULL,
  device_hint TEXT,
  remote_ip TEXT,
  occurrences INT NOT NULL DEFAULT 1,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_protocol_failures_family_variant_error_code
  ON protocol_failures(
    family,
    COALESCE(variant, ''),
    error_code,
    COALESCE(device_hint, '')
  );

ALTER TABLE protocol_failures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_protocol_failures" ON protocol_failures
  FOR ALL USING (public.is_platform_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON protocol_failures TO authenticated;
