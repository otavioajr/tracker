-- Geofences table
CREATE TABLE geofences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  area GEOMETRY(POLYGON, 4326) NOT NULL,
  type geofence_type NOT NULL DEFAULT 'inclusion',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_geofences_tenant_id ON geofences(tenant_id);
CREATE INDEX idx_geofences_area ON geofences USING GIST(area);

-- Alerts table
CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  type alert_type NOT NULL,
  severity alert_severity NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_alerts_tenant_id ON alerts(tenant_id);
CREATE INDEX idx_alerts_device_id ON alerts(device_id);
CREATE INDEX idx_alerts_created_at ON alerts(tenant_id, created_at DESC);

-- Alert Rules table
CREATE TABLE alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
  type alert_type NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  notify_email BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_alert_rules_tenant_id ON alert_rules(tenant_id);

-- Triggers
CREATE TRIGGER set_geofences_updated_at
  BEFORE UPDATE ON geofences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_alert_rules_updated_at
  BEFORE UPDATE ON alert_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
