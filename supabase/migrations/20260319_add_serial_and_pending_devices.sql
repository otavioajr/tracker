-- Add serial_number to devices (the binary protocol ID sent by the device)
ALTER TABLE devices ADD COLUMN serial_number TEXT;
CREATE UNIQUE INDEX idx_devices_serial_number ON devices(serial_number) WHERE serial_number IS NOT NULL;

-- Table for unknown devices that connect but aren't registered
CREATE TABLE pending_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  serial TEXT NOT NULL UNIQUE,
  protocol device_protocol NOT NULL DEFAULT 'suntech',
  ip_address TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  message_count INT NOT NULL DEFAULT 1,
  linked_device_id UUID REFERENCES devices(id) ON DELETE SET NULL
);

-- RLS: gateway writes via direct connection (bypasses RLS)
-- Note: pending_devices has no tenant_id (unknown until linked).
-- All authenticated users can see/manage pending devices.
-- This is acceptable because serials are not sensitive data.
ALTER TABLE pending_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_pending" ON pending_devices
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "admin_manage_pending" ON pending_devices
  FOR ALL USING (public.is_platform_admin());

CREATE POLICY "client_delete_pending" ON pending_devices
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- Backfill: set serial_number for the existing ST310U device
UPDATE devices SET serial_number = '007075134' WHERE imei = '007075134';
-- Restore original IMEI from label
UPDATE devices SET imei = '356430071495757' WHERE serial_number = '007075134';
