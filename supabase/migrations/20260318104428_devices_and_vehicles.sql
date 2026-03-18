-- Devices table
CREATE TABLE devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  imei TEXT NOT NULL UNIQUE,
  protocol device_protocol NOT NULL DEFAULT 'suntech',
  model TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  last_communication_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_devices_tenant_id ON devices(tenant_id);
CREATE INDEX idx_devices_imei ON devices(imei);

-- Vehicles table
CREATE TABLE vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_id UUID UNIQUE REFERENCES devices(id) ON DELETE SET NULL,
  plate TEXT NOT NULL,
  brand TEXT,
  model TEXT,
  year INT,
  color TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vehicles_tenant_id ON vehicles(tenant_id);
CREATE INDEX idx_vehicles_device_id ON vehicles(device_id);

-- Triggers
CREATE TRIGGER set_devices_updated_at
  BEFORE UPDATE ON devices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_vehicles_updated_at
  BEFORE UPDATE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
