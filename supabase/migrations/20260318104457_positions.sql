-- Positions table (partitioned by month on server_time)
-- NOTE: PostgreSQL does not support foreign keys on partitioned tables.
-- Referential integrity for device_id and tenant_id is enforced at the
-- application layer (Go Gateway validates IMEI → device before inserting).
CREATE TABLE positions (
  id BIGSERIAL,
  device_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  location GEOMETRY(POINT, 4326) NOT NULL,
  speed DOUBLE PRECISION,
  heading DOUBLE PRECISION,
  ignition BOOLEAN,
  altitude DOUBLE PRECISION,
  satellites INT,
  raw_data JSONB,
  device_time TIMESTAMPTZ NOT NULL,
  server_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id, server_time)
) PARTITION BY RANGE (server_time);

-- Create partitions for current and next month
CREATE TABLE positions_2026_03 PARTITION OF positions
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

CREATE TABLE positions_2026_04 PARTITION OF positions
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

-- Indexes (created on parent, applied to all partitions)
CREATE INDEX idx_positions_device_id ON positions(device_id);
CREATE INDEX idx_positions_tenant_id ON positions(tenant_id);
CREATE INDEX idx_positions_device_time ON positions(device_id, server_time DESC);
CREATE INDEX idx_positions_location ON positions USING GIST(location);
